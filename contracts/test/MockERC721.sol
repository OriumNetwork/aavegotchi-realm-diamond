// SPDX-License-Identifier: MIT
pragma solidity ^0.8.1;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockERC721 is ERC721URIStorage, Ownable {
    uint256 private _tokenIds;

    constructor() ERC721("MockERC721", "M721") {}

    function mint(address to) public returns (uint256) {
        _tokenIds++;
        uint256 newTokenId = _tokenIds;
        _mint(to, newTokenId);
        return newTokenId;
    }
}
