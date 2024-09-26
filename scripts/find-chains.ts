import {
  Address,
  createPublicClient,
  decodeEventLog,
  http,
  keccak256,
  Log,
  PublicClient,
  toHex,
} from 'viem';
import yargs from 'yargs/yargs';
import { getParentChainFromId } from '@arbitrum/orbit-sdk/utils';
import { AbiEventItem } from '../src/types';
import { saveChainInformation } from '../src/saveChainInformation';
import { fetchChainInformation } from '../src/fetchChainInformation';
import { generateOrbitChainKey, getDefaultChainRpc, queryLogsByChunks } from '../src/utils';
import { getChain } from '../src/getChain';

/////////////////////////
// Types and constants //
/////////////////////////
type FindChainsOptions = {
  parentChainId: number;
  parentChainRpc?: string;
  fromBlock?: number;
  toBlock?: number;
  saveChainsInformation?: boolean;
};

type RollupInitializedEventArgs = {
  machineHash: `0x${string}`;
  chainId: number;
};

type ChainSummary = {
  chainId: number;
  transactionHash: `0x${string}`;
  createdAtBlock: bigint;
  rollupAddress: Address;
  sequencerInboxAddress?: Address;
};

const rollupInitializedEventAbi = {
  inputs: [
    {
      indexed: false,
      internalType: 'bytes32',
      name: 'machineHash',
      type: 'bytes32',
    },
    {
      indexed: false,
      internalType: 'uint256',
      name: 'chainId',
      type: 'uint256',
    },
  ],
  name: 'RollupInitialized',
  type: 'event',
};

type SequencerInboxUpdatedEventType = {
  eventName: string;
  args: {
    newSequencerInbox?: Address;
  };
};
const SequencerInboxUpdatedEventAbi = {
  inputs: [
    {
      indexed: false,
      internalType: 'address',
      name: 'newSequencerInbox',
      type: 'address',
    },
  ],
  name: 'SequencerInboxUpdated',
  type: 'event',
};
const SequencerInboxUpdatedEventTopic = keccak256(toHex('SequencerInboxUpdated(address)'));

//////////////////////
// Helper functions //
//////////////////////
const renderFoundChains = (blockFrom: bigint, blockTo: bigint, chainsSummary: ChainSummary[]) => {
  console.log('************************');
  console.log(`* Chains found`);
  console.log(`* (Between ${blockFrom} to ${blockTo})`);
  console.log(`* Found ${chainsSummary.length} chains`);
  console.log('************************');
  if (chainsSummary.length > 0) {
    chainsSummary
      .sort((a, b) => Number(a.createdAtBlock - b.createdAtBlock))
      .forEach((chainSummary) => {
        console.log('----------------------');
        console.log(chainSummary);
        console.log('----------------------');
        console.log('');
      });
  }
};

