const { expect } = require("chai");
const { ethers } = require("hardhat");

// HW-1
describe("CERC20", function () {
  it("should be able to deploy CErc20 contract successfully", async function () {
    // 1. ----------------------------------------------------------------
    const comptrollFactory = await ethers.getContractFactory("Comptroller");
    const comptroller = await comptrollFactory.deploy();
    await comptroller.deployed();
    // console.log(`Successfully contract to ${comptroller.address}`);

    const erc20Factory = await ethers.getContractFactory("MTKToken");
    const erc20 = await erc20Factory.deploy(
      ethers.utils.parseUnits("10000", 18),
      "myToken",
      "MTK"
    );
    // ethers.utils.parseUnits("10000", 18); // 在metamask裡會看到10000
    await erc20.deployed();
    // console.log(`Successfully contract to ${erc20.address}`);

    const interestRateModelFactory = await ethers.getContractFactory(
      "WhitePaperInterestRateModel"
    );
    const interestRateModel = await interestRateModelFactory.deploy(0, 0);
    await interestRateModel.deployed();
    //   console.log(`Successfully contract to ${erc20.address}`);

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
    // console.log(`Successfully contract to ${cErc20.address}`);

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
