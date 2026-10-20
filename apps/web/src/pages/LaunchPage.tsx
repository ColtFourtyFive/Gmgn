// Launch (/:chain/launch): create a token on one of the chain's launchpads.
// Launchpad (with its curve numbers), name / ticker / description / logo,
// socials, a dev buy with the share of supply it gets, optional bundle
// wallets, an exit strategy and a preset; a live preview and the cost against
// the paper balance; confirm, launch and land on the new token's page. Below:
// the user's launches with their curve progress.

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CHAINS, formatCompact, formatPercent, type ChainId, type LaunchConfig, PRESET_LABELS } from '@trenchscope/shared';
import { Rocket } from 'lucide-react';
import { splitFieldError } from '@/components/account';
import { Note } from '@/components/account/FormBits';
import { Native, TokenAvatar } from '@/components/common';
import {
  BUNDLE_BUY_DEFAULT,
  CostSummary,
  DEV_BUY_PRESETS,
  LaunchFormFields,
  LaunchPreview,
  launchCost,
  MyLaunches,
  nativeUsdOf,
  simulateCreationBlock,
  toLaunchRequest,
  useLaunchConfig,
  useLaunchWallet,
  validateLaunch,
  type LaunchErrors,
  type LaunchField,
  type LaunchForm,
} from '@/components/launch';
import { Page, PageHeader, useDeposit } from '@/components/layout';
import { tokenKeys } from '@/components/token';
import { DEFAULT_STRATEGY, describeStrategy } from '@/components/trade/StrategyEditor';
import { Button, ErrorState, focusFirstError, Modal, Skeleton, SkeletonText } from '@/components/ui';
import { walletKeys } from '@/components/wallet';
import { invalidateTradingQueries, trackManualSwap, useBreakpoint, useTradeSettings } from '@/hooks';
import { api } from '@/lib/api';
import { routes, useChain } from '@/lib/chain';
import { errorMessage, formatNativeFor } from '@/lib/format';
import { requireAuth, useSession } from '@/store/session';
import { toast } from '@/store/toasts';

const FORM_ID = 'launch-form';

/** Server field (path head) → form field. */
const FIELD: Record<string, LaunchField> = {
  launchpad: 'launchpad',
  name: 'name',
  symbol: 'symbol',
  description: 'description',
  logoGlyph: 'glyph',
  devBuyNative: 'devBuy',
  bundleWallets: 'bundleBuy',
  bundleBuyNative: 'bundleBuy',
  strategy: 'strategy',
};

type Errors = LaunchErrors & { form?: string };

function serverErrors(err: unknown): Errors {
  const { field, message } = splitFieldError(err);
  if (field === 'socials') {
    const key = /^socials\.(twitter|telegram|website):/.exec(errorMessage(err))?.[1] as LaunchField | undefined;
    if (key) return { [key]: message };
  }
  return field && FIELD[field] ? { [FIELD[field]]: message } : { form: message };
}

const share = (v: number) => formatPercent(v, { sign: false, digits: 1 });

export default function LaunchPage() {
  const chain = useChain();
  const config = useLaunchConfig();
  if (!config.data)
    return (
      <Page className="flex max-w-[1400px] flex-col gap-3">
        <PageHeader title="Launch a token" icon={<Rocket size={16} />} />
        {config.isError ? (
          <div className="panel">
            <ErrorState title="Couldn’t load the launchpads" error={config.error} onRetry={() => void config.refetch()} retrying={config.isFetching} />
          </div>
        ) : (
          <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_360px]" aria-busy>
            <div className="panel flex flex-col gap-4 p-4">
              <Skeleton className="h-24 w-full" />
              <SkeletonText lines={6} />
            </div>
            <Skeleton className="h-80 w-full" />
          </div>
        )}
      </Page>
    );
  return <Launch key={chain} chain={chain} config={config.data} />;
}

