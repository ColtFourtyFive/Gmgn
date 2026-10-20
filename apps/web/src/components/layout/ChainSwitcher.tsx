import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CHAINS, type ChainId } from '@trenchscope/shared';
import clsx from 'clsx';
import { CHAIN_SHORT, ChainIcon } from '@/components/common';
import { Select, useRovingKeys } from '@/components/ui';
import { useActiveChain } from '@/hooks/useActiveChain';
import { useEnabledChains } from '@/hooks/useMode';
import { useUi } from '@/store/ui';
import { switchChainPath } from './nav';

/** Switch to a chain, keeping the current section when possible (see switchChainPath). */
export function useSwitchChain(): (chain: ChainId) => void {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (chain) => {
    useUi.getState().setChain(chain);
    const next = switchChainPath(pathname, chain);
    if (next && next !== pathname) navigate(next);
  };
}

/**
 * Chain dropdown for the top bar (the chains this deployment serves).
 * `compact` shows only the icon. A deployment with one chain (live: Solana)
 * shows it as a plain chip: there is nothing to switch to.
 */
export function ChainSwitcher({ compact, className }: { compact?: boolean; className?: string }) {
  const chain = useActiveChain();
  const switchChain = useSwitchChain();
  const chains = useEnabledChains();
  const options = useMemo(
    () => chains.map((id) => ({ value: id, label: CHAINS[id].name, icon: <ChainIcon chain={id} size={16} />, hint: CHAINS[id].nativeSymbol })),
    [chains],
  );
  if (chains.length <= 1) {
    return (
      <span className={clsx('flex h-8 shrink-0 items-center gap-1.5 rounded px-1.5 text-sm', className)} title={`Chain: ${CHAINS[chain].name}`}>
        <ChainIcon chain={chain} size={16} />
        {!compact && <span className="font-medium">{CHAIN_SHORT[chain]}</span>}
        <span className="sr-only">{CHAINS[chain].name}</span>
      </span>
    );
  }
  return (
    <Select
      aria-label="Switch chain"
      value={chain}
      onChange={switchChain}
      options={options}
      placement="bottom-end"
      menuClassName="min-w-[180px]"
      className={clsx('shrink-0', className)}
      renderValue={() => (
        <>
          <ChainIcon chain={chain} size={16} />
          {!compact && <span className="font-medium">{CHAIN_SHORT[chain]}</span>}
        </>
      )}
    />
  );
}

/** Grid of chain buttons (mobile drawer): a radio group (one Tab stop, arrow keys pick). Nothing when only one chain is served. */
export function ChainPicker({ className }: { className?: string }) {
  const chains = useEnabledChains();
  if (chains.length <= 1) return null;
  return <ChainPickerGrid chains={chains} className={className} />;
}

function ChainPickerGrid({ chains, className }: { chains: ChainId[]; className?: string }) {
  const chain = useActiveChain();
  const switchChain = useSwitchChain();
  const items = useMemo(() => chains.map((id) => ({ value: id })), [chains]);
  const { refs, onKeyDown, tabStop } = useRovingKeys(items, chain, switchChain);
  return (
    <div role="radiogroup" aria-label="Chain" onKeyDown={onKeyDown} className={clsx('grid grid-cols-4 gap-1.5', className)}>
      {chains.map((id, i) => (
        <button
          key={id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={id === chain}
          tabIndex={i === tabStop ? 0 : -1}
          onClick={() => switchChain(id)}
          className={clsx(
            'flex h-14 flex-col items-center justify-center gap-1 rounded border text-xs font-medium transition-colors',
            id === chain ? 'border-accent bg-accent/10 text-fg' : 'border-line text-muted hover:border-line-strong',
          )}
        >
          <ChainIcon chain={id} size={18} />
          {CHAIN_SHORT[id]}
        </button>
      ))}
    </div>
  );
}
