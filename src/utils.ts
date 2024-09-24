import fs from 'fs';
import path from 'path';
import { Address, Chain, defineChain, GetLogsReturnType, PublicClient } from 'viem';
import {
  mainnet,
  sepolia,
  arbitrum,
  arbitrumNova,
  arbitrumGoerli,
  arbitrumSepolia,
  base,
} from 'viem/chains';
import {
  blockQueryChunkSizeArb,
  blockQueryChunkSizeBase,
  blockQueryChunkSizeEth,
  blockQueryMaxAttempts,
  orbitChainsInformationJsonFile,
  orbitChainsLocalInformationJsonFile,
} from '../src/constants';
import { AbiEventItem } from './types';
import dotenv from 'dotenv';
dotenv.config();

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

export const getDefaultChainRpc = (chainInformation: Chain, rpcSpecified?: string) => {
  if (rpcSpecified) {
    return rpcSpecified;
  }

  const chainId = chainInformation.id;
  switch (chainId) {
    case mainnet.id:
      return process.env.RPC_ETHEREUM ?? undefined;
    case arbitrum.id:
      return process.env.RPC_ARBONE ?? undefined;
    case arbitrumNova.id:
      return process.env.RPC_ARBNOVA ?? undefined;
    case base.id:
      return process.env.RPC_BASE ?? undefined;
  }

  return undefined;
};

// Helper functions for orbit-chain files
export const generateOrbitChainKey = (parentChainId: number, rollupAddress: Address) => {
  return `${parentChainId}_${rollupAddress.toLowerCase()}`;
}

export const loadOrbitChainsFromFile = () => {
  const orbitChainsInformationFilepath = path.join(__dirname, '..', orbitChainsInformationJsonFile);
  const orbitChainsInformationRaw = fs.readFileSync(orbitChainsInformationFilepath, 'utf8');
  const orbitChainsInformation = JSON.parse(orbitChainsInformationRaw);

  // Loading local file (if it exists)
  let orbitChainsLocalInformation = [];
  const orbitChainsLocalInformationFilepath = path.join(
    __dirname,
    '..',
    orbitChainsLocalInformationJsonFile,
  );
  if (fs.existsSync(orbitChainsLocalInformationFilepath)) {
    const orbitChainsLocalInformationRaw = fs.readFileSync(
      orbitChainsLocalInformationFilepath,
      'utf8',
    );
    orbitChainsLocalInformation = JSON.parse(orbitChainsLocalInformationRaw);
  }

  return {
    ...orbitChainsInformation,
    ...orbitChainsLocalInformation,
  };
};

// Query logs by chunks
const getChunkSizeByChainId = (chainId: number) => {
  switch (chainId) {
    case mainnet.id:
      return blockQueryChunkSizeEth;
    case base.id:
      return blockQueryChunkSizeBase;
  }

  return blockQueryChunkSizeArb;
};

export type QueryLogsByChunksParameters = {
  publicClient: PublicClient;
  event: AbiEventItem;
  fromBlock: bigint;
  toBlock: bigint;
  verbose?: boolean;
};
export const queryLogsByChunks = async ({
  publicClient,
  event,
  fromBlock,
  toBlock,
  verbose = true,
}: QueryLogsByChunksParameters): Promise<GetLogsReturnType> => {
  const results: GetLogsReturnType[] = [];

  // Initializing chunkSize
  const chainId = await publicClient.getChainId();
  let chunkSize = getChunkSizeByChainId(chainId);

  // Initializing fromBlock
  let currentFromBlock = fromBlock;

  // Main loop
  while (currentFromBlock <= toBlock) {
    // Calculating toBlock
    const currentToBlock =
      currentFromBlock + chunkSize - 1n < toBlock ? currentFromBlock + chunkSize - 1n : toBlock;

    // Querying logs
    let attempts = 0;
    while (attempts < blockQueryMaxAttempts) {
      try {
        if (verbose) {
          console.log(
            `Querying logs on ${chainId} from ${currentFromBlock} to ${currentToBlock}...`,
          );
        }
        const result = await publicClient.getLogs({
          event,
          fromBlock: currentFromBlock,
          toBlock: currentToBlock,
        });
        results.push(result);
        break;
      } catch (error) {
        attempts++;

        if (attempts >= blockQueryMaxAttempts) {
          console.error(`Failed to get logs after ${blockQueryMaxAttempts} attempts:`, error);
          throw error;
        }

        console.warn(`Attempt ${attempts} failed. Retrying...`);
        await sleep(1000 * attempts);
      }
    }

    // Next iteration
    currentFromBlock = currentToBlock + 1n;
  }

  return results.flat();
};

// General utils
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
