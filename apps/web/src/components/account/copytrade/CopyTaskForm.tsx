import { useId, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CHAINS, formatNative, type ChainId, type CopyTradeTask, type PresetId, type Range, type StrategySpec } from '@trenchscope/shared';
import { Save } from 'lucide-react';
import { ensureLiveTradeAck } from '@/components/trade/LiveTradeAck';
import { DEFAULT_STRATEGY, StrategyEditor } from '@/components/trade/StrategyEditor';
import { Button, Drawer, Field, focusFirstError, Input, NumberInput, RangeInput, SegmentedControl, Toggle } from '@/components/ui';
import { useIsLive } from '@/hooks/useMode';
import { useTradeSettings } from '@/hooks/useSettings';
import { api, ApiError } from '@/lib/api';
import { nativeSymbol } from '@/lib/chain';
import { useSession } from '@/store/session';
import { toast } from '@/store/toasts';
import { addressError, addressPlaceholder, isAddressFor, normalizeAddress, sameAddress } from '../address';
import { splitFieldError } from '../errors';
import { FormSection, Note, PresetPicker } from '../FormBits';
import { WalletPreview } from '../previews';
import { accountKeys } from '../queries';
import { strategyError } from '../strategy';
import { TagInput } from '../TagInput';

type CopyBody = Omit<CopyTradeTask, 'id' | 'createdAt' | 'stats'>;

interface CopyForm {
  target: string;
  label: string;
  buyMode: 'fixed' | 'ratio';
  buyAmount: number | null;
  /** buyRatio shown as a percent of the target's size (1 = 100%). */
  buyRatioPct: number | null;
  maxPerToken: number | null;
  mcap: Range | undefined;
  minLiquidityUsd: number | null;
  firstBuyOnly: boolean;
  sellMode: 'mirror' | 'none';
  useStrategy: boolean;
  strategy: StrategySpec;
  blacklist: string[];
  presetId: PresetId;
}

type Errors = Partial<Record<'target' | 'label' | 'buyAmount' | 'buyRatio' | 'maxPerToken' | 'mcap' | 'minLiquidityUsd' | 'strategy' | 'blacklist' | 'form', string>>;

/** Server field names -> form fields. */
const FIELD_MAP: Record<string, keyof Errors> = {
  target: 'target',
  label: 'label',
  buyAmount: 'buyAmount',
  buyRatio: 'buyRatio',
  maxPerToken: 'maxPerToken',
  minMarketCapUsd: 'mcap',
  maxMarketCapUsd: 'mcap',
  minLiquidityUsd: 'minLiquidityUsd',
  strategy: 'strategy',
  blacklist: 'blacklist',
};

function initialForm(task: CopyTradeTask | null, target: string, defaults: { amount: number; preset: PresetId }): CopyForm {
  if (task) {
    return {
      target: task.target,
      label: task.label,
      buyMode: task.buyMode,
      buyAmount: task.buyAmount || defaults.amount,
      buyRatioPct: Number((task.buyRatio * 100).toPrecision(10)),
      maxPerToken: task.maxPerToken,
      mcap: task.minMarketCapUsd === null && task.maxMarketCapUsd === null ? undefined : { min: task.minMarketCapUsd ?? undefined, max: task.maxMarketCapUsd ?? undefined },
      minLiquidityUsd: task.minLiquidityUsd,
      firstBuyOnly: task.firstBuyOnly,
      sellMode: task.sellMode,
      useStrategy: !!task.strategy,
      strategy: task.strategy ?? DEFAULT_STRATEGY,
      blacklist: task.blacklist,
      presetId: task.presetId,
    };
  }
  return {
    target,
    label: '',
    buyMode: 'fixed',
    buyAmount: defaults.amount,
    buyRatioPct: 10,
    maxPerToken: Number((defaults.amount * 4).toPrecision(6)),
    mcap: undefined,
    minLiquidityUsd: null,
    firstBuyOnly: false,
    sellMode: 'mirror',
    useStrategy: false,
    strategy: DEFAULT_STRATEGY,
    blacklist: [],
    presetId: defaults.preset,
  };
}