function Launch({ chain, config }: { chain: ChainId; config: LaunchConfig }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const wide = useBreakpoint('lg');
  const trade = useTradeSettings(chain);
  const signedIn = useSession((s) => !!s.token);
  const balance = useSession((s) => (s.token ? (s.account?.wallets[chain]?.nativeBalance ?? null) : null));
  const wallet = useLaunchWallet(chain);
  const deposit = useDeposit(chain);
  const [form, setForm] = useState<LaunchForm>(() => ({
    launchpad: config.launchpads[chain][0]?.id ?? '',
    name: '',
    symbol: '',
    description: '',
    glyph: config.defaultGlyph,
    socials: { twitter: '', telegram: '', website: '' },
    devBuy: DEV_BUY_PRESETS[chain][2],
    useBundles: false,
    bundleWallets: 2,
    bundleBuy: BUNDLE_BUY_DEFAULT[chain],
    useStrategy: false,
    strategy: DEFAULT_STRATEGY,
    presetId: trade.activeBuyPreset,
  }));
  const [submitted, setSubmitted] = useState(false);
  const [fromServer, setFromServer] = useState<Errors>({});
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  const set = useCallback(<K extends keyof LaunchForm>(key: K, value: LaunchForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFromServer((e) => (Object.keys(e).length ? {} : e));
  }, []);

  const pad = config.launchpads[chain].find((lp) => lp.id === form.launchpad) ?? config.launchpads[chain][0];
  const devBuy = form.devBuy ?? 0;
  const bundles = form.useBundles ? form.bundleWallets : 0;
  const bundleBuy = form.useBundles ? (form.bundleBuy ?? 0) : 0;
  const block = useMemo(() => simulateCreationBlock(pad, devBuy, bundles, bundleBuy), [pad, devBuy, bundles, bundleBuy]);
  const cost = launchCost(chain, config, trade.buyPresets[form.presetId], devBuy, bundles, bundleBuy);
  const buys = (devBuy > 0 ? 1 : 0) + (bundleBuy > 0 ? bundles : 0);
  const nativeUsd = nativeUsdOf(pad);
  const errors: Errors = { ...(submitted ? validateLaunch(form, chain, config) : {}), ...fromServer };
  const short = balance !== null && balance + 1e-12 < cost.total;
  const symbol = form.symbol || 'TOKEN';

  const review = () => {
    setSubmitted(true);
    setFromServer({});
    if (Object.keys(validateLaunch(form, chain, config)).length) {
      requestAnimationFrame(() => focusFirstError(FORM_ID));
      return;
    }
    requireAuth(() => setConfirming(true));
  };

  const launch = async () => {
    setPending(true);
    try {
      const res = await api.launch(toLaunchRequest(form, chain));
      const t = res.token;
      // The creation-block fills also reach the user channel: claim them so they don't toast again.
      for (const r of res.receipts) trackManualSwap(chain, t.address)(r);
      qc.setQueryData(tokenKeys.detail(chain, t.address), t);
      invalidateTradingQueries(qc);
      if (wallet) void qc.invalidateQueries({ queryKey: walletKeys.created(chain, wallet) });
      const dev = res.receipts[0];
      toast.success(
        `$${t.symbol} is live on ${pad.name}`,
        devBuy > 0 && dev?.ok
          ? `Dev buy: ${formatCompact(dev.tokenAmount)} ${t.symbol} (${share(dev.tokenAmount / t.totalSupply)} of supply) for ${formatNativeFor(chain, dev.nativeAmount)}`
          : 'Launched without a dev buy.',
        { to: routes.token(chain, t.address), label: 'View token' },
      );
      navigate(routes.token(chain, t.address));
    } catch (err) {
      setConfirming(false);
      setFromServer(serverErrors(err));
    } finally {
      setPending(false);
    }
  };

  const launchButton = (
    <Button variant="primary" block icon={<Rocket size={14} />} onClick={review} disabled={short} className="h-10">
      {!signedIn ? 'Sign in to launch' : form.symbol ? `Launch $${form.symbol}` : 'Launch token'}
    </Button>
  );

  return (
    <Page className="flex max-w-[1400px] flex-col gap-3">
      <PageHeader
        className="!mb-0"
        title="Launch a token"
        icon={<Rocket size={16} />}
        subtitle={`Create a token on a ${CHAINS[chain].name} launchpad — a paper launch on the simulated market`}
      />
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <LaunchFormFields id={FORM_ID} chain={chain} config={config} form={form} onChange={set} errors={errors} block={block} />
        <aside aria-label="Preview and cost" className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-0 lg:max-h-[calc(100dvh-6.5rem)] lg:overflow-y-auto">
          <LaunchPreview form={form} pad={pad} narrative={config.glyphNarratives[form.glyph]} block={block} />
          <CostSummary
            chain={chain}
            cost={cost}
            buys={buys}
            bundleWallets={bundles}
            bundleBuy={bundleBuy}
            nativeUsd={nativeUsd}
            balance={balance}
            onDeposit={() => void deposit.deposit()}
            depositPending={deposit.pending}
          />
          {errors.form && (
            <Note tone="error" title="Launch failed">
              {errors.form}
            </Note>
          )}
          {wide && launchButton}
        </aside>
      </div>
      <MyLaunches chain={chain} launchesPerHour={config.limits.launchesPerHour} />
      {!wide && (
        <div data-sticky-bottom className="sticky bottom-0 z-sticky -mx-3 flex items-center gap-3 border-t border-line bg-panel/95 px-3 py-2 backdrop-blur md:-mx-4 md:px-4">
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="text-2xs text-faint">Total cost</span>
            <Native value={cost.total} chain={chain} className="text-sm font-semibold" />
          </span>
          <span className="ml-auto w-48">{launchButton}</span>
        </div>
      )}

      <Modal
        open={confirming}
        onClose={() => !pending && setConfirming(false)}
        size="sm"
        title={`Launch $${symbol}?`}
        description={`On ${pad.name} · ${CHAINS[chain].name}. Paper launch on the simulated market.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" icon={<Rocket size={14} />} loading={pending} onClick={() => void launch()} data-autofocus>
              Launch ${symbol}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-3">
            <TokenAvatar seed={`${form.symbol}|${form.name}`} glyph={form.glyph} size={40} launchpadColor={pad.color} />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-semibold text-fg">${symbol}</span>
              <span className="truncate text-xs text-muted">{form.name.trim()}</span>
            </span>
          </div>
          <dl className="flex flex-col gap-1 rounded border border-line bg-panel-2 p-2.5 text-xs">
            <ConfirmRow label="Dev buy">{devBuy > 0 ? `${formatNativeFor(chain, devBuy)} · ≈ ${share(block.devShare)} of supply` : 'None'}</ConfirmRow>
            {bundles > 0 && <ConfirmRow label="Bundle wallets">{`${bundles} × ${formatNativeFor(chain, bundleBuy)} · ≈ ${share(block.bundleShare)} of supply`}</ConfirmRow>}
            {form.useStrategy && devBuy > 0 && <ConfirmRow label="Exit strategy">{describeStrategy(form.strategy)}</ConfirmRow>}
            <ConfirmRow label="Preset">{PRESET_LABELS[form.presetId]}</ConfirmRow>
            <ConfirmRow label="Total cost">
              <Native value={cost.total} chain={chain} className="font-semibold" />
            </ConfirmRow>
          </dl>
          <p className="text-xs text-muted">The name, ticker, logo and socials can’t be changed once the token is live.</p>
        </div>
      </Modal>
    </Page>
  );
}

function ConfirmRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-fg">{children}</dd>
    </div>
  );
}
