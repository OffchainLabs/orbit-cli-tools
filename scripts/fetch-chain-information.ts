import { createPublicClient, http, PublicClient } from 'viem';
import { getParentChainFromId } from '@arbitrum/orbit-sdk/utils';
import {
  fetchChainInformation,
  FetchChainInformationOptions,
  FetchChainInformationResult,
} from '../src/fetchChainInformation';
import { extractChainIdFromRpc, getDefaultChainRpc } from '../src/utils';
import { saveChainInformation } from '../src/saveChainInformation';
import yargs from 'yargs/yargs';

//////////////////////
// Helper functions //
//////////////////////
const renderChainInformation = (orbitChainInformation: FetchChainInformationResult) => {
  console.log('* Chain information *');
  console.log('*********************');

  console.log('Chain id:');
  console.log(orbitChainInformation.chainId);

  console.log('Core contracts:');
  console.log(orbitChainInformation.coreContractsWithCreator);

  console.log('TokenBridge contracts:');
  console.log(orbitChainInformation.tokenBridgeContractsWithCreators);
};

///////////////////
// Main function //
///////////////////
const main = async (options: FetchChainInformationOptions) => {
  const orbitChainInformation = await fetchChainInformation(options);

  // Render information
  renderChainInformation(orbitChainInformation);

  // Optionally save the information
  if (options.saveChainInformation) {
    // Parent chain client
    const parentChainInformation = getParentChainFromId(options.parentChainId);
    const clientTransport = http(
      getDefaultChainRpc(parentChainInformation, options.parentChainRpc),
    );
    const parentChainPublicClient = createPublicClient({
      chain: parentChainInformation,
      transport: clientTransport,
    }) as PublicClient;

    // Comparing the chainId obtained from the parent chain with the one obtained from the RPC
    if (options.rpc) {
      const chainIdFromRpc = await extractChainIdFromRpc(options.rpc);
      if (orbitChainInformation.chainId != chainIdFromRpc) {
        throw new Error(
          `Chain id obtained from RollupInitialized event (${orbitChainInformation.chainId}) does not match the one obtained from the RPC (${chainIdFromRpc})`,
        );
      }
    }

    saveChainInformation({
      parentChainPublicClient,
      orbitChainId: orbitChainInformation.chainId,
      orbitChainRpc: options.rpc || undefined,
      coreContractsWithCreator: orbitChainInformation.coreContractsWithCreator,
      tokenBridgeContractsWithCreators: orbitChainInformation.tokenBridgeContractsWithCreators,
      updateInformation: options.updateInformation,
    });
  }
};

/////////////////////
// Start execution //
/////////////////////
const options = yargs(process.argv.slice(2))
  .options({
    rollup: { type: 'string', demandOption: true, requiresArg: true },
    parentChainId: { type: 'number', demandOption: true, requiresArg: true },
    parentChainRpc: { type: 'string', default: '' },
    rpc: { type: 'string', default: '' },
    tokenBridgeCreator: { type: 'string', default: '' },
    saveChainInformation: { type: 'boolean', default: false },
    updateInformation: { type: 'boolean', default: false },
  })
  .parseSync();

main(options)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