export interface CopyTaskFormProps {
  open: boolean;
  onClose: () => void;
  chain: ChainId;
  /** Task being edited (null = create). */
  task: CopyTradeTask | null;
  /** Prefilled target for new tasks (?target=). */
  initialTarget?: string;
}

const FORM_ID = 'copy-task-form';

/** Create / edit drawer for a copy-trade task. State is mounted fresh on every open. */
export function CopyTaskForm(props: CopyTaskFormProps) {
  return props.open ? <CopyTaskDrawer {...props} /> : null;
}

function CopyTaskDrawer({ onClose, chain, task, initialTarget = '' }: CopyTaskFormProps) {
  const ids = useId();
  const qc = useQueryClient();
  const trade = useTradeSettings(chain);
  const own = useSession((s) => s.account?.wallets[chain]?.address);
  const balance = useSession((s) => s.account?.wallets[chain]?.nativeBalance ?? 0);
  const [form, setForm] = useState<CopyForm>(() => initialForm(task, initialTarget, { amount: trade.instantBuyAmount, preset: trade.activeBuyPreset }));
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const sym = nativeSymbol(chain);
  const liveMode = useIsLive();

  const set = <K extends keyof CopyForm>(key: K, value: CopyForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    // A server error is stale once the user edits the form.
    setErrors((e) => (Object.keys(e).length ? {} : e));
  };

  const validate = (f: CopyForm): Errors => {
    const e: Errors = {};
    const addrErr = addressError(chain, f.target, 'wallet address');
    if (addrErr) e.target = addrErr;
    else if (sameAddress(chain, f.target, own)) e.target = `That is your own ${liveMode ? '' : 'paper '}wallet — pick another trader to copy.`;
    if (f.label.trim().length > 32) e.label = 'Keep the label to 32 characters.';
    if (f.buyMode === 'fixed' && !(f.buyAmount && f.buyAmount > 0)) e.buyAmount = `Enter a buy amount in ${sym}.`;
    if (f.buyMode === 'ratio' && !(f.buyRatioPct && f.buyRatioPct > 0 && f.buyRatioPct <= 10000)) e.buyRatio = 'Enter a size between 0.01% and 10,000% of the target’s buy.';
    if (!(f.maxPerToken && f.maxPerToken > 0)) e.maxPerToken = `Enter the most ${sym} to spend per token.`;
    if (f.mcap?.min !== undefined && f.mcap?.max !== undefined && f.mcap.min > f.mcap.max) e.mcap = 'Min market cap is above max.';
    if (f.minLiquidityUsd !== null && f.minLiquidityUsd < 0) e.minLiquidityUsd = 'Liquidity cannot be negative.';
    if (f.useStrategy) {
      const s = strategyError(f.strategy);
      if (s) e.strategy = s;
    }
    return e;
  };

  const live = submitted ? validate(form) : {};
  const shown: Errors = { ...live, ...errors };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setSubmitted(true);
    setErrors({});
    const v = validate(form);
    if (Object.keys(v).length) {
      requestAnimationFrame(() => focusFirstError(FORM_ID));
      return;
    }
    const body: CopyBody = {
      chain,
      target: normalizeAddress(chain, form.target),
      label: form.label.trim(),
      enabled: task?.enabled ?? true,
      buyMode: form.buyMode,
      buyAmount: form.buyMode === 'fixed' ? form.buyAmount! : (form.buyAmount ?? 0),
      buyRatio: form.buyMode === 'ratio' ? form.buyRatioPct! / 100 : task?.buyRatio ?? 1,
      maxPerToken: form.maxPerToken!,
      minMarketCapUsd: form.mcap?.min ?? null,
      maxMarketCapUsd: form.mcap?.max ?? null,
      minLiquidityUsd: form.minLiquidityUsd,
      firstBuyOnly: form.firstBuyOnly,
      sellMode: form.sellMode,
      strategy: form.useStrategy ? form.strategy : null,
      blacklist: form.blacklist,
      presetId: form.presetId,
    };
    // Live: a new task buys with real funds on its own, so the one-time acknowledgement comes first.
    if (!task && liveMode && !(await ensureLiveTradeAck())) return;
    setPending(true);
    try {
      const saved = task ? await api.updateCopyTask(task.id, body) : await api.createCopyTask(body);
      qc.setQueryData<CopyTradeTask[]>(accountKeys.copyTasks, (list) => (list ? (task ? list.map((t) => (t.id === saved.id ? saved : t)) : [...list, saved]) : list));
      void qc.invalidateQueries({ queryKey: accountKeys.copyTasks });
      toast.success(task ? 'Copy task updated' : 'Copy task started', saved.label || `Copying ${saved.target.slice(0, 6)}…`);
      onClose();
    } catch (err) {
      const { field, message } = splitFieldError(err);
      if (err instanceof ApiError && err.status === 404 && /wallet/i.test(message)) setErrors({ target: `No wallet with this address on ${CHAINS[chain].name}.` });
      else if (/own wallet/i.test(message)) setErrors({ target: message });
      else if (field && FIELD_MAP[field]) setErrors({ [FIELD_MAP[field]]: message });
      else setErrors({ form: message });
    } finally {
      setPending(false);
    }
  };

  const fixedTooBig = form.buyMode === 'fixed' && form.buyAmount !== null && form.maxPerToken !== null && form.maxPerToken < form.buyAmount;

  return (
    <Drawer
      open
      onClose={onClose}
      title={task ? 'Edit copy task' : 'New copy task'}
      className="!w-[min(460px,100vw)]"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={FORM_ID} loading={pending} icon={<Save size={14} />}>
            {task ? 'Save changes' : 'Start copying'}
          </Button>
        </div>
      }
    >
      <form id={FORM_ID} onSubmit={(e) => void submit(e)} noValidate>
        <FormSection title="Wallet to copy" description="Every buy this wallet makes on this chain is mirrored with your size and filters.">
          <Field label="Target address" htmlFor={`${ids}-target`} error={shown.target} hint={task ? 'The target can’t be changed — create a new task to copy another wallet.' : undefined}>
            <Input
              id={`${ids}-target`}
              value={form.target}
              onChange={(e) => set('target', e.target.value)}
              placeholder={addressPlaceholder(chain)}
              invalid={!!shown.target}
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-xs"
              data-autofocus={!task || undefined}
              disabled={!!task}
              wrapperClassName={task ? 'opacity-60' : undefined}
            />
          </Field>
          {isAddressFor(chain, form.target) && <WalletPreview chain={chain} address={form.target} />}
          <Field label="Label (optional)" htmlFor={`${ids}-label`} error={shown.label} hint="Shown on the task card and in notifications.">
            <Input id={`${ids}-label`} value={form.label} onChange={(e) => set('label', e.target.value)} maxLength={32} placeholder="e.g. Smart degen #1" invalid={!!shown.label} />
          </Field>
        </FormSection>

        <FormSection title="Buy size">
          <SegmentedControl
            className="self-start"
            value={form.buyMode}
            onChange={(v) => set('buyMode', v)}
            aria-label="Buy mode"
            items={[
              { value: 'fixed', label: `Fixed ${sym}` },
              { value: 'ratio', label: '% of target' },
            ]}
          />
          {form.buyMode === 'fixed' ? (
            <Field label={`Amount per copied buy (${sym})`} htmlFor={`${ids}-amount`} error={shown.buyAmount} hint={`${liveMode ? 'Balance' : 'Paper balance'}: ${formatNative(balance, sym)}`}>
              <NumberInput
                id={`${ids}-amount`}
                value={form.buyAmount}
                onChange={(v) => set('buyAmount', v)}
                min={0}
                step={0.01}
                suffix={sym}
                presets={trade.quickBuyAmounts}
                invalid={!!shown.buyAmount}
              />
            </Field>
          ) : (
            <Field label="Size relative to the target's buy" htmlFor={`${ids}-ratio`} error={shown.buyRatio} hint="100% buys the same amount of native the target spent.">
              <NumberInput
                id={`${ids}-ratio`}
                value={form.buyRatioPct}
                onChange={(v) => set('buyRatioPct', v)}
                min={0}
                max={10000}
                step={5}
                suffix="%"
                presets={[5, 10, 25, 50, 100]}
                formatPreset={(p) => `${p}%`}
                invalid={!!shown.buyRatio}
              />
            </Field>
          )}
          <Field label={`Max spend per token (${sym})`} htmlFor={`${ids}-max`} error={shown.maxPerToken} hint="Copies stop adding to a token once this much has been spent on it.">
            <NumberInput id={`${ids}-max`} value={form.maxPerToken} onChange={(v) => set('maxPerToken', v)} min={0} step={0.1} suffix={sym} invalid={!!shown.maxPerToken} />
          </Field>
          {fixedTooBig && <Note tone="warn">The per-token cap is below the buy amount, so each copied buy is capped at {formatNative(form.maxPerToken, sym)}.</Note>}
          <Field label="Trade preset" hint="Slippage, priority fee and anti-MEV settings used for copied buys (edit them in Settings).">
            <PresetPicker chain={chain} value={form.presetId} onChange={(p) => set('presetId', p)} className="self-start" />
          </Field>
        </FormSection>

        <FormSection title="Filters" description="Skip buys that don’t match. Leave empty to copy everything.">
          <Field label="Market cap at the target’s buy (USD)" error={shown.mcap}>
            <RangeInput value={form.mcap} onChange={(v) => set('mcap', v)} prefix="$" label="Market cap" size="md" invalid={!!shown.mcap} />
          </Field>
          <Field label="Min liquidity (USD)" htmlFor={`${ids}-liq`} error={shown.minLiquidityUsd}>
            <NumberInput id={`${ids}-liq`} value={form.minLiquidityUsd} onChange={(v) => set('minLiquidityUsd', v)} min={0} step={1000} prefix="$" placeholder="Any" />
          </Field>
          <Toggle checked={form.firstBuyOnly} onChange={(v) => set('firstBuyOnly', v)} label="First buy only" description="Copy only the target’s first buy of each token, not later adds." />
          <Field label="Blacklist (token addresses)" htmlFor={`${ids}-bl`} error={shown.blacklist} hint="Press Enter after each address; paste a list to add many.">
            <TagInput
              id={`${ids}-bl`}
              value={form.blacklist}
              onChange={(v) => set('blacklist', v)}
              normalize={(s) => normalizeAddress(chain, s)}
              validate={(s) => addressError(chain, s, 'token address')}
              placeholder={addressPlaceholder(chain)}
              max={500}
              mono
              invalid={!!shown.blacklist}
            />
          </Field>
        </FormSection>

        <FormSection title="Selling">
          <SegmentedControl
            className="self-start"
            value={form.sellMode}
            onChange={(v) => set('sellMode', v)}
            aria-label="Sell mode"
            items={[
              { value: 'mirror', label: 'Mirror sells' },
              { value: 'none', label: 'Don’t mirror' },
            ]}
          />
          <p className="text-xs text-muted">
            {form.sellMode === 'mirror'
              ? 'When the target sells part of a position, the same share of your copied position is sold.'
              : 'Target sells are ignored; positions exit through your strategy below or manually.'}
          </p>
          <Toggle checked={form.useStrategy} onChange={(v) => set('useStrategy', v)} label="Attach exit strategy" description="Take-profit / stop-loss orders placed on every copied buy." />
          {form.useStrategy && <StrategyEditor value={form.strategy} onChange={(s) => set('strategy', s)} compact />}
          {shown.strategy && <Note tone="error">{shown.strategy}</Note>}
          {form.sellMode === 'none' && !form.useStrategy && <Note tone="warn">With no mirrored sells and no exit strategy, copied positions only close when you sell them yourself.</Note>}
        </FormSection>

        <FormSection title="Before you start">
          <Note tone="warn" title="Copy trading is risky">
            Targets can dump on their copiers, your fills land after theirs (worse prices), and a busy wallet can drain your balance quickly. Caps and filters limit
            the damage. {liveMode ? 'Copied trades execute on Solana mainnet with real funds.' : 'This is paper trading on a simulated market.'}
          </Note>
          {shown.form && <Note tone="error">{shown.form}</Note>}
        </FormSection>
      </form>
    </Drawer>
  );
}
