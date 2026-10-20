import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CHAIN_IDS, CHAINS, formatUsd, shortAddress, type SearchResult } from '@trenchscope/shared';
import { ArrowRight, CornerDownLeft, History, LogIn, LogOut, Moon, Plus, Search, Settings, Sun, UserPlus, X, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { CHAIN_SHORT, ChainIcon, Pct, Price, TokenAvatar, WalletAvatar, WalletTags } from '@/components/common';
import { IconButton, Kbd, Modal, Spinner } from '@/components/ui';
import { chainFromPath, useActiveChain } from '@/hooks/useActiveChain';
import { useDebounce } from '@/hooks/useDebounce';
import { MOD_KEY, useHotkeys } from '@/hooks/useHotkeys';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useTheme } from '@/hooks/useTheme';
import { api } from '@/lib/api';
import { routes } from '@/lib/chain';
import { requireAuth, useSession } from '@/store/session';
import { toast } from '@/store/toasts';
import { useUi } from '@/store/ui';
import { useDeposit } from './AccountControls';
import { useSwitchChain } from './ChainSwitcher';
import { ACCOUNT_ITEMS, NAV_ITEMS } from './nav';
import { isFullAddress, resolveAddress } from './Omnibox';
import {
  addRecent,
  rankCommands,
  RECENT_KEY,
  recentKey,
  validRecents,
  type PaletteCommand,
  type PaletteToken,
  type PaletteWallet,
  type RecentItem,
} from './palette';

/** Short description and extra search terms per page key. */
const PAGE_META: Record<string, { description: string; keywords: string[] }> = {
  trenches: { description: 'New, almost bonded and migrated launches', keywords: ['launches', 'bonding curve', 'pump'] },
  trending: { description: 'Hottest tokens by time window', keywords: ['hot', 'top', 'gainers', 'volume'] },
  'new-pairs': { description: 'Fresh DEX pools of migrated tokens', keywords: ['pools', 'migrated', 'listings'] },
  monitor: { description: 'Smart money and KOL trades, live', keywords: ['smart money', 'kol', 'feed', 'tracker', 'following'] },
  signals: { description: 'Alpha signals as they fire', keywords: ['alpha', 'pumps', 'dev sells'] },
  leaderboard: { description: 'Top wallets by PnL', keywords: ['top traders', 'wallets', 'pnl', 'ranking'] },
  copytrade: { description: 'Mirror wallets automatically', keywords: ['copy', 'mirror', 'follow'] },
  sniper: { description: 'Auto-buy new launches', keywords: ['snipe', 'auto buy', 'bot'] },
  portfolio: { description: 'Positions, PnL and orders', keywords: ['positions', 'holdings', 'balance', 'orders'] },
  narratives: { description: 'Hot themes and their tokens', keywords: ['themes', 'meta', 'sectors'] },
  launch: { description: 'Launch a token', keywords: ['create token', 'deploy', 'mint'] },
  callouts: { description: 'KOL calls and how they played out', keywords: ['calls', 'kol calls', 'hit rate'] },
  watchlist: { description: 'Your starred tokens', keywords: ['favorites', 'starred'] },
  alerts: { description: 'Price, wallet and keyword alerts', keywords: ['notifications', 'price alert'] },
  rewards: { description: 'Referrals, cashback and points', keywords: ['referral', 'cashback', 'points', 'invite'] },
};

type Entry =
  | { type: 'command'; key: string; command: PaletteCommand; icon: ReactNode; indices: number[] }
  | { type: 'token'; key: string; token: PaletteToken & Partial<Pick<SearchResult['tokens'][number], 'priceUsd' | 'marketCapUsd' | 'priceChange24h'>> }
  | { type: 'wallet'; key: string; wallet: PaletteWallet }
  | { type: 'address'; key: string; address: string };

interface Section {
  title: string;
  entries: Entry[];
  /** Header action (e.g. clear recents). */
  action?: ReactNode;
}

const icon = (Icon: LucideIcon) => <Icon size={15} aria-hidden />;