///////////////////
// Main function //
///////////////////
const main = async (options: FindChainsOptions) => {
  // Parent chain client
  const parentChainInformation = getParentChainFromId(options.parentChainId);
  const clientTransport = http(getDefaultChainRpc(parentChainInformation, options.parentChainRpc));
  const parentChainPublicClient = createPublicClient({
    chain: parentChainInformation,
    transport: clientTransport,
  }) as PublicClient;

  // Block search range
  let fromBlock = 0n;
  if (options.fromBlock && options.fromBlock > 0) {
    fromBlock = BigInt(options.fromBlock);
  }

  let toBlock = await parentChainPublicClient.getBlockNumber();
  if (options.toBlock && options.toBlock > 0) {
    toBlock = BigInt(options.toBlock);
  }

  const queryFromBlock = fromBlock > 0 ? fromBlock : 0n;
  const queryToBlock = toBlock;

  // Obtaining RollupInitialized events
  const rollupInitializedEvents = (await queryLogsByChunks({
    publicClient: parentChainPublicClient,
    event: rollupInitializedEventAbi as AbiEventItem,
    fromBlock: queryFromBlock,
    toBlock: queryToBlock,
  })) as Log<bigint, number, false, AbiEventItem, undefined, [AbiEventItem], string>[];

  const chainsSummary: ChainSummary[] = await Promise.all(
    rollupInitializedEvents.map(async (rollupInitializedEvent) => {
      const chainSummary: ChainSummary = {
        chainId: (rollupInitializedEvent.args as RollupInitializedEventArgs).chainId,
        transactionHash: rollupInitializedEvent.transactionHash,
        createdAtBlock: rollupInitializedEvent.blockNumber,
        rollupAddress: rollupInitializedEvent.address,
      };

      // Get the transaction receipt
      const transactionReceipt = await parentChainPublicClient.getTransactionReceipt({
        hash: rollupInitializedEvent.transactionHash,
      });

      // Find the SequencerInboxUpdated log
      const sequencerInboxUpdatedEventLog = transactionReceipt.logs.filter(
        (log: any) => log.topics[0] == SequencerInboxUpdatedEventTopic,
      )[0];

      if (sequencerInboxUpdatedEventLog) {
        // Get the SequencerInbox address
        const decodedLog = decodeEventLog({
          abi: [SequencerInboxUpdatedEventAbi],
          data: sequencerInboxUpdatedEventLog.data,
          topics: sequencerInboxUpdatedEventLog.topics,
        }) as SequencerInboxUpdatedEventType;

        if (decodedLog.args && decodedLog.args.newSequencerInbox) {
          chainSummary.sequencerInboxAddress = decodedLog.args.newSequencerInbox;
        }
      }

      return chainSummary;
    }),
  );

  // Rendering found chains
  renderFoundChains(fromBlock, toBlock, chainsSummary);

  // Optionally saving them
  if (options.saveChainsInformation) {
    const duplicatedChains: ChainSummary[] = [];

    await Promise.all(
      chainsSummary.map(async (chainSummary) => {
        // We check first if the chain is already in the orbit-chains file
        const storedChainInformationByKey = await getChain({
          key: generateOrbitChainKey(options.parentChainId, chainSummary.rollupAddress),
        });
        if (storedChainInformationByKey) {
          // That chain already exists in the orbit-chains file, we don't need to process it
          return;
        }

        // We then check if the chain id is present in the orbit-chains file
        const storedChainInformationById = await getChain({
          id: Number(chainSummary.chainId),
        });
        if (storedChainInformationById) {
          // Information for that chain id already exists in the orbit-chains file, but it's different
          duplicatedChains.push(chainSummary);
          return;
        }

        // We finally check if the same chain id has been detected multiple times in this run
        const chainIdIsDuplicated = chainsSummary.find(
          (item: ChainSummary) =>
            item.chainId === chainSummary.chainId &&
            item.rollupAddress !== chainSummary.rollupAddress,
        );
        if (chainIdIsDuplicated) {
          duplicatedChains.push(chainSummary);
          return;
        }

        // Chain does not exist in the orbit-chains file, we continue the flow (fetch information and save it)
        console.log(`Fetching information for ${chainSummary.chainId}`);
        const chainInformation = await fetchChainInformation({
          rollup: chainSummary.rollupAddress,
          parentChainId: options.parentChainId,
          parentChainRpc: options.parentChainRpc || undefined,
        });

        console.log(`Saving information of ${chainSummary.chainId}`);
        saveChainInformation({
          parentChainPublicClient,
          orbitChainId: chainInformation.chainId,
          orbitChainRpc: undefined,
          coreContractsWithCreator: chainInformation.coreContractsWithCreator,
          tokenBridgeContractsWithCreators: chainInformation.tokenBridgeContractsWithCreators,
        });
      }),
    );

    // Finally show the duplicated chains found
    if (duplicatedChains) {
      console.log(`Duplicated chains found:`);
      console.table(duplicatedChains);
    }
  }
};

/////////////////////
// Start execution //
/////////////////////
const options = yargs(process.argv.slice(2))
  .options({
    parentChainId: { type: 'number', demandOption: true, requiresArg: true },
    parentChainRpc: { type: 'string', default: '' },
    fromBlock: { type: 'number', default: 0 },
    toBlock: { type: 'number', default: 0 },
    saveChainsInformation: { type: 'boolean', default: false },
  })
  .parseSync();

main(options)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
