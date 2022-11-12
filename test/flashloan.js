const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("bignumber.js");
const {
  loadFixture,
  impersonateAccount,
} = require("@nomicfoundation/hardhat-network-helpers");
const { Logger, LogLevel } = require("@ethersproject/logger");

Logger.setLogLevel(LogLevel.ERROR);

// USDC (tokenA
// UNI  (tokenB
const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const UNI_ADDRESS = "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984";
const BINANCE_ADDRESS = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const UNI_AMOUNT = ethers.utils.parseUnits("1000", 18);
const USDC_AMOUNT = ethers.utils.parseUnits("5000", 6);
const TOKENA_PRICE = ethers.utils.parseUnits("1", 30); // token A(USDC) 的價格為 $1（USDC decimals = 6，要再補 12 位數）
const TOKENB_PRICE = ethers.utils.parseUnits("10", 18); // token B(UNI) 的價格為 $10
const NEW_TOKENB_PRICE = ethers.utils.parseUnits("6.2", 18);
const COLLATERAL_FACTOR = ethers.utils.parseUnits("0.5", 18);
const CLOSE_FACTOR = ethers.utils.parseUnits("0.5", 18);
const LIQUIDATION_INCENTIVE = ethers.utils.parseUnits("1.08", 18);

const LENDING_POOL_ADDRESSES_PROVIDER =
  "0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5";
const UNISWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";

