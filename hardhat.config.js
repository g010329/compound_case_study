require("@nomicfoundation/hardhat-toolbox");

const privateKey = "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },
  networks: {
    goerli: {
      url: "",
      accounts: [privateKey],
    },
    // archive node
    hardhat: {
      forking: {
        url: "",
        blockNumber: 15759400,
        enabled: true,
      },
      allowUnlimitedContractSize: true,
    },
  },
  etherscan: {
    apiKey: {
      goerli: "",
    },
  },
};
