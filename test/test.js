const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

// HW-1
describe("W11", function () {
  const TOKEN_NAME_A = "tokenA";
  const TOKEN_SYMBOL_A = "TKA";
  const TOKEN_NAME_B = "tokenB";
  const TOKEN_SYMBOL_B = "TKB";

  async function deployComptrollerFixture() {
    const comptrollFactory = await ethers.getContractFactory("Comptroller");
    const comptroller = await comptrollFactory.deploy();

    await comptroller.deployed();

    return { comptroller };
  }

  async function deployErc20Fixture() {
    const erc20Factory = await ethers.getContractFactory("Erc20Token");
    const erc20 = await erc20Factory.deploy(
      ethers.utils.parseUnits("10000", 18), // ethers.utils.parseUnits("10000", 18); // 在 metamask 裡會看到10000
      "myToken",
      "MTK"
    );

    await erc20.deployed();

    return { erc20 };
  }

  async function deployInterestRateModelFixture() {
    const interestRateModelFactory = await ethers.getContractFactory(
      "WhitePaperInterestRateModel"
    );
    const interestRateModel = await interestRateModelFactory.deploy(0, 0);
    await interestRateModel.deployed();

    return { interestRateModel };
  }

  // w11
  it("(ver.1)should be able to deploy CErc20 contract and mint/redeem successfully", async function () {
    // 1. ----------------------------------------------------------------
    const { comptroller } = await loadFixture(deployComptrollerFixture);
    const { erc20 } = await loadFixture(deployErc20Fixture);
    const { interestRateModel } = await loadFixture(
      deployInterestRateModelFixture
    );

    const cErc20Factory = await ethers.getContractFactory("CErc20"); // or use CErc20Immutable.sol
    const cErc20 = await cErc20Factory.deploy();
    await cErc20.deployed();

    await cErc20[
      "initialize(address,address,address,uint256,string,string,uint8)"
    ](
      erc20.address,
      comptroller.address,
      interestRateModel.address,
      ethers.utils.parseUnits("1", 18),
      "myToken",
      "MTK",
      18
    );

    // 2. ----------------------------------------------------------------
    const MINT_AMOUNT = ethers.utils.parseUnits("100", 18);
    const [addr1] = await ethers.getSigners();
    comptroller._supportMarket(cErc20.address);

    // mint
    await erc20.approve(cErc20.address, MINT_AMOUNT);
    await cErc20.mint(MINT_AMOUNT);
    expect(await erc20.balanceOf(cErc20.address)).to.equal(MINT_AMOUNT);
    expect(await cErc20.balanceOf(addr1.address)).to.equal(MINT_AMOUNT);

    // redeem
    // FIXME: W11 feaadback: 這行可以拿掉
    // await cErc20.approve(addr1.address, MINT_AMOUNT);
    await cErc20.redeem(MINT_AMOUNT);
    expect(await erc20.balanceOf(cErc20.address)).to.equal(0);
    expect(await cErc20.balanceOf(addr1.address)).to.equal(0);
  });

  // Rewrite w11 homework
  async function deployCompoundFixture() {
    [account0] = await ethers.getSigners();

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

    const interestRateModelFactory = await ethers.getContractFactory(
      "WhitePaperInterestRateModel"
    );
    const interestRateModel = await interestRateModelFactory.deploy(0, 0);
    await interestRateModel.deployed();

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

    return {
      account0,
      comptroller,
      interestRateModel,
      tokenA,
      cTokenA,
    };
  }

  it("(ver.2)should be able to deploy CErc20 contract and mint/redeem successfully", async function () {
    const { account0, comptroller, interestRateModel, tokenA, cTokenA } =
      await loadFixture(deployCompoundFixture);
    const MINT_AMOUNT = ethers.utils.parseUnits("100", 18);

    comptroller._supportMarket(cTokenA.address);

    // mint: User1 使用 100 顆（100 * 10^18） ERC20 去 mint 出 100 CErc20 token
    await tokenA.approve(cTokenA.address, MINT_AMOUNT);
    await cTokenA.mint(MINT_AMOUNT);
    expect(await tokenA.balanceOf(cTokenA.address)).to.equal(MINT_AMOUNT);
    expect(await cTokenA.balanceOf(account0.address)).to.equal(MINT_AMOUNT);

    // redeem: 再用 100 CErc20 token redeem 回 100 顆 ERC20
    await cTokenA.redeem(MINT_AMOUNT);
    expect(await tokenA.balanceOf(cTokenA.address)).to.equal(0);
    expect(await cTokenA.balanceOf(account0.address)).to.equal(0);
  });
});