describe("W13", function () {
  async function deployCompoundFixture() {
    [owner, account1] = await ethers.getSigners();

    // init USDC & UNI contract instance
    usdc = await ethers.getContractAt("ERC20", USDC_ADDRESS);
    uni = await ethers.getContractAt("ERC20", UNI_ADDRESS);

    // init InterestRateModel
    const interestRateModelFactory = await ethers.getContractFactory(
      "WhitePaperInterestRateModel"
    );
    const interestRateModel = await interestRateModelFactory.deploy(0, 0);
    await interestRateModel.deployed();

    // init Oracle
    const simplePriceOracleFactory = await ethers.getContractFactory(
      "SimplePriceOracle"
    );
    const simplePriceOracle = await simplePriceOracleFactory.deploy();
    await simplePriceOracle.deployed();

    // init Comptroller
    const comptrollFactory = await ethers.getContractFactory("Comptroller");
    let comptroller = await comptrollFactory.deploy();
    await comptroller.deployed();

    // init proxy setting (set unitroller & comptroller)
    const unitrollerFactory = await ethers.getContractFactory("Unitroller");
    unitroller = await unitrollerFactory.deploy();
    await unitroller._setPendingImplementation(comptroller.address);
    await unitroller._acceptImplementation();
    await comptroller._become(unitroller.address);
    comptroller = await comptrollFactory.attach(unitroller.address);

    // init cTokenA & cTokenB
    const cErc20DelegateFactory = await ethers.getContractFactory(
      "CErc20Delegate"
    );
    cErc20Delegate = await cErc20DelegateFactory.deploy();
    const CErc20DelegatorFactory = await ethers.getContractFactory(
      "CErc20Delegator"
    );
    const cTokenA = await CErc20DelegatorFactory.deploy(
      usdc.address,
      comptroller.address,
      interestRateModel.address,
      ethers.utils.parseUnits("1", 6),
      "USD Coin",
      "USDC",
      18,
      owner.address,
      cErc20Delegate.address,
      "0x"
    );
    await cTokenA.deployed();
    const cTokenB = await CErc20DelegatorFactory.deploy(
      uni.address,
      comptroller.address,
      interestRateModel.address,
      ethers.utils.parseUnits("1", 18),
      "Uniswap",
      "UNI",
      18,
      owner.address,
      cErc20Delegate.address,
      "0x"
    );
    await cTokenB.deployed();

    // setup -------------------------------------------------------------
    await comptroller._supportMarket(cTokenA.address);
    await comptroller._supportMarket(cTokenB.address);
    await comptroller._setPriceOracle(simplePriceOracle.address);
    await comptroller._setCloseFactor(CLOSE_FACTOR);
    await comptroller._setLiquidationIncentive(LIQUIDATION_INCENTIVE);

    await simplePriceOracle.setUnderlyingPrice(cTokenB.address, TOKENB_PRICE);
    await simplePriceOracle.setUnderlyingPrice(cTokenA.address, TOKENA_PRICE);

    // 需要先設定 simplePriceOracle 中 cToken 的 underlyingPrice，才能設定 cToken 的 collateralFactor
    await comptroller._setCollateralFactor(cTokenB.address, COLLATERAL_FACTOR);

    return {
      owner,
      account1,
      usdc,
      uni,
      comptroller,
      simplePriceOracle,
      interestRateModel,
      cTokenA,
      cTokenB,
    };
  }

  it("test flasholoan", async function () {
    // 0) owner 先取得 1000 uni; account1 取得 5000 usdc
    const {
      owner,
      account1,
      uni,
      usdc,
      cTokenA,
      cTokenB,
      comptroller,
      simplePriceOracle,
    } = await loadFixture(deployCompoundFixture);
    await impersonateAccount(BINANCE_ADDRESS);
    binance = await ethers.getSigner(BINANCE_ADDRESS);

    expect(await uni.balanceOf(owner.address)).to.eq(0); // owner 帳戶裡原本的 uni 為 0
    uni.connect(binance).transfer(owner.address, UNI_AMOUNT);
    expect(await uni.balanceOf(owner.address)).to.eq(UNI_AMOUNT); // 模擬賬戶轉了 1000 uni 給 owner, owner 帳戶裡有 1000 uni

    expect(await usdc.balanceOf(account1.address)).to.eq(0); // account1 帳戶裡原本的 usdc 為 0
    usdc.connect(binance).transfer(account1.address, USDC_AMOUNT);
    expect(await usdc.balanceOf(account1.address)).to.eq(USDC_AMOUNT); // 模擬賬戶轉了 5000 usdc 給 account1, account1 帳戶裡有 5000 usdc

    // FIXME: borrow USDC(tokenA) (想把這一步拆出去另一個 it，不過因為每個 it 中 loadFixture 狀態(例如轉了5000usdc)無法保留)
    // 1) account1 先將 5000 usdc(token A) 投入 compound 池中
    await usdc.connect(account1).approve(cTokenA.address, USDC_AMOUNT);
    await cTokenA.connect(account1).mint(USDC_AMOUNT);
    expect(await cTokenA.balanceOf(account1.address)).to.eq(
      ethers.utils.parseUnits("5000", 18)
    ); // account1 帳戶裡的 cTokenA 為 5000，這邊用 cTokenA 的 decimals = 18
    expect(await usdc.balanceOf(cTokenA.address)).to.eq(
      ethers.utils.parseUnits("5000", 6)
    ); // cTokenA 池子裡的 usdc 為 5000，這邊用 usdc 的 decimals = 6

    // 2) owner 抵押 1000 uni(token B)，並借出 5000 usdc(token A)
    await uni.approve(cTokenB.address, UNI_AMOUNT);
    await cTokenB.mint(UNI_AMOUNT);
    expect(await cTokenB.balanceOf(owner.address)).to.eq(UNI_AMOUNT);
    await comptroller.enterMarkets([cTokenB.address]);
    await cTokenA.borrow(USDC_AMOUNT);
    expect(await usdc.balanceOf(owner.address)).to.eq(USDC_AMOUNT);
    expect(await usdc.balanceOf(cTokenA.address)).to.eq(
      ethers.utils.parseUnits("0", 6)
    );

    /** 閃電貸清算：account1 透過 AAVE 的 Flash loan 來清算 owner，流程：
    // 1. 先使用 aave 的 flashloan 借出 USDC
    // 2. 使用 USDC 清算 owner 獲得 cUNI
    // 3. 將 cUNI redeem成 UNI
    // 4. 將 UNI swap成 USDC
     */

    // 3) 將 UNI 價格改為 $6.2 使 owner 產生 Shortfall
    await simplePriceOracle.setUnderlyingPrice(
      cTokenB.address,
      NEW_TOKENB_PRICE
    );
    // 查看 owner 的流動性
    // 這裡會回傳三個值 [可能的錯誤代碼、帳戶流動性還有多少、帳戶抵押品短缺shoarfall]
    let result = await comptroller.getAccountLiquidity(owner.address);
    expect(result[1]).to.eq(0);
    expect(result[2]).to.gt(0); // 這裡 shortfall 會是 1900*10**18，因為 owner 借了 5000 ，但是抵押品價值只有 3100

    // 使用 callStatic 模擬送出交易，取得 owner 借貸的價值
    const borrowBalance = await cTokenA.callStatic.borrowBalanceCurrent(
      owner.address
    );
    const repayAmount = borrowBalance * (50 / 100);

    // 4) account1 部署 閃電貸合約，並呼叫清算函式
    let flashloanFactory = await ethers.getContractFactory("FlashLoanV2");
    flashloan = await flashloanFactory
      .connect(account1)
      .deploy(
        LENDING_POOL_ADDRESSES_PROVIDER,
        UNISWAP_ROUTER,
        cTokenA.address,
        cTokenB.address,
        owner.address,
        repayAmount
      );

    expect(await usdc.balanceOf(flashloan.address)).to.eq(0);
    await flashloan.connect(account1).flashLoan(USDC_ADDRESS, repayAmount);
    expect(await await usdc.balanceOf(flashloan.address)).to.gt(0); // 清算獎勵設 8% 大約會是 121 顆

    // 5) account1 呼叫閃電貸合約中的 withdraw 函式提款（閃電貸合約中最好不要存放資產）
    await flashloan
      .connect(account1)
      .withdraw(USDC_ADDRESS, ethers.utils.parseUnits("120", 6));
    expect(await await usdc.balanceOf(account1.address)).to.eq(
      ethers.utils.parseUnits("120", 6)
    );
  });
});
