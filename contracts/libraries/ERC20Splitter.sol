// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ERC20Splitter {
  // Mapping to track balances of token by address and recipient
  mapping(address => mapping(address => uint256)) private _balances;

  // Mapping to track which tokens a user has received (for auto-withdrawals)
  mapping(address => address[]) private _userTokens;
  mapping(address => mapping(address => bool)) private _hasToken;

  event Deposit(address indexed depositor, address[] tokenAddresses, uint256[] amounts, uint256[][] shares, address[][] recipients);
  event Withdraw(address indexed recipient, address tokenAddress, uint256 amount);

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
  function withdraw() external {
    address[] storage userTokens = _userTokens[msg.sender];

    require(userTokens.length > 0, "No tokens to withdraw");

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

        emit Withdraw(msg.sender, tokenAddress, amount);
      }
    }
    _clearUserTokens(msg.sender);
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

    require(totalSharePercentage == 10000, "Shares must sum to 100%");

    if (tokenAddress == address(0)) {
      // Handle native token (ETH)
      require(msg.value == amount, "Incorrect native token amount sent");
    } else {
      // Handle ERC-20 token
      require(IERC20(tokenAddress).transferFrom(msg.sender, address(this), amount), "Transfer failed");
    }

    // Distribute the tokens based on shares
    for (uint256 i = 0; i < recipients.length; i++) {
      uint256 recipientAmount = (amount * shares[i]) / 10000;
      _balances[tokenAddress][recipients[i]] += recipientAmount;

      // Track the token for this recipient (if it's the first time they receive this token)
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

  /// @notice View function to check token balances for an account.
  /// @param tokenAddress The address of the token.
  /// @param account The address of the account to check balance for.
  /// @return The balance of the specified token for the given account.
  function balances(address tokenAddress, address account) external view returns (uint256) {
    return _balances[tokenAddress][account];
  }

  function _clearUserTokens(address user) internal {
    address[] storage tokens = _userTokens[user];

    // Clear the _hasToken mapping for each token
    for (uint256 i = 0; i < tokens.length; i++) {
      _hasToken[user][tokens[i]] = false;
    }

    // Clear the _userTokens array
    delete _userTokens[user];
  }

  // Fallback and receive functions to handle native token deposits
  receive() external payable {}
}
