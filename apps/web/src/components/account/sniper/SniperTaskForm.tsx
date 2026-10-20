import { useId, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CHAINS, formatNative, type ChainId, type PresetId, type SniperKind, type SniperTask, type StrategySpec } from '@trenchscope/shared';
import { Crosshair } from 'lucide-react';
import { DEFAULT_STRATEGY, StrategyEditor } from '@/components/trade/StrategyEditor';
import { Button, Drawer, Field, focusFirstError, Input, NumberInput, SegmentedControl, Toggle } from '@/components/ui';
import { useTradeSettings } from '@/hooks/useSettings';
import { api } from '@/lib/api';
import { nativeSymbol } from '@/lib/chain';
import { useSession } from '@/store/session';
import { toast } from '@/store/toasts';
import { addressError, addressPlaceholder, normalizeAddress } from '../address';
import { splitFieldError } from '../errors';
import { FormSection, Note, PresetPicker } from '../FormBits';
import { accountKeys } from '../queries';
import { strategyError } from '../strategy';
import { TagInput } from '../TagInput';
import { LaunchpadPicker } from './LaunchpadPicker';
import { SNIPER_KIND, SNIPER_KINDS } from './meta';

type SniperBody = Omit<SniperTask, 'id' | 'createdAt' | 'buysDone' | 'lastTriggeredAt'>;

interface SniperForm {
  kind: SniperKind;
  label: string;
  keywords: string[];
  devAddresses: string[];
  launchpads: string[];
  requireSocials: boolean;
  /** maxDevHoldRate as a percent. */
  maxDevHoldPct: number | null;
  minDevMigrated: number | null;
  buyAmount: number | null;
  maxBuys: number | null;
  useStrategy: boolean;
  strategy: StrategySpec;
  presetId: PresetId;
}

type ErrorKey = 'label' | 'keywords' | 'devAddresses' | 'launchpads' | 'maxDevHold' | 'minDevMigrated' | 'buyAmount' | 'maxBuys' | 'strategy' | 'form';
type Errors = Partial<Record<ErrorKey, string>>;

const FIELD_MAP: Record<string, ErrorKey> = {
  label: 'label',
  keywords: 'keywords',
  devAddresses: 'devAddresses',
  launchpads: 'launchpads',
  maxDevHoldRate: 'maxDevHold',
  minDevMigrated: 'minDevMigrated',
  buyAmount: 'buyAmount',
  maxBuys: 'maxBuys',
  strategy: 'strategy',
};

function initialForm(task: SniperTask | null, defaults: { amount: number; preset: PresetId }): SniperForm {
  if (task) {
    return {
      kind: task.kind,
      label: task.label,
      keywords: task.keywords,
      devAddresses: task.devAddresses,
      launchpads: task.launchpads,
      requireSocials: task.requireSocials,
      maxDevHoldPct: task.maxDevHoldRate === null ? null : Number((task.maxDevHoldRate * 100).toPrecision(10)),
      minDevMigrated: task.minDevMigrated,
      buyAmount: task.buyAmount,
      maxBuys: task.maxBuys,
      useStrategy: !!task.strategy,
      strategy: task.strategy ?? DEFAULT_STRATEGY,
      presetId: task.presetId,
    };
  }
  return {
    kind: 'new_token',
    label: '',
    keywords: [],
    devAddresses: [],
    launchpads: [],
    requireSocials: true,
    maxDevHoldPct: 10,
    minDevMigrated: null,
    buyAmount: defaults.amount,
    maxBuys: 3,
    useStrategy: true,
    strategy: DEFAULT_STRATEGY,
    presetId: defaults.preset,
  };
}

export interface SniperTaskFormProps {
  open: boolean;
  onClose: () => void;
  chain: ChainId;
  task: SniperTask | null;
  /** Prefill kind / dev address for new tasks (e.g. ?dev= from a wallet page). */
  initial?: { kind?: SniperKind; dev?: string };
}

const FORM_ID = 'sniper-task-form';

/** Create / edit drawer for a sniper task. State is mounted fresh on every open. */
export function SniperTaskForm(props: SniperTaskFormProps) {
  return props.open ? <SniperTaskDrawer {...props} /> : null;
}

