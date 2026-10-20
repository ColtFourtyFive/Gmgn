// Venue contracts per EVM chain. Every address below holds code on its chain
// (eth_getCode) and was exercised read-only on mainnet; the source of each is
// noted. Shared protocol contracts (Permit2, WETH, v4 PoolManager, factories)
// live in ../chains.ts.

import type { Address } from 'viem';
import type { EvmChainId } from '../chains';

/** Universal Router generations differ in the v2/v3/v4 swap parameter layout (2.1.1 added minHopPriceX36). */
export type UniversalRouterVersion = '2.0' | '2.1.1';

export interface UniswapDeployment {
  universalRouter: Address;
  universalRouterVersion: UniversalRouterVersion;
  v4Quoter: Address | null;
  v4StateView: Address | null;
  /** Uniswap v3 QuoterV2 (quoteExactInputSingle with a params struct). */
  v3QuoterV2: Address | null;
  /** Uniswap v3 / v2 factories the Universal Router computes pools from (null where it has none). */
  v3Factory: Address | null;
  v2Factory: Address | null;
}

export interface EvmVenueContracts {
  uniswap: UniswapDeployment | null;
  /** KyberSwap MetaAggregationRouterV2 (same address on every supported chain). */
  kyberRouter: Address | null;
  /** KyberSwap aggregator API chain slug (null = not supported). */
  kyberChainSlug: string | null;
  fourMeme: { tokenManager2: Address; helper3: Address } | null;
  flapPortal: Address | null;
  pons: { factory: Address; memeHook: Address } | null;
  clankerFactory: Address | null;
  pancakeV2: { router: Address; factory: Address } | null;
}

const KYBER_ROUTER: Address = '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5';

export const EVM_VENUES: Record<EvmChainId, EvmVenueContracts> = {
  base: {
    // @uniswap/universal-router-sdk 5.15.0 CHAIN_CONFIGS[8453] V2_0; quoter / state view from
    // @uniswap/sdk-core 7.19.4 CHAIN_TO_ADDRESSES_MAP[8453]; KyberSwap routes on Base return this router.
    uniswap: {
      universalRouter: '0x6fF5693b99212Da76ad316178A184AB56D299b43',
      universalRouterVersion: '2.0',
      v4Quoter: '0x0d5e0F971ED27FBfF6c2837bf31316121532048D',
      v4StateView: '0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71',
      v3QuoterV2: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
      v3Factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
      v2Factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
    },
    kyberRouter: KYBER_ROUTER,
    kyberChainSlug: 'base',
    fourMeme: null,
    flapPortal: null,
    pons: null,
    // Clanker v4 factory: tokenDeploymentInfo(token) -> hook of the token's pool.
    clankerFactory: '0xE85A59c628F7d27878ACeB4bf3b35733630083a9',
    pancakeV2: null,
  },
  robinhood: {
    // universal-router-sdk 5.15.0 CHAIN_CONFIGS[4663] V2_1_1 (no 2.0 router exists on this chain; its
    // eip712Domain() reports name "UniversalRouter", version "2", chainId 4663); quoter / state view /
    // factories from sdk-core 7.19.4 ROBINHOOD_ADDRESSES.
    uniswap: {
      universalRouter: '0x8876789976dEcBfCbBbe364623C63652db8C0904',
      universalRouterVersion: '2.1.1',
      v4Quoter: '0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94',
      v4StateView: '0xF3334192D15450CdD385c8B70e03f9A6bD9E673b',
      v3QuoterV2: '0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7',
      v3Factory: '0x1f7d7550B1b028f7571E69A784071F0205FD2EfA',
      v2Factory: '0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f',
    },
    // KyberSwap lists robinhood (4663) and routes through Pons v2 and Flap curves and v3/v4 pools there.
    kyberRouter: KYBER_ROUTER,
    kyberChainSlug: 'robinhood',
    fourMeme: null,
    // Flap's Robinhood Chain portal (same implementation as BNB Chain; buy() is feature-disabled, swapExactInput works).
    flapPortal: '0x26605f322f7fF986f381bB9A6e3f5DAb0bEaEb09',
    // Pons v2: factory found from on-chain launches (token.launchFactory()), hook = factory.memeHook().
    pons: { factory: '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e', memeHook: '0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044' },
    clankerFactory: null,
    pancakeV2: null,
  },
  bsc: {
    // No Uniswap Universal Router path on BNB Chain: PancakeSwap pools go through KyberSwap, then the
    // PancakeSwap v2 router as the direct fallback.
    uniswap: null,
    kyberRouter: KYBER_ROUTER,
    kyberChainSlug: 'bsc',
    fourMeme: { tokenManager2: '0x5c952063c7fc8610FFDB798152D69F0B9550762b', helper3: '0xF251F83e40a78868FcfA3FA4599Dad6494E46034' },
    flapPortal: '0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0',
    pons: null,
    clankerFactory: null,
    // PancakeSwap v2 Router02 and factory (the factory is also ../chains.ts v2Factory).
    pancakeV2: { router: '0x10ED43C718714eb63d5aA57B78B54704E256024E', factory: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73' },
  },
  eth: {
    // universal-router-sdk 5.15.0 CHAIN_CONFIGS[1] V2_0; sdk-core 7.19.4 MAINNET_ADDRESSES.
    uniswap: {
      universalRouter: '0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af',
      universalRouterVersion: '2.0',
      v4Quoter: '0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203',
      v4StateView: '0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227',
      v3QuoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
      v3Factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      v2Factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    },
    kyberRouter: KYBER_ROUTER,
    kyberChainSlug: 'ethereum',
    fourMeme: null,
    flapPortal: null,
    pons: null,
    clankerFactory: null,
    pancakeV2: null,
  },
};

/**
 * MEV-protected send endpoints we recommend for <PREFIX>_PRIVATE_RPC_URL (all
 * answered eth_chainId correctly). Base and Robinhood Chain are sequencer
 * chains without a public mempool: transactions go straight to the sequencer,
 * so there is nothing to front-run from the mempool and no private RPC is needed.
 */
export const RECOMMENDED_PRIVATE_RPC: Partial<Record<EvmChainId, { url: string; provider: string }[]>> = {
  eth: [
    { url: 'https://rpc.flashbots.net/fast', provider: 'Flashbots Protect (fast mode: shares with all builders)' },
    { url: 'https://rpc.mevblocker.io', provider: 'MEV Blocker' },
  ],
  bsc: [
    { url: 'https://rpc-bsc.48.club', provider: '48 Club privacy RPC' },
    { url: 'https://bsc.blockrazor.xyz/fullprivacy', provider: 'BlockRazor (full privacy, revert protection)' },
  ],
};

/** Chains whose transactions only reach a centralized sequencer (no public mempool to sandwich from). */
export const SEQUENCER_CHAINS: EvmChainId[] = ['base', 'robinhood'];
