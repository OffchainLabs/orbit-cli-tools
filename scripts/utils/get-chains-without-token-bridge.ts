import { OrbitChainInformation } from '../../src/types';
import { loadOrbitChainsFromFile } from '../../src/utils';
import { Address, zeroAddress } from 'viem';

type OrbitChainInformationSummary = {
  key: string;
  id: number;
  name: string;
  parentChainId: number;
  rollup: Address;
  sequencerInbox: Address;
};

//////////////////////
// Helper functions //
//////////////////////
const renderChainsInformationSummary = (
  chainsInformationSummary: OrbitChainInformationSummary[],
  totalChains: number,
) => {
  console.log('****************************************');
  console.log('* Chains without TokenBridge contracts *');
  console.log('****************************************');
  console.log(chainsInformationSummary);
  console.log();
  console.log(
    `Found ${chainsInformationSummary.length} chains without TokenBridge contracts (of a total of ${totalChains})`,
  );
};

///////////////////
// Main function //
///////////////////
const main = async () => {
  // Load orbit-chains file
  const orbitChainsInformation = loadOrbitChainsFromFile();
  const orbitChains = Object.values(orbitChainsInformation) as OrbitChainInformation[];

  const orbitChainsWithoutTokenBridge = orbitChains.reduce(
    (acc: OrbitChainInformationSummary[], chainInformation: OrbitChainInformation) => {
      if (chainInformation.tokenBridge.parentChainContracts.router === zeroAddress) {
        acc.push({
          key: chainInformation.parentChainId + '_' + chainInformation.core.rollup,
          id: chainInformation.id,
          name: chainInformation.name,
          parentChainId: chainInformation.parentChainId,
          rollup: chainInformation.core.rollup,
          sequencerInbox: chainInformation.core.sequencerInbox,
        });
      }

      return acc;
    },
    [],
  );

  if (orbitChainsWithoutTokenBridge) {
    renderChainsInformationSummary(orbitChainsWithoutTokenBridge, orbitChains.length);
  }
};

/////////////////////
// Start execution //
/////////////////////
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