/** Every command the palette offers (pages on every chain, account actions, chain switches), with icons. */
function useCommands(): { commands: PaletteCommand[]; icons: Map<string, ReactNode> } {
  const navigate = useNavigate();
  const chain = useActiveChain();
  const switchChain = useSwitchChain();
  const { theme, toggle } = useTheme();
  const isGuest = useSession((s) => !!s.account?.isGuest);
  const signedIn = useSession((s) => !!s.token);
  const { deposit } = useDeposit(chain);
  // These change identity every render; commands call the latest through a ref so the list stays memoized.
  const fns = useRef({ navigate, switchChain, deposit });
  fns.current = { navigate, switchChain, deposit };

  return useMemo(() => {
    const go = (href: string) => () => fns.current.navigate(href);
    const commands: PaletteCommand[] = [];
    const icons = new Map<string, ReactNode>();
    const add = (cmd: PaletteCommand, el: ReactNode) => {
      commands.push(cmd);
      icons.set(cmd.id, el);
    };

    // Ranking keeps input order on ties: chain switches and actions before same-scoring pages.
    for (const c of CHAIN_IDS) {
      if (c === chain) continue;
      add(
        { id: `chain:${c}`, group: 'Chains', title: `Switch to ${CHAINS[c].name}`, keywords: [c, CHAIN_SHORT[c], 'chain', 'network'], run: () => fns.current.switchChain(c) },
        <ChainIcon chain={c} size={16} />,
      );
    }

    add(
      {
        id: 'action:deposit',
        group: 'Actions',
        title: 'Deposit',
        subtitle: `Top up your ${CHAINS[chain].name} paper wallet`,
        keywords: ['faucet', 'top up', 'fund', 'balance'],
        run: () => requireAuth(() => void fns.current.deposit()),
      },
      icon(Plus),
    );
    add(
      { id: 'action:settings', group: 'Actions', title: 'Open settings', keywords: ['preferences', 'presets', 'slippage', 'hotkeys'], run: go(routes.settings()) },
      icon(Settings),
    );
    const next = theme === 'dark' ? 'light' : 'dark';
    add(
      { id: 'action:theme', group: 'Actions', title: `Switch to ${next} theme`, keywords: ['theme', 'appearance', 'dark mode', 'light mode'], run: toggle },
      icon(next === 'light' ? Sun : Moon),
    );
    const prompt = (tab: 'quick' | 'login' | 'register') => () => useSession.getState().promptAuth(true, tab);
    if (!signedIn) {
      add({ id: 'action:signin', group: 'Actions', title: 'Sign in', subtitle: 'Start paper trading in one click', keywords: ['quick start', 'guest', 'account'], run: prompt('quick') }, icon(LogIn));
      add({ id: 'action:login', group: 'Actions', title: 'Log in', subtitle: 'Username and password', keywords: ['sign in', 'account'], run: prompt('login') }, icon(LogIn));
      add({ id: 'action:register', group: 'Actions', title: 'Create account', keywords: ['register', 'sign up'], run: prompt('register') }, icon(UserPlus));
    } else {
      if (isGuest) {
        add({ id: 'action:register', group: 'Actions', title: 'Register account', subtitle: 'Keep this guest account', keywords: ['sign up', 'password'], run: prompt('register') }, icon(UserPlus));
      }
      add(
        {
          id: 'action:signout',
          group: 'Actions',
          title: 'Sign out',
          keywords: ['log out', 'logout'],
          run: () => void useSession.getState().logout().then(() => toast.info('Signed out')),
        },
        icon(LogOut),
      );
    }

    // Pages: the active chain first, then other chains (listed only when the query names them).
    for (const c of [chain, ...CHAIN_IDS.filter((x) => x !== chain)]) {
      for (const item of NAV_ITEMS) {
        const href = item.href(c);
        const scoped = chainFromPath(href) !== null;
        if (!scoped && c !== chain) continue;
        add(
          {
            id: scoped ? `page:${item.key}:${c}` : `page:${item.key}`,
            group: 'Pages',
            title: item.label,
            subtitle: PAGE_META[item.key]?.description,
            keywords: [...(PAGE_META[item.key]?.keywords ?? []), ...(scoped ? [c, CHAIN_SHORT[c], CHAINS[c].name] : [])],
            chain: scoped ? c : undefined,
            otherChain: scoped && c !== chain,
            run: go(href),
          },
          icon(item.icon),
        );
      }
    }
    for (const item of ACCOUNT_ITEMS) {
      // Portfolio is a primary section; settings is an action.
      if (item.key === 'settings' || NAV_ITEMS.some((n) => n.key === item.key)) continue;
      add(
        { id: `page:${item.key}`, group: 'Pages', title: item.label, subtitle: PAGE_META[item.key]?.description, keywords: PAGE_META[item.key]?.keywords, run: go(item.href) },
        icon(item.icon),
      );
    }
    return { commands, icons };
  }, [chain, theme, toggle, signedIn, isGuest]);
}

