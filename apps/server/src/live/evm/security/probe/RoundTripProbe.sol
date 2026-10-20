// SPDX-License-Identifier: MIT
// Trenchscope round-trip probe. Never deployed: its runtime code is placed at a
// throwaway address (or at a real holder's address) through an eth_call state
// override and run once to buy a token from a pool, transfer a slice of it and
// sell the rest, measuring every leg by balance deltas. Read-only by
// construction: eth_call state is discarded.
pragma solidity 0.8.26;

interface IERC20Min {
    function balanceOf(address) external view returns (uint256);
}

interface IWrappedNative {
    function deposit() external payable;
}

interface IV2Pair {
    function getReserves() external view returns (uint112, uint112, uint32);
    function token0() external view returns (address);
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external;
}

interface IV3Pool {
    function token0() external view returns (address);
    function swap(address recipient, bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96, bytes calldata data)
        external
        returns (int256, int256);
}

contract RoundTripProbe {
    struct Leg {
        bool ok;
        // buy: amount the pool sent; transfer / sell: amount debited from the probe
        uint256 expected;
        // buy: amount the probe received; transfer: amount the recipient received; sell: amount the pool received
        uint256 actual;
        uint256 gasUsed;
        bytes err;
    }

    struct Params {
        // 0 = Uniswap-V2-style pair, 1 = Uniswap-V3-style pool (Uniswap / PancakeSwap / Algebra callbacks)
        uint8 kind;
        address pool;
        address token;
        // Token paid in. wrap = true: wrapped native, deposited from the probe's native balance;
        // wrap = false: the caller set the probe's quote balance through a storage override.
        address quote;
        bool wrap;
        uint256 amountIn;
        // V2 only: pool fee in basis points (sizes outputs; must be >= the pair's real fee)
        uint16 feeBps;
        // receives the transfer-leg slice (share of the bought amount, in bps; 0 = no transfer leg)
        address recipient;
        uint16 transferBps;
        // true: skip the buy and sell tokens the probe address already holds (holder simulation)
        bool skipBuy;
        // tokens to sell; 0 = everything held
        uint256 sellAmount;
    }

    struct Outcome {
        Leg buy;
        Leg xfer;
        Leg sell;
        // quote received for the sell, and what the pool would have paid before the sell started
        uint256 quoteOut;
        uint256 expectedQuoteOut;
    }

    error FeeOnTransfer(uint256 debited, uint256 received);
    error Quote(int256 amount0, int256 amount1);
    error NotSelf();
    error BadCallback();
    error TransferFailed(bytes reason);

    uint160 internal constant MIN_SQRT_RATIO = 4295128739;
    uint160 internal constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    address private activePool;
    address private payToken;
    bool private quoting;

    function roundTrip(Params calldata p) external returns (Outcome memory o) {
        uint256 held = IERC20Min(p.token).balanceOf(address(this));
        if (!p.skipBuy) {
            if (p.wrap) IWrappedNative(p.quote).deposit{value: p.amountIn}();
            uint256 before = held;
            uint256 g = gasleft();
            try this.buyLeg(p) returns (uint256 expectedOut) {
                o.buy.ok = true;
                o.buy.expected = expectedOut;
            } catch (bytes memory reason) {
                o.buy.err = reason;
            }
            o.buy.gasUsed = g - gasleft();
            held = IERC20Min(p.token).balanceOf(address(this));
            o.buy.actual = held > before ? held - before : 0;
            if (!o.buy.ok || held == 0) return o;
        }

        // Transfer a slice to a plain address.
        uint256 slice = (held * p.transferBps) / 10_000;
        if (slice > 0) _transferLeg(p, o, held, slice);
        held = IERC20Min(p.token).balanceOf(address(this));

        uint256 amount = p.sellAmount == 0 || p.sellAmount > held ? held : p.sellAmount;
        if (amount == 0) return o;
        o.expectedQuoteOut = _quoteSell(p, amount);
        uint256 qBefore = IERC20Min(p.quote).balanceOf(address(this));
        uint256 g2 = gasleft();
        try this.sellLeg(p, amount) returns (uint256 poolReceived) {
            o.sell.ok = true;
            o.sell.actual = poolReceived;
        } catch (bytes memory reason) {
            o.sell.err = reason;
            if (reason.length == 68 && bytes4(reason) == FeeOnTransfer.selector) {
                (uint256 d, uint256 r) = abi.decode(_tail(reason), (uint256, uint256));
                o.sell.expected = d;
                o.sell.actual = r;
            }
        }
        o.sell.gasUsed = g2 - gasleft();
        uint256 heldEnd = IERC20Min(p.token).balanceOf(address(this));
        if (o.sell.ok) o.sell.expected = held > heldEnd ? held - heldEnd : 0;
        uint256 qAfter = IERC20Min(p.quote).balanceOf(address(this));
        o.quoteOut = qAfter > qBefore ? qAfter - qBefore : 0;
    }

    function _transferLeg(Params calldata p, Outcome memory o, uint256 held, uint256 slice) internal {
        uint256 rBefore = IERC20Min(p.token).balanceOf(p.recipient);
        uint256 g = gasleft();
        (bool ok, bytes memory ret) = p.token.call(abi.encodeWithSelector(0xa9059cbb, p.recipient, slice));
        o.xfer.gasUsed = g - gasleft();
        o.xfer.ok = ok && (ret.length == 0 || (ret.length >= 32 && abi.decode(ret, (bool))));
        if (!o.xfer.ok) o.xfer.err = ret;
        uint256 heldAfter = IERC20Min(p.token).balanceOf(address(this));
        o.xfer.expected = held > heldAfter ? held - heldAfter : 0;
        uint256 rAfter = IERC20Min(p.token).balanceOf(p.recipient);
        o.xfer.actual = rAfter > rBefore ? rAfter - rBefore : 0;
    }

    /// What the pool pays for `amount` tokens right now (before any token-side hook runs).
    function _quoteSell(Params calldata p, uint256 amount) internal returns (uint256) {
        if (p.kind == 0) {
            IV2Pair pair = IV2Pair(p.pool);
            bool tokenIs0 = pair.token0() == p.token;
            (uint112 r0, uint112 r1,) = pair.getReserves();
            return tokenIs0 ? _amountOut(amount, r0, r1, p.feeBps) : _amountOut(amount, r1, r0, p.feeBps);
        }
        bool zeroForOne = IV3Pool(p.pool).token0() == p.token;
        try this.quoteV3(p.pool, zeroForOne, amount) {} catch (bytes memory r) {
            if (r.length == 68 && bytes4(r) == Quote.selector) {
                (int256 a0, int256 a1) = abi.decode(_tail(r), (int256, int256));
                int256 out = zeroForOne ? a1 : a0;
                return out < 0 ? uint256(-out) : 0;
            }
        }
        return 0;
    }

    /// Always reverts with Quote(amount0, amount1) from inside the swap callback.
    function quoteV3(address pool, bool zeroForOne, uint256 amount) external {
        if (msg.sender != address(this)) revert NotSelf();
        quoting = true;
        activePool = pool;
        IV3Pool(pool).swap(address(this), zeroForOne, int256(amount), zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1, "");
    }

    function buyLeg(Params calldata p) external returns (uint256 expectedOut) {
        if (msg.sender != address(this)) revert NotSelf();
        if (p.kind == 0) {
            IV2Pair pair = IV2Pair(p.pool);
            (uint112 r0, uint112 r1,) = pair.getReserves();
            bool tokenIs0 = pair.token0() == p.token;
            (uint256 rIn, uint256 rOut) = tokenIs0 ? (uint256(r1), uint256(r0)) : (uint256(r0), uint256(r1));
            _transfer(p.quote, p.pool, p.amountIn);
            expectedOut = _amountOut(p.amountIn, rIn, rOut, p.feeBps);
            pair.swap(tokenIs0 ? expectedOut : 0, tokenIs0 ? 0 : expectedOut, address(this), "");
        } else {
            bool zeroForOne = IV3Pool(p.pool).token0() == p.quote;
            (int256 a0, int256 a1) = _v3Swap(p.pool, p.quote, zeroForOne, p.amountIn);
            int256 out = zeroForOne ? a1 : a0;
            expectedOut = out < 0 ? uint256(-out) : 0;
        }
    }

    function sellLeg(Params calldata p, uint256 amount) external returns (uint256 poolReceived) {
        if (msg.sender != address(this)) revert NotSelf();
        if (p.kind == 0) return _sellV2(p, amount);
        bool zeroForOne = IV3Pool(p.pool).token0() == p.token;
        (int256 a0, int256 a1) = _v3Swap(p.pool, p.token, zeroForOne, amount);
        int256 paid = zeroForOne ? a0 : a1;
        poolReceived = paid > 0 ? uint256(paid) : 0;
    }

    function _sellV2(Params calldata p, uint256 amount) internal returns (uint256 poolReceived) {
        IV2Pair pair = IV2Pair(p.pool);
        bool tokenIs0 = pair.token0() == p.token;
        (uint112 r0, uint112 r1,) = pair.getReserves();
        uint256 rIn = tokenIs0 ? r0 : r1;
        uint256 bal = IERC20Min(p.token).balanceOf(p.pool);
        uint256 excess = bal > rIn ? bal - rIn : 0;
        _transfer(p.token, p.pool, amount);
        // Token hooks may swap their own tax inside the transfer (which syncs the reserves first).
        (uint112 s0, uint112 s1,) = pair.getReserves();
        uint256 sIn = tokenIs0 ? s0 : s1;
        if (sIn != rIn) excess = 0;
        bal = IERC20Min(p.token).balanceOf(p.pool);
        poolReceived = bal > sIn + excess ? bal - sIn - excess : 0;
        uint256 out = _amountOut(poolReceived, sIn, tokenIs0 ? s1 : s0, p.feeBps);
        pair.swap(tokenIs0 ? 0 : out, tokenIs0 ? out : 0, address(this), "");
    }

    function _v3Swap(address pool, address tokenIn, bool zeroForOne, uint256 amountIn) internal returns (int256, int256) {
        activePool = pool;
        payToken = tokenIn;
        (int256 a0, int256 a1) = IV3Pool(pool).swap(
            address(this), zeroForOne, int256(amountIn), zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1, ""
        );
        activePool = address(0);
        return (a0, a1);
    }

    function _pay(int256 a0, int256 a1) internal {
        if (msg.sender != activePool || activePool == address(0)) revert BadCallback();
        if (quoting) revert Quote(a0, a1);
        uint256 owed = a0 > 0 ? uint256(a0) : a1 > 0 ? uint256(a1) : 0;
        if (owed == 0) return;
        address t = payToken;
        uint256 pBefore = IERC20Min(t).balanceOf(msg.sender);
        uint256 sBefore = IERC20Min(t).balanceOf(address(this));
        _transfer(t, msg.sender, owed);
        uint256 received = IERC20Min(t).balanceOf(msg.sender) - pBefore;
        uint256 sAfter = IERC20Min(t).balanceOf(address(this));
        uint256 debited = sBefore > sAfter ? sBefore - sAfter : 0;
        // A concentrated-liquidity pool rejects short payments: report what a fee-on-transfer token delivered.
        if (received < owed) revert FeeOnTransfer(debited, received);
    }

    function uniswapV3SwapCallback(int256 a0, int256 a1, bytes calldata) external {
        _pay(a0, a1);
    }

    function pancakeV3SwapCallback(int256 a0, int256 a1, bytes calldata) external {
        _pay(a0, a1);
    }

    function algebraSwapCallback(int256 a0, int256 a1, bytes calldata) external {
        _pay(a0, a1);
    }

    function _amountOut(uint256 amountIn, uint256 rIn, uint256 rOut, uint16 feeBps) internal pure returns (uint256) {
        if (amountIn == 0 || rIn == 0 || rOut == 0) return 0;
        uint256 inWithFee = amountIn * (10_000 - feeBps);
        return (inWithFee * rOut) / (rIn * 10_000 + inWithFee);
    }

    function _transfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        if (!ok || (ret.length > 0 && (ret.length < 32 || !abi.decode(ret, (bool))))) revert TransferFailed(ret);
    }

    function _tail(bytes memory b) internal pure returns (bytes memory out) {
        out = new bytes(b.length - 4);
        for (uint256 i = 0; i < out.length; i++) out[i] = b[i + 4];
    }

    receive() external payable {}
}

/// Reads the code size of many accounts in one eth_call (placed by state override, like the probe).
contract CodeSizeReader {
    function codeSizes(address[] calldata accounts) external view returns (uint256[] memory sizes) {
        sizes = new uint256[](accounts.length);
        for (uint256 i = 0; i < accounts.length; i++) sizes[i] = accounts[i].code.length;
    }
}
