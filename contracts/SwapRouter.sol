// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity =0.7.6;
pragma abicoder v2;

import '@uniswap/v3-core/contracts/libraries/SafeCast.sol';
import '@uniswap/v3-core/contracts/libraries/TickMath.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';

import './interfaces/IUniswapV3PoolExtended.sol';

import './interfaces/ISwapRouter.sol';
import './base/PeripheryImmutableState.sol';
import './base/PeripheryValidation.sol';
import './base/PeripheryPaymentsWithFee.sol';
import './base/Multicall.sol';
import './base/SelfPermit.sol';
import './libraries/Path.sol';
import './libraries/PoolAddress.sol';
import './libraries/CallbackValidation.sol';
import './interfaces/external/IWETH9.sol';

/// @title Uniswap V3 Swap Router
/// @notice Router for stateless execution of swaps against Uniswap V3
contract SwapRouter is
    ISwapRouter,
    PeripheryImmutableState,
    PeripheryValidation,
    PeripheryPaymentsWithFee,
    Multicall,
    SelfPermit,
    ReentrancyGuard
{
    using Path for bytes;
    using SafeCast for uint256;

    /// @dev Used as the placeholder value for amountInCached, because the computed amount in for an exact output swap
    /// can never actually be this value
    uint256 private constant DEFAULT_AMOUNT_IN_CACHED = type(uint256).max;

    /// @dev Transient storage variable used for returning the computed amount in for an exact output swap.
    uint256 private amountInCached = DEFAULT_AMOUNT_IN_CACHED;

    constructor(address _factory, address _WETH9) PeripheryImmutableState(_factory, _WETH9) {}

    /// @dev Returns the pool for the given token pair and fee. The pool contract may or may not exist.
    function getPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) private view returns (IUniswapV3PoolExtended) {
        return IUniswapV3PoolExtended(PoolAddress.computeAddress(factory, PoolAddress.getPoolKey(tokenA, tokenB, fee)));
    }

    struct SwapCallbackData {
        bytes path;
        address payer;
    }

    /// @inheritdoc IUniswapV3SwapCallback
    function uniswapV3SwapCallback(
        int256 amount0Delta,
        int256 amount1Delta,
        bytes calldata _data
    ) external override {
        require(amount0Delta > 0 || amount1Delta > 0); // swaps entirely within 0-liquidity regions are not supported
        SwapCallbackData memory data = abi.decode(_data, (SwapCallbackData));
        (address tokenIn, address tokenOut, uint24 fee) = data.path.decodeFirstPool();
        CallbackValidation.verifyCallback(factory, tokenIn, tokenOut, fee);

        (bool isExactInput, uint256 amountToPay) =
            amount0Delta > 0
                ? (tokenIn < tokenOut, uint256(amount0Delta))
                : (tokenOut < tokenIn, uint256(amount1Delta));
        if (isExactInput) {
            pay(tokenIn, data.payer, msg.sender, amountToPay);
        } else {
            // either initiate the next swap or pay
            if (data.path.hasMultiplePools()) {
                data.path = data.path.skipToken();
                exactOutputInternal(amountToPay, msg.sender, 0, data);
            } else {
                amountInCached = amountToPay;
                tokenIn = tokenOut; // swap in/out because exact output swaps are reversed
                pay(tokenIn, data.payer, msg.sender, amountToPay);
            }
        }
    }

    struct SwapInputInternal {
        int256 amountIn;
        address recipient;
        uint160 sqrtPriceLimitX96;
        bool isFeeOnTransfer;
    }

    /// @dev Performs a single exact input swap
    function exactInputInternal(SwapInputInternal memory params, SwapCallbackData memory data)
        private
        returns (uint256 amountOut)
    {
        // allow swapping to the router address with address 0
        if (params.recipient == address(0)) params.recipient = address(this);

        (address tokenIn, address tokenOut, uint24 fee) = data.path.decodeFirstPool();

        {
            bool zeroForOne = tokenIn < tokenOut;
            uint256 amountOutBefore = IERC20(tokenOut).balanceOf(address(this));
            int256 amount0;
            int256 amount1;

            if (params.isFeeOnTransfer) {
                (amount0, amount1) = getPool(tokenIn, tokenOut, fee).swapFeeOnTransfer(
                    msg.sender,
                    params.recipient,
                    zeroForOne,
                    params.amountIn,
                    params.sqrtPriceLimitX96 == 0
                        ? (zeroForOne ? TickMath.MIN_SQRT_RATIO + 1 : TickMath.MAX_SQRT_RATIO - 1)
                        : params.sqrtPriceLimitX96,
                    abi.encode(data)
                );
            } else {
                (amount0, amount1) = getPool(tokenIn, tokenOut, fee).swap(
                    params.recipient,
                    zeroForOne,
                    params.amountIn,
                    params.sqrtPriceLimitX96 == 0
                        ? (zeroForOne ? TickMath.MIN_SQRT_RATIO + 1 : TickMath.MAX_SQRT_RATIO - 1)
                        : params.sqrtPriceLimitX96,
                    abi.encode(data)
                );
            }

            amountOut = uint256(-(zeroForOne ? amount1 : amount0));
            if (params.recipient == address(this) && amountOut > 0) {
                amountOut = IERC20(tokenOut).balanceOf(address(this)) - amountOutBefore;
            }
        }
    }

    /// @inheritdoc ISwapRouter
    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        override
        nonReentrant
        checkDeadline(params.deadline)
        returns (uint256 amountOut)
    {
        SwapInputInternal memory inputParams =
            SwapInputInternal({
                amountIn: params.amountIn.toInt256(),
                recipient: params.recipient,
                sqrtPriceLimitX96: params.sqrtPriceLimitX96,
                isFeeOnTransfer: false
            });

        address recipient = params.recipient == address(0) ? address(this) : params.recipient;
        uint256 balanceBefore = IERC20(params.tokenOut).balanceOf(recipient);

        exactInputInternal(
            inputParams,
            SwapCallbackData({path: abi.encodePacked(params.tokenIn, params.fee, params.tokenOut), payer: msg.sender})
        );

        // calculate the actual amount recieved by the recipient
        amountOut = IERC20(params.tokenOut).balanceOf(recipient) - balanceBefore;
        require(amountOut >= params.amountOutMinimum, 'Too little received');
    }

    /// @inheritdoc ISwapRouter
    function exactInputSingleFeeOnTransfer(ExactInputSingleParams calldata params)
        external
        payable
        override
        nonReentrant
        checkDeadline(params.deadline)
        returns (uint256 amountOut)
    {
        SwapInputInternal memory inputParams =
            SwapInputInternal({
                amountIn: params.amountIn.toInt256(),
                recipient: params.recipient,
                sqrtPriceLimitX96: params.sqrtPriceLimitX96,
                isFeeOnTransfer: true
            });

        address recipient = params.recipient == address(0) ? address(this) : params.recipient;
        uint256 balanceBefore = IERC20(params.tokenOut).balanceOf(recipient);

        exactInputInternal(
            inputParams,
            SwapCallbackData({path: abi.encodePacked(params.tokenIn, params.fee, params.tokenOut), payer: msg.sender})
        );

        // calculate the actual amount recieved by the recipient
        amountOut = IERC20(params.tokenOut).balanceOf(recipient) - balanceBefore;
        require(amountOut >= params.amountOutMinimum, 'Too little received');
    }

    /// @inheritdoc ISwapRouter
    function exactInput(ExactInputParams memory params)
        external
        payable
        override
        nonReentrant
        checkDeadline(params.deadline)
        returns (uint256 amountOut)
    {
        return _extactInputHandler(params, false);
    }

    /// @inheritdoc ISwapRouter
    function exactInputFeeOnTransfer(ExactInputParams calldata params)
        external
        payable
        override
        nonReentrant
        checkDeadline(params.deadline)
        returns (uint256 amountOut)
    {
        return _extactInputHandler(params, true);
    }

    /// @dev Performs a exact input swap based on token type
    function _extactInputHandler(ExactInputParams memory params, bool isFeeOnTransfer)
        internal
        returns (uint256 amountOut)
    {
        address payer = msg.sender; // msg.sender pays for the first hop

        while (true) {
            bool hasMultiplePools = params.path.hasMultiplePools();

            SwapInputInternal memory inputParams =
                SwapInputInternal({
                    amountIn: params.amountIn.toInt256(),
                    recipient: hasMultiplePools ? address(this) : params.recipient, // for intermediate swaps, this contract custodies
                    sqrtPriceLimitX96: 0,
                    isFeeOnTransfer: isFeeOnTransfer
                });

            // the outputs of prior swaps become the inputs to subsequent ones
            params.amountIn = exactInputInternal(
                inputParams,
                SwapCallbackData({
                    path: params.path.getFirstPool(), // only the first pool in the path is necessary
                    payer: payer
                })
            );

            // decide whether to continue or terminate
            if (hasMultiplePools) {
                payer = address(this); // at this point, the caller has paid
                params.path = params.path.skipToken();
            } else {
                amountOut = params.amountIn;
                break;
            }
        }

        require(amountOut >= params.amountOutMinimum, 'Too little received');
    }

    /// @dev Performs a single exact output swap
    function exactOutputInternal(
        uint256 amountOut,
        address recipient,
        uint160 sqrtPriceLimitX96,
        SwapCallbackData memory data
    ) private returns (uint256 amountIn) {
        // allow swapping to the router address with address 0
        if (recipient == address(0)) recipient = address(this);

        (address tokenOut, address tokenIn, uint24 fee) = data.path.decodeFirstPool();

        bool zeroForOne = tokenIn < tokenOut;

        (int256 amount0Delta, int256 amount1Delta) =
            getPool(tokenIn, tokenOut, fee).swap(
                recipient,
                zeroForOne,
                -amountOut.toInt256(),
                sqrtPriceLimitX96 == 0
                    ? (zeroForOne ? TickMath.MIN_SQRT_RATIO + 1 : TickMath.MAX_SQRT_RATIO - 1)
                    : sqrtPriceLimitX96,
                abi.encode(data)
            );

        uint256 amountOutReceived;
        (amountIn, amountOutReceived) = zeroForOne
            ? (uint256(amount0Delta), uint256(-amount1Delta))
            : (uint256(amount1Delta), uint256(-amount0Delta));
        // it's technically possible to not receive the full output amount,
        // so if no price limit has been specified, require this possibility away
        if (sqrtPriceLimitX96 == 0) require(amountOutReceived == amountOut);
    }

    /// @inheritdoc ISwapRouter
    function exactOutputSingle(ExactOutputSingleParams calldata params)
        external
        payable
        override
        nonReentrant
        checkDeadline(params.deadline)
        returns (uint256 amountIn)
    {
        // avoid an SLOAD by using the swap return data
        amountIn = exactOutputInternal(
            params.amountOut,
            params.recipient,
            params.sqrtPriceLimitX96,
            SwapCallbackData({path: abi.encodePacked(params.tokenOut, params.fee, params.tokenIn), payer: msg.sender})
        );

        require(amountIn <= params.amountInMaximum, 'Too much requested');
        // has to be reset even though we don't use it in the single hop case
        amountInCached = DEFAULT_AMOUNT_IN_CACHED;
    }

    /// @inheritdoc ISwapRouter
    function exactOutput(ExactOutputParams calldata params)
        external
        payable
        override
        nonReentrant
        checkDeadline(params.deadline)
        returns (uint256 amountIn)
    {
        // it's okay that the payer is fixed to msg.sender here, as they're only paying for the "final" exact output
        // swap, which happens first, and subsequent swaps are paid for within nested callback frames
        exactOutputInternal(
            params.amountOut,
            params.recipient,
            0,
            SwapCallbackData({path: params.path, payer: msg.sender})
        );

        amountIn = amountInCached;
        require(amountIn <= params.amountInMaximum, 'Too much requested');
        amountInCached = DEFAULT_AMOUNT_IN_CACHED;
    }
}
