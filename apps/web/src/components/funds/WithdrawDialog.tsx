// Live Withdraw dialog: SOL or a held token to an ACTIVE whitelisted address,
// confirmed with the current 2FA code. Amounts are exact decimals (no float
// rounding); Max keeps the fee reserve; one idempotency key (clientId) covers
// every retry of a request until the server answers with a transfer, so a
// timeout followed by a retry can never send twice. Without 2FA or an active
// whitelisted address the form is replaced by what to do in Security settings.

import { useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CHAINS, shortAddress, type ChainId, type WalletTransfer, type WhitelistEntry } from '@trenchscope/shared';
import { ArrowUpRight, CircleCheck, ShieldCheck } from 'lucide-react';
import { Note } from '@/components/account/FormBits';
import { accountKeys } from '@/components/account/queries';
import { Native, TokenAvatar, TxHash } from '@/components/common';
import { Button, ErrorState, Field, Input, Modal, Select, SkeletonText } from '@/components/ui';
import { useNow } from '@/hooks/useNow';
import { api, ApiError } from '@/lib/api';
import { routes } from '@/lib/chain';
import { errorMessage, formatNativeFor } from '@/lib/format';
import { useSession } from '@/store/session';
import { toast } from '@/store/toasts';
import {
  activeWhitelist,
  decimalsFor,
  formatCountdown,
  formatUnits,
  maxWithdrawUnits,
  newClientId,
  normalizeCode,
  pendingWhitelist,
  validateWithdraw,
  whitelistLabel,
  withdrawAmount,
  type WithdrawAsset,
  type WithdrawErrors,
} from './model';
import { fundsKeys, useDepositInfo, useSecurityStatus } from './queries';
import { TransferAmount, TransferStatusBadge } from './TransfersTable';
import { TotpInput } from './TotpInput';

/** Used for Max until the deposit info (the server's reserve) has loaded. */
const FALLBACK_FEE_RESERVE = 0.01;

export interface WithdrawDialogProps {
  open: boolean;
  onClose: () => void;
  /** Asset to preselect (null: SOL). */
  initialMint?: string | null;
  chain?: ChainId;
}

export function WithdrawDialog({ open, onClose, initialMint = null, chain = 'sol' }: WithdrawDialogProps) {
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Withdraw" description={`Send SOL or tokens from your Trenchscope wallet on ${CHAINS[chain].name}.`}>
      <WithdrawBody chain={chain} initialMint={initialMint} onClose={onClose} />
    </Modal>
  );
}

/** Action row at the bottom of the dialog body (styled like Modal's footer). */
function Actions({ children }: { children: React.ReactNode }) {
  return <div className="-mx-4 -mb-4 mt-1 flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3">{children}</div>;
}

function WithdrawBody({ chain, initialMint, onClose }: { chain: ChainId; initialMint: string | null; onClose: () => void }) {
  const security = useSecurityStatus();
  const now = useNow();

  if (security.isLoading) return <SkeletonText lines={5} className="py-2" />;
  if (security.isError || !security.data) {
    return <ErrorState compact title="Couldn’t load your withdrawal settings" error={security.error} onRetry={() => void security.refetch()} retrying={security.isFetching} />;
  }
  const s = security.data;
  if (!s.twoFactorEnabled) {
    return (
      <Blocked onClose={onClose} title="Turn on two-factor authentication to withdraw">
        Withdrawals need a code from an authenticator app, so a stolen password alone can’t move your funds. Set it up in Security settings, then add the address
        you want to withdraw to.
      </Blocked>
    );
  }
  const active = activeWhitelist(s.whitelist, chain, now);
  if (active.length === 0) {
    const pending = pendingWhitelist(s.whitelist, chain, now);
    return (
      <Blocked onClose={onClose} title={pending.length ? 'Your withdrawal address isn’t active yet' : 'Add a withdrawal address first'}>
        {pending.length ? (
          <>
            New addresses activate after a security delay.{' '}
            <span className="font-medium text-fg">{whitelistLabel(pending[0])}</span> can receive withdrawals in{' '}
            <span className="num font-medium text-fg">{formatCountdown(pending[0].activeAt - now)}</span>.
          </>
        ) : (
          <>Withdrawals only go to whitelisted addresses. Add one in Security settings; it activates after a short security delay.</>
        )}
      </Blocked>
    );
  }
  return <WithdrawForm chain={chain} initialMint={initialMint} destinations={active} onClose={onClose} />;
}

