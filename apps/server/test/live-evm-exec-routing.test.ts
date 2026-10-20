// Offline replays of real mainnet verification runs (scripts/evm-exec-verify.ts --record):
// routing decisions, quotes, minOut / fee math, allow-listed plans and simulated
// fills, deterministic against the recorded RPC and aggregator responses.

import { describe, expect, it } from 'vitest';
import { isAddressEqual, type Address } from 'viem';
import { EVM_CHAINS } from '../src/live/evm/chains';
import type { EvmLiveConfig } from '../src/live/evm/config';
import { chainAllowlist, decodeApprove } from '../src/live/evm/exec/allowlist';
import { EvmExecEngine } from '../src/live/evm/exec/engine';
import { feeOnInput, minOutAfterSlippage } from '../src/live/evm/exec/math';
import { overlayClient, replayClient, replayFetch } from '../src/live/evm/exec/recorder';
import { CURVE_VENUES } from '../src/live/evm/exec/router';
import type { EvmTradeIntent } from '../src/live/evm/exec/types';
import { receiptFixtures, tradeFixtures, withoutHistoricalBalances, type TradeFixture } from './fixtures/evm/exec/load';

const trades = tradeFixtures().filter((f) => f.result.status === 'OK');
const receipts = receiptFixtures();

function engineFor(f: Pick<TradeFixture, 'chain' | 'feeWallet' | 'now' | 'overlay' | 'recording'>) {
  const chain = EVM_CHAINS[f.chain].viem;
  const base = replayClient(chain, f.recording);
  const client = f.overlay ? overlayClient(chain, base, f.overlay) : base;
  const config: EvmLiveConfig = {
    chains: { [f.chain]: { chain: f.chain, rpcUrls: ['replay'], wsUrl: null, privateRpcUrl: null, publicRpcOnly: true } },
    feeWallet: f.feeWallet,
    platformFeeBps: 80,
    kyberswap: { baseUrl: 'https://aggregator-api.kyberswap.com', clientId: 'trenchscope' },
  };
  return new EvmExecEngine({ config, clients: { [f.chain]: { read: client, send: client, ws: null } }, fetch: replayFetch(f.recording), now: () => f.now });
}

function intentOf(f: TradeFixture): EvmTradeIntent {
  return f.side === 'buy'
    ? { chain: f.chain, token: f.token, side: 'buy', amount: BigInt(f.buyAmount), amountKind: 'native', slippageBps: 'auto', speed: 'P2', antiMev: false, venues: f.venues }
    : { chain: f.chain, token: f.token, side: 'sell', amount: 1000n, amountKind: 'percent', slippageBps: 'auto', speed: 'P2', antiMev: false, venues: f.venues, wallet: f.wallet };
}

