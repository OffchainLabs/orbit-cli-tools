import { PublicClient } from 'viem';
import fs from 'fs';
import path from 'path';
import {
  CoreContractsWithCreator,
  TokenBridgeContractsWithCreators,
  OrbitChainInformation,
} from '../src/types';
import { orbitChainsInformationJsonFile } from '../src/constants';
import { generateOrbitChainKey } from './utils';

export const saveChainInformation = ({
  parentChainPublicClient,
  orbitChainId,
  orbitChainRpc,
  coreContractsWithCreator,
  tokenBridgeContractsWithCreators,
  updateInformation,
}: {
  parentChainPublicClient: PublicClient;
  orbitChainId: number;
  orbitChainRpc: string | undefined;
  coreContractsWithCreator: CoreContractsWithCreator;
  tokenBridgeContractsWithCreators: TokenBridgeContractsWithCreators;
  updateInformation?: boolean;
}): boolean => {
  // Load orbit-chains file
  const orbitChainsInformationFilepath = path.join(__dirname, '..', orbitChainsInformationJsonFile);
  const orbitChainsInformationRaw = fs.readFileSync(orbitChainsInformationFilepath, 'utf8');
  const orbitChainsInformation = JSON.parse(orbitChainsInformationRaw);

  // Generate key
  const parentChainId = parentChainPublicClient.chain!.id;
  const orbitChainKey = generateOrbitChainKey(parentChainId, coreContractsWithCreator.rollup);

  if (orbitChainKey in orbitChainsInformation && !updateInformation) {
    // Information already present in JSON object
    console.warn(
      `Chain id ${orbitChainKey} is already present in ${orbitChainsInformationJsonFile}. If you want to update the information, use the flag '--updateInformation'. Skip saving.`,
    );
    return false;
  }

  const orbitChainInformation: OrbitChainInformation = {
    id: orbitChainId,
    name: '',
    infoUrl: '',
    rpc: orbitChainRpc || '',
    parentChainId,
    parentChainRpc: parentChainPublicClient.chain!.rpcUrls.default.http[0],
    explorerUrl:
      orbitChainKey in orbitChainsInformation
        ? orbitChainsInformation[orbitChainKey].explorerUrl
        : '',
    parentChainExplorerUrl: parentChainPublicClient.chain!.blockExplorers!.default.url,
    core: coreContractsWithCreator,
    tokenBridge: tokenBridgeContractsWithCreators,
  };
  orbitChainsInformation[orbitChainKey] = orbitChainInformation;

  // Sort chains information
  const orbitChainsInformationSorted = Object.keys(orbitChainsInformation).sort().reduce((result: any, key: string) => {
    result[key] = orbitChainsInformation[key];
    return result;
  }, {});

  fs.writeFileSync(orbitChainsInformationFilepath, JSON.stringify(orbitChainsInformationSorted, null, 4));
  return true;
};
