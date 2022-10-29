const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

// HW-1
describe("CERC20", function () {
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

  it("should be able to deploy CErc20 contract and mint/redeem successfully", async function () {
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
    await cErc20.approve(addr1.address, MINT_AMOUNT);
    await cErc20.redeem(MINT_AMOUNT);
    expect(await erc20.balanceOf(cErc20.address)).to.equal(0);
    expect(await cErc20.balanceOf(addr1.address)).to.equal(0);
  });
});
