// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract ERC20Splitter is ReentrancyGuard {
  // Mapping to track balances of token by address and recipient
  mapping(address => mapping(address => uint256)) public _balances;

  // Mapping to track which tokens a user has received (for auto-withdrawals)
  mapping(address => address[]) private _userTokens;
  mapping(address => mapping(address => bool)) private _hasToken;

  event Deposit(address indexed depositor, address[] tokenAddresses, uint256[] amounts, uint256[][] shares, address[][] recipients);
  event Withdraw(address indexed user, address[] tokenAddresses, uint256[] amounts);

  uint256 public constant MAX_SHARES = 10000;

  /// @notice Deposits ERC20 or native tokens and splits between recipients based on shares.
  /// @param tokenAddresses Array of token addresses (use address(0) for native tokens).
  /// @param amounts Array of amounts for each token.
  /// @param shares Array of share percentages (out of 10000) for each recipient.
  /// @param recipients Array of recipients for each token.
  function deposit(
    address[] calldata tokenAddresses,
    uint256[] calldata amounts,
    uint256[][] calldata shares,
    address[][] calldata recipients
  ) external payable {
    require(tokenAddresses.length == amounts.length, "Invalid input lengths");
    require(tokenAddresses.length == shares.length && tokenAddresses.length == recipients.length, "Mismatched input sizes");

    for (uint256 i = 0; i < tokenAddresses.length; i++) {
      _splitTokens(tokenAddresses[i], amounts[i], shares[i], recipients[i]);
    }

    emit Deposit(msg.sender, tokenAddresses, amounts, shares, recipients);
  }

  /// @notice Withdraw all tokens that the caller is entitled to.
  /// Tokens are automatically determined based on previous deposits.
  function withdraw() external nonReentrant {
    address[] storage userTokens = _userTokens[msg.sender];
    require(userTokens.length > 0, "No tokens to withdraw");

    // Store token addresses and amounts for the event
    address[] memory withdrawnTokens = new address[](userTokens.length);
    uint256[] memory withdrawnAmounts = new uint256[](userTokens.length);

    for (uint256 i = 0; i < userTokens.length; i++) {
      address tokenAddress = userTokens[i];
      uint256 amount = _balances[tokenAddress][msg.sender];

      if (amount > 0) {
        _balances[tokenAddress][msg.sender] = 0;

        if (tokenAddress == address(0)) {
          payable(msg.sender).transfer(amount);
        } else {
          require(IERC20(tokenAddress).transfer(msg.sender, amount), "Transfer failed");
        }

        withdrawnTokens[i] = tokenAddress;
        withdrawnAmounts[i] = amount;
      }

      delete _hasToken[msg.sender][tokenAddress];
    }

    delete _userTokens[msg.sender];

    emit Withdraw(msg.sender, withdrawnTokens, withdrawnAmounts);
  }

  /// @notice Internal function to split the tokens among recipients.
  /// @param tokenAddress The address of the token being split (use address(0) for native tokens).
  /// @param amount The amount of tokens to be split.
  /// @param shares Array of share percentages (out of 10000) for each recipient.
  /// @param recipients Array of recipients for the token.
  function _splitTokens(address tokenAddress, uint256 amount, uint256[] calldata shares, address[] calldata recipients) internal {
    require(shares.length == recipients.length, "Shares and recipients length mismatch");
    require(amount > 0, "Amount must be greater than zero");

    uint256 totalSharePercentage = 0;

    for (uint256 i = 0; i < shares.length; i++) {
      totalSharePercentage += shares[i];
    }

    require(totalSharePercentage == MAX_SHARES, "Shares must sum to 100%");

    if (tokenAddress == address(0)) {
      require(msg.value == amount, "Incorrect native token amount sent");
    } else {
      require(IERC20(tokenAddress).transferFrom(msg.sender, address(this), amount), "Transfer failed");
    }

    // Distribute the tokens based on shares
    for (uint256 i = 0; i < recipients.length; i++) {
      uint256 recipientAmount = (amount * shares[i]) / MAX_SHARES;
      _balances[tokenAddress][recipients[i]] += recipientAmount;

      _addTokenForUser(recipients[i], tokenAddress);
    }
  }

  /// @notice Adds a token to the list of tokens a user has received (for automatic withdrawals).
  /// @param recipient The recipient of the token.
  /// @param tokenAddress The address of the token.
  function _addTokenForUser(address recipient, address tokenAddress) internal {
    if (!_hasToken[recipient][tokenAddress]) {
      _userTokens[recipient].push(tokenAddress);
      _hasToken[recipient][tokenAddress] = true;
    }
  }
}
