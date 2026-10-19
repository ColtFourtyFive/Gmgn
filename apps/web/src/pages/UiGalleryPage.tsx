// Visual QA page (/_ui): every design-system component with sample data.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CHAIN_IDS, LAUNCHPADS, type Range, type SecurityCheck, type WalletTag } from '@trenchscope/shared';
import { Bell, Ellipsis, Filter, Palette, Settings, Star, Trash2 } from 'lucide-react';
import {
  AddressLink,
  Age,
  ChainBadge,
  ChainIcon,
  Compact,
  CurveProgress,
  FlashValue,
  LaunchpadBadge,
  Native,
  Pct,
  Price,
  RiskChip,
  SecurityChecksList,
  SimBanner,
  SocialLinks,
  Sparkline,
  StatTile,
  TokenAvatar,
  TokenLink,
  Usd,
  WALLET_TAG_META,
  WalletAvatar,
  WalletTagBadge,
  WalletTags,
  type TokenLinkData,
} from '@/components/common';
import { Page, PageHeader } from '@/components/layout';
import { QuickBuyButton } from '@/components/trade/QuickBuyButton';
import {
  Badge,
  Button,
  Checkbox,
  CopyButton,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  HoverCard,
  IconButton,
  Input,
  Kbd,
  Menu,
  Modal,
  NumberInput,
  Panel,
  Popover,
  RangeInput,
  SegmentedControl,
  Select,
  Skeleton,
  SkeletonText,
  Spinner,
  Tabs,
  Toggle,
  Tooltip,
  type Column,
} from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { toast } from '@/store/toasts';

