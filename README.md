# komodo-solidity-contracts

These are contracts for the Komodo notary group to perform various functions on the Ethereum chain.

## Concept:

Notaries can collectively make multisig contract calls going via [Gateway](./contracts/Gateway.sol),
which provides a `proxy` method to verify notary signatures to some threshold and proxy the call.

## How to develop

## Prerequisites
1. Install NPM
1. Install [Truffle](https://www.trufflesuite.com)

## Testing

[docs](https://www.trufflesuite.com/docs/truffle/getting-started/using-truffle-develop-and-the-console)

```
$ truffle develop

truffle(develop)> test
```

If there's any errors, Google them, and the chances are you'll find the answers on Github. Truffle can be a bit of a diva to get going, but it's pretty stable once you've got the tests working. If you see "invalid opcode" that's the equivalent of a segfault, and means that the contract has performed an access error. "Reverted" means there was some assertion failure, and is often accompanied by a message.
