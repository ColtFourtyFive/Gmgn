import { Fragment, useEffect, useId, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CHAINS, formatUsd, shortAddress, type ChainId, type SearchResult } from '@trenchscope/shared';
import { Search, X } from 'lucide-react';
import clsx from 'clsx';
import { ChainIcon, Pct, Price, TokenAvatar, WalletAvatar, WalletTags } from '@/components/common';
import { Floating, Kbd, Spinner } from '@/components/ui';
import { useActiveChain } from '@/hooks/useActiveChain';
import { useDebounce } from '@/hooks/useDebounce';
import { MOD_KEY, useHotkeys } from '@/hooks/useHotkeys';
import { useDisplaySettings } from '@/hooks/useSettings';
import { api } from '@/lib/api';
import { routes } from '@/lib/chain';
import { useUi } from '@/store/ui';

const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** A complete token/wallet address (Solana base58 or EVM hex). */
export function isFullAddress(text: string): boolean {
  return BASE58_ADDRESS.test(text) || EVM_ADDRESS.test(text);
}

type Hit =
  | { kind: 'token'; key: string; href: string; token: SearchResult['tokens'][number] }
  | { kind: 'wallet'; key: string; href: string; wallet: SearchResult['wallets'][number] };

function toHits(data: SearchResult | undefined): Hit[] {
  if (!data) return [];
  return [
    ...data.tokens.map((t): Hit => ({ kind: 'token', key: `t:${t.chain}:${t.address}`, href: routes.token(t.chain, t.address), token: t })),
    ...data.wallets.map((w): Hit => ({ kind: 'wallet', key: `w:${w.chain}:${w.address}`, href: routes.wallet(w.chain, w.address), wallet: w })),
  ];
}

/** Resolve a pasted address to its token or wallet page (falls back to a wallet page). */
export async function resolveAddress(address: string, chain: ChainId): Promise<string> {
  try {
    const res = await api.search(address);
    const token = res.tokens.find((t) => t.address === address);
    if (token) return routes.token(token.chain, token.address);
    const wallet = res.wallets.find((w) => w.address === address);
    if (wallet) return routes.wallet(wallet.chain, wallet.address);
  } catch {
    /* server unreachable: fall through to a best guess */
  }
  const evm = EVM_ADDRESS.test(address);
  const guess: ChainId = evm ? (CHAINS[chain].addressStyle === 'evm' ? chain : 'bsc') : 'sol';
  return routes.wallet(guess, address);
}

function HitRow({ hit, id, active, onPick, onHover }: { hit: Hit; id: string; active: boolean; onPick: () => void; onHover: () => void }) {
  let body: ReactNode;
  if (hit.kind === 'token') {
    const t = hit.token;
    body = (
      <>
        <TokenAvatar seed={t.logoSeed} glyph={t.logoGlyph} size={28} />
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-semibold text-fg">{t.symbol}</span>
            <ChainIcon chain={t.chain} size={12} />
          </span>
          <span className="truncate text-xs text-muted">{t.name}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end leading-tight">
          <Price value={t.priceUsd} className="text-sm text-fg" />
          <span className="flex items-center gap-1.5 text-xs">
            <span className="num text-muted">MC {formatUsd(t.marketCapUsd)}</span>
            <Pct value={t.priceChange24h} digits={1} />
          </span>
        </span>
      </>
    );
  } else {
    const w = hit.wallet;
    body = (
      <>
        <WalletAvatar seed={w.avatarSeed} size={24} />
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className={clsx('truncate', w.label ? 'font-medium text-fg' : 'num font-mono text-xs text-fg')}>{w.label ?? shortAddress(w.address, 6, 6)}</span>
          <WalletTags tags={w.tags} max={3} />
        </span>
        <ChainIcon chain={w.chain} size={14} />
      </>
    );
  }
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      onMouseDown={(e) => e.preventDefault()}
      onMouseEnter={onHover}
      onClick={onPick}
      className={clsx('flex h-11 cursor-pointer items-center gap-2.5 rounded px-2', active && 'bg-panel-3')}
    >
      {body}
    </li>
  );
}

export interface OmniboxProps {
  /** `bar`: inline input with a dropdown (desktop). `sheet`: input + inline results (mobile search sheet). */
  variant?: 'bar' | 'sheet';
  /** Called after navigating to a result (closes the sheet). */
  onNavigate?: () => void;
  /** Focus the input when the enclosing Modal/Drawer opens. */
  autoFocus?: boolean;
  className?: string;
}

/**
 * Global search: tokens and wallets by name, symbol, address or KOL label.
 * Debounced; ↑/↓ + Enter keyboard navigation; pasting a full address jumps
 * straight to it; "/" focuses the bar, and its "⌘K" hint opens the command
 * palette.
 */
