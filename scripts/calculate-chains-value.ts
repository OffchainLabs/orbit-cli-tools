import yargs from 'yargs/yargs';
import { createPublicClient, http, parseAbi, PublicClient } from 'viem';
import { getDefaultChainRpc, loadOrbitChainsFromFile } from '../src/utils';
import { calculateChainTvl, ChainTvlResult } from '../src/calculateChainTvl';
import { getChain } from '../src/getChain';
import { getParentChainFromId } from '@arbitrum/orbit-sdk/utils';

type CalculateChainsValueOptions = {
  sortByActivity?: boolean;
  showFullTable?: boolean;
};

type ChainValueResult = {
  id: number;
  name: string;
  parentChainId: number;
} & ChainTvlResult & {
    lastReportedMessageCount: bigint;
  };

const renderValueInformation = (chainsValue: ChainValueResult[], showFullTable?: boolean) => {
  // Reorganize some of the information
  const chainsValueSummary = showFullTable
    ? chainsValue
    : chainsValue.map((chainValue) => {
        return {
          id: chainValue.id,
          parentChainId: chainValue.parentChainId,
          bridgedNativeToken: `${chainValue.bridgedNativeToken} ${chainValue.nativeTokenSymbol}`,
          bridgedUsd: chainValue.bridgedUsd,
          lastReportedMessageCount: Number(chainValue.lastReportedMessageCount),
        };
      });

  console.log('****************************');
  console.log('* Chains value information *');
  console.log('****************************');
  console.table(chainsValueSummary);
};

const main = async (options: CalculateChainsValueOptions) => {
  // Load orbit-chains file
  const orbitChainsInformation = loadOrbitChainsFromFile();

  // Get all keys
  const orbitChainKeys = Object.keys(orbitChainsInformation);

  // Initialize result object
  const chainsValue: ChainValueResult[] = [];

  // Traverse all ids
  await Promise.all(
    orbitChainKeys.map(async (orbitChainKey) => {
      // Get chain information
      const orbitChainInformation = await getChain({
        key: orbitChainKey,
      });

      // Failsafe, although this will never happen (for now)
      if (!orbitChainInformation) {
        return;
      }

      // Parent chain client
      const parentChainInformation = getParentChainFromId(orbitChainInformation.parentChainId);
      const parentChainPublicClient = createPublicClient({
        chain: parentChainInformation,
        transport: http(getDefaultChainRpc(parentChainInformation)),
      }) as PublicClient;

      // Get TVL on bridge
      const orbitChainTvl = await calculateChainTvl(orbitChainKey);

      // Get latest block number batched
      const lastReportedMessageCount = await parentChainPublicClient.readContract({
        address: orbitChainInformation.core.bridge,
        abi: parseAbi(['function sequencerReportedSubMessageCount() view returns (uint256)']),
        functionName: 'sequencerReportedSubMessageCount',
      });

      chainsValue.push({
        id: orbitChainInformation.id,
        name: orbitChainInformation.name,
        parentChainId: orbitChainInformation.parentChainId,
        ...orbitChainTvl,
        lastReportedMessageCount,
      });
    }),
  );

  // Sorting array by value bridged
  if (options.sortByActivity) {
    chainsValue.sort(
      (a, b) => Number(b.lastReportedMessageCount) - Number(a.lastReportedMessageCount),
    );
  } else {
    chainsValue.sort((a, b) => {
      if (Number(b.bridgedUsd) === Number(a.bridgedUsd)) {
        return Number(b.lastReportedMessageCount) - Number(a.lastReportedMessageCount);
      }

      return Number(b.bridgedUsd) - Number(a.bridgedUsd);
    });
  }

  renderValueInformation(chainsValue, options.showFullTable);
};

/////////////////////
// Start execution //
/////////////////////
const options = yargs(process.argv.slice(2))
  .options({
    sortByActivity: { type: 'boolean', default: false },
    showFullTable: { type: 'boolean', default: false },
  })
  .parseSync();

main(options)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
