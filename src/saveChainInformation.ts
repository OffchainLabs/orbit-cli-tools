import { PublicClient } from 'viem';
import fs from 'fs';
import path from 'path';
import {
  CoreContractsWithCreator,
  TokenBridgeContractsWithCreators,
  OrbitChainInformation,
} from '../src/types';
import { orbitChainsInformationJsonFile } from '../src/constants';

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

  if (orbitChainId in orbitChainsInformation && !updateInformation) {
    // Information already present in JSON object
    console.warn(
      `Chain id ${orbitChainId} is already present in ${orbitChainsInformationJsonFile}. If you want to update the information, use the flag '--updateInformation'. Skip saving.`,
    );
    return false;
  }

  const orbitChainInformation: OrbitChainInformation = {
    id: orbitChainId,
    rpc: orbitChainRpc || '',
    parentChainId: parentChainPublicClient.chain!.id,
    parentChainRpc: parentChainPublicClient.chain!.rpcUrls.default.http[0],
    explorerUrl:
      orbitChainId in orbitChainsInformation
        ? orbitChainsInformation[orbitChainId].explorerUrl
        : '',
    parentChainExplorerUrl: parentChainPublicClient.chain!.blockExplorers!.default.url,
    core: coreContractsWithCreator,
    tokenBridge: tokenBridgeContractsWithCreators,
  };
  orbitChainsInformation[orbitChainId] = orbitChainInformation;

  fs.writeFileSync(orbitChainsInformationFilepath, JSON.stringify(orbitChainsInformation, null, 4));
  return true;
};
