import fs from 'fs';
import path from 'path';
import { defineChain } from 'viem';
import {
  mainnet,
  sepolia,
  arbitrum,
  arbitrumNova,
  arbitrumGoerli,
  arbitrumSepolia,
  base,
} from 'viem/chains';
import { orbitChainsInformationJsonFile, orbitChainsLocalInformationJsonFile } from '../src/constants';

// Types
export type ChainInformation = {
  id: number;
  rpc: string;
  name: string;
  nativeCurrency?: {
    name: string;
    symbol: string;
    decimals: number;
  };
};

// Tracked Viem chains
const trackedChains = {
  mainnet,
  sepolia,
  arbitrum,
  arbitrumNova,
  arbitrumGoerli,
  arbitrumSepolia,
  base,
};

export const extractChainIdFromRpc = async (chainRpc: string) => {
  // Call RPC
  const res = await fetch(chainRpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'chain-id',
      method: 'eth_chainId',
    }),
  });
  const data = await res.json();

  // Extract chain id
  const chainId = Number(data.result);
  return chainId;
};

export const defineChainInformation = (chainInformation: ChainInformation) => {
  return defineChain({
    id: chainInformation.id,
    name: chainInformation.name,
    network: 'orbit',
    nativeCurrency: chainInformation.nativeCurrency || {
      name: 'ETH',
      symbol: 'ETH',
      decimals: 18,
    },
    rpcUrls: {
      default: {
        http: [chainInformation.rpc],
      },
      public: {
        http: [chainInformation.rpc],
      },
    },
  });
};

export const getChainInfoFromChainId = (chainId: number) => {
  for (const chain of Object.values(trackedChains)) {
    if ('id' in chain) {
      if (chain.id === chainId) {
        return chain;
      }
    }
  }

  return undefined;
};

// Load orbit-chains files
export const loadOrbitChainsFromFile = () => {
  const orbitChainsInformationFilepath = path.join(__dirname, '..', orbitChainsInformationJsonFile);
  const orbitChainsInformationRaw = fs.readFileSync(orbitChainsInformationFilepath, 'utf8');
  const orbitChainsInformation = JSON.parse(orbitChainsInformationRaw);

  // Loading local file
  const orbitChainsLocalInformationFilepath = path.join(__dirname, '..', orbitChainsLocalInformationJsonFile);
  const orbitChainsLocalInformationRaw = fs.readFileSync(orbitChainsLocalInformationFilepath, 'utf8');
  const orbitChainsLocalInformation = JSON.parse(orbitChainsLocalInformationRaw);

  return {
    ...orbitChainsInformation,
    ...orbitChainsLocalInformation,
  };
}
