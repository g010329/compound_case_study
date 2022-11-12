require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.10",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000,
          },
        },
      },
      // {
      //   version: "0.6.0",
      // },
    ],
  },
  networks: {
    hardhat: {
      forking: {
        url: process.env.ALCHEMY_URL,
        blockNumber: 15815693,
      },
      allowUnlimitedContractSize: true,
    },
  },
};
