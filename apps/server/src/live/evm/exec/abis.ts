// ABIs of the contracts the engine calls, each verified against the deployed
// bytecode (dispatcher selectors cross-checked with the openchain signature
// database) and exercised read-only on mainnet (eth_call / eth_simulateV1):
//  - four.meme: selectors of TokenManager2's implementation (0xf32ee25a...);
//    Helper3 ABI from the four-flap-meme-sdk 4.4.3 package.
//  - Flap: selectors of the portal implementations on BNB Chain and Robinhood
//    Chain (same code); struct layouts from four-flap-meme-sdk 4.4.3.
//  - Pons v2: selectors of the curve and factory bytecode; return values
//    decoded against live curves (buy() returns tokens out).
//  - Uniswap: Universal Router commands / v4 actions from
//    @uniswap/universal-router-sdk 5.15.0 and @uniswap/v4-sdk 2.4.1.
//  - KyberSwap MetaAggregationRouterV2: decoded real route/build calldata.

import { parseAbi } from 'viem';

export const erc20Abi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
]);

export const wethAbi = parseAbi([
  'event Deposit(address indexed dst, uint256 wad)',
  'event Withdrawal(address indexed src, uint256 wad)',
]);

export const permit2Abi = parseAbi([
  'function approve(address token, address spender, uint160 amount, uint48 expiration)',
  'function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)',
]);

export const multicall3Abi = parseAbi([
  'struct Call3 { address target; bool allowFailure; bytes callData; }',
  'struct Result { bool success; bytes returnData; }',
  'function aggregate3(Call3[] calls) payable returns (Result[] returnData)',
]);

// four.meme (BNB Chain) ------------------------------------------------------

export const fourTokenManager2Abi = parseAbi([
  'function buyTokenAMAP(uint256 origin, address token, address to, uint256 funds, uint256 minAmount) payable',
  'function sellToken(uint256 origin, address token, uint256 amount, uint256 minFunds, uint256 feeRate, address feeRecipient)',
  'event TokenPurchase(address token, address account, uint256 price, uint256 amount, uint256 cost, uint256 fee, uint256 offers, uint256 funds)',
  'event TokenSale(address token, address account, uint256 price, uint256 amount, uint256 cost, uint256 fee, uint256 offers, uint256 funds)',
]);

export const fourHelper3Abi = parseAbi([
  'function getTokenInfo(address token) view returns (uint256 version, address tokenManager, address quote, uint256 lastPrice, uint256 tradingFeeRate, uint256 minTradingFee, uint256 launchTime, uint256 offers, uint256 maxOffers, uint256 funds, uint256 maxFunds, bool liquidityAdded)',
  'function tryBuy(address token, uint256 amount, uint256 funds) view returns (address tokenManager, address quote, uint256 estimatedAmount, uint256 estimatedCost, uint256 estimatedFee, uint256 amountMsgValue, uint256 amountApproval, uint256 amountFunds)',
  'function trySell(address token, uint256 amount) view returns (address tokenManager, address quote, uint256 funds, uint256 fee)',
  'function buyWithEth(uint256 origin, address token, address to, uint256 funds, uint256 minAmount) payable',
  'function sellForEth(uint256 origin, address token, uint256 amount, uint256 minFunds, uint256 feeRate, address feeRecipient)',
]);

// Flap (BNB Chain, Robinhood Chain) ------------------------------------------

export const flapPortalAbi = parseAbi([
  'struct TokenStateV7 { uint8 status; uint256 reserve; uint256 circulatingSupply; uint256 price; uint8 tokenVersion; uint256 r; uint256 h; uint256 k; uint256 dexSupplyThresh; address quoteTokenAddress; bool nativeToQuoteSwapEnabled; bytes32 extensionID; uint256 taxRate; address pool; uint256 progress; uint8 lpFeeProfile; }',
  'function getTokenV7(address token) view returns (TokenStateV7)',
  'function getFeeRate() view returns (uint256 buyFeeRate, uint256 sellFeeRate)',
  'struct QuoteExactInputParams { address inputToken; address outputToken; uint256 inputAmount; }',
  'function quoteExactInput(QuoteExactInputParams params) returns (uint256 outputAmount)',
  'struct ExactInputParams { address inputToken; address outputToken; uint256 inputAmount; uint256 minOutputAmount; bytes permitData; }',
  'function swapExactInput(ExactInputParams params) payable returns (uint256 outputAmount)',
  'event TokenBought(uint256 ts, address token, address buyer, uint256 amount, uint256 eth, uint256 fee, uint256 postPrice)',
  'event TokenSold(uint256 ts, address token, address seller, uint256 amount, uint256 eth, uint256 fee, uint256 postPrice)',
]);

