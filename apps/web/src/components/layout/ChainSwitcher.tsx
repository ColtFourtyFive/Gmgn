import { useLocation, useNavigate } from 'react-router-dom';
import { CHAIN_IDS, CHAINS, type ChainId } from '@trenchscope/shared';
import clsx from 'clsx';
import { CHAIN_SHORT, ChainIcon } from '@/components/common';
import { Select, useRovingKeys } from '@/components/ui';
import { useActiveChain } from '@/hooks/useActiveChain';
import { useUi } from '@/store/ui';
import { switchChainPath } from './nav';

const OPTIONS = CHAIN_IDS.map((id) => ({ value: id, label: CHAINS[id].name, icon: <ChainIcon chain={id} size={16} />, hint: CHAINS[id].nativeSymbol }));

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

/** Chain dropdown for the top bar. `compact` shows only the icon. */
export function ChainSwitcher({ compact, className }: { compact?: boolean; className?: string }) {
  const chain = useActiveChain();
  const switchChain = useSwitchChain();
  return (
    <Select
      aria-label="Switch chain"
      value={chain}
      onChange={switchChain}
      options={OPTIONS}
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

const PICKER_ITEMS = CHAIN_IDS.map((id) => ({ value: id }));

/** Grid of chain buttons (mobile drawer): a radio group (one Tab stop, arrow keys pick). */
export function ChainPicker({ className }: { className?: string }) {
  const chain = useActiveChain();
  const switchChain = useSwitchChain();
  const { refs, onKeyDown, tabStop } = useRovingKeys(PICKER_ITEMS, chain, switchChain);
  return (
    <div role="radiogroup" aria-label="Chain" onKeyDown={onKeyDown} className={clsx('grid grid-cols-4 gap-1.5', className)}>
      {CHAIN_IDS.map((id, i) => (
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
