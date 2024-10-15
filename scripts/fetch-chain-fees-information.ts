import { getChain, GetChainOptions } from '../src/getChain';
import yargs from 'yargs/yargs';
import { createPublicClientForOrbitChain } from '../src/utils';
import { arbGasInfoPublicActions, arbOwnerPublicActions, getBatchPosters } from '@arbitrum/orbit-sdk';
import { Address, parseAbi, zeroAddress } from 'viem';

type ChainFeesInformationResult = {
  id: number;
  name: string;
  parentChainId: number;
  parentChainFees: {
    batchPoster: Address;
    baseFeeCollector: Address;
    baseFee: bigint;
    surplusFeeCollector: Address;
    surplusFee: bigint;
  };
  orbitChainFees: {
    baseFeeCollector: Address;
    baseFee: bigint;
    surplusFeeCollector: Address;
    surplusFee: bigint;
  };
};

//////////////////////
// Helper functions //
//////////////////////
const renderChainFeesInformation = (chainFeesInformation: ChainFeesInformationResult) => {
  console.log('**************************');
  console.log('* Chain fees information *');
  console.log('**************************');
  console.log(chainFeesInformation);
};

///////////////////
// Main function //
///////////////////
const main = async (options: GetChainOptions) => {
  ///////////////////////////
  // Get chain information //
  ///////////////////////////
  const orbitChainInformation = await getChain({
    ...options,
    verbose: true,
  });
  if (!orbitChainInformation) {
    throw new Error('Chain was not found');
  }

  // Chain key
  const orbitChainKey = orbitChainInformation.parentChainId + '_' + orbitChainInformation.core.rollup;

  // Checking RPC existence
  if (!orbitChainInformation.rpc) {
    throw new Error(`The specified chain ${orbitChainKey} does not have an RPC available.`)
  }

  // Create client
  const rawPublicClient = await createPublicClientForOrbitChain(orbitChainKey);
  if (!rawPublicClient) {
      // We should not land here, but placing this fallback just in case
      throw new Error('An internal error occurred');
  }
  const publicClient = rawPublicClient.extend(arbGasInfoPublicActions).extend(arbOwnerPublicActions);


  /////////////////////////////////////////
  // Get parent-chain's fees information //
  /////////////////////////////////////////
  
  // Get batch poster
  const batchPosterCandidates = await getBatchPosters(publicClient, {
    rollup: orbitChainInformation.core.rollup,
    sequencerInbox: orbitChainInformation.core.sequencerInbox,
  });

  if (batchPosterCandidates.batchPosters.length > 1) {
    console.warn('More than one batch posters were found: ');
    console.warn(batchPosterCandidates.batchPosters);
  }
  const batchPoster = batchPosterCandidates.batchPosters[0];

  // Get fee collector for that batch poster
  let parentChainBaseFeeCollector: Address = zeroAddress;
  try {
    parentChainBaseFeeCollector = await publicClient.readContract({
      address: '0x000000000000000000000000000000000000006D',
      abi: parseAbi(['function getFeeCollector(address) view returns (address)']),
      functionName: 'getFeeCollector',
      args: [batchPoster],
    });
  } catch (error) {
    console.warn(`No fee collector was found for batch poster ${batchPoster}`);
  }

  // Get parent chain reward fee collector
  let parentChainSurplusFeeCollector: Address = zeroAddress;
  try {
    parentChainSurplusFeeCollector = await publicClient.arbGasInfoReadContract({
      functionName: 'getL1RewardRecipient',
    }) as Address;
  } catch (error) {
    console.warn(`No L1 reward recipient was found`);
  }

  // Get current parent chain base fee
  const parentChainBaseFeeEstimate = await publicClient.arbGasInfoReadContract({
    functionName: 'getL1BaseFeeEstimate',
  }) as bigint;

  // Get current parent chain surplus fee
  const parentChainSurplusFeeRate = await publicClient.arbGasInfoReadContract({
    functionName: 'getL1RewardRate',
  }) as bigint;


  ////////////////////////////////////////
  // Get orbit-chain's fees information //
  ////////////////////////////////////////

  // Get base fee and surplus fee collectors (infraFeeAccount, networkFeeAccount)
  const infraFeeAccount = await publicClient.arbOwnerReadContract({
    functionName: 'getInfraFeeAccount',
  }) as Address;

  const networkFeeAccount = await publicClient.arbOwnerReadContract({
    functionName: 'getNetworkFeeAccount',
  }) as Address;

  const surplusFeeCollector = networkFeeAccount;
  // If the infraFeeAccount is set to 0x0, the networkFeeAccount will receive both base and surplus fees
  const baseFeeCollector = infraFeeAccount === zeroAddress ? networkFeeAccount : infraFeeAccount;

  // Get current base fee and surplus fee
  const pricesInWei = await publicClient.arbGasInfoReadContract({
    functionName: 'getPricesInWei',
  }) as [bigint, bigint, bigint, bigint, bigint, bigint];
  
  const baseFee = pricesInWei[3];
  const surplusFee = pricesInWei[4];


  ////////////
  // Result //
  ////////////
  renderChainFeesInformation({
    id: orbitChainInformation.id,
    name: orbitChainInformation.name,
    parentChainId: orbitChainInformation.parentChainId,
    parentChainFees: {
      batchPoster,
      baseFeeCollector: parentChainBaseFeeCollector,
      baseFee: parentChainBaseFeeEstimate,
      surplusFeeCollector: parentChainSurplusFeeCollector,
      surplusFee: parentChainSurplusFeeRate,
    },
    orbitChainFees: {
      baseFeeCollector,
      baseFee,
      surplusFeeCollector,
      surplusFee,
    },
  })
};

/////////////////////
// Start execution //
/////////////////////
const options = yargs(process.argv.slice(2))
  .options({
    id: { type: 'number' },
    rpc: { type: 'string' },
    rollup: { type: 'string' },
  })
  .check((argv) => {
    if (!argv.rollup && !argv.id && !argv.rpc) {
      throw new Error('At least one option needs to be specified');
    }

    return true;
  })
  .parseSync();

main(options)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
