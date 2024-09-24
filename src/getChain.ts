import { OrbitChainInformation } from '../src/types';
import { extractChainIdFromRpc, loadOrbitChainsFromFile } from '../src/utils';

export type GetChainOptions = {
  id?: number;
  rpc?: string;
  rollup?: string;
  verbose?: boolean;
};

export const getChain = async (
  options: GetChainOptions,
): Promise<OrbitChainInformation | undefined> => {
  // Load orbit-chains file
  const orbitChainsInformation = loadOrbitChainsFromFile();

  // Default chain id
  let orbitChainId = 0;

  // If we receive the chain id
  if (options.id) {
    orbitChainId = options.id;
  }

  // If we receive the chain RPC
  if (options.rpc) {
    orbitChainId = await extractChainIdFromRpc(options.rpc);
  }

  // If we receive the rollup address of the chain
  if (options.rollup) {
    const orbitChains = Object.values(orbitChainsInformation) as OrbitChainInformation[];
    const orbitChainInformation = orbitChains.find(
      (item: OrbitChainInformation) => item.core.rollup === options.rollup,
    );

    if (orbitChainInformation) {
      orbitChainId = orbitChainInformation.id;
    }
  }

  if (!orbitChainId || !(orbitChainId in orbitChainsInformation)) {
    if (options.verbose) {
      console.error(`Chain ${orbitChainId} was not found in the chains JSON file`);
    }
    return;
  }

  return orbitChainsInformation[orbitChainId];
};