function Highlighted({ text, indices }: { text: string; indices: number[] }) {
  if (indices.length === 0) return <>{text}</>;
  const hit = new Set(indices);
  const parts: ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    const on = hit.has(i);
    let j = i;
    while (j < text.length && hit.has(j) === on) j++;
    const chunk = text.slice(i, j);
    parts.push(
      on ? (
        <mark key={i} className="bg-transparent text-accent">
          {chunk}
        </mark>
      ) : (
        chunk
      ),
    );
    i = j;
  }
  return <>{parts}</>;
}

function EntryRow({ entry, active }: { entry: Entry; active: boolean }) {
  switch (entry.type) {
    case 'command': {
      const { command: c } = entry;
      return (
        <>
          <span className={clsx('flex h-7 w-7 shrink-0 items-center justify-center rounded border', active ? 'border-line-strong bg-panel text-fg' : 'border-line bg-panel-2 text-muted')}>
            {entry.icon}
          </span>
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="truncate font-medium text-fg">
              <Highlighted text={c.title} indices={entry.indices} />
            </span>
            {c.subtitle && <span className="hidden truncate text-xs text-muted sm:inline">{c.subtitle}</span>}
          </span>
          {c.otherChain && c.chain && (
            <span className="flex shrink-0 items-center gap-1 rounded border border-line px-1.5 py-0.5 text-2xs text-muted">
              <ChainIcon chain={c.chain} size={12} />
              {CHAINS[c.chain].name}
            </span>
          )}
        </>
      );
    }
    case 'token': {
      const t = entry.token;
      return (
        <>
          <TokenAvatar seed={t.logoSeed} glyph={t.logoGlyph} size={28} />
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="flex items-center gap-1.5">
              <span className="truncate font-semibold text-fg">{t.symbol}</span>
              <ChainIcon chain={t.chain} size={12} />
            </span>
            <span className="truncate text-xs text-muted">{t.name}</span>
          </span>
          {t.priceUsd !== undefined && (
            <span className="flex shrink-0 flex-col items-end leading-tight">
              <Price value={t.priceUsd} className="text-sm text-fg" />
              <span className="flex items-center gap-1.5 text-xs">
                <span className="num hidden text-muted sm:inline">MC {formatUsd(t.marketCapUsd)}</span>
                <Pct value={t.priceChange24h} digits={1} />
              </span>
            </span>
          )}
        </>
      );
    }
    case 'wallet': {
      const w = entry.wallet;
      return (
        <>
          <WalletAvatar seed={w.avatarSeed} size={24} className="mx-0.5" />
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className={clsx('truncate', w.label ? 'font-medium text-fg' : 'num font-mono text-xs text-fg')}>{w.label ?? shortAddress(w.address, 6, 6)}</span>
            <WalletTags tags={w.tags} max={3} />
          </span>
          <ChainIcon chain={w.chain} size={14} />
        </>
      );
    }
    case 'address':
      return (
        <>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-line bg-panel-2 text-muted">{icon(ArrowRight)}</span>
          <span className="min-w-0 flex-1 truncate">
            Open <span className="num font-mono text-xs text-fg">{shortAddress(entry.address, 8, 8)}</span>
          </span>
        </>
      );
  }
}