/** Flap TokenStatus: 1 = tradable on the curve, 4 = graduated to a DEX. */
export const FLAP_STATUS = { invalid: 0, tradable: 1, inDuel: 2, killed: 3, dex: 4 } as const;

// Pons v2 (Robinhood Chain) --------------------------------------------------

export const ponsFactoryAbi = parseAbi([
  // Returns a record whose first two words are (token, curve), then creator, fee recipient, pair token, graduation threshold, ...
  'function getLaunchedToken(address token) view returns (address token_, address curve, address creator, address feeRecipient, address pairToken, uint256 graduationThreshold)',
  'function memeHook() view returns (address)',
]);

export const ponsCurveAbi = parseAbi([
  'function token() view returns (address)',
  'function pairToken() view returns (address)',
  'function isNativeQuote() view returns (bool)',
  'function graduated() view returns (bool)',
  'function readyToGraduate() view returns (bool)',
  'function feeBps() view returns (uint256)',
  'function creatorTaxBps() view returns (uint256)',
  'function quoteReserve() view returns (uint256)',
  'function tokenReserve() view returns (uint256)',
  'function sellableTokens() view returns (uint256)',
  'function currentSnipeTaxBps(address buyer) view returns (uint256)',
  'function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) payable returns (uint256 tokensOut)',
  'function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient) returns (uint256 quoteOut)',
  'event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)',
  'event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)',
]);

export const ponsTokenAbi = parseAbi(['function curve() view returns (address)', 'function launchFactory() view returns (address)']);

// Uniswap ----------------------------------------------------------------------

export const universalRouterAbi = parseAbi(['function execute(bytes commands, bytes[] inputs, uint256 deadline) payable']);

export const v4QuoterAbi = parseAbi([
  'function quoteExactInputSingle(((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) returns (uint256 amountOut, uint256 gasEstimate)',
  'function quoteExactInput((address exactCurrency, (address intermediateCurrency, uint24 fee, int24 tickSpacing, address hooks, bytes hookData)[] path, uint128 exactAmount) params) returns (uint256 amountOut, uint256 gasEstimate)',
]);

export const v4StateViewAbi = parseAbi([
  'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
  'function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)',
]);

/** Zora coins (and other v4 launchpads using the same pattern) expose their pool key and paired currency. */
export const v4CoinAbi = parseAbi([
  'function getPoolKey() view returns ((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks))',
  'function currency() view returns (address)',
]);

export const clankerFactoryAbi = parseAbi(['function tokenDeploymentInfo(address token) view returns ((address token, address hook, address locker, address[] extensions))']);

export const v3FactoryAbi = parseAbi(['function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)']);
export const v3PoolAbi = parseAbi(['function liquidity() view returns (uint128)']);
export const quoterV2Abi = parseAbi([
  'struct QuoteExactInputSingleParams { address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96; }',
  'function quoteExactInputSingle(QuoteExactInputSingleParams params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
]);

export const v2FactoryAbi = parseAbi(['function getPair(address tokenA, address tokenB) view returns (address pair)']);
export const v2PairAbi = parseAbi([
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)',
]);

export const pancakeV2RouterAbi = parseAbi([
  'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable',
  'function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)',
]);

// KyberSwap ----------------------------------------------------------------------

export const kyberRouterAbi = parseAbi([
  'struct SwapDescriptionV2 { address srcToken; address dstToken; address[] srcReceivers; uint256[] srcAmounts; address[] feeReceivers; uint256[] feeAmounts; address dstReceiver; uint256 amount; uint256 minReturnAmount; uint256 flags; bytes permit; }',
  'struct SwapExecutionParams { address callTarget; address approveTarget; bytes targetData; SwapDescriptionV2 desc; bytes clientData; }',
  'function swap(SwapExecutionParams execution) payable returns (uint256 returnAmount, uint256 gasUsed)',
  'function swapSimpleMode(address caller, SwapDescriptionV2 desc, bytes executorData, bytes clientData) returns (uint256 returnAmount, uint256 gasUsed)',
  'event Swapped(address sender, address srcToken, address dstToken, address dstReceiver, uint256 spentAmount, uint256 returnAmount)',
]);

/** KyberSwap's placeholder for the native token. */
export const KYBER_NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as const;

/** Synthetic log address eth_simulateV1 uses for traced native transfers (traceTransfers). */
export const SIMULATED_NATIVE_LOG_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as const;
