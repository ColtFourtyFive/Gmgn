// Maps an EvmSecurityReport onto the simulator's TokenState security fields and
// extra audit-checklist rows (SecurityCheck) for the orchestrator.

import type { SecurityCheck } from '@trenchscope/shared';
import type { TokenState } from '../../../sim/world';
import type { EvmSecurityReport, Tri } from './types';

export type TokenSecurityFields = Pick<TokenState, 'renouncedMint' | 'renouncedFreeze' | 'isOpenSource' | 'isRenounced' | 'isHoneypot' | 'buyTax' | 'sellTax'>;

export interface EvmTokenSecurityMapping {
  /** Exactly the TokenState security fields. */
  fields: TokenSecurityFields;
  /**
   * TokenState.buyTax / sellTax are plain numbers: when a tax is unknown the field
   * holds 0 and this says so (the 'evm_tax_unknown' check is added as well).
   */
  taxKnown: { buy: boolean; sell: boolean };
  /** For TokenSecurity.lpBurnedRate: burned + locked share of the main pool's LP, null when unknown. */
  lpBurnedRate: number | null;
  /** Extra audit checklist rows (keys prefixed "evm_"). */
  checks: SecurityCheck[];
}

const DASH = '—';
const yn = (v: Tri, yes = 'Yes', no = 'No') => (v === null ? DASH : v ? yes : no);
const pct = (v: number) => {
  const p = v * 100;
  if (p === 0) return '0%';
  if (p < 0.1) return '<0.1%';
  return `${p < 10 ? p.toFixed(1) : p.toFixed(0)}%`;
};
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** A risk flag row: true is bad (or warn), false good, unknown info. */
function flagRow(key: string, label: string, v: Tri, hint: string, bad: 'bad' | 'warn' = 'bad'): SecurityCheck {
  return { key, label, value: yn(v), level: v === null ? 'info' : v ? bad : 'good', ...(v ? { hint } : {}) };
}

/** Whether the owner can still change things that affect holders, after launchpad templates are taken into account. */
function renouncedForUi(r: EvmSecurityReport): boolean | null {
  switch (r.ownerRole) {
    case 'none':
    case 'renounced':
    case 'launchpad':
    case 'metadata-only':
      return true;
    case 'privileged':
      return false;
    default:
      return r.isRenounced;
  }
}

