import { useId, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CHAIN_IDS, CHAINS, type AlertKind, type AlertRule, type ChainId, type SignalFilterGroup, type SignalKind } from '@trenchscope/shared';
import { BellPlus, Save } from 'lucide-react';
import { ChainIcon, Price, Usd } from '@/components/common';
import { SIGNAL_META, SIGNAL_ORDER } from '@/components/signals/meta';
import { Button, Checkbox, Drawer, Field, focusFirstError, Input, NumberInput, SegmentedControl, Select, Toggle } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/store/toasts';
import { addressError, addressPlaceholder, isAddressFor, normalizeAddress } from '../address';
import { splitFieldError } from '../errors';
import { FormSection, Note } from '../FormBits';
import { TokenPreview, WalletPreview } from '../previews';
import { accountKeys, useTokenMeta } from '../queries';
import { ALERT_KIND, ALERT_KINDS } from './meta';

type AlertBody = Omit<AlertRule, 'id' | 'createdAt' | 'lastTriggeredAt'>;

interface AlertFormState {
  kind: AlertKind;
  chain: ChainId;
  token: string;
  wallet: string;
  keyword: string;
  direction: 'above' | 'below';
  value: number | null;
  repeat: boolean;
  note: string;
  // signal_subscription (the form edits the first group; others are kept as they are)
  signalName: string;
  /** Empty = every kind. */
  signalKinds: SignalKind[];
  minLiquidityUsd: number | null;
  mcMin: number | null;
  mcMax: number | null;
  minHolders: number | null;
  /** Percent (0-100) in the form, a ratio on the rule. */
  maxTop10Pct: number | null;
  maxAgeMin: number | null;
  excludeRisk: boolean;
  maxPerHour: number | null;
}

type ErrorKey = 'token' | 'wallet' | 'keyword' | 'value' | 'note' | 'signalName' | 'mcMax' | 'maxTop10Pct' | 'maxPerHour' | 'form';

const SIGNAL_DEFAULTS = {
  signalName: '',
  signalKinds: [] as SignalKind[],
  minLiquidityUsd: null,
  mcMin: null,
  mcMax: null,
  minHolders: null,
  maxTop10Pct: null,
  maxAgeMin: null,
  excludeRisk: true,
  maxPerHour: 30,
};

/** The form's signal fields from a rule's first group. */
function signalState(rule: AlertRule): Partial<AlertFormState> {
  const g = rule.signals?.groups[0];
  if (!rule.signals || !g) return {};
  return {
    signalName: rule.signals.name,
    signalKinds: g.kinds,
    minLiquidityUsd: g.minLiquidityUsd ?? null,
    mcMin: g.mcMin ?? null,
    mcMax: g.mcMax ?? null,
    minHolders: g.minHolders ?? null,
    maxTop10Pct: g.maxTop10 !== null && g.maxTop10 !== undefined ? Math.round(g.maxTop10 * 1000) / 10 : null,
    maxAgeMin: g.maxAgeMin ?? null,
    excludeRisk: g.excludeRisk,
    maxPerHour: rule.signals.maxPerHour,
  };
}
type Errors = Partial<Record<ErrorKey, string>>;

function initialState(rule: AlertRule | null, chain: ChainId, prefill?: Partial<AlertFormState>): AlertFormState {
  if (rule) {
    return {
      kind: rule.kind,
      chain: rule.chain,
      token: rule.token ?? '',
      wallet: rule.wallet ?? '',
      keyword: rule.keyword ?? '',
      direction: rule.direction ?? 'above',
      value: rule.kind === 'wallet_trade' || rule.kind === 'new_token' || rule.kind === 'signal_subscription' ? null : rule.value,
      repeat: rule.repeat,
      note: rule.note,
      ...SIGNAL_DEFAULTS,
      ...signalState(rule),
    };
  }
  return { kind: 'price', chain, token: '', wallet: '', keyword: '', direction: 'above', value: null, repeat: false, note: '', ...SIGNAL_DEFAULTS, ...prefill };
}

