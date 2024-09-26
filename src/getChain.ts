import { OrbitChainInformation } from '../src/types';
import {
  extractChainIdFromRpc,
  generateOrbitChainKey,
  loadOrbitChainsFromFile,
} from '../src/utils';

export type GetChainOptions = {
  id?: number;
  rpc?: string;
  rollup?: string;
  key?: string;
  verbose?: boolean;
};

export const getChain = async (
  options: GetChainOptions,
): Promise<OrbitChainInformation | undefined> => {
  // Load orbit-chains file
  const orbitChainsInformation = loadOrbitChainsFromFile();
  const orbitChains = Object.values(orbitChainsInformation) as OrbitChainInformation[];

  // Default key
  let orbitChainKey = '';

  // If we receive the chain id
  if (options.id) {
    const orbitChainInformation = orbitChains.find(
      (item: OrbitChainInformation) => item.id === options.id,
    );

    if (orbitChainInformation) {
      orbitChainKey = generateOrbitChainKey(
        orbitChainInformation.parentChainId,
        orbitChainInformation.core.rollup,
      );
    }
  }

  // If we receive the chain RPC
  if (options.rpc) {
    const orbitChainId = await extractChainIdFromRpc(options.rpc);

    const orbitChainInformation = orbitChains.find(
      (item: OrbitChainInformation) => item.id === orbitChainId,
    );

    if (orbitChainInformation) {
      orbitChainKey = generateOrbitChainKey(
        orbitChainInformation.parentChainId,
        orbitChainInformation.core.rollup,
      );
    }
  }

  // If we receive the rollup address of the chain
  if (options.rollup) {
    const orbitChains = Object.values(orbitChainsInformation) as OrbitChainInformation[];
    const orbitChainInformation = orbitChains.find(
      (item: OrbitChainInformation) => item.core.rollup === options.rollup,
    );

    if (orbitChainInformation) {
      orbitChainKey = generateOrbitChainKey(
        orbitChainInformation.parentChainId,
        orbitChainInformation.core.rollup,
      );
    }
  }

  // If we receive the key
  if (options.key) {
    orbitChainKey = options.key.toLowerCase();
  }

  if (!orbitChainKey || !(orbitChainKey in orbitChainsInformation)) {
    if (options.verbose) {
      console.error(`Chain ${orbitChainKey} was not found in the chains JSON file`);
    }
    return;
  }

  return orbitChainsInformation[orbitChainKey];
};
