// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");

async function main() {
  // 1. Deploy underlying ERC20 token(decimals is 18): MTKToken
  // const Contract = await hre.ethers.getContractFactory("MTKToken");
  // const contract = await Contract.deploy(1000000000000);
  // ----------------------------------------------
  // 2. Deploy Comptroller.sol
  // const Contract = await hre.ethers.getContractFactory("Comptroller");
  // const contract = await Contract.deploy();
  // ----------------------------------------------
  // 3. Deploy IntereatModel(這邊用 WhitePaperInterestRateModel 最簡單)
  const Contract = await hre.ethers.getContractFactory(
    "WhitePaperInterestRateModel"
  );
  const contract = await Contract.deploy([
    "uint baseRatePerYear",
    "uint multiplierPerYear",
  ]);
  // ----------------------------------------------
  // 4. Deploy CErc20.sol
  const args = [
    0xe9d690ed70140b4354336516606ba5a3201994c6,
    0x737b4d0b2f3070ea281b691f0b77115869e728d9,
    "InterestRateModel interestRateModel_",
    1,
    "myToken",
    "MTK",
    18,
  ];

  // const Contract = await hre.ethers.getContractFactory("CErc20");
  // const contract = await Contract.deploy(args);

  await contract.deployed();
  console.log(`Successfully contract to ${contract.address}`);
  // const lockedAmount = hre.ethers.utils.parseEther("1");

  // const currentTimestampInSeconds = Math.round(Date.now() / 1000);
  // const ONE_YEAR_IN_SECS = 365 * 24 * 60 * 60;
  // const unlockTime = currentTimestampInSeconds + ONE_YEAR_IN_SECS;
  // const Contract = await hre.ethers.getContractFactory("Erc20");
  // const contract = await Contract.deploy([], { value: lockedAmount });

  // await contract.deployed();

  // console.log(
  //   `Lock with 1 ETH and unlock timestamp ${unlockTime} deployed to ${lock.address}`
  // );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