export interface AlertFormProps {
  open: boolean;
  onClose: () => void;
  /** Rule being edited (null = create). */
  rule: AlertRule | null;
  /** Default chain for new rules. */
  chain: ChainId;
  /** Prefill for new rules (e.g. ?token= from a token page, the Signals page's Subscribe). */
  prefill?: Partial<AlertFormState>;
}

export type AlertPrefill = Partial<AlertFormState>;

const FORM_ID = 'alert-form';

/** Create / edit drawer for an alert rule; fields adapt to the alert kind. */
export function AlertForm(props: AlertFormProps) {
  return props.open ? <AlertDrawer {...props} /> : null;
}

function AlertDrawer({ onClose, rule, chain: defaultChain, prefill }: AlertFormProps) {
  const ids = useId();
  const qc = useQueryClient();
  const [form, setForm] = useState<AlertFormState>(() => initialState(rule, defaultChain, prefill));
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const meta = ALERT_KIND[form.kind];
  const token = useTokenMeta(form.chain, meta.subject === 'token' ? form.token : null).data;

  const set = <K extends keyof AlertFormState>(key: K, value: AlertFormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (Object.keys(e).length ? {} : e));
  };

  const validate = (f: AlertFormState): Errors => {
    const e: Errors = {};
    const m = ALERT_KIND[f.kind];
    if (m.subject === 'token') {
      const err = addressError(f.chain, f.token, 'token address');
      if (err) e.token = err;
    }
    if (m.subject === 'wallet') {
      const err = addressError(f.chain, f.wallet, 'wallet address');
      if (err) e.wallet = err;
      if (f.token.trim()) {
        const tErr = addressError(f.chain, f.token, 'token address');
        if (tErr) e.token = tErr;
      }
    }
    if (m.subject === 'keyword') {
      const kw = f.keyword.trim();
      if (!kw) e.keyword = 'Enter a keyword to match in new token names or symbols.';
      else if (kw.length > 32) e.keyword = 'Keep the keyword to 32 characters.';
    }
    if (m.subject === 'signals') {
      if (f.signalName.trim().length > 40) e.signalName = 'Keep the name to 40 characters.';
      if (f.mcMin !== null && f.mcMax !== null && f.mcMin > f.mcMax) e.mcMax = 'Max market cap is below min.';
      if (f.maxTop10Pct !== null && !(f.maxTop10Pct >= 0 && f.maxTop10Pct <= 100)) e.maxTop10Pct = 'Enter a share between 0 and 100%.';
      if (!(f.maxPerHour !== null && Number.isInteger(f.maxPerHour) && f.maxPerHour >= 1 && f.maxPerHour <= 120)) e.maxPerHour = 'Enter a whole number from 1 to 120.';
    }
    if (m.value === 'count') {
      if (!(f.value !== null && Number.isInteger(f.value) && f.value >= 1)) e.value = 'Enter a whole number of buys (1 or more).';
    } else if (m.value !== 'none' && !(f.value !== null && f.value > 0)) {
      e.value = m.value === 'pct' ? 'Enter a percentage above 0.' : 'Enter a value above 0.';
    }
    if (f.note.length > 140) e.note = 'Keep the note to 140 characters.';
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
    const m = ALERT_KIND[form.kind];
    const group: SignalFilterGroup = {
      kinds: form.signalKinds,
      minLiquidityUsd: form.minLiquidityUsd,
      mcMin: form.mcMin,
      mcMax: form.mcMax,
      minHolders: form.minHolders,
      maxTop10: form.maxTop10Pct === null ? null : form.maxTop10Pct / 100,
      maxAgeMin: form.maxAgeMin,
      excludeRisk: form.excludeRisk,
    };
    const body: AlertBody = {
      chain: form.chain,
      kind: form.kind,
      token: m.subject === 'token' || (m.subject === 'wallet' && form.token.trim()) ? normalizeAddress(form.chain, form.token) : null,
      wallet: m.subject === 'wallet' ? normalizeAddress(form.chain, form.wallet) : null,
      keyword: m.subject === 'keyword' ? form.keyword.trim() : null,
      direction: m.directional ? form.direction : null,
      value: m.value === 'none' ? 0 : form.value!,
      repeat: form.repeat,
      enabled: true,
      note: form.note.trim(),
      signals:
        m.subject === 'signals'
          ? { name: form.signalName.trim(), groups: [group, ...(rule?.signals?.groups.slice(1) ?? [])], maxPerHour: form.maxPerHour ?? 30 }
          : null,
    };
    setPending(true);
    try {
      const saved = rule ? await api.updateAlert(rule.id, body) : await api.createAlert(body);
      qc.setQueryData<AlertRule[]>(accountKeys.alerts, (list) => (list ? (rule ? list.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...list]) : list));
      void qc.invalidateQueries({ queryKey: accountKeys.alerts });
      toast.success(rule ? 'Alert updated' : 'Alert created', `${ALERT_KIND[saved.kind].label} alert is ${saved.enabled ? 'active' : 'paused'}.`);
      onClose();
    } catch (err) {
      const { field, message } = splitFieldError(err);
      if (err instanceof ApiError && err.status === 404) {
        if (/token/i.test(message)) setErrors({ token: `No token with this address on ${CHAINS[form.chain].name}.` });
        else if (/wallet/i.test(message)) setErrors({ wallet: `No wallet with this address on ${CHAINS[form.chain].name}.` });
        else setErrors({ form: message });
      } else if (field && ['token', 'wallet', 'keyword', 'value', 'note'].includes(field)) setErrors({ [field]: message });
      else if (field === 'signals') setErrors({ form: message });
      else setErrors({ form: message });
    } finally {
      setPending(false);
    }
  };

  const valueField = () => {
    if (meta.value === 'none') return null;
    if (meta.value === 'count') {
      return (
        <Field label="Smart-money buys within 5 minutes" htmlFor={`${ids}-value`} error={shown.value}>
          <NumberInput id={`${ids}-value`} value={form.value} onChange={(v) => set('value', v)} min={1} step={1} presets={[2, 3, 5, 10]} invalid={!!shown.value} />
        </Field>
      );
    }
    const label = meta.value === 'pct' ? (form.direction === 'above' ? 'Rises by at least' : 'Falls by at least') : form.kind === 'price' ? 'Price (USD)' : 'Market cap (USD)';
    const current = token ? (form.kind === 'price' ? token.priceUsd : form.kind === 'mcap' ? token.marketCapUsd : null) : null;
    return (
      <Field label={label} htmlFor={`${ids}-value`} error={shown.value}>
        <NumberInput
          id={`${ids}-value`}
          value={form.value}
          onChange={(v) => set('value', v)}
          min={0}
          step={meta.value === 'pct' ? 5 : current ? Number(current.toPrecision(1)) / 10 || 1 : 1}
          prefix={meta.value === 'pct' ? undefined : '$'}
          suffix={meta.value === 'pct' ? '%' : undefined}
          presets={meta.value === 'pct' ? [10, 25, 50, 100] : current ? [0.5, 0.8, 1.25, 2].map((x) => Number((current * x).toPrecision(3))) : undefined}
          formatPreset={meta.value === 'pct' ? (p) => `${p}%` : (p) => (form.kind === 'price' ? <Price value={p} significant={3} /> : <Usd value={p} />)}
          placeholder={meta.value === 'pct' ? '20' : undefined}
          invalid={!!shown.value}
        />
      </Field>
    );
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={rule ? 'Edit alert' : 'New alert'}
      className="!w-[min(440px,100vw)]"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={FORM_ID} loading={pending} icon={rule ? <Save size={14} /> : <BellPlus size={14} />}>
            {rule ? 'Save alert' : 'Create alert'}
          </Button>
        </div>
      }
    >
      <form id={FORM_ID} onSubmit={(e) => void submit(e)} noValidate>
        <FormSection title="Trigger">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <Field label="Alert type" htmlFor={`${ids}-kind`}>
              <Select
                id={`${ids}-kind`}
                value={form.kind}
                onChange={(k) => set('kind', k)}
                aria-label="Alert type"
                options={ALERT_KINDS.map((k) => {
                  const M = ALERT_KIND[k];
                  return { value: k, label: M.label, icon: <M.icon size={13} className="text-muted" /> };
                })}
              />
            </Field>
            <Field label="Chain" htmlFor={`${ids}-chain`}>
              <Select
                id={`${ids}-chain`}
                value={form.chain}
                onChange={(c) => set('chain', c)}
                aria-label="Chain"
                disabled={!!rule}
                className="w-[128px]"
                options={CHAIN_IDS.map((c) => ({ value: c, label: CHAINS[c].name, icon: <ChainIcon chain={c} size={14} /> }))}
              />
            </Field>
          </div>
          <p className="text-xs text-muted">{meta.description}</p>

          {meta.subject === 'token' && (
            <>
              <Field label="Token address" htmlFor={`${ids}-token`} error={shown.token}>
                <Input
                  id={`${ids}-token`}
                  value={form.token}
                  onChange={(e) => set('token', e.target.value)}
                  placeholder={addressPlaceholder(form.chain)}
                  className="font-mono text-xs"
                  autoComplete="off"
                  spellCheck={false}
                  invalid={!!shown.token}
                  data-autofocus
                />
              </Field>
              {isAddressFor(form.chain, form.token) && <TokenPreview chain={form.chain} address={form.token} />}
            </>
          )}

          {meta.subject === 'wallet' && (
            <>
              <Field label="Wallet address" htmlFor={`${ids}-wallet`} error={shown.wallet}>
                <Input
                  id={`${ids}-wallet`}
                  value={form.wallet}
                  onChange={(e) => set('wallet', e.target.value)}
                  placeholder={addressPlaceholder(form.chain)}
                  className="font-mono text-xs"
                  autoComplete="off"
                  spellCheck={false}
                  invalid={!!shown.wallet}
                  data-autofocus
                />
              </Field>
              {isAddressFor(form.chain, form.wallet) && <WalletPreview chain={form.chain} address={form.wallet} />}
              <Field label="Only trades of this token (optional)" htmlFor={`${ids}-wtoken`} error={shown.token}>
                <Input
                  id={`${ids}-wtoken`}
                  value={form.token}
                  onChange={(e) => set('token', e.target.value)}
                  placeholder="Any token"
                  className="font-mono text-xs"
                  autoComplete="off"
                  spellCheck={false}
                  invalid={!!shown.token}
                />
              </Field>
            </>
          )}

          {meta.subject === 'signals' && (
            <>
              <Field label="Name (optional)" htmlFor={`${ids}-sname`} error={shown.signalName}>
                <Input id={`${ids}-sname`} value={form.signalName} onChange={(e) => set('signalName', e.target.value)} maxLength={40} placeholder="e.g. Smart entries" invalid={!!shown.signalName} data-autofocus />
              </Field>
              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1 text-xs font-medium text-muted">Signal kinds (none picked = every kind)</legend>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {SIGNAL_ORDER.map((k) => (
                    <Checkbox
                      key={k}
                      checked={form.signalKinds.includes(k)}
                      onChange={(on) => set('signalKinds', on ? [...form.signalKinds, k] : form.signalKinds.filter((x) => x !== k))}
                      label={SIGNAL_META[k].label}
                    />
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {meta.subject === 'keyword' && (
            <Field label="Keyword" htmlFor={`${ids}-kw`} error={shown.keyword} hint="Case-insensitive match against new token names and symbols.">
              <Input id={`${ids}-kw`} value={form.keyword} onChange={(e) => set('keyword', e.target.value)} maxLength={32} placeholder="e.g. cat" invalid={!!shown.keyword} data-autofocus />
            </Field>
          )}
        </FormSection>

        {meta.subject === 'signals' && (
          <FormSection title="Token filters">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Min liquidity (USD)" htmlFor={`${ids}-liq`}>
                <NumberInput id={`${ids}-liq`} value={form.minLiquidityUsd} onChange={(v) => set('minLiquidityUsd', v)} min={0} step={1000} prefix="$" placeholder="Any" />
              </Field>
              <Field label="Min holders" htmlFor={`${ids}-holders`}>
                <NumberInput id={`${ids}-holders`} value={form.minHolders} onChange={(v) => set('minHolders', v)} min={0} step={10} placeholder="Any" />
              </Field>
              <Field label="Market cap min (USD)" htmlFor={`${ids}-mcmin`}>
                <NumberInput id={`${ids}-mcmin`} value={form.mcMin} onChange={(v) => set('mcMin', v)} min={0} step={10_000} prefix="$" placeholder="Any" invalid={!!shown.mcMax} />
              </Field>
              <Field label="Market cap max (USD)" htmlFor={`${ids}-mcmax`} error={shown.mcMax}>
                <NumberInput id={`${ids}-mcmax`} value={form.mcMax} onChange={(v) => set('mcMax', v)} min={0} step={10_000} prefix="$" placeholder="Any" invalid={!!shown.mcMax} />
              </Field>
              <Field label="Max top-10 share" htmlFor={`${ids}-top10`} error={shown.maxTop10Pct}>
                <NumberInput id={`${ids}-top10`} value={form.maxTop10Pct} onChange={(v) => set('maxTop10Pct', v)} min={0} max={100} step={5} suffix="%" placeholder="Any" invalid={!!shown.maxTop10Pct} />
              </Field>
              <Field label="Max token age (minutes)" htmlFor={`${ids}-age`}>
                <NumberInput id={`${ids}-age`} value={form.maxAgeMin} onChange={(v) => set('maxAgeMin', v)} min={0} step={30} placeholder="Any" />
              </Field>
            </div>
            <Toggle
              checked={form.excludeRisk}
              onChange={(v) => set('excludeRisk', v)}
              label="Skip low-quality tokens"
              description="Leaves out tokens with a rug ratio above 30%, wash trading or a honeypot contract."
            />
          </FormSection>
        )}

        {(meta.directional || meta.value !== 'none') && (
          <FormSection title="Condition">
            {meta.directional && (
              <SegmentedControl
            className="self-start"
                value={form.direction}
                onChange={(d) => set('direction', d)}
                aria-label="Direction"
                items={
                  form.kind === 'change'
                    ? [
                        { value: 'above', label: 'Pumps' },
                        { value: 'below', label: 'Dumps' },
                      ]
                    : [
                        { value: 'above', label: 'Goes above' },
                        { value: 'below', label: 'Goes below' },
                      ]
                }
              />
            )}
            {valueField()}
          </FormSection>
        )}

        <FormSection title="Delivery">
          <Toggle
            checked={form.repeat}
            onChange={(v) => set('repeat', v)}
            label="Repeat"
            description={
              form.repeat
                ? meta.subject === 'signals'
                  ? 'Keeps notifying; a token’s signals within a minute arrive together.'
                  : 'Keeps firing, at most once a minute.'
                : 'Fires once, then switches itself off.'
            }
          />
          {meta.subject === 'signals' && (
            <Field label="At most per hour" htmlFor={`${ids}-perhour`} error={shown.maxPerHour} hint="Signals past the limit are skipped until the hour rolls over.">
              <NumberInput id={`${ids}-perhour`} value={form.maxPerHour} onChange={(v) => set('maxPerHour', v)} min={1} max={120} step={5} presets={[10, 30, 60]} invalid={!!shown.maxPerHour} />
            </Field>
          )}
          <Field label="Note (optional)" htmlFor={`${ids}-note`} error={shown.note} hint={`${form.note.length}/140 · added to the notification`}>
            <Input id={`${ids}-note`} value={form.note} onChange={(e) => set('note', e.target.value)} maxLength={140} placeholder="Why you set this alert" invalid={!!shown.note} />
          </Field>
          <p className="text-xs text-muted">Alerts arrive in the bell menu, as a toast while the app is open, and on the Notifications tab.</p>
          {shown.form && <Note tone="error">{shown.form}</Note>}
        </FormSection>
      </form>
    </Drawer>
  );
}
