import { Address, createPublicClient, http, parseAbi, parseEventLogs, PublicClient } from 'viem';
import { getParentChainFromId, getTokenBridgeCreatorAddress } from '@arbitrum/orbit-sdk/utils';
import {
  createRollupFetchTransactionHash,
  createRollupPrepareTransactionReceipt,
  createTokenBridgeFetchTokenBridgeContracts,
} from '@arbitrum/orbit-sdk';
import { CoreContractsWithCreator, TokenBridgeContractsWithCreators } from '../src/types';

export type FetchChainInformationOptions = {
  rollup: string;
  parentChainId: number;
  parentChainRpc?: string;
  rpc?: string;
  tokenBridgeCreator?: string;
  saveChainInformation?: boolean;
  updateInformation?: boolean;
};

export type FetchChainInformationResult = {
  chainId: number;
  coreContractsWithCreator: CoreContractsWithCreator;
  tokenBridgeContractsWithCreators: TokenBridgeContractsWithCreators;
};

export const fetchChainInformation = async (
  options: FetchChainInformationOptions,
): Promise<FetchChainInformationResult> => {
  // Parent chain client
  const parentChainInformation = getParentChainFromId(options.parentChainId);
  const clientTransport = options.parentChainRpc ? http(options.parentChainRpc) : http();
  const parentChainPublicClient = createPublicClient({
    chain: parentChainInformation,
    transport: clientTransport,
  }) as PublicClient;

  // Getting rollup contracts
  // (NOTE: instead of using directly `createRollupFetchCoreContracts`, we'll fetch the transaction hash, get the receipt, and call the getCoreContracts method from there, since we also want to obtain the rollupCreator address and the chain id)
  const rollupAddress = options.rollup as `0x${string}`;
  const rollupCreationtransactionHash = await createRollupFetchTransactionHash({
    rollup: rollupAddress,
    publicClient: parentChainPublicClient,
  });
  const transactionReceipt = createRollupPrepareTransactionReceipt(
    await parentChainPublicClient.waitForTransactionReceipt({
      hash: rollupCreationtransactionHash,
    }),
  );
  const coreContractsWithCreator: CoreContractsWithCreator = {
    ...transactionReceipt.getCoreContracts(),
    rollupCreator: transactionReceipt.to!,
  };

  // Getting the chain id from the `RollupInitialized` log
  const rollupInitializedLogs = parseEventLogs({
    abi: parseAbi(['event RollupInitialized(bytes32, uint256)']),
    eventName: 'RollupInitialized',
    logs: transactionReceipt.logs,
  });
  if (!rollupInitializedLogs || rollupInitializedLogs.length != 1) {
    throw new Error(
      `An unexpected number of RollupInitialized logs was not found on transaction ${transactionReceipt.transactionHash} (${rollupInitializedLogs.length})`,
    );
  }

  if (!rollupInitializedLogs[0].args || rollupInitializedLogs[0].args.length != 2) {
    throw new Error(
      `An unexpected number of arguments was found on the RollupInitialized log (${rollupInitializedLogs[0].args.length})`,
    );
  }
  const chainId = Number(rollupInitializedLogs[0].args[1]);

  // Getting token bridge contracts
  const tokenBridgeCreatorAddress = options.tokenBridgeCreator
    ? (options.tokenBridgeCreator as Address)
    : getTokenBridgeCreatorAddress(parentChainPublicClient);
  const tokenBridgeContracts = await createTokenBridgeFetchTokenBridgeContracts({
    inbox: coreContractsWithCreator.inbox,
    parentChainPublicClient: parentChainPublicClient,
    tokenBridgeCreatorAddressOverride: tokenBridgeCreatorAddress,
  });

  // Token bridge creators
  const orbitChainTokenBridgeCreatorAddress = (await parentChainPublicClient.readContract({
    address: tokenBridgeCreatorAddress,
    abi: parseAbi(['function canonicalL2FactoryAddress() view returns (address)']),
    functionName: 'canonicalL2FactoryAddress',
  })) as Address;

  const tokenBridgeContractsWithCreators: TokenBridgeContractsWithCreators = {
    parentChainContracts: {
      ...tokenBridgeContracts.parentChainContracts,
      tokenBridgeCreator: tokenBridgeCreatorAddress,
    },
    orbitChainContracts: {
      ...tokenBridgeContracts.orbitChainContracts,
      tokenBridgeCreator: orbitChainTokenBridgeCreatorAddress,
    },
  };

  return {
    chainId,
    coreContractsWithCreator,
    tokenBridgeContractsWithCreators,
  };
};
