// EVM execution engine for live trading on Base, Robinhood Chain, BNB Chain
// and Ethereum. Standalone: the orchestrator wires it into the trading venue
// seam. Entry point: EvmExecEngine (engine.ts) — quote / prepare / simulate /
// send / track; see engine.ts for the flow and types.ts for the shapes.
//
// Venues (router.ts VENUE_ORDER): four.meme, Flap and Pons bonding curves
// first, then KyberSwap, then direct Uniswap v4 / v3 / v2 pools through the
// Universal Router (PancakeSwap v2 on BNB Chain). Contracts per chain and how
// each was verified: contracts.ts; the allow-list every plan is checked
// against: allowlist.ts; fees and gas: math.ts, gas.ts; MEV: contracts.ts
// RECOMMENDED_PRIVATE_RPC + engine.sender().

export { EvmExecEngine, simulationError, type EvmExecEngineOptions, type EvmSendOptions, type EvmSendSigner, type EvmSimulateOptions } from './engine';
export { EvmExecError, classifyRpcError, isEvmExecError, type EvmExecErrorCode } from './errors';
export { allowlistedTargets, chainAllowlist, validatePlan, PERMIT2_MAX_EXPIRY_SECONDS } from './allowlist';
export { EVM_VENUES, RECOMMENDED_PRIVATE_RPC, SEQUENCER_CHAINS, type EvmVenueContracts, type UniswapDeployment, type UniversalRouterVersion } from './contracts';
export { GAS_POLICY, SPEED_TIP_PERCENT, computeFees, gasLimitFor, suggestFees, type FeeSuggestion } from './gas';
export { KyberClient, validateKyberBuild, type KyberBuild, type KyberRoute } from './kyber';
export { autoSlippageBps, minOutAfterSlippage, priceImpactBps, resolveSlippageBps } from './math';
export { KeyedSerialQueue, NonceManager } from './nonce';
export { decodeFill, tokenFlow, type EvmTrackContext } from './receipt';
export { CURVE_VENUES, VENUE_ORDER, defaultVenues, routeAndQuote, type RoutingAttempt } from './router';
export { toExternalTrade, toLiveFillRecord, toQuoteDto } from './dto';
export type * from './types';
