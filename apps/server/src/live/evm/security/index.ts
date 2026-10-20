// EVM token security (Base, Robinhood Chain, BNB Chain, Ethereum).
//
//   const checker = new EvmSecurityChecker({ clients: { base: client, robinhood: client2, ... } });
//   const report = await checker.check('base', token, { createdAt });
//   const { fields, checks, lpBurnedRate } = toTokenSecurityFlags(report);
//
// Venue simulators beyond Uniswap / PancakeSwap V2 and V3 plug in through
// checker.registerSimulator(sim: RoundTripSimulator).

export { EvmSecurityChecker, type EvmSecurityCheckerOptions, type ProviderName } from './checker';
export { toTokenSecurityFlags, type EvmTokenSecurityMapping, type TokenSecurityFields } from './flags';
export { V2V3Simulator, v2v3Simulator, rankPools, type RoundTripSimulator, type SimulationContext } from './simulate';
export { LAUNCHPADS, LAUNCHPAD_ADDRESSES } from './launchpads';
export { VENUES } from './venues';
export type { RpcClient } from './rpc';
export type * from './types';