/** Palette body; mounted only while open, so every open starts with an empty query. */
function PaletteContent({ close }: { close: () => void }) {
  const navigate = useNavigate();
  const chain = useActiveChain();
  const listId = useId();
  const { commands, icons } = useCommands();
  const [stored, setRecent] = useLocalStorage<unknown>(RECENT_KEY, []);
  const recent = useMemo(() => validRecents(stored), [stored]);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const query = text.trim();
  const q = useDebounce(query, 200);

  const search = useQuery({
    queryKey: ['search', q],
    queryFn: ({ signal }) => api.search(q, undefined, signal),
    enabled: q.length > 0,
    staleTime: 10_000,
    retry: false,
    placeholderData: keepPreviousData,
  });

  const sections = useMemo<Section[]>(() => {
    const byId = new Map(commands.map((c) => [c.id, c]));
    const commandEntry = (c: PaletteCommand, indices: number[] = []): Entry => ({ type: 'command', key: c.id, command: c, icon: icons.get(c.id), indices });
    if (!query) {
      const recentEntries = recent.flatMap((r): Entry[] => {
        if (r.type === 'token') return [{ type: 'token', key: recentKey(r), token: r.token }];
        if (r.type === 'wallet') return [{ type: 'wallet', key: recentKey(r), wallet: r.wallet }];
        const c = byId.get(r.id);
        return c ? [commandEntry(c)] : [];
      });
      const shown = new Set(recentEntries.map((e) => e.key));
      const group = (g: PaletteCommand['group']) => commands.filter((c) => c.group === g && !c.otherChain && !shown.has(c.id)).map((c) => commandEntry(c));
      return [
        {
          title: 'Recent',
          entries: recentEntries,
          action: (
            <button type="button" onClick={() => setRecent([])} className="normal-case tracking-normal text-faint hover:text-fg">
              Clear
            </button>
          ),
        },
        { title: 'Pages', entries: group('Pages') },
        { title: 'Actions', entries: group('Actions') },
        { title: 'Chains', entries: group('Chains') },
      ];
    }
    const found = search.data;
    // A pasted address the search does not know yet still opens directly.
    const known = found?.tokens.some((t) => t.address === query) || found?.wallets.some((w) => w.address === query);
    return [
      { title: 'Go to', entries: isFullAddress(query) && !known ? [{ type: 'address', key: `address:${query}`, address: query }] : [] },
      { title: 'Commands', entries: rankCommands(query, commands).slice(0, 6).map((r) => commandEntry(r.item, r.indices)) },
      { title: 'Tokens', entries: (found?.tokens ?? []).slice(0, 8).map((t): Entry => ({ type: 'token', key: `token:${t.chain}:${t.address}`, token: t })) },
      { title: 'Wallets', entries: (found?.wallets ?? []).slice(0, 5).map((w): Entry => ({ type: 'wallet', key: `wallet:${w.chain}:${w.address}`, wallet: w })) },
    ];
  }, [commands, icons, recent, setRecent, query, search.data]);

  const visible = sections.filter((s) => s.entries.length > 0);
  const flat = visible.flatMap((s) => s.entries);
  const activeIdx = Math.min(active, Math.max(0, flat.length - 1));
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    document.getElementById(`${listId}-${activeIdx}`)?.scrollIntoView({ block: 'nearest' });
  }, [listId, activeIdx]);

  const remember = (item: RecentItem) => setRecent((list: unknown) => addRecent(validRecents(list), item));
  const runEntry = (entry: Entry) => {
    close();
    switch (entry.type) {
      case 'command':
        remember({ type: 'command', id: entry.command.id });
        entry.command.run();
        break;
      case 'token': {
        const { chain: c, address, symbol, name, logoSeed, logoGlyph } = entry.token;
        remember({ type: 'token', token: { chain: c, address, symbol, name, logoSeed, logoGlyph } });
        navigate(routes.token(c, address));
        break;
      }
      case 'wallet':
        remember({ type: 'wallet', wallet: entry.wallet });
        navigate(routes.wallet(entry.wallet.chain, entry.wallet.address));
        break;
      case 'address':
        void resolveAddress(entry.address, chain).then((href) => navigate(href));
        break;
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return; // Enter confirms an IME composition, not an entry
    const n = flat.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (n) setActive((activeIdx + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flat[activeIdx]) runEntry(flat[activeIdx]);
    }
  };
  // Ctrl/Cmd+K toggles from anywhere in the dialog (global hotkeys are muted while a modal is open).
  const onDialogKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      close();
    }
  };

  const searching = q.length > 0 && search.isFetching && !search.data;
  let status: ReactNode = null;
  if (query && searching) {
    status = (
      <>
        <Spinner size={13} label="" /> Searching tokens and wallets…
      </>
    );
  } else if (query && search.isError && q === query) {
    status = 'Token search is unavailable right now.';
  } else if (query && flat.length === 0 && q === query && !search.isFetching) {
    status = `Nothing matches “${query}”.`;
  }

  let index = 0;
  return (
    <div onKeyDown={onDialogKeyDown} className="flex max-h-[min(78dvh,560px)] flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-3.5">
        <Search size={16} className="shrink-0 text-faint" aria-hidden />
        <input
          type="text"
          role="combobox"
          aria-label="Search pages, actions, tokens and wallets"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={flat.length ? `${listId}-${activeIdx}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          data-autofocus
          placeholder="Search pages, actions, tokens, wallets…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          className="input-bare text-md"
        />
        <Kbd className="hidden sm:inline-flex">Esc</Kbd>
        <IconButton label="Close" size="sm" icon={<X size={16} />} onClick={close} className="-mr-1.5 sm:hidden" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
        <ul id={listId} role="listbox" aria-label="Results">
          {visible.map((section) => (
            <li key={section.title} role="group" aria-label={section.title} className="mb-1 last:mb-0">
              <div role="presentation" className="table-head flex items-center justify-between px-2 pb-1 pt-2">
                <span aria-hidden className="flex items-center gap-1.5">
                  {section.title === 'Recent' && <History size={11} aria-hidden />}
                  {section.title}
                </span>
                {section.action}
              </div>
              <ul role="presentation">
                {section.entries.map((entry) => {
                  const i = index++;
                  const on = i === activeIdx;
                  return (
                    <li
                      key={entry.key}
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={on}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseMove={() => !on && setActive(i)}
                      onClick={() => runEntry(entry)}
                      className={clsx('flex cursor-pointer items-center gap-2.5 rounded px-2 text-sm', entry.type === 'token' ? 'h-11' : 'h-10', on && 'bg-panel-3')}
                    >
                      <EntryRow entry={entry} active={on} />
                      {on && <CornerDownLeft size={13} className="hidden shrink-0 text-faint sm:block" aria-hidden />}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
        {status && (
          <p role="status" className="flex items-center gap-2 px-2 py-3 text-sm text-muted">
            {status}
          </p>
        )}
      </div>
      <div className="hidden shrink-0 items-center gap-3 border-t border-line px-3.5 py-1.5 text-2xs text-faint sm:flex">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> navigate
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↵</Kbd> open
        </span>
        <span className="flex items-center gap-1">
          <Kbd>/</Kbd> search bar
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Kbd>{MOD_KEY}</Kbd>
          <Kbd>K</Kbd> toggle
        </span>
      </div>
    </div>
  );
}

/**
 * Command palette (Ctrl/Cmd+K): fuzzy search over every page on every chain,
 * chain switching, theme, deposit and account actions, plus live token and
 * wallet search. Arrow keys + Enter; recent picks persist in localStorage.
 * Mounted once by the AppShell; open it from anywhere with
 * `useUi.getState().setPaletteOpen(true)`.
 */
export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  const close = () => useUi.getState().setPaletteOpen(false);
  useHotkeys({ 'mod+k': () => useUi.getState().setPaletteOpen(!useUi.getState().paletteOpen) }, { allowInInputs: true });

  return (
    <Modal open={open} onClose={close} hideClose aria-label="Command palette" size="lg" className="sm:max-w-[620px]" bodyClassName="!p-0">
      <PaletteContent close={close} />
    </Modal>
  );
}
