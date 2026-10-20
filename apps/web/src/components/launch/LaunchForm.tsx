// The launch form's sections: launchpad, token identity (name, ticker,
// description, logo), socials, dev buy, bundle wallets, exit strategy and
// trade preset. Controlled: the page owns the state and the checks.

import { useId, type ReactNode } from 'react';
import { CHAINS, formatPercent, type ChainId, type LaunchConfig } from '@trenchscope/shared';
import { Globe, Send } from 'lucide-react';
import { FormSection, Note, PresetPicker } from '@/components/account/FormBits';
import { StrategyEditor } from '@/components/trade/StrategyEditor';
import { Field, Input, NumberInput, SegmentedControl, Toggle } from '@/components/ui';
import { XMark } from '@/components/wallet';
import { DEV_BUY_PRESETS, normalizeSymbol, type CreationBlock, type LaunchErrors, type LaunchForm as Form, type SocialKey } from './model';
import { GlyphPicker, LaunchpadCards } from './Pickers';

const SOCIALS: { key: SocialKey; label: string; icon: ReactNode; placeholder: string }[] = [
  { key: 'twitter', label: 'X (Twitter)', icon: <XMark size={12} />, placeholder: 'https://x.com/yourtoken' },
  { key: 'telegram', label: 'Telegram', icon: <Send size={12} />, placeholder: 'https://t.me/yourtoken' },
  { key: 'website', label: 'Website', icon: <Globe size={12} />, placeholder: 'https://yourtoken.fun' },
];

export interface LaunchFormProps {
  id: string;
  chain: ChainId;
  config: LaunchConfig;
  form: Form;
  onChange: <K extends keyof Form>(key: K, value: Form[K]) => void;
  errors: LaunchErrors;
  block: CreationBlock;
}

const share = (v: number) => formatPercent(v, { sign: false, digits: v > 0 && v < 0.01 ? 2 : 1 });