function SniperTaskDrawer({ onClose, chain, task, initial }: SniperTaskFormProps) {
  const ids = useId();
  const qc = useQueryClient();
  const trade = useTradeSettings(chain);
  const balance = useSession((s) => s.account?.wallets[chain]?.nativeBalance ?? 0);
  const [form, setForm] = useState<SniperForm>(() => {
    const f = initialForm(task, { amount: trade.instantBuyAmount, preset: trade.activeBuyPreset });
    if (!task && initial?.kind) f.kind = initial.kind;
    if (!task && initial?.dev) f.devAddresses = [normalizeAddress(chain, initial.dev)];
    return f;
  });
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const sym = nativeSymbol(chain);

  const set = <K extends keyof SniperForm>(key: K, value: SniperForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (Object.keys(e).length ? {} : e));
  };

  const validate = (f: SniperForm): Errors => {
    const e: Errors = {};
    if (f.label.trim().length > 32) e.label = 'Keep the label to 32 characters.';
    if (f.kind === 'dev_launch' && f.devAddresses.length === 0) e.devAddresses = 'Add at least one dev wallet to watch.';
    if (f.maxDevHoldPct !== null && !(f.maxDevHoldPct >= 0 && f.maxDevHoldPct <= 100)) e.maxDevHold = 'Enter a share between 0% and 100%.';
    if (f.minDevMigrated !== null && !(Number.isInteger(f.minDevMigrated) && f.minDevMigrated >= 0)) e.minDevMigrated = 'Enter a whole number (0 or more).';
    if (!(f.buyAmount && f.buyAmount > 0)) e.buyAmount = `Enter a buy amount in ${sym}.`;
    if (!(f.maxBuys && Number.isInteger(f.maxBuys) && f.maxBuys >= 1 && f.maxBuys <= 1000)) e.maxBuys = 'Enter a whole number between 1 and 1,000.';
    if (f.useStrategy) {
      const s = strategyError(f.strategy);
      if (s) e.strategy = s;
    }
    return e;
  };

  const shown: Errors = { ...(submitted ? validate(form) : {}), ...errors };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setSubmitted(true);
    setErrors({});
    if (Object.keys(validate(form)).length) {
      requestAnimationFrame(() => focusFirstError(FORM_ID));
      return;
    }
    const strategy = form.useStrategy ? (form.kind === 'migration' ? { ...form.strategy, migrationSellPercent: 0 } : form.strategy) : null;
    const body: SniperBody = {
      chain,
      kind: form.kind,
      label: form.label.trim(),
      enabled: task ? task.enabled || (task.buysDone >= task.maxBuys && form.maxBuys! > task.buysDone) : true,
      keywords: form.keywords,
      devAddresses: form.devAddresses,
      launchpads: form.launchpads,
      requireSocials: form.requireSocials,
      maxDevHoldRate: form.maxDevHoldPct === null ? null : form.maxDevHoldPct / 100,
      minDevMigrated: form.minDevMigrated,
      buyAmount: form.buyAmount!,
      maxBuys: form.maxBuys!,
      strategy,
      presetId: form.presetId,
    };
    setPending(true);
    try {
      const saved = task ? await api.updateSniperTask(task.id, body) : await api.createSniperTask(body);
      qc.setQueryData<SniperTask[]>(accountKeys.sniperTasks, (list) => (list ? (task ? list.map((t) => (t.id === saved.id ? saved : t)) : [...list, saved]) : list));
      void qc.invalidateQueries({ queryKey: accountKeys.sniperTasks });
      toast.success(task ? 'Sniper updated' : 'Sniper armed', saved.label || SNIPER_KIND[saved.kind].label);
      onClose();
    } catch (err) {
      const { field, message } = splitFieldError(err);
      if (field && FIELD_MAP[field]) setErrors({ [FIELD_MAP[field]]: message });
      else setErrors({ form: message });
    } finally {
      setPending(false);
    }
  };

  const noFilters =
    form.kind !== 'dev_launch' &&
    form.keywords.length === 0 &&
    form.devAddresses.length === 0 &&
    form.launchpads.length === 0 &&
    !form.requireSocials &&
    form.maxDevHoldPct === null &&
    form.minDevMigrated === null;
  const budget = (form.buyAmount ?? 0) * (form.maxBuys ?? 0);
  const kindMeta = SNIPER_KIND[form.kind];

  return (
    <Drawer
      open
      onClose={onClose}
      title={task ? 'Edit sniper' : 'New sniper'}
      className="!w-[min(460px,100vw)]"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={FORM_ID} loading={pending} icon={<Crosshair size={14} />}>
            {task ? 'Save changes' : 'Arm sniper'}
          </Button>
        </div>
      }
    >
      <form id={FORM_ID} onSubmit={(e) => void submit(e)} noValidate>
        <FormSection title="What to snipe">
          <SegmentedControl
            className="self-start"
            value={form.kind}
            onChange={(k) => set('kind', k)}
            aria-label="Sniper type"
            items={SNIPER_KINDS.map((k) => {
              const M = SNIPER_KIND[k];
              return { value: k, label: M.label, icon: <M.icon size={12} /> };
            })}
          />
          <p className="text-xs text-muted">{kindMeta.description}</p>
          <Field label="Label (optional)" htmlFor={`${ids}-label`} error={shown.label}>
            <Input id={`${ids}-label`} value={form.label} onChange={(e) => set('label', e.target.value)} maxLength={32} placeholder={`e.g. ${kindMeta.label} · cats`} invalid={!!shown.label} data-autofocus />
          </Field>
        </FormSection>

        <FormSection title="Match" description="A token must pass every filter you set. Leave a filter empty to ignore it.">
          {form.kind === 'dev_launch' && (
            <Field label="Dev wallets" htmlFor={`${ids}-devs`} error={shown.devAddresses} hint="Press Enter after each address; paste a list to add many.">
              <TagInput
                id={`${ids}-devs`}
                value={form.devAddresses}
                onChange={(v) => set('devAddresses', v)}
                normalize={(s) => normalizeAddress(chain, s)}
                validate={(s) => addressError(chain, s, 'wallet address')}
                placeholder={addressPlaceholder(chain)}
                max={50}
                mono
                invalid={!!shown.devAddresses}
              />
            </Field>
          )}
          <Field label="Name / symbol keywords (any)" htmlFor={`${ids}-kw`} error={shown.keywords} hint="Matches when the name or symbol contains any keyword.">
            <TagInput id={`${ids}-kw`} value={form.keywords} onChange={(v) => set('keywords', v)} placeholder="cat, ai, pepe…" max={20} maxLength={32} invalid={!!shown.keywords} />
          </Field>
          <Field label="Launchpads" error={shown.launchpads}>
            <LaunchpadPicker chain={chain} value={form.launchpads} onChange={(v) => set('launchpads', v)} />
          </Field>
          <Toggle checked={form.requireSocials} onChange={(v) => set('requireSocials', v)} label="Require socials" description="Skip tokens without an X, Telegram or website link." />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Max dev holding" htmlFor={`${ids}-devhold`} error={shown.maxDevHold}>
              <NumberInput id={`${ids}-devhold`} value={form.maxDevHoldPct} onChange={(v) => set('maxDevHoldPct', v)} min={0} max={100} step={1} suffix="%" placeholder="Any" invalid={!!shown.maxDevHold} />
            </Field>
            <Field label="Min dev migrations" htmlFor={`${ids}-devmig`} error={shown.minDevMigrated}>
              <NumberInput id={`${ids}-devmig`} value={form.minDevMigrated} onChange={(v) => set('minDevMigrated', v)} min={0} step={1} placeholder="Any" invalid={!!shown.minDevMigrated} />
            </Field>
          </div>
          {form.kind !== 'dev_launch' && (
            <Field label="Only these devs (optional)" htmlFor={`${ids}-devs2`} error={shown.devAddresses}>
              <TagInput
                id={`${ids}-devs2`}
                value={form.devAddresses}
                onChange={(v) => set('devAddresses', v)}
                normalize={(s) => normalizeAddress(chain, s)}
                validate={(s) => addressError(chain, s, 'wallet address')}
                placeholder={addressPlaceholder(chain)}
                max={50}
                mono
              />
            </Field>
          )}
          {noFilters && (
            <Note tone="warn">
              No filters set: this matches every {form.kind === 'migration' ? 'migration' : 'launch'} on {CHAINS[chain].name}
              {form.kind === 'new_token' ? ` (about ${CHAINS[chain].launchesPerMinute} per minute)` : ''} until max buys is reached.
            </Note>
          )}
        </FormSection>

        <FormSection title="Buy">
          <Field label={`Amount per snipe (${sym})`} htmlFor={`${ids}-amount`} error={shown.buyAmount}>
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
          <Field label="Max buys" htmlFor={`${ids}-max`} error={shown.maxBuys} hint="The sniper switches itself off after this many buys.">
            <NumberInput id={`${ids}-max`} value={form.maxBuys} onChange={(v) => set('maxBuys', v)} min={1} max={1000} step={1} presets={[1, 3, 5, 10]} invalid={!!shown.maxBuys} />
          </Field>
          {task && task.buysDone > 0 && <p className="text-xs text-muted">{task.buysDone} buy{task.buysDone === 1 ? '' : 's'} done so far — raise max buys to keep sniping.</p>}
          {budget > balance && (
            <Note tone="warn">
              Up to {formatNative(budget, sym)} could be spent, more than your {formatNative(balance, sym)} paper balance. Later snipes fail once the balance runs out.
            </Note>
          )}
          <Field label="Trade preset" hint="Higher presets pay more priority fee to land earlier in the block.">
            <PresetPicker chain={chain} value={form.presetId} onChange={(p) => set('presetId', p)} className="self-start" />
          </Field>
        </FormSection>

        <FormSection title="Exit strategy" description="Exit orders placed on every sniped position.">
          <Toggle checked={form.useStrategy} onChange={(v) => set('useStrategy', v)} label="Attach exit strategy" />
          {form.useStrategy && <StrategyEditor value={form.strategy} onChange={(s) => set('strategy', s)} hideMigration={form.kind === 'migration'} compact />}
          {shown.strategy && <Note tone="error">{shown.strategy}</Note>}
          {!form.useStrategy && <Note tone="warn">Without exit rules, sniped tokens stay in your portfolio until you sell them.</Note>}
        </FormSection>

        <FormSection title="Before you arm it">
          <Note tone="warn" title="Sniping is high risk">
            Most fresh launches go to zero, devs and bundlers often dump on the first buyers, and every snipe pays fees. Keep sizes small and use exits. Paper
            trading on a simulated market.
          </Note>
          {shown.form && <Note tone="error">{shown.form}</Note>}
        </FormSection>
      </form>
    </Drawer>
  );
}
