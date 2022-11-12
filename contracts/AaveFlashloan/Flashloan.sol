// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "../interfaces/UniswapV3/ISwapRouter.sol";
import "../interfaces/AAVE/FlashLoanReceiverBase.sol";
import "../CErc20.sol";
// import { CErc20 } from 'compound-protocol/contracts/CErc20.sol';
import {TransferHelper} from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";

contract FlashLoan is FlashLoanReceiverBase {
    using SafeMath for uint256;

    address public admin;
    ISwapRouter public immutable swapRouter;

    modifier onlyAdmin() {
        require(msg.sender == admin);
        _;
    }

    constructor(
        ILendingPoolAddressesProvider _addressProvider,
        ISwapRouter _swapRouter
    ) FlashLoanReceiverBase(_addressProvider) {
        swapRouter = ISwapRouter(_swapRouter);
        admin = msg.sender;
    }

    /**
     * This function is called after your contract has received the flash loaned amount
     * @dev This function must be called only be the LENDING_POOL and takes care of repaying
     * active debt positions, migrating collateral and incurring new V2 debt token debt.
     *
     * @param assets The array of flash loaned assets used to repay debts.
     * @param amounts The array of flash loaned asset amounts used to repay debts.
     * @param premiums The array of premiums incurred as additional debts.
     * @param initiator The address that initiated the flash loan, unused.
     * @param params The byte array containing, in this case, the arrays of aTokens and aTokenAmounts.
     */
    /// @param initiator this contract address
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator, //TODO: 沒用到 (?)
        bytes calldata params
    ) external override returns (bool) {
        require(
            msg.sender == address(LENDING_POOL),
            "Only Lending Pool can call"
        );
        (
            address borrower,
            address liquidateAddress,
            address rewardAddress,
            address rewardErc20Address
        ) = abi.decode(params, (address, address, address, address));

        IERC20(assets[0]).approve(liquidateAddress, amounts[0]);
        // Liquidate the borrower debt
        CErc20(liquidateAddress).liquidateBorrow(
            borrower,
            amounts[0],
            CErc20(rewardAddress)
        );

        {
            uint256 redeemTokens = IERC20(rewardAddress).balanceOf(
                address(this)
            );

            // redeem reward
            CErc20(rewardAddress).redeem(redeemTokens);
        }

        {
            uint256 rewardBalances = IERC20(rewardErc20Address).balanceOf(
                address(this)
            );

            // Approve the router to spend DAI.
            TransferHelper.safeApprove(
                rewardErc20Address,
                address(swapRouter),
                rewardBalances
            );

            // Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
            // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
            ISwapRouter.ExactInputSingleParams memory uniswapParams = ISwapRouter
                .ExactInputSingleParams({
                    tokenIn: rewardErc20Address,
                    tokenOut: assets[0], // FIXME: assets: Stack too deep
                    fee: 3000, // 0.3%
                    recipient: address(this),
                    deadline: block.timestamp,
                    amountIn: rewardBalances,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                });

            uint256 amountOut = swapRouter.exactInputSingle(uniswapParams);
            uint256 amountOwing = amounts[0] + premiums[0]; // FIXME: amounts: Stack too deep

            if (amountOut > amountOwing) {
                IERC20(assets[0]).approve(address(LENDING_POOL), amountOwing);
            }
        }

        return true;
    }

    function withdraw(IERC20 asset, uint256 amount) external {
        require(msg.sender == admin, "Only admin can withdraw");

        asset.transfer(admin, amount);
    }
}