export function toTokenSecurityFlags(r: EvmSecurityReport): EvmTokenSecurityMapping {
  const fields: TokenSecurityFields = {
    renouncedMint: null,
    renouncedFreeze: null,
    isOpenSource: r.isOpenSource,
    isRenounced: renouncedForUi(r),
    isHoneypot: r.isHoneypot,
    buyTax: r.buyTax ?? 0,
    sellTax: r.sellTax ?? 0,
  };
  const f = r.flags;
  const checks: SecurityCheck[] = [];

  if (r.buyTax === null || r.sellTax === null) {
    checks.push({ key: 'evm_tax_unknown', label: 'Tax measured', value: 'No', level: 'warn', hint: 'Buy / sell tax could not be measured (no tradable pool or providers unavailable)' });
  }
  if (r.transferTax !== null && r.transferTax > 0) {
    checks.push({ key: 'evm_transfer_tax', label: 'Transfer tax', value: pct(r.transferTax), level: r.transferTax > 0.1 ? 'bad' : 'warn', hint: 'Tokens are taxed when sent between wallets' });
  }
  if (r.cannotBuy) checks.push({ key: 'evm_cannot_buy', label: 'Buying', value: 'Blocked', level: 'bad', hint: 'Buys revert (trading may not be enabled yet)' });
  if (r.cannotSellAll) checks.push({ key: 'evm_cannot_sell_all', label: 'Sell all', value: 'Blocked', level: 'warn', hint: 'Holders cannot sell their whole balance' });

  // Ownership, with what the owner actually is.
  const ownerValue =
    r.ownerRole === 'launchpad'
      ? `Launchpad${r.launchpad ? ` (${r.launchpad.name})` : ''}`
      : r.ownerRole === 'metadata-only'
        ? 'Admin (metadata only)'
        : r.ownerRole === 'none'
          ? 'None'
          : r.ownerRole === 'renounced'
            ? 'Renounced'
            : r.ownerRole === 'privileged'
              ? r.owner
                ? short(r.owner)
                : 'Active'
              : DASH;
  checks.push({
    key: 'evm_owner',
    label: 'Owner',
    value: ownerValue,
    level: r.ownerRole === null ? 'info' : r.ownerRole === 'privileged' ? 'warn' : 'good',
    ...(r.ownerRole === 'launchpad' ? { hint: 'The launchpad contract owns the token until migration, not the dev' } : {}),
    ...(r.ownerRole === 'metadata-only' ? { hint: 'The admin can only change the image / metadata' } : {}),
    ...(r.ownerRole === 'privileged' ? { hint: 'An owner / admin can call privileged functions' } : {}),
  });

  checks.push(flagRow('evm_mint', 'Mint function', f.mintable, 'Owner can mint new supply'));
  const proxyValue = r.proxy?.kind === 'minimal-clone' ? 'Clone (immutable)' : f.upgradeable ? 'Upgradeable' : f.proxy ? 'Proxy' : yn(f.proxy);
  checks.push({
    key: 'evm_proxy',
    label: 'Upgradeable',
    value: proxyValue,
    level: f.upgradeable ? 'bad' : f.proxy === null && f.upgradeable === null ? 'info' : f.proxy && f.upgradeable === null ? 'warn' : 'good',
    ...(f.upgradeable ? { hint: 'The contract code can be replaced' } : {}),
  });
  checks.push(flagRow('evm_blacklist', 'Blacklist', f.blacklist, 'Owner can block wallets from trading'));
  checks.push(flagRow('evm_tax_modifiable', 'Tax modifiable', f.taxModifiable, 'Owner can raise buy / sell taxes'));
  checks.push(flagRow('evm_pausable', 'Trading pausable', f.pausable, 'Owner can pause trading / transfers'));
  checks.push(flagRow('evm_balance_change', 'Balance control', f.ownerCanChangeBalance, 'Owner can change or burn holder balances'));
  checks.push({
    key: 'evm_anti_whale',
    label: 'Max tx / wallet',
    value: yn(f.antiWhale),
    level: f.antiWhale === null ? 'info' : f.antiWhaleModifiable ? 'warn' : 'good',
    ...(f.antiWhale ? { hint: f.antiWhaleModifiable ? 'Limits exist and the owner can change them' : 'Transaction / wallet size limits exist' } : {}),
  });
  checks.push(flagRow('evm_cooldown', 'Trading cooldown', f.tradingCooldown, 'Wallets must wait between trades', 'warn'));
  const hidden: Tri = f.hiddenOwner === true || f.canTakeBackOwnership === true ? true : f.hiddenOwner === false && f.canTakeBackOwnership !== null ? false : null;
  checks.push(flagRow('evm_hidden_owner', 'Hidden owner', hidden, 'Ownership can be reclaimed after renouncing'));
  checks.push(flagRow('evm_selfdestruct', 'Self-destruct', f.selfDestruct, 'The contract can destroy itself'));
  checks.push(flagRow('evm_external_call', 'External calls', f.externalCall, 'Transfers can call other contracts', 'warn'));

  const lpBurnedRate =
    r.lp && (r.lp.burnedShare !== null || r.lp.lockedShare !== null) ? Math.round(Math.min(1, (r.lp.burnedShare ?? 0) + (r.lp.lockedShare ?? 0)) * 10_000) / 10_000 : null;
  if (r.lp?.lockers.length) {
    checks.push({
      key: 'evm_lp_lockers',
      label: 'LP lockers',
      value: r.lp.lockers.map((l) => `${l.name}${l.share === null ? '' : ` ${pct(l.share)}`}`).join(', '),
      level: 'info',
    });
  }

  if (r.creator.address) {
    const s = r.creator.share;
    checks.push({
      key: 'evm_creator',
      label: 'Creator holds',
      value: s === null ? DASH : pct(s),
      level: s === null ? 'info' : s <= 0.02 ? 'good' : s <= 0.1 ? 'warn' : 'bad',
      hint: `Creator ${short(r.creator.address)}`,
    });
  }

  if (r.launchpad) {
    checks.push({
      key: 'evm_launchpad',
      label: 'Launchpad',
      value: `${r.launchpad.name}${r.launchpad.template !== 'standard' && r.launchpad.template !== 'unknown' ? ` (${r.launchpad.template})` : ''}`,
      level: 'info',
      ...(r.launchpad.facts.length ? { hint: r.launchpad.facts.slice(1, 3).join('; ') || r.launchpad.facts[0] } : {}),
    });
  }

  const sim = r.simulation;
  checks.push({
    key: 'evm_simulation',
    label: 'Buy / sell simulation',
    value: !sim ? DASH : sim.isHoneypot === true ? 'Sell blocked' : sim.isHoneypot === false ? 'Passed' : sim.cannotBuy ? 'Buy blocked' : 'Inconclusive',
    level: !sim ? 'info' : sim.isHoneypot === true ? 'bad' : sim.isHoneypot === false ? 'good' : sim.cannotBuy ? 'warn' : 'info',
    ...(sim ? { hint: `${sim.venue} ${short(sim.pool.address)}${sim.notes.length ? `: ${sim.notes[0]}` : ''}` } : { hint: 'No pool the simulator can trade' }),
  });

  if (r.disagreements.length) {
    checks.push({
      key: 'evm_disagreements',
      label: 'Sources disagree',
      value: String(r.disagreements.length),
      level: 'info',
      hint: r.disagreements
        .slice(0, 3)
        .map((d) => `${d.field}: ${d.values.map((v) => `${v.provider}=${typeof v.value === 'number' ? pct(v.value) : String(v.value)}`).join(' / ')}`)
        .join('; '),
    });
  }
  checks.push({ key: 'evm_coverage', label: 'Check coverage', value: pct(r.coverage), level: r.coverage >= 0.75 ? 'good' : r.coverage >= 0.5 ? 'info' : 'warn' });

  return { fields, taxKnown: { buy: r.buyTax !== null, sell: r.sellTax !== null }, lpBurnedRate, checks };
}
