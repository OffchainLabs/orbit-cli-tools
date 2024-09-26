import yargs from 'yargs/yargs';
import { createPublicClientForOrbitChain, loadOrbitChainsFromFile } from '../src/utils';
import { getChain } from '../src/getChain';

type GetChainsClientVersionOptions = {
  sortByClientVersion?: boolean;
  sortByLastBlockDate?: boolean;
  showFullTable?: boolean;
};

type ChainClientVersionResult = {
  id: number;
  name: string;
  parentChainId: number;
  rpc: string;
  lastBlock: bigint;
  lastBlockTimestamp: bigint;
  clientVersion: string;
};

const renderClientVersionInformation = (
  chainsClientVersion: ChainClientVersionResult[],
  showFullTable?: boolean,
) => {
  // Reorganize some of the information
  const chainsClientVersionSummary = showFullTable
    ? chainsClientVersion
    : chainsClientVersion.map((chainClientVersion) => {
        return {
          id: chainClientVersion.id,
          name: chainClientVersion.name,
          parentChainId: chainClientVersion.parentChainId,
          lastBlockDate:
            chainClientVersion.lastBlock === 0n
              ? ''
              : new Date(Number(chainClientVersion.lastBlockTimestamp) * 1000).toDateString(),
          clientVersion: chainClientVersion.clientVersion,
        };
      });

  console.log('*************************');
  console.log('* Chains client version *');
  console.log('*************************');
  console.table(chainsClientVersionSummary);
};

const main = async (options: GetChainsClientVersionOptions) => {
  // Load orbit-chains file
  const orbitChainsInformation = loadOrbitChainsFromFile();

  // Get all keys
  const orbitChainKeys = Object.keys(orbitChainsInformation);

  // Initialize result object
  const chainsClientVersion: ChainClientVersionResult[] = [];

  // Traverse all keys
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

      // Initialize result object
      const chainClientVersion: ChainClientVersionResult = {
        id: orbitChainInformation.id,
        name: orbitChainInformation.name,
        parentChainId: orbitChainInformation.parentChainId,
        rpc: '',
        lastBlock: 0n,
        lastBlockTimestamp: 0n,
        clientVersion: '',
      };

      if (orbitChainInformation.rpc) {
        chainClientVersion.rpc = orbitChainInformation.rpc;

        // Call RPC to get the client version
        try {
          const res = await fetch(orbitChainInformation.rpc, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'client-version',
              method: 'web3_clientVersion',
            }),
          });
          const data = await res.json();
          chainClientVersion.clientVersion = data.result;
        } catch (err) {
          chainClientVersion.clientVersion = 'Error';
        }

        // Get last block number and date
        const publicClient = await createPublicClientForOrbitChain(orbitChainKey);
        if (!publicClient) {
          // We should not land here, but placing this fallback just in case
          return;
        }

        try {
          const lastBlock = await publicClient.getBlock();
          chainClientVersion.lastBlock = lastBlock.number;
          chainClientVersion.lastBlockTimestamp = lastBlock.timestamp;
        } catch (err) {
          // Gracefully continuing
        }
      } else {
        // We don't have an RPC for this chain
        chainClientVersion.rpc = '-';
        chainClientVersion.clientVersion = '-';
      }

      chainsClientVersion.push(chainClientVersion);
    }),
  );

  // Sorting array by value bridged
  if (options.sortByClientVersion) {
    chainsClientVersion.sort((a, b) => (b.clientVersion > a.clientVersion ? 1 : -1));
  } else if (options.sortByLastBlockDate) {
    chainsClientVersion.sort((a, b) => (b.lastBlockTimestamp > a.lastBlockTimestamp ? 1 : -1));
  }

  renderClientVersionInformation(chainsClientVersion, options.showFullTable);
};

/////////////////////
// Start execution //
/////////////////////
const options = yargs(process.argv.slice(2))
  .options({
    sortByClientVersion: { type: 'boolean', default: false },
    sortByLastBlockDate: { type: 'boolean', default: false },
    showFullTable: { type: 'boolean', default: false },
  })
  .parseSync();

main(options)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
