import {
  orbitChainsInformationJsonFile,
  orbitChainsLocalInformationJsonFile,
} from '../../src/constants';
import fs from 'fs';
import path from 'path';
import { Address } from 'viem';

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
) => {
  console.log('*********************************************************');
  console.log('* Chains that are only in the "orbit-chains-local" file *');
  console.log('*********************************************************');
  console.log(chainsInformationSummary);
};

///////////////////
// Main function //
///////////////////
const main = async () => {
  // Load orbit-chains file
  const orbitChainsInformationFilepath = path.join(
    __dirname,
    '../..',
    orbitChainsInformationJsonFile,
  );
  const orbitChainsInformationRaw = fs.readFileSync(orbitChainsInformationFilepath, 'utf8');
  const orbitChainsInformation = JSON.parse(orbitChainsInformationRaw);

  // Loading local file (if it exists)
  let orbitChainsLocalInformation = [];
  const orbitChainsLocalInformationFilepath = path.join(
    __dirname,
    '../..',
    orbitChainsLocalInformationJsonFile,
  );
  if (fs.existsSync(orbitChainsLocalInformationFilepath)) {
    const orbitChainsLocalInformationRaw = fs.readFileSync(
      orbitChainsLocalInformationFilepath,
      'utf8',
    );
    orbitChainsLocalInformation = JSON.parse(orbitChainsLocalInformationRaw);
  }

  // Getting chains that are in "local" and not in the general file
  const orbitChainsOnlyInLocalFile: OrbitChainInformationSummary[] = [];
  Object.keys(orbitChainsLocalInformation).map((orbitChainKey: string) => {
    if (!(orbitChainKey in orbitChainsInformation)) {
      orbitChainsOnlyInLocalFile.push({
        key: orbitChainKey,
        id: orbitChainsLocalInformation[orbitChainKey].id,
        name: orbitChainsLocalInformation[orbitChainKey].name,
        parentChainId: orbitChainsLocalInformation[orbitChainKey].parentChainId,
        rollup: orbitChainsLocalInformation[orbitChainKey].core.rollup,
        sequencerInbox: orbitChainsLocalInformation[orbitChainKey].core.sequencerInbox,
      });
    }
  });

  if (orbitChainsOnlyInLocalFile) {
    renderChainsInformationSummary(orbitChainsOnlyInLocalFile);
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
