// Live preview of the token as Trenches will list it right after the
// creation block, plus the launch traits buyers weigh.

import { memo, type ReactNode } from 'react';
import type { LaunchpadCurve, Socials } from '@trenchscope/shared';
import { Check, Minus } from 'lucide-react';
import clsx from 'clsx';
import { CurveProgress, LaunchpadBadge, Pct, SocialLinks, TokenAvatar, Usd } from '@/components/common';
import { Badge, Heading } from '@/components/ui';
import { launchSignals, SOCIAL_KEYS, socialError, type CreationBlock, type LaunchForm } from './model';

export interface LaunchPreviewProps {
  form: LaunchForm;
  pad: LaunchpadCurve | undefined;
  narrative: string | undefined;
  block: CreationBlock;
  className?: string;
}

function Stat({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col" title={hint}>
      <dt className="text-2xs text-faint">{label}</dt>
      <dd className="num truncate text-sm font-semibold text-fg">{children}</dd>
    </div>
  );
}

export const LaunchPreview = memo(function LaunchPreview({ form, pad, narrative, block, className }: LaunchPreviewProps) {
  const socials: Socials = {};
  for (const key of SOCIAL_KEYS) if (form.socials[key].trim() && !socialError(key, form.socials[key])) socials[key] = form.socials[key].trim();
  const bundles = form.useBundles ? form.bundleWallets : 0;
  return (
    <section className={clsx('panel flex flex-col', className)} aria-label="Token preview">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="table-head">Preview</span>
        {pad && <LaunchpadBadge launchpad={pad.id} className="ml-auto" />}
      </header>
      <div className="flex gap-3 p-3">
        {/* Colors are seeded at launch; the preview seeds them from the ticker. */}
        <TokenAvatar seed={form.symbol || form.name ? `${form.symbol}|${form.name}` : 'preview'} glyph={form.glyph} size={56} progress={block.progress} launchpadColor={pad?.color} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span className={clsx('truncate text-md font-semibold', form.symbol ? 'text-fg' : 'text-faint')}>{form.symbol || 'TICKER'}</span>
            <span className={clsx('min-w-0 truncate text-xs', form.name.trim() ? 'text-muted' : 'text-faint')}>{form.name.trim() || 'Token name'}</span>
          </div>
          <div className="flex min-w-0 items-center gap-1.5 text-xs">
            <span className="font-medium text-up">0s</span>
            <SocialLinks socials={socials} size={12} />
            {narrative && <Badge tone="info">{narrative}</Badge>}
          </div>
          <p className={clsx('line-clamp-2 break-words text-xs', form.description.trim() ? 'text-muted' : 'italic text-faint')}>{form.description.trim() || 'No description yet'}</p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 pb-3">
        <Stat label="MC at launch" hint="Market cap once the creation-block buys filled">
          <Usd value={block.marketCapUsd} />
        </Stat>
        <Stat label="Graduates at" hint="Market cap when the curve completes and the token migrates">
          <Usd value={pad?.graduationMarketCapUsd} />
        </Stat>
        <Stat label="Dev holds" hint="Your dev buy, as a share of total supply">
          <Pct value={block.devShare} sign={false} colored={false} />
        </Stat>
        <Stat label={bundles ? `Bundles hold (${bundles})` : 'Bundles hold'} hint="All bundle wallets together, as a share of total supply">
          <Pct value={bundles ? block.bundleShare : 0} sign={false} colored={false} />
        </Stat>
      </dl>
      <div className="flex flex-col gap-1 px-3 pb-3">
        <span className="text-2xs text-faint">Curve after the creation block</span>
        <CurveProgress progress={block.progress} size="md" />
      </div>
      <div className="border-t border-line px-3 py-2.5">
        <Heading className="mb-1.5 text-xs font-medium text-muted">What buyers look for</Heading>
        <ul className="flex flex-col gap-1">
          {launchSignals(form, block).map((s) => (
            <li key={s.key} className="flex items-start gap-1.5 text-xs" title={s.hint}>
              {s.ok ? <Check size={13} className="mt-px shrink-0 text-up" aria-label="Yes" /> : <Minus size={13} className="mt-px shrink-0 text-faint" aria-label="Not yet" />}
              <span className="min-w-0">
                <span className={s.ok ? 'text-fg' : 'text-muted'}>{s.label}</span>
                {!s.ok && <span className="block text-2xs text-faint">{s.hint}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
});