export function Omnibox({ variant = 'bar', onNavigate, autoFocus, className }: OmniboxProps) {
  const navigate = useNavigate();
  const chain = useActiveChain();
  const { hotkeys } = useDisplaySettings();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [jumping, setJumping] = useState(false);
  const q = useDebounce(text.trim(), 200);

  const search = useQuery({
    queryKey: ['search', q],
    queryFn: ({ signal }) => api.search(q, undefined, signal),
    enabled: q.length > 0,
    staleTime: 10_000,
    retry: false,
    placeholderData: keepPreviousData,
  });
  const hits = useMemo(() => (q ? toHits(search.data) : []), [q, search.data]);
  useEffect(() => setActive(0), [q]);

  useHotkeys({ '/': () => inputRef.current?.focus() }, { enabled: variant === 'bar' && hotkeys });

  const go = (href: string) => {
    navigate(href);
    setText('');
    inputRef.current?.blur();
    onNavigate?.();
  };
  const jumpTo = async (address: string) => {
    setJumping(true);
    try {
      go(await resolveAddress(address, chain));
    } finally {
      setJumping(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && hits.length) {
      e.preventDefault();
      setActive((a) => (a + 1) % hits.length);
    } else if (e.key === 'ArrowUp' && hits.length) {
      e.preventDefault();
      setActive((a) => (a - 1 + hits.length) % hits.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const value = text.trim();
      if (hits[active] ?? hits[0]) go((hits[active] ?? hits[0]).href);
      else if (isFullAddress(value)) void jumpTo(value);
    } else if (e.key === 'Escape') {
      if (text) setText('');
      else inputRef.current?.blur();
    }
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').trim();
    if (!isFullAddress(pasted)) return;
    e.preventDefault();
    setText(pasted);
    void jumpTo(pasted);
  };

  const showResults = text.trim().length > 0;
  const loading = jumping || (search.isFetching && hits.length === 0);
  const tokenCount = hits.filter((h) => h.kind === 'token').length;

  const results = (
    <div className="flex flex-col">
      {loading && (
        <p className="flex items-center gap-2 px-3 py-3 text-sm text-muted">
          <Spinner size={13} label="" /> {jumping ? 'Opening address…' : 'Searching…'}
        </p>
      )}
      {!loading && search.isError && <p className="px-3 py-3 text-sm text-muted">Search is unavailable right now.</p>}
      {!loading && !search.isError && q && search.isSuccess && hits.length === 0 && (
        <p className="px-3 py-3 text-sm text-muted">No tokens or wallets match “{q}”.</p>
      )}
      {hits.length > 0 && (
        <ul id={listId} role="listbox" aria-label="Search results" className="p-1">
          {hits.map((hit, i) => (
            <Fragment key={hit.key}>
              {i === 0 && tokenCount > 0 && (
                <li role="presentation" className="table-head px-2 pb-1 pt-1.5">
                  Tokens
                </li>
              )}
              {i === tokenCount && (
                <li role="presentation" className="table-head px-2 pb-1 pt-2">
                  Wallets
                </li>
              )}
              <HitRow hit={hit} id={`${listId}-${i}`} active={i === active} onHover={() => setActive(i)} onPick={() => go(hit.href)} />
            </Fragment>
          ))}
        </ul>
      )}
      <p className="hidden border-t border-line px-3 py-1.5 text-2xs text-faint sm:block">↑↓ to navigate · Enter to open · paste an address to jump</p>
    </div>
  );

  const input = (
    <div
      ref={wrapRef}
      className={clsx('input-group', variant === 'sheet' && '!h-10 text-base', focused && variant === 'bar' && 'bg-panel', className)}
      onClick={() => inputRef.current?.focus()}
    >
      <Search size={14} className="shrink-0 text-faint" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-label="Search tokens and wallets"
        aria-expanded={showResults}
        aria-controls={hits.length ? listId : undefined}
        aria-activedescendant={hits.length ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        data-autofocus={autoFocus || undefined}
        placeholder={variant === 'bar' ? 'Search token or wallet' : 'Search token, wallet or paste address'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        className="input-bare [&::-webkit-search-cancel-button]:hidden"
      />
      {text ? (
        <button type="button" aria-label="Clear search" onMouseDown={(e) => e.preventDefault()} onClick={() => setText('')} className="text-faint hover:text-fg">
          <X size={14} />
        </button>
      ) : (
        variant === 'bar' && (
          <button
            type="button"
            title="Command palette: pages, actions and search"
            aria-label="Open command palette"
            aria-keyshortcuts="Control+K Meta+K"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              useUi.getState().setPaletteOpen(true);
            }}
            className="shrink-0 rounded"
          >
            <Kbd className="hover:border-accent/60 hover:text-fg">{MOD_KEY === '⌘' ? '⌘K' : 'Ctrl K'}</Kbd>
          </button>
        )
      )}
    </div>
  );

  if (variant === 'sheet') {
    return (
      <div className="flex flex-col gap-2">
        {input}
        {showResults && results}
      </div>
    );
  }
  return (
    <>
      {input}
      <Floating
        open={focused && showResults}
        anchorRef={wrapRef}
        placement="bottom-start"
        offset={4}
        matchWidth
        onClose={() => inputRef.current?.blur()}
        className="panel w-[420px] max-w-[calc(100vw-16px)] shadow-float animate-pop-in"
      >
        {results}
      </Floating>
    </>
  );
}
