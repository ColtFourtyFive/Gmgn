// ABI of the contracts in RoundTripProbe.sol (kept in sync by the probe test,
// which checks every selector below is dispatched by the compiled runtime).

import { parseAbi } from 'viem';

export const roundTripProbeAbi = parseAbi([
  'struct Leg { bool ok; uint256 expected; uint256 actual; uint256 gasUsed; bytes err; }',
  'struct Params { uint8 kind; address pool; address token; address quote; bool wrap; uint256 amountIn; uint16 feeBps; address recipient; uint16 transferBps; bool skipBuy; uint256 sellAmount; }',
  'struct Outcome { Leg buy; Leg xfer; Leg sell; uint256 quoteOut; uint256 expectedQuoteOut; }',
  'function roundTrip(Params p) returns (Outcome o)',
  'function buyLeg(Params p) returns (uint256 expectedOut)',
  'function sellLeg(Params p, uint256 amount) returns (uint256 poolReceived)',
  'function quoteV3(address pool, bool zeroForOne, uint256 amount)',
  'function uniswapV3SwapCallback(int256 a0, int256 a1, bytes data)',
  'function pancakeV3SwapCallback(int256 a0, int256 a1, bytes data)',
  'function algebraSwapCallback(int256 a0, int256 a1, bytes data)',
  'error FeeOnTransfer(uint256 debited, uint256 received)',
  'error Quote(int256 amount0, int256 amount1)',
  'error NotSelf()',
  'error BadCallback()',
  'error TransferFailed(bytes reason)',
]);

export const codeSizeReaderAbi = parseAbi(['function codeSizes(address[] accounts) view returns (uint256[] sizes)']);
