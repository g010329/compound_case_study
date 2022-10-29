// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// contract MTKToken is ERC20 {
//     constructor(uint256 initialSupply) ERC20("myToken", "MTK") {
//         _mint(msg.sender, initialSupply);
//     }
// }

contract MTKToken is ERC20 {
    constructor(
        uint256 initialSupply,
        string memory name,
        string memory symbol
    ) ERC20(name, symbol) {
        _mint(msg.sender, initialSupply);
    }
}