describe('recorded mainnet trades', () => {
  it('has fixtures for every venue on every chain', () => {
    const venues = new Set(trades.map((t) => `${t.chain}:${t.result.venue.split(':')[0]}`));
    for (const v of ['bsc:fourmeme', 'bsc:flap', 'bsc:kyberswap', 'bsc:pancake-v2', 'robinhood:pons', 'robinhood:flap', 'robinhood:uniswap-v4', 'robinhood:kyberswap', 'base:kyberswap', 'base:uniswap-v4', 'base:uniswap-v3', 'base:uniswap-v2', 'eth:kyberswap', 'eth:uniswap-v3', 'eth:uniswap-v2', 'eth:uniswap-v4']) {
      expect(venues, v).toContain(v);
    }
  });

  for (const f of trades) {
    it(`${f.chain} ${f.case} ${f.side}`, async () => {
      const engine = engineFor(f);
      const quote = await engine.quote(intentOf(f));

      // routing: the venue the live run chose; curves before pools
      expect(quote.venue).toBe(f.result.venue.split(':')[0]);
      expect(quote.route).toBe(CURVE_VENUES.includes(quote.venue) ? 'curve' : 'pool');

      // slippage and fee math
      expect(quote.minOut).toBe(minOutAfterSlippage(quote.expectedOut, quote.slippageBps));
      if (f.side === 'buy') {
        expect(quote.fees.platformFee).toBe(feeOnInput(quote.amountIn, 80));
        expect(quote.venueAmountIn).toBe(quote.amountIn - quote.fees.platformFee);
      } else {
        expect(quote.expectedOut + quote.fees.platformFee).toBe(quote.nativeLeg);
      }
      const atomic = quote.venue === 'kyberswap' || quote.venue.startsWith('uniswap') || (quote.venue === 'fourmeme' && f.side === 'sell');
      expect(quote.fees.platformFeeMode === 'atomic').toBe(atomic);

      // plan: approvals only to allow-listed spenders (or the factory-verified Pons curve), exact amounts
      const plan = await engine.prepare(quote, f.wallet);
      const allow = chainAllowlist(f.chain);
      for (const s of plan.steps) {
        if (s.kind === 'approve') {
          const { spender, amount } = decodeApprove(s.data);
          const ok = allow.spenders.has(spender.toLowerCase()) || (quote.venueData.venue === 'pons' && isAddressEqual(spender, quote.venueData.curve as Address));
          expect(ok, `spender ${spender}`).toBe(true);
          expect(amount).toBe(quote.amountIn);
        }
      }
      expect(plan.steps.filter((s) => s.kind === 'fee')).toHaveLength(quote.fees.platformFeeMode.startsWith('separate') ? 1 : 0);

      // simulation: output within slippage, the fee wallet receives the fee
      const sim = await engine.simulate(plan, f.freshWallet ? { stateOverrides: { [f.wallet]: { balance: quote.amountIn + 10n ** 18n } } } : {});
      expect(sim.ok, sim.error ?? '').toBe(true);
      const separate = quote.fees.platformFeeMode.startsWith('separate') ? quote.fees.platformFee : 0n;
      const out = f.side === 'buy' ? sim.tokenDelta! : sim.nativeReceived! - separate;
      expect(out).toBeGreaterThanOrEqual(quote.minOut);
      if (f.side === 'buy' || !atomic) expect(sim.feeReceived).toBe(quote.fees.platformFee);
      else expect(sim.feeReceived! * 10_000n / (out + sim.feeReceived!)).toBeLessThanOrEqual(80n);
    });
  }
});

describe('recorded mainnet receipts', () => {
  for (const r of receipts) {
    it(`${r.chain} ${r.name}: decodes the fill`, async () => {
      const engine = engineFor({ chain: r.chain, feeWallet: '0x0000000000000000000000000000000000000001', now: 0, overlay: null, recording: r.recording });
      const fill = await engine.track(r.chain, r.hash, { token: r.token, side: r.side });
      expect(fill).toEqual(r.fill);
      if (r.eventTokens !== null) expect(fill.tokenAmount).toBe(r.eventTokens);
      // the balance delta and the venue's own event agree on the native leg; the balance method also credits
      // native the wallet received from elsewhere in the same block (one recorded BSC buy got 0.003% back
      // that way while KyberSwap's Swapped event reports the full msg.value spent), hence 1 bp
      if (fill.nativeSource === 'balance') {
        const diff = fill.nativeAmount > r.eventNative ? fill.nativeAmount - r.eventNative : r.eventNative - fill.nativeAmount;
        expect(diff * 10_000n <= r.eventNative, `${fill.nativeAmount} vs ${r.eventNative}`).toBe(true);
      }
    });

    it(`${r.chain} ${r.name}: falls back to the venue event without historical state`, async () => {
      const chain = EVM_CHAINS[r.chain].viem;
      const client = withoutHistoricalBalances(chain, replayClient(chain, r.recording));
      const config: EvmLiveConfig = { chains: { [r.chain]: { chain: r.chain, rpcUrls: ['replay'], wsUrl: null, privateRpcUrl: null, publicRpcOnly: true } }, feeWallet: null, platformFeeBps: 80, kyberswap: { baseUrl: 'x', clientId: 'x' } };
      const engine = new EvmExecEngine({ config, clients: { [r.chain]: { read: client, send: client, ws: null } }, kyber: null });
      const fill = await engine.track(r.chain, r.hash, { token: r.token, side: r.side });
      expect(fill.tokenAmount).toBe(r.fill.tokenAmount);
      expect(fill.nativeSource).toBe('event');
      expect(fill.nativeAmount).toBe(r.eventNative);
    });
  }
});