/** Why withdrawing is not possible yet, a link to fix it, and a disabled Withdraw button. */
function Blocked({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <Note tone="warn" title={title}>
        {children}
      </Note>
      <Actions>
        <Link to={routes.settings('security')} onClick={onClose} className="btn-outline" data-autofocus>
          <ShieldCheck size={14} aria-hidden />
          Open Security settings
        </Link>
        <Button variant="primary" disabled icon={<ArrowUpRight size={14} />}>
          Withdraw
        </Button>
      </Actions>
    </div>
  );
}

function WithdrawForm({ chain, initialMint, destinations, onClose }: { chain: ChainId; initialMint: string | null; destinations: WhitelistEntry[]; onClose: () => void }) {
  const ids = useId();
  const formId = `${ids}-form`;
  const qc = useQueryClient();
  const wallet = useSession((s) => s.account?.wallets[chain] ?? null);
  const solBalance = wallet?.nativeBalance ?? 0;
  const deposit = useDepositInfo(chain);
  const feeReserve = deposit.data?.feeReserve ?? FALLBACK_FEE_RESERVE;
  const holdings = useQuery({ queryKey: accountKeys.portfolio(chain), queryFn: () => api.portfolio(chain), staleTime: 5_000 });

  const assets = useMemo<WithdrawAsset[]>(() => {
    const sol: WithdrawAsset = { mint: null, symbol: CHAINS[chain].nativeSymbol, balance: solBalance };
    const tokens = (holdings.data?.positions ?? [])
      .filter((p) => p.chain === chain && p.balance > 0 && (!wallet || p.wallet === wallet.address))
      .map((p) => ({ mint: p.token, symbol: p.tokenInfo.symbol, balance: p.balance, imageUrl: p.tokenInfo.imageUrl, logoSeed: p.tokenInfo.logoSeed, logoGlyph: p.tokenInfo.logoGlyph }));
    return [sol, ...tokens];
  }, [holdings.data, solBalance, chain, wallet]);

  const [assetKey, setAssetKey] = useState<string>(initialMint ?? 'native');
  const asset = assets.find((a) => (a.mint ?? 'native') === assetKey) ?? null;
  const [amount, setAmount] = useState('');
  const [to, setTo] = useState<string | null>(destinations.length === 1 ? destinations[0].address : null);
  const [code, setCode] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WalletTransfer | null>(null);
  // One key per withdrawal: kept across retries (a lost answer + retry never sends twice), renewed once the server reports a transfer.
  const [clientId, setClientId] = useState(newClientId);
  const inflight = useRef(false);
  const codeRef = useRef<HTMLInputElement>(null);

  const errors: WithdrawErrors = validateWithdraw({ asset, amount, to, code }, feeReserve, solBalance);
  const shown = touched ? errors : {};
  const destination = destinations.find((d) => d.address === to) ?? null;
  const max = asset ? formatUnits(maxWithdrawUnits(asset, feeReserve), decimalsFor(asset.mint)) : '0';

  const resetForAnother = () => {
    setResult(null);
    setAmount('');
    setCode('');
    setTouched(false);
    setError(null);
  };
  if (result) return <WithdrawResult transfer={result} destination={destination} onDone={onClose} onAnother={resetForAnother} />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (inflight.current) return;
    if (Object.keys(errors).length > 0 || !asset || !to) {
      requestAnimationFrame(() => document.getElementById(formId)?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    const value = withdrawAmount(asset, amount);
    if (value === null) return;
    inflight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const transfer = await api.withdraw({ chain, to, mint: asset.mint, amount: value, code: normalizeCode(code), clientId });
      setClientId(newClientId());
      setResult(transfer);
      void qc.invalidateQueries({ queryKey: fundsKeys.all });
      void qc.invalidateQueries({ queryKey: ['portfolio'] });
      void useSession.getState().refreshAccount().catch(() => undefined);
      if (transfer.status === 'failed') toast.error('Withdrawal failed', transfer.error ?? 'The transfer did not go through.');
    } catch (err) {
      // Same key on retry (the server may have sent it before the answer was lost), except after a definite on-chain failure.
      if (err instanceof ApiError && err.code === 'tx_failed') setClientId(newClientId());
      setError(errorMessage(err, 'Withdrawal failed'));
      if (err instanceof ApiError && err.code === 'totp_required') {
        setCode('');
        codeRef.current?.focus();
      }
    } finally {
      inflight.current = false;
      setSubmitting(false);
    }
  };

  const assetOptions = assets.map((a) => ({
    value: a.mint ?? 'native',
    label: a.symbol,
    icon: a.mint ? <TokenAvatar seed={a.logoSeed ?? a.mint} glyph={a.logoGlyph} imageUrl={a.imageUrl} size={16} /> : undefined,
    hint: <span className="num">{formatUnits(maxWithdrawUnits({ mint: a.mint, balance: a.balance }, 0), decimalsFor(a.mint))}</span>,
  }));

  return (
    <form id={formId} onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-3">
      <Field label="Asset" htmlFor={`${ids}-asset`} error={shown.asset}>
        <Select
          id={`${ids}-asset`}
          value={asset ? (asset.mint ?? 'native') : null}
          onChange={(v) => {
            setAssetKey(v);
            setAmount('');
          }}
          options={assetOptions}
          placeholder="Pick an asset"
        />
      </Field>
      <Field
        label={`Amount${asset ? ` (${asset.symbol})` : ''}`}
        htmlFor={`${ids}-amount`}
        error={shown.amount}
        hint={
          asset
            ? asset.mint === null
              ? `Available ${max} SOL · ${formatNativeFor(chain, feeReserve)} stays for network fees`
              : `Available ${max} ${asset.symbol} · the network fee is paid in SOL`
            : undefined
        }
      >
        <Input
          id={`${ids}-amount`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.0"
          value={amount}
          invalid={!!shown.amount}
          onChange={(e) => setAmount(e.target.value.replace(/,/g, '.').replace(/[^\d.]/g, ''))}
          suffix={
            <button type="button" className="rounded px-1.5 py-0.5 text-xs font-semibold text-accent hover:bg-panel-3" onClick={() => setAmount(max)} disabled={!asset} aria-label="Withdraw the maximum">
              Max
            </button>
          }
        />
      </Field>
      <Field label="To (whitelisted address)" htmlFor={`${ids}-to`} error={shown.to}>
        <Select
          id={`${ids}-to`}
          value={to}
          onChange={setTo}
          options={destinations.map((d) => ({ value: d.address, label: d.label || shortAddress(d.address, 4, 4), hint: <span className="num font-mono">{shortAddress(d.address, 4, 4)}</span> }))}
          placeholder="Pick an address"
        />
      </Field>
      <Field label="Two-factor code" htmlFor={`${ids}-code`} error={shown.code} hint="From your authenticator app">
        <TotpInput ref={codeRef} id={`${ids}-code`} value={code} onChange={setCode} invalid={!!shown.code} />
      </Field>

      {asset && destination && !errors.amount && (
        <p className="rounded border border-line bg-panel-2 px-2.5 py-2 text-xs text-muted" data-testid="withdraw-summary">
          You send{' '}
          <span className="num font-semibold text-fg">
            {amount} {asset.symbol}
          </span>{' '}
          to <span className="font-medium text-fg">{whitelistLabel(destination)}</span>. Withdrawals on Solana can’t be reversed.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded border border-down/30 bg-down/10 px-2.5 py-1.5 text-sm text-down">
          {error}
        </p>
      )}
      <Actions>
        <Button variant="ghost" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={submitting} icon={<ArrowUpRight size={14} />}>
          Withdraw
        </Button>
      </Actions>
    </form>
  );
}

function WithdrawResult({ transfer: t, destination, onDone, onAnother }: { transfer: WalletTransfer; destination: WhitelistEntry | null; onDone: () => void; onAnother: () => void }) {
  const ok = t.status !== 'failed';
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2.5 rounded border border-line bg-panel-2 p-3" role="status">
        <CircleCheck size={18} className={ok ? 'mt-px shrink-0 text-up' : 'mt-px shrink-0 text-down'} aria-hidden />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold text-fg">{ok ? (t.status === 'confirmed' ? 'Withdrawal confirmed' : 'Withdrawal sent') : 'Withdrawal failed'}</p>
          <p className="mt-0.5 text-muted">
            <TransferAmount transfer={t} /> to {destination ? whitelistLabel(destination) : t.counterparty ? shortAddress(t.counterparty, 4, 4) : 'your address'}
          </p>
          {t.error && <p className="mt-1 text-down">{t.error}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <TransferStatusBadge transfer={t} />
            {t.networkFee > 0 && (
              <span>
                Network fee <Native value={t.networkFee} chain={t.chain} className="text-fg" />
              </span>
            )}
            {t.signature && <TxHash chain={t.chain} hash={t.signature} />}
          </div>
        </div>
      </div>
      {ok && t.status !== 'confirmed' && <p className="text-xs text-muted">Confirmation usually takes a few seconds; the status updates in your transfer history.</p>}
      <Actions>
        <Button variant="ghost" onClick={onAnother}>
          New withdrawal
        </Button>
        <Button variant="primary" onClick={onDone} data-autofocus>
          Done
        </Button>
      </Actions>
    </div>
  );
}