/** Deterministic PRNG so the gallery looks the same on every load. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GLYPHS = ['🐸', '🐶', '🚀', '🐱', '🤖', '🍌', '🔥', '💎', '🦍', '🌙', '🧠', '🐳'];
const WORDS = ['PEPE', 'MOON', 'DOGE', 'CAT', 'BOT', 'NANA', 'FIRE', 'GEM', 'APE', 'LUNA', 'BRAIN', 'WHALE'];
const SOL_ADDR = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const EVM_ADDR = '0x8ba1f109551bD432803012645Ac136ddd64DBA72';

interface SampleRow {
  id: string;
  token: TokenLinkData & { name: string; launchpad: string; progress: number };
  price: number;
  mcap: number;
  change: number;
  holders: number;
  createdAt: number;
  spark: number[];
}

function sampleRows(n: number): SampleRow[] {
  const rnd = mulberry32(42);
  const now = Date.now();
  const sol = LAUNCHPADS.filter((l) => l.chain === 'sol');
  return Array.from({ length: n }, (_, i) => {
    const w = WORDS[i % WORDS.length];
    const price = 10 ** -(3 + rnd() * 5);
    let v = 1;
    return {
      id: `row${i}`,
      token: {
        chain: 'sol',
        address: `${SOL_ADDR.slice(0, 36)}${String(i).padStart(4, '0')}pump`,
        symbol: `${w}${i}`,
        name: `${w.charAt(0)}${w.slice(1).toLowerCase()} Coin ${i}`,
        logoSeed: `seed-${i}`,
        logoGlyph: GLYPHS[i % GLYPHS.length],
        launchpad: sol[i % sol.length].id,
        progress: Math.min(1, rnd() * 1.2),
      },
      price,
      mcap: price * 1e9,
      change: (rnd() - 0.4) * 3,
      holders: Math.round(rnd() * 5000),
      createdAt: now - Math.round(rnd() * 6 * 3600_000),
      spark: Array.from({ length: 24 }, () => (v *= 0.9 + rnd() * 0.22)),
    };
  });
}

const CHECKS: SecurityCheck[] = [
  { key: 'mint', label: 'Mint authority renounced', value: 'Yes', level: 'good' },
  { key: 'freeze', label: 'Freeze authority renounced', value: 'Yes', level: 'good' },
  { key: 'top10', label: 'Top 10 holders', value: '38.2%', level: 'warn', hint: 'Share of supply held by the 10 largest holders (excluding the curve/pool).' },
  { key: 'dev', label: 'Dev holding', value: '0%', level: 'good' },
  { key: 'bundler', label: 'Bundler volume', value: '52.0%', level: 'bad', hint: 'Share of volume from wallets that bought in the creation block.' },
  { key: 'lp', label: 'LP burned', value: 'N/A (on curve)', level: 'info' },
];

const ALL_TAGS = Object.keys(WALLET_TAG_META) as WalletTag[];
const WINDOWS = (['1m', '5m', '1h', '24h'] as const).map((w) => ({ value: w, label: w }));

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <Panel title={title} className={className}>
      <div className="flex flex-col gap-3">{children}</div>
    </Panel>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-24 shrink-0 text-xs text-faint">{label}</span>
      {children}
    </div>
  );
}

const SWATCHES = ['bg', 'panel', 'panel-2', 'panel-3', 'line', 'line-strong', 'fg', 'muted', 'faint', 'accent', 'up', 'down', 'warn', 'info'];
const TAG_SWATCHES = ['smart', 'kol', 'dev', 'sniper', 'insider', 'bundler', 'whale', 'fresh', 'bot'];

/** Design-system gallery for visual QA in both themes. */
export default function UiGalleryPage() {
  const { theme, setTheme } = useTheme();
  const rows = useMemo(() => sampleRows(150), []);
  const [tab, setTab] = useState<'all' | 'smart' | 'kol'>('all');
  const [win, setWin] = useState<'1m' | '5m' | '1h' | '24h'>('1h');
  const [select, setSelect] = useState<string | null>('moonpit');
  const [amount, setAmount] = useState<number | null>(0.5);
  const [range, setRange] = useState<Range | undefined>({ min: 0.05 });
  const [toggle, setToggle] = useState(true);
  const [check, setCheck] = useState(false);
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [compact, setCompact] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ticker, setTicker] = useState(0.00001234);

  useEffect(() => {
    const t = setInterval(() => setTicker((v) => v * (0.97 + Math.random() * 0.06)), 1500);
    return () => clearInterval(t);
  }, []);

  const columns = useMemo<Column<SampleRow>[]>(
    () => [
      {
        key: 'token',
        header: 'Token',
        sticky: true,
        width: 190,
        sortable: true,
        sortValue: (r) => r.token.symbol,
        render: (r) => <TokenLink token={r.token} showName showProgress showLaunchpad size={28} />,
      },
      { key: 'age', header: 'Age', align: 'right', sortable: true, sortValue: (r) => -r.createdAt, render: (r) => <Age ts={r.createdAt} className="text-muted" /> },
      { key: 'price', header: 'Price', align: 'right', sortable: true, sortValue: (r) => r.price, render: (r) => <Price value={r.price} /> },
      { key: 'mcap', header: 'MCap', align: 'right', sortable: true, sortValue: (r) => r.mcap, render: (r) => <Usd value={r.mcap} /> },
      { key: 'change', header: '1h %', align: 'right', sortable: true, sortValue: (r) => r.change, render: (r) => <Pct value={r.change} /> },
      { key: 'holders', header: 'Holders', align: 'right', sortable: true, sortValue: (r) => r.holders, hideBelow: 'md', render: (r) => <Compact value={r.holders} /> },
      { key: 'spark', header: 'Trend', hideBelow: 'lg', render: (r) => <Sparkline data={r.spark} width={72} height={20} /> },
      { key: 'curve', header: 'Curve', width: 120, hideBelow: 'lg', render: (r) => <CurveProgress progress={r.token.progress} /> },
      { key: 'buy', header: '', align: 'right', width: 70, render: (r) => <QuickBuyButton chain="sol" token={r.token.address} symbol={r.token.symbol} /> },
    ],
    [],
  );

  return (
    <Page>
      <PageHeader
        title="UI gallery"
        subtitle="Trenchscope design system — every component with sample data"
        icon={<Palette size={16} />}
        actions={
          <SegmentedControl
            aria-label="Theme"
            value={theme}
            onChange={setTheme}
            items={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]}
          />
        }
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <Section title="Color tokens" className="lg:col-span-2">
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {SWATCHES.map((s) => (
              <div key={s} className="flex flex-col items-center gap-1">
                <span className="h-8 w-full rounded border border-line" style={{ background: `rgb(var(--${s}))` }} />
                <span className="text-2xs text-muted">{s}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TAG_SWATCHES.map((s) => (
              <span key={s} className="chip" style={{ color: `rgb(var(--${s}))`, background: `rgb(var(--${s}) / 0.14)` }}>
                --{s}
              </span>
            ))}
          </div>
        </Section>

        <Section title="Numbers">
          <Row label="Price">
            <Price value={0.000001234} />
            <Price value={0.0421} />
            <Price value={3.5} />
            <Price value={0.0000004521} symbol="SOL" />
          </Row>
          <Row label="Usd">
            <Usd value={1234} />
            <Usd value={4_560_000} />
            <Usd value={-820.5} colored />
            <Usd value={1520} colored signed />
          </Row>
          <Row label="Native">
            <Native value={1.25} chain="sol" />
            <Native value={0.0004} chain="bsc" />
            <Native value={-0.35} chain="base" colored />
          </Row>
          <Row label="Pct">
            <Pct value={0.1234} />
            <Pct value={-0.052} />
            <Pct value={0} />
            <Pct value={2.4} arrow />
            <Pct value={-0.31} arrow />
          </Row>
          <Row label="Compact">
            <Compact value={999} />
            <Compact value={12_345} />
            <Compact value={1_250_000_000} />
          </Row>
          <Row label="Age (live)">
            <Age ts={Date.now() - 42_000} />
            <Age ts={Date.now() - 5 * 60_000} suffix=" ago" />
            <Age ts={Date.now() - 26 * 3600_000} />
          </Row>
          <Row label="FlashValue">
            <FlashValue value={ticker}>
              <Price value={ticker} />
            </FlashValue>
            <span className="text-xs text-faint">changes every 1.5s</span>
          </Row>
        </Section>

        <Section title="Buttons">
          <Row label="Variants">
            <Button variant="primary">Primary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="soft">Soft</Button>
            <Button variant="buy">Buy</Button>
            <Button variant="sell">Sell</Button>
            <Button variant="danger" icon={<Trash2 size={14} />}>
              Delete
            </Button>
          </Row>
          <Row label="Sizes">
            <Button variant="primary" size="xs">
              XS
            </Button>
            <Button variant="primary" size="sm">
              Small
            </Button>
            <Button variant="primary">Medium</Button>
            <Button variant="outline" loading>
              Loading
            </Button>
            <Button variant="outline" disabled>
              Disabled
            </Button>
          </Row>
          <Row label="IconButton">
            <IconButton label="Settings" icon={<Settings size={16} />} />
            <IconButton label="Watch" icon={<Star size={16} />} variant="outline" active />
            <IconButton label="Alerts" icon={<Bell size={16} />} badge={3} />
            <IconButton label="Filter" icon={<Filter size={14} />} size="sm" variant="soft" />
          </Row>
          <Row label="Quick buy">
            <QuickBuyButton chain="sol" token={SOL_ADDR} symbol="PEPE" />
            <QuickBuyButton chain="bsc" token={EVM_ADDR} symbol="CAT" size="sm" variant="solid" />
          </Row>
          <Row label="Badges">
            <Badge>Neutral</Badge>
            <Badge tone="accent">Boosted</Badge>
            <Badge tone="up">Migrated</Badge>
            <Badge tone="down">Rugged</Badge>
            <Badge tone="warn">CTO</Badge>
            <Badge tone="info">New</Badge>
            <Badge color="#5EE6A8">Custom</Badge>
          </Row>
          <Row label="Misc">
            <Kbd>/</Kbd>
            <Kbd>B</Kbd>
            <Spinner />
            <CopyButton text={SOL_ADDR} />
            <CopyButton text={SOL_ADDR} showLabel label="Copy CA" />
          </Row>
        </Section>

        <Section title="Inputs">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Input with adornments">
              <Input placeholder="Search tokens" prefix={<Filter size={13} />} suffix={<Kbd>/</Kbd>} />
            </Field>
            <Field label="Invalid input" error="Address is not valid">
              <Input defaultValue="0xnope" invalid />
            </Field>
            <Field label="NumberInput with presets" hint="ArrowUp/Down steps by 0.1">
              <NumberInput value={amount} onChange={setAmount} min={0} step={0.1} suffix="SOL" presets={[0.1, 0.5, 1, 2]} />
            </Field>
            <Field label="RangeInput (percent of ratio)">
              <RangeInput value={range} onChange={setRange} scale={100} suffix="%" label="Top 10" />
            </Field>
            <Field label="Select">
              <Select
                aria-label="Launchpad"
                value={select}
                onChange={setSelect}
                options={LAUNCHPADS.map((l) => ({ value: l.id, label: l.name, icon: <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />, hint: l.chain.toUpperCase() }))}
              />
            </Field>
            <div className="flex flex-col gap-2">
              <Toggle label="Flash updates" description="Highlight changing values" checked={toggle} onChange={setToggle} />
              <Toggle size="sm" aria-label="Compact" checked={!toggle} onChange={(v) => setToggle(!v)} />
              <Checkbox label="Hide copycats" checked={check} onChange={setCheck} />
              <Checkbox label="Some selected" checked={false} indeterminate onChange={() => undefined} />
            </div>
          </div>
        </Section>

        <Section title="Tabs">
          <Tabs
            aria-label="Feed"
            value={tab}
            onChange={setTab}
            items={[
              { value: 'all', label: 'All', count: 128 },
              { value: 'smart', label: 'Smart money', count: 12 },
              { value: 'kol', label: 'KOL', count: 0 },
            ]}
          />
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl aria-label="Window" value={win} onChange={setWin} items={WINDOWS} />
            <SegmentedControl aria-label="Window small" size="sm" value={win} onChange={setWin} items={WINDOWS} />
          </div>
        </Section>

        <Section title="Overlays">
          <Row label="Popover">
            <Popover trigger={<Button size="sm">Open popover</Button>} className="w-64 p-3">
              <p className="text-sm">Popovers flip when they would leave the viewport and close on Escape or outside click.</p>
            </Popover>
            <Popover trigger={<IconButton label="Row actions" icon={<Ellipsis size={16} />} variant="outline" size="sm" />} placement="bottom-end" role="menu">
              {(close) => (
                <Menu
                  onDone={close}
                  items={[
                    { key: 'watch', label: 'Add to watchlist', icon: <Star size={14} />, onSelect: () => toast.info('Added to watchlist') },
                    { key: 'alert', label: 'Create alert', icon: <Bell size={14} />, onSelect: () => toast.info('Alert created') },
                    { key: 'del', label: 'Remove', icon: <Trash2 size={14} />, danger: true, onSelect: () => toast.error('Removed') },
                  ]}
                />
              )}
            </Popover>
          </Row>
          <Row label="Tooltip">
            <Tooltip content="Share of supply held by the top 10 wallets">
              <Button size="sm" variant="ghost">
                Hover me
              </Button>
            </Tooltip>
            <HoverCard trigger={<span className="link cursor-default text-sm underline decoration-dotted">Hover card</span>}>
              <div className="flex w-56 items-center gap-2">
                <TokenAvatar seed="hover" glyph="🐸" size={36} progress={0.62} />
                <div>
                  <p className="font-semibold">PEPE</p>
                  <p className="text-xs text-muted">
                    MC <Usd value={84_000} /> · <Pct value={0.42} />
                  </p>
                </div>
              </div>
            </HoverCard>
          </Row>
          <Row label="Dialogs">
            <Button size="sm" onClick={() => setModal(true)}>
              Modal
            </Button>
            <Button size="sm" onClick={() => setDrawer(true)}>
              Drawer
            </Button>
          </Row>
          <Row label="Toasts">
            <Button size="sm" variant="buy" onClick={() => toast.success('Bought PEPE', '1.2M PEPE for 0.5 SOL @ $0.0₅41', { to: '/sol/trending', label: 'View token' })}>
              Success
            </Button>
            <Button size="sm" variant="sell" onClick={() => toast.error('Sell failed', 'Slippage exceeded (15%)')}>
              Error
            </Button>
            <Button size="sm" onClick={() => toast.info('Alert triggered', 'MOON crossed $100K market cap')}>
              Info
            </Button>
          </Row>
        </Section>

        <Section title="Feedback & states">
          <div className="flex items-center gap-3">
            <Skeleton circle width={32} height={32} />
            <div className="flex-1">
              <SkeletonText lines={2} />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded border border-line">
              <EmptyState compact title="No trades yet" description="Trades for this token will stream in here." action={<Button size="sm">Refresh</Button>} />
            </div>
            <div className="rounded border border-line">
              <ErrorState compact error={new Error('Server unreachable — is the API running?')} onRetry={() => toast.info('Retrying…')} />
            </div>
          </div>
          <SimBanner variant="card" />
          <SimBanner />
        </Section>

        <Section title="Tokens, wallets & chains">
          <Row label="TokenAvatar">
            {[16, 24, 32, 44].map((s, i) => (
              <TokenAvatar key={s} seed={`demo${i}`} glyph={GLYPHS[i]} size={s} />
            ))}
            <TokenAvatar seed="ring1" glyph="🚀" size={44} progress={0.35} launchpadColor="#5EE6A8" />
            <TokenAvatar seed="ring2" glyph="💎" size={44} progress={1} launchpadColor="#FF8A3D" />
          </Row>
          <Row label="WalletAvatar">
            {['a', 'b', 'c', 'd', 'e'].map((s) => (
              <WalletAvatar key={s} seed={`wallet-${s}`} size={24} />
            ))}
          </Row>
          <Row label="Chains">
            {CHAIN_IDS.map((c) => (
              <ChainIcon key={c} chain={c} size={20} />
            ))}
            {CHAIN_IDS.map((c) => (
              <ChainBadge key={c} chain={c} show="short" />
            ))}
          </Row>
          <Row label="Launchpads">
            {LAUNCHPADS.slice(0, 5).map((l) => (
              <LaunchpadBadge key={l.id} launchpad={l.id} />
            ))}
          </Row>
          <Row label="Wallet tags">
            {ALL_TAGS.map((t) => (
              <WalletTagBadge key={t} tag={t} />
            ))}
          </Row>
          <Row label="With labels">
            <WalletTags tags={['smart', 'kol', 'whale', 'fresh', 'bot', 'sniper']} showLabel max={4} />
          </Row>
          <Row label="Links">
            <TokenLink token={rows[0].token} showName showProgress showLaunchpad />
            <AddressLink chain="sol" address={SOL_ADDR} avatar />
            <AddressLink chain="bsc" address={EVM_ADDR} label="@degenking" tags={['kol', 'smart']} avatar />
            <SocialLinks socials={{ twitter: 'https://x.com', telegram: 'https://t.me', website: 'https://example.com' }} />
          </Row>
        </Section>

        <Section title="Risk & stats">
          <Row label="RiskChip">
            <RiskChip label="Top10" value={0.18} threshold={0.3} hint="Top 10 holders' share" />
            <RiskChip label="Dev" value={0.22} threshold={0.1} />
            <RiskChip label="Insiders" value={0.04} threshold={0.2} />
            <RiskChip label="Bundlers" value={0.52} threshold={0.3} />
            <RiskChip label="LP burn" value={1} threshold={0.9} invert />
            <RiskChip label="Snipers" value={null} threshold={0.2} />
          </Row>
          <Row label="Curve">
            <CurveProgress progress={0.12} className="w-40" />
            <CurveProgress progress={0.86} className="w-40" />
            <CurveProgress progress={1} className="w-40" size="md" />
          </Row>
          <Row label="Sparkline">
            <Sparkline data={rows[1].spark} />
            <Sparkline data={rows[2].spark} tone="accent" fill={false} />
            <Sparkline data={rows[3].spark} width={120} height={32} />
          </Row>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label="Total value" value={<Usd value={12_840} />} sub={<Pct value={0.083} />} />
            <StatTile label="Realized PnL" value={<Usd value={3_210} colored signed />} sub="7d" />
            <StatTile label="Win rate" value="64.2%" sub="27W / 15L" />
            <StatTile label="Balance" value={<Native value={42.5} chain="sol" />} sub={<Usd value={7_862} />} />
          </div>
          <SecurityChecksList checks={CHECKS} columns={2} />
        </Section>

        <Panel
          title="DataTable"
          subtitle="150 rows · client-side sort · sticky header & first column"
          className="lg:col-span-2"
          padded={false}
          actions={
            <>
              <Toggle size="sm" label="Compact" checked={compact} onChange={setCompact} />
              <Toggle size="sm" label="Loading" checked={loading} onChange={setLoading} />
            </>
          }
        >
          <DataTable
            aria-label="Sample tokens"
            columns={columns}
            rows={loading ? [] : rows}
            rowKey={(r) => r.id}
            loading={loading}
            compact={compact}
            defaultSort={{ key: 'mcap', dir: 'desc' }}
            maxHeight={420}
            minWidth={720}
            onRowClick={(r) => toast.info(`Row clicked: ${r.token.symbol}`)}
          />
        </Panel>

        <Panel title="DataTable — empty" padded={false}>
          <DataTable aria-label="Empty sample" columns={columns.slice(0, 4)} rows={[]} rowKey={(r) => r.id} />
        </Panel>
      </div>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Confirm trade"
        description="Market buy with preset P1 (15% slippage)."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)}>
              Cancel
            </Button>
            <Button variant="buy" onClick={() => setModal(false)}>
              Buy 0.5 SOL
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <NumberInput value={amount} onChange={setAmount} min={0} step={0.1} suffix="SOL" presets={[0.1, 0.5, 1, 2]} data-autofocus />
          <Select
            aria-label="Preset"
            value="P1"
            onChange={() => undefined}
            options={[
              { value: 'P1', label: 'P1 · 15% slippage' },
              { value: 'P2', label: 'P2 · 25% slippage, anti-MEV' },
            ]}
          />
        </div>
      </Modal>
      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Filters" footer={<Button variant="primary" block onClick={() => setDrawer(false)}>Apply</Button>}>
        <div className="flex flex-col gap-3 p-3">
          <Field label="Market cap">
            <RangeInput value={range} onChange={setRange} prefix="$" />
          </Field>
          <Checkbox label="Hide copycats" checked={check} onChange={setCheck} />
        </div>
      </Drawer>
    </Page>
  );
}
