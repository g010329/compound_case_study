// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "hardhat/console.sol";
import "../interfaces/UniswapV3/ISwapRouter.sol";
import "../interfaces/AAVE/FlashLoanReceiverBase.sol";
import "../CErc20.sol";

contract FlashLoanV2 is FlashLoanReceiverBase {
    using SafeMath for uint256;

    address public admin;
    address public borrower;
    uint256 public repayAmount;
    ISwapRouter public immutable swapRouter;
    CErc20 public immutable cUSDC;
    CErc20 public immutable cUNI;

    address public constant UNI = 0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984;
    address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    modifier onlyAdmin() {
        require(msg.sender == admin);
        _;
    }

    constructor(
        ILendingPoolAddressesProvider _addressProvider,
        ISwapRouter _swapRouter,
        CErc20 _cUSDC,
        CErc20 _cUNI,
        address _borrower,
        uint256 _repayAmount
    ) FlashLoanReceiverBase(_addressProvider) {
        swapRouter = ISwapRouter(_swapRouter);
        cUSDC = CErc20(_cUSDC);
        cUNI = CErc20(_cUNI);
        borrower = _borrower;
        repayAmount = _repayAmount;
        admin = msg.sender;
    }

    ///@param asset ERC20 token address
    ///@param amount loan amount
    function flashLoan(address asset, uint256 amount) external onlyAdmin {
        address receiver = address(this);

        address[] memory assets = new address[](1);
        assets[0] = asset;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;

        _flashloan(assets, amounts);
    }

    function _flashloan(address[] memory assets, uint256[] memory amounts)
        internal
    {
        address receiverAddress = address(this);

        address onBehalfOf = address(this);
        bytes memory params = "";
        uint16 referralCode = 0;

        uint256[] memory modes = new uint256[](assets.length);

        // 0 = no debt (flash), 1 = stable, 2 = variable
        for (uint256 i = 0; i < assets.length; i++) {
            modes[i] = 0;
        }

        LENDING_POOL.flashLoan(
            receiverAddress,
            assets,
            amounts,
            modes,
            onBehalfOf,
            params,
            referralCode
        );
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

        // // 先 approve cUSDC 使用 USDC
        IERC20(USDC).approve(address(cUSDC), amounts[0]);

        // 使用 USDC 清算債務
        cUSDC.liquidateBorrow(borrower, repayAmount, cUNI);

        // 將獲得的 cUNI redeem 回 UNI
        cUNI.redeem(cUNI.balanceOf(address(this)));

        uint256 uniBalance = IERC20(UNI).balanceOf(address(this));

        // 將 UNI swap換成 USDC，先 approve swapRouter 使用此合約地址的 UNI
        IERC20(UNI).approve(address(swapRouter), uniBalance);
        ISwapRouter.ExactInputSingleParams memory uniswapParams = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: UNI,
                tokenOut: USDC,
                fee: 3000, // 0.3%
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: uniBalance,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });

        uint256 amountOut_USDC = swapRouter.exactInputSingle(uniswapParams);

        {
            address[] memory tempAssets = assets;
            for (uint256 i = 0; i < tempAssets.length; i++) {
                uint256 amountOwing = amounts[i].add(premiums[i]);
                IERC20(tempAssets[i]).approve(
                    address(LENDING_POOL),
                    amountOwing
                );
            }
        }

        return true;
    }

    function withdraw(IERC20 asset, uint256 amount) external {
        require(msg.sender == admin, "Only admin can withdraw");

        asset.transfer(admin, amount);
    }
}
