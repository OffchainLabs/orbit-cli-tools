# Orbit CLI tools

CLI tools to work with Orbit chains

Available tools:

- Find chains
- Fetch chain information
- Get chain
- Calculate chains value

## Find chains

This tool searches new orbit chains that have been deployed on the specified parent chain. It does so by searching for `RollupInitialized` events, which are usually emitted by RollupCreator contracts whenever a new chain is created.

Once a chain has been found, it returns the following information:

- chain id
- hash of the transaction where the chain was created
- block where the chain was created
- rollup address
- sequencerInbox address

Usage:

```shell
yarn findChains --parentChainId <chainId>
```

Available options:

- `--parentChainId` (required): id of the parent chain (it must be supported by the orbit SDK)
- `--fromBlock` and `--toBlock`: blocks to limit the search range
- `--parentChainRpc`: rpc to use (by default, the script will use the rpc provided by viem)
- `--saveChainsInformation`: saves the information of the chain to the `orbit-chains.json` file (notice that information like the block explorer URL or the orbit chain RPC can't be found this way and won't be saved)

Example:

```shell
yarn findChains --parentChainId 42161 --fromBlock 244716654
```

## Fetch chain information

This tool fetches the following information from an orbit chain:

- chain id
- core contracts
- token bridge contracts

Additionally, this tool can save this information in a local json file `orbit-chains.json` (name by default).

Usage:

```shell
yarn fetchChainInformation --rollup <rollup address> --parentChainId <parent chain id>
```

Available options:

- `--rollup` (required): address of the rollup contract
- `--parentChainId` (required): id of the parent chain (it must be supported by the orbit SDK)
- `--parentChainRpc`: parent chain RPC to use (by default, the script will use the RPC provided by viem)
- `--rpc`: RPC of the orbit chain, it will be used to extract the chain id, and optionally to save it to the local JSON file
- `--tokenBridgeCreator`: address of the TokenBridgeCreator contract used to create the token bridge of the chain (by default, the script will use the one set in the Orbit SDK)
- `--saveChainInformation`: whether or not to save the information found in the local JSON file (if the chain id exists, it will not save the information) (by default, the script won't save the information)
- `--updateInformation`: whether or not to update the information found in the local JSON file, even if the chain id already exists there. It must be used with `--saveChainInformation`.

Example:

```shell
yarn fetchChainInformation --rollup 0xC47DacFbAa80Bd9D8112F4e8069482c2A3221336 --parentChainId 42161 --rpc https://xai-chain.net/rpc --saveChainInformation
```

## Get chain

Returns the information of a chain that exists in the local JSON file.

Usage:

```shell
yarn getChain --id <chain id> --rpc <chain RPC> --rollup <rollup address>
```

All parameters are optional, but at least one must be used.

## Calculate chains value

Calculates the following information of all the chains that exist in the `orbit-chains.json` file:

- TVL of the chain: calculated as the amount of native tokens locked in the Bridge contract
- Last block number reported by the sequencer

The TVL is calculated in both native token assets and USD. The USD value is obtained by calling Coingecko's API, so a DEMO api key is required for it to work. Otherwise, 0 USD will be returned.

The scripts yields the information of all chains in a table format, ordered by the amount of USD locked in the Bridge contract.

Available options:

- `--sortByActivity`: orders the information by last block number reported, instead of TVL
- `--showFullTable`: shows all the information obtained (might not fit  smaller screens)

Example:

```shell
yarn calculateChainsValue
```
