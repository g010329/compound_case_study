const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

// HW-1
describe("W12", function () {
  const AMOUNT_200 = ethers.utils.parseUnits("200", 18);
  const AMOUNT_100 = ethers.utils.parseUnits("100", 18);
  const AMOUNT_75 = ethers.utils.parseUnits("75", 18);
  const AMOUNT_50 = ethers.utils.parseUnits("50", 18);
  const AMOUNT_40 = ethers.utils.parseUnits("40", 18);
  const AMOUNT_25 = ethers.utils.parseUnits("25", 18);
  const AMOUNT_20 = ethers.utils.parseUnits("20", 18);
  const AMOUNT_10 = ethers.utils.parseUnits("10", 18);
  const AMOUNT_1 = ethers.utils.parseUnits("1", 18);
  const AMOUNT_0 = ethers.utils.parseUnits("0", 18);

  async function deployCompoundFixture() {
    [account0, account1, account2] = await ethers.getSigners();

    const comptrollFactory = await ethers.getContractFactory("Comptroller");
    const comptroller = await comptrollFactory.deploy();
    await comptroller.deployed();

    const erc20Factory = await ethers.getContractFactory("Erc20Token");
    const tokenA = await erc20Factory.deploy(
      ethers.utils.parseUnits("10000", 18), // ethers.utils.parseUnits("10000", 18); // 在 metamask 裡會看到10000
      "tokenA",
      "TKA"
    );
    await tokenA.deployed();
    const tokenB = await erc20Factory.deploy(
      ethers.utils.parseUnits("10000", 18), // ethers.utils.parseUnits("10000", 18); // 在 metamask 裡會看到10000
      "tokenB",
      "TKB"
    );
    await tokenB.deployed();

    const interestRateModelFactory = await ethers.getContractFactory(
      "WhitePaperInterestRateModel"
    );
    const interestRateModel = await interestRateModelFactory.deploy(0, 0);
    await interestRateModel.deployed();

    const simplePriceOracleFactory = await ethers.getContractFactory(
      "SimplePriceOracle"
    );
    const simplePriceOracle = await simplePriceOracleFactory.deploy();
    await simplePriceOracle.deployed();

    const cErc20Factory = await ethers.getContractFactory("CErc20Immutable");
    const cTokenA = await cErc20Factory.deploy(
      tokenA.address,
      comptroller.address,
      interestRateModel.address,
      ethers.utils.parseUnits("1", 18),
      "tokenA",
      "TKA",
      18,
      account0.address
    );
    await cTokenA.deployed();

    const cTokenB = await cErc20Factory.deploy(
      tokenB.address,
      comptroller.address,
      interestRateModel.address,
      ethers.utils.parseUnits("1", 18),
      "tokenB",
      "TKB",
      18,
      account0.address
    );
    await cTokenB.deployed();

    return {
      account0,
      account1,
      account2,
      comptroller,
      simplePriceOracle,
      interestRateModel,
      tokenA,
      tokenB,
      cTokenA,
      cTokenB,
    };
  }

  it("3).should be able to borrow/repay successfully", async function () {
    // 設定 collateral factor 為 50%
    const COLLATERAL_FACTOR = ethers.utils.parseUnits("0.5", 18);
    const {
      account0,
      account1,
      account2,
      comptroller,
      simplePriceOracle,
      interestRateModel,
      tokenA,
      tokenB,
      cTokenA,
      cTokenB,
    } = await loadFixture(deployCompoundFixture);

    await comptroller._supportMarket(cTokenA.address);
    await comptroller._supportMarket(cTokenB.address);
    await comptroller._setPriceOracle(simplePriceOracle.address);

    // 記得這邊要用要借貸的 account1 去呼叫。將 account1 的 cTokenB 先設定成當抵押品(用entermarket)，才能借貸
    await comptroller.connect(account1).enterMarkets([cTokenB.address]);

    // 在 Oracle 中設定一顆 token A 的價格為 $1，一顆 token B 的價格為 $100
    await simplePriceOracle.setUnderlyingPrice(cTokenA.address, AMOUNT_1);
    await simplePriceOracle.setUnderlyingPrice(cTokenB.address, AMOUNT_100);

    // Token B 的 collateral factor 為 50%
    await comptroller._setCollateralFactor(cTokenB.address, COLLATERAL_FACTOR);

    // 給 account1 100 顆 tokenB
    await tokenB.transfer(account1.address, AMOUNT_100);
    expect(await tokenB.balanceOf(account1.address)).to.equal(AMOUNT_100);

    // 給 account2 100 顆 tokenA
    await tokenA.transfer(account2.address, AMOUNT_100);
    expect(await tokenA.balanceOf(account2.address)).to.equal(AMOUNT_100);

    // account1 使用 1 顆 tokenB 來 mint cToken，account1 使用 tokenB 作為抵押品來借出 50 顆 tokenA
    // account2 存 100 tokenA 到池子中(等等讓 account1 借出)
    await tokenA.connect(account2).approve(cTokenA.address, AMOUNT_100);
    await cTokenA.connect(account2).mint(AMOUNT_100);

    // tokenB 的 collateral factor 為 50%，因此抵押一顆 tokenB($100)，可以借出 $50(100*1*50%) 等值的 tokenA
    // account1 允許 cTokenB 合約 動用他的 1 顆 tokenB
    // 原本 allowance 是 0
    expect(await tokenB.allowance(account1.address, cTokenB.address)).to.equal(
      ethers.utils.parseUnits("0", 18)
    );
    await tokenB.connect(account1).approve(cTokenB.address, AMOUNT_1);
    // approve 後 allowance 變成 1
    expect(await tokenB.allowance(account1.address, cTokenB.address)).to.equal(
      AMOUNT_1
    );

    // account1 抵押 1 顆 tokenB，並得到 1 顆 cTokenB
    await cTokenB.connect(account1).mint(AMOUNT_1);

    // const d = await comptroller.getAccountLiquidity(account1.address);
    // console.log("d", d);
    // account1 借出 $50 等值的 tokenA，也就是 50(50/1) 顆 tokenA
    await cTokenA.connect(account1).borrow(AMOUNT_50);

    // 現在 account1 有 50 顆 tokenA，cTokenA 有 50 顆 tokenA
    expect(await tokenA.balanceOf(account1.address)).to.equal(AMOUNT_50);
    expect(await tokenA.balanceOf(cTokenA.address)).to.equal(AMOUNT_50);

    // 測試在 accouont1 repay 前不能去 redeem 抵押的 cTokenB: RedeemComptrollerRejection(4)
    await expect(cTokenB.connect(account1).redeem(AMOUNT_1))
      .to.be.revertedWithCustomError(cTokenB, "RedeemComptrollerRejection")
      .withArgs(4);

    // 測試 account1 借出超過 $50 等值的 tokenA，會出現錯誤: BorrowComptrollerRejection(4)
    // await cTokenA.connect(account1).borrow(ethers.utils.parseUnits("80", 18));
    await expect(
      cTokenA.connect(account1).borrow(ethers.utils.parseUnits("80", 18))
    )
      .to.be.revertedWithCustomError(cTokenB, "BorrowComptrollerRejection")
      .withArgs(4);

    // 還款前查看 account1 的 tokenA 流動性
    // 這裡會回傳三個值(可能的錯誤代碼、帳戶流動性還有多少、帳戶抵押品短缺shoarfall)
    const liquidityBeforeRepay = await comptroller.getAccountLiquidity(
      account1.address
    );
    // console.log("before repay", liquidityBeforeRepay);
    // 0, 0, 0

    // repay: account1 還款 50 顆 tokenA
    await tokenA.connect(account1).approve(cTokenA.address, AMOUNT_50);
    await cTokenA.connect(account1).repayBorrow(AMOUNT_50);

    // 還款後查看 account1 的 tokenA 流動性
    const liquidityAfterRepay = await comptroller.getAccountLiquidity(
      account1.address
    );
    // console.log("after repay", liquidityAfterRepay);
    // 0, 50, 0
  });

  it("4).should be able to liquidate after decreasing collateral factor of tokenA ", async function () {
    // 設定 collateral factor 為 50%
    const COLLATERAL_FACTOR = ethers.utils.parseUnits("0.5", 18);
    const {
      account0,
      account1,
      account2,
      comptroller,
      simplePriceOracle,
      interestRateModel,
      tokenA,
      tokenB,
      cTokenA,
      cTokenB,
    } = await loadFixture(deployCompoundFixture);

    await comptroller._supportMarket(cTokenA.address);
    await comptroller._supportMarket(cTokenB.address);
    await comptroller._setPriceOracle(simplePriceOracle.address);

    await comptroller.connect(account1).enterMarkets([cTokenB.address]);

    await simplePriceOracle.setUnderlyingPrice(cTokenA.address, AMOUNT_1);
    await simplePriceOracle.setUnderlyingPrice(cTokenB.address, AMOUNT_100);
    await comptroller._setCollateralFactor(cTokenB.address, COLLATERAL_FACTOR);
    await comptroller._setCollateralFactor(cTokenA.address, COLLATERAL_FACTOR);

    await tokenB.transfer(account1.address, AMOUNT_200);
    await tokenA.transfer(account2.address, AMOUNT_200);

    await tokenA.connect(account2).approve(cTokenA.address, AMOUNT_100);
    await cTokenA.connect(account2).mint(AMOUNT_100);

    await tokenB.connect(account1).approve(cTokenB.address, AMOUNT_1);
    await cTokenB.connect(account1).mint(AMOUNT_1);
    await cTokenA.connect(account1).borrow(AMOUNT_50);

    // 以上為第三題借貸場景 ------------------------------------------------------------

    // 4) 調整 token A 的 collateral factor，讓 user1 被 user2 清算
    // const PROTOCOL_SEIZE_SHARE = ethers.utils.parseUnits("0.03", 18);
    const LIQUIDATION_INCENTIVE = ethers.utils.parseUnits("1.08", 18);
    const CLOSE_FACTOR = ethers.utils.parseUnits("0.5", 18);
    const NEW_COLLATERAL_FACTOR = ethers.utils.parseUnits("0.4", 18);
    // 設定 CloseFactor 為 50%
    await comptroller._setCloseFactor(CLOSE_FACTOR);
    // 設定清算獎勵 LiquidationIncentive 為 108%
    await comptroller._setLiquidationIncentive(
      ethers.utils.parseUnits("1.08", 18)
    );

    await tokenA
      .connect(account2)
      .approve(cTokenA.address, ethers.utils.parseUnits("10000", 18));

    // 查看 account1 在 借貸狀態下的流動性
    // console.log(
    //   "查看 account1 在 借貸狀態下的流動性：",
    //   await comptroller.getAccountLiquidity(account1.address)
    // ); // 0, 0, 0

    // 調整 tokenB 的 collateral factor，讓 account1 被 account2 清算
    await comptroller._setCollateralFactor(
      cTokenB.address,
      NEW_COLLATERAL_FACTOR
    ); // 此時可以借出的價值從 $50 變成 $40

    // 查看 account1 在抵押品的CollateralFactor從 50% 調低成 40% 後的流動性
    // console.log(
    //   "查看 account1 在抵押品的CollateralFactor從 50% 調低成 40% 後的流動性：",
    //   await comptroller.getAccountLiquidity(account1.address)
    // ); // 0, 0, 10 會看到shortfall 為 10(50-40=10)，大於 0 可以被清算

    // 發件人account2 清算借款人 account1 的抵押品，這邊假設一次清算最多50%
    // 被扣押的抵押品 25顆 cTokenB 被轉移給清算人 account2 (50 顆乘以 close factor50% = 25顆)，要來償還這10元的 shortfall
    // account2 要償還 $25 的 tokenA 給 cTokenA合約，並且 account2 會得到 $1*25*1.08 = $27 的 cTokenB
    expect(await await tokenA.balanceOf(account2.address)).to.equal(AMOUNT_100);
    expect(await await cTokenB.balanceOf(account2.address)).to.equal(AMOUNT_0);
    await cTokenA
      .connect(account2)
      .liquidateBorrow(
        account1.address,
        ethers.utils.parseUnits("25", 18),
        cTokenB.address
      );
    expect(await await tokenA.balanceOf(account2.address)).to.equal(AMOUNT_75);

    console.log(
      "account2' cTokenB after liquidateBorrow:",
      await cTokenB.balanceOf(account2.address)
    ); // 26.24400 TODO: 跟想像中的 27 不一樣，再確認

    // 查看 account1 在被 account2 清算完 50% 後的流動性
    // console.log(
    //   "查看 account1 在被 account2 清算完 50% 後的流動性：",
    //   await comptroller.getAccountLiquidity(account1.address)
    // ); // 0, 4.2, 0 TODO: 確認4.2怎麼來
  });

  it("5).should be able to liquidate after decreasing the oracle price of tokenB ", async function () {
    // 設定 collateral factor 為 50%
    const COLLATERAL_FACTOR = ethers.utils.parseUnits("0.5", 18);
    const {
      account0,
      account1,
      account2,
      comptroller,
      simplePriceOracle,
      interestRateModel,
      tokenA,
      tokenB,
      cTokenA,
      cTokenB,
    } = await loadFixture(deployCompoundFixture);

    await comptroller._supportMarket(cTokenA.address);
    await comptroller._supportMarket(cTokenB.address);
    await comptroller._setPriceOracle(simplePriceOracle.address);

    await comptroller.connect(account1).enterMarkets([cTokenB.address]);

    await simplePriceOracle.setUnderlyingPrice(cTokenA.address, AMOUNT_1);
    await simplePriceOracle.setUnderlyingPrice(cTokenB.address, AMOUNT_100);
    await comptroller._setCollateralFactor(cTokenB.address, COLLATERAL_FACTOR);
    await comptroller._setCollateralFactor(cTokenA.address, COLLATERAL_FACTOR);

    await tokenB.transfer(account1.address, AMOUNT_200);
    await tokenA.transfer(account2.address, AMOUNT_200);

    await tokenA.connect(account2).approve(cTokenA.address, AMOUNT_100);
    await cTokenA.connect(account2).mint(AMOUNT_100);

    await tokenB.connect(account1).approve(cTokenB.address, AMOUNT_1);
    await cTokenB.connect(account1).mint(AMOUNT_1);
    await cTokenA.connect(account1).borrow(AMOUNT_50);

    // 以上為第三題借貸場景 ------------------------------------------------------------

    // 5) 調整 oracle 中的 token B 的價格，讓 account1 被 account2 清算
    const PROTOCOL_SEIZE_SHARE = ethers.utils.parseUnits("0.03", 18);
    const LIQUIDATION_INCENTIVE = ethers.utils.parseUnits("1.08", 18);
    const CLOSE_FACTOR = ethers.utils.parseUnits("0.5", 18);
    const NEW_COLLATERAL_FACTOR = ethers.utils.parseUnits("0.4", 18);
    // 設定 CloseFactor 為 50%
    await comptroller._setCloseFactor(CLOSE_FACTOR);
    // 設定清算獎勵 LiquidationIncentive 為 108%
    await comptroller._setLiquidationIncentive(
      ethers.utils.parseUnits("1.08", 18)
    );
    await tokenB.transfer(account1.address, AMOUNT_200);
    await tokenA.transfer(account2.address, AMOUNT_200);

    await tokenA
      .connect(account2)
      .approve(cTokenA.address, ethers.utils.parseUnits("10000", 18));

    // 查看 account1 在 借貸狀態下的流動性
    // console.log(
    //   "查看 account1 在 借貸狀態下的流動性：",
    //   await comptroller.getAccountLiquidity(account1.address)
    // ); // 0, 0, 0

    // 調整 oracle 中的 token B 的價格($100 改為 $20)，讓 account1 被 account2 清算
    await simplePriceOracle.setUnderlyingPrice(cTokenB.address, AMOUNT_20);
    // 此時抵押品的價值從 $100 -> $20*1 = $20，不足以償還原本 $50 的債務。系統會出現壞帳。

    // 查看 account1 在 抵押品價值跌到不足以償還債務時的流動性
    // console.log(
    //   "查看 account1 在 抵押品價值跌到不足以償還債務時的流動性：",
    //   await comptroller.getAccountLiquidity(account1.address)
    // ); // 0, 0, 40 => 50元的債務 - 目前抵押品價值可借出10元 = 40元的債務shorfall

    // 10 / 1.08 = 9.26 => account2 最多償還 9.26 的債務，才能拿到清算獎勵
    await cTokenA
      .connect(account2)
      .liquidateBorrow(
        account1.address,
        ethers.utils.parseUnits("9", 18),
        cTokenB.address
      );

    // console.log(
    //   "查看 account1 在被 account2 清算完 50% 後的流動性：",
    //   await comptroller.getAccountLiquidity(account1.address)
    // ); // 0, 0, 40 => 50元的債務 - 目前抵押品價值可借出10元 = 40元的債務shorfall
  });
});