export function LaunchFormFields({ id, chain, config, form, onChange: set, errors, block }: LaunchFormProps) {
  const ids = useId();
  const sym = CHAINS[chain].nativeSymbol;
  const { limits } = config;
  const devBuy = form.devBuy ?? 0;
  const descLength = form.description.trim().length;

  return (
    <form id={id} noValidate onSubmit={(e) => e.preventDefault()} className="panel">
      <FormSection title="Launchpad" description="Each launchpad runs its own bonding curve; the token migrates to a DEX pool when the curve fills.">
        <LaunchpadCards chain={chain} pads={config.launchpads[chain]} value={form.launchpad} onChange={(v) => set('launchpad', v)} invalid={!!errors.launchpad} />
        {errors.launchpad && <p className="text-xs text-down">{errors.launchpad}</p>}
      </FormSection>

      <FormSection title="Token">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)]">
          <Field label="Name" htmlFor={`${ids}-name`} error={errors.name} hint={`${form.name.trim().length}/${limits.nameMaxLength}`}>
            <Input
              id={`${ids}-name`}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              maxLength={limits.nameMaxLength}
              placeholder="e.g. Moon Frog"
              autoComplete="off"
              invalid={!!errors.name}
              data-autofocus
            />
          </Field>
          <Field label="Ticker" htmlFor={`${ids}-symbol`} error={errors.symbol} hint="Letters and digits">
            <Input
              id={`${ids}-symbol`}
              value={form.symbol}
              onChange={(e) => set('symbol', normalizeSymbol(e.target.value, limits.symbolMaxLength))}
              prefix="$"
              placeholder="MFROG"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              invalid={!!errors.symbol}
              className="num font-semibold uppercase"
            />
          </Field>
        </div>
        <Field label="Description (optional)" htmlFor={`${ids}-desc`} error={errors.description} hint={`${descLength}/${limits.descriptionMaxLength}`}>
          <textarea
            id={`${ids}-desc`}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            maxLength={limits.descriptionMaxLength}
            rows={3}
            placeholder="What is the token about? Buyers read this first."
            aria-invalid={!!errors.description || undefined}
            className="input h-auto resize-y py-1.5 leading-snug"
          />
        </Field>
        <Field label="Logo" htmlFor={`${ids}-glyph`} error={errors.glyph} hint={`Narrative: ${config.glyphNarratives[form.glyph] ?? '—'} · the avatar colors are generated at launch`}>
          <GlyphPicker id={`${ids}-glyph`} glyphs={config.glyphs} narratives={config.glyphNarratives} value={form.glyph} onChange={(g) => set('glyph', g)} />
        </Field>
      </FormSection>

      <FormSection title="Socials" description="Optional https links. Tokens with socials draw more buyers.">
        {SOCIALS.map((s) => (
          <Field key={s.key} label={s.label} htmlFor={`${ids}-${s.key}`} error={errors[s.key]}>
            <Input
              id={`${ids}-${s.key}`}
              type="url"
              inputMode="url"
              value={form.socials[s.key]}
              onChange={(e) => set('socials', { ...form.socials, [s.key]: e.target.value })}
              prefix={s.icon}
              placeholder={s.placeholder}
              autoComplete="off"
              spellCheck={false}
              invalid={!!errors[s.key]}
            />
          </Field>
        ))}
      </FormSection>

      <FormSection title="Dev buy" description="Your own buy in the creation block, before anyone else can trade.">
        <Field
          label={`Amount (${sym})`}
          htmlFor={`${ids}-dev`}
          error={errors.devBuy}
          hint={devBuy > 0 ? `≈ ${share(block.devShare)} of supply · max ${limits.maxDevBuyNative[chain]} ${sym}` : `No dev buy · max ${limits.maxDevBuyNative[chain]} ${sym}`}
        >
          <NumberInput
            id={`${ids}-dev`}
            value={form.devBuy}
            onChange={(v) => set('devBuy', v)}
            min={0}
            max={limits.maxDevBuyNative[chain]}
            step={0.01}
            suffix={sym}
            presets={DEV_BUY_PRESETS[chain]}
            formatPreset={(v) => (v === 0 ? 'None' : String(v))}
            invalid={!!errors.devBuy}
          />
        </Field>
        {block.devShare >= 0.2 && <Note tone="warn">A dev bag of {share(block.devShare)} of supply is a red flag for most buyers.</Note>}
      </FormSection>

      <FormSection title="Bundle wallets" description={`Up to ${limits.maxBundleWallets} extra paper wallets that buy in the same block as your dev buy.`}>
        <Toggle checked={form.useBundles} onChange={(v) => set('useBundles', v)} label="Bundle buys in the creation block" />
        {form.useBundles && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Wallets">
                <SegmentedControl
                  aria-label="Bundle wallets"
                  value={String(form.bundleWallets)}
                  onChange={(v) => set('bundleWallets', Number(v))}
                  items={Array.from({ length: limits.maxBundleWallets }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
                  className="self-start"
                />
              </Field>
              <Field label={`Buy per wallet (${sym})`} htmlFor={`${ids}-bundle`} error={errors.bundleBuy} hint={`≈ ${share(block.bundleShareEach)} each · ${share(block.bundleShare)} together`}>
                <NumberInput
                  id={`${ids}-bundle`}
                  value={form.bundleBuy}
                  onChange={(v) => set('bundleBuy', v)}
                  min={0}
                  max={limits.maxBundleBuyNative[chain]}
                  step={0.01}
                  suffix={sym}
                  invalid={!!errors.bundleBuy}
                />
              </Field>
            </div>
            <Note tone="warn" title="Bundles are visible">
              Funded from your wallet, they show up as bundlers on the token page and raise its rug ratio. They sell the same share whenever you sell your dev
              buy.
            </Note>
          </>
        )}
      </FormSection>

      <FormSection title="Exit strategy" description="Take-profit, stop-loss and event exits on your dev buy, armed the moment the token exists.">
        <Toggle
          checked={form.useStrategy}
          onChange={(v) => set('useStrategy', v)}
          disabled={devBuy <= 0}
          label="Attach exit orders to the dev buy"
          description={devBuy <= 0 ? 'Needs a dev buy.' : undefined}
        />
        {form.useStrategy && devBuy > 0 && <StrategyEditor value={form.strategy} onChange={(s) => set('strategy', s)} compact />}
        {errors.strategy && <Note tone="error">{errors.strategy}</Note>}
      </FormSection>

      <FormSection title="Trade preset" description="The creation-block buys pay this preset's priority fee and anti-MEV tip.">
        <PresetPicker chain={chain} value={form.presetId} onChange={(p) => set('presetId', p)} className="self-start" />
      </FormSection>
    </form>
  );
}
