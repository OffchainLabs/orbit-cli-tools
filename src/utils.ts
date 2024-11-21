import fs from 'fs';
import path from 'path';
import {
  Address,
  Chain,
  createPublicClient,
  defineChain,
  formatUnits,
  GetLogsReturnType,
  http,
  parseAbi,
  PublicClient,
  zeroAddress,
} from 'viem';
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
import { getChain } from './getChain';
import { getParentChainFromId } from '@arbitrum/orbit-sdk/utils';
import dotenv from 'dotenv';
import { getTokenPrice } from './coingecko';
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

export type NativeTokenInformation = {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
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

export const getNativeTokenInformation = async (
  parentChainId: number,
  nativeTokenAddress: Address,
): Promise<NativeTokenInformation> => {
  if (nativeTokenAddress === zeroAddress) {
    return {
      address: zeroAddress,
      name: 'ETH',
      symbol: 'ETH',
      decimals: 18,
    };
  }

  // Create parent chain client
  const parentChainInformation = getParentChainFromId(parentChainId);
  const parentChainPublicClient = createPublicClient({
    chain: parentChainInformation,
    transport: http(getDefaultChainRpc(parentChainInformation)),
  }) as PublicClient;

  const nativeTokenName = await parentChainPublicClient.readContract({
    address: nativeTokenAddress,
    abi: parseAbi(['function symbol() view returns (string)']),
    functionName: 'symbol',
  });

  const nativeTokenSymbol = await parentChainPublicClient.readContract({
    address: nativeTokenAddress,
    abi: parseAbi(['function symbol() view returns (string)']),
    functionName: 'symbol',
  });

  const nativeTokenDecimals = await parentChainPublicClient.readContract({
    address: nativeTokenAddress,
    abi: parseAbi(['function decimals() view returns (uint8)']),
    functionName: 'decimals',
  });

  return {
    address: nativeTokenAddress,
    name: nativeTokenName,
    symbol: nativeTokenSymbol,
    decimals: nativeTokenDecimals,
  };
};

export type TokenAmountUsdInformation = {
  tokenAddress: Address;
  tokenSymbol: string;
  tokenAmount: number;
  usdAmount: number;
};

export const getUsdValueOfTokenAmount = async (
  parentChainId: number,
  nativeTokenAddress: Address,
  amount: bigint,
): Promise<TokenAmountUsdInformation> => {
  // Create parent chain client
  const parentChainInformation = getParentChainFromId(parentChainId);
  const parentChainPublicClient = createPublicClient({
    chain: parentChainInformation,
    transport: http(getDefaultChainRpc(parentChainInformation)),
  }) as PublicClient;

  const nativeTokenDecimals =
    nativeTokenAddress === zeroAddress
      ? 18
      : await parentChainPublicClient.readContract({
          address: nativeTokenAddress,
          abi: parseAbi(['function decimals() view returns (uint8)']),
          functionName: 'decimals',
        });

  const nativeTokenSymbol =
    nativeTokenAddress === zeroAddress
      ? 'ETH'
      : await parentChainPublicClient.readContract({
          address: nativeTokenAddress,
          abi: parseAbi(['function symbol() view returns (string)']),
          functionName: 'symbol',
        });

  const tokenPrice = await getTokenPrice(
    parentChainId,
    nativeTokenAddress === zeroAddress ? 'ethereum' : nativeTokenAddress,
  );

  const nativeTokenAmount = Number(formatUnits(amount, nativeTokenDecimals));
  const usdAmount = nativeTokenAmount * tokenPrice;

  return {
    tokenAddress: nativeTokenAddress,
    tokenSymbol: nativeTokenSymbol,
    tokenAmount: nativeTokenAmount,
    usdAmount,
  };
};

export const createPublicClientForOrbitChain = async (
  key: string,
): Promise<PublicClient | undefined> => {
  const orbitChainInformation = await getChain({ key });
  if (!orbitChainInformation || !orbitChainInformation.rpc) {
    return undefined;
  }

  // Initialize object for creating the public client
  const orbitChainInformationForPublicClient: ChainInformation = {
    id: orbitChainInformation.id,
    rpc: orbitChainInformation.rpc,
    name: orbitChainInformation.name || 'Orbit chain',
  };

  // Handle potential native currency
  if (orbitChainInformation.core.nativeToken !== zeroAddress) {
    const nativeTokenInformation = await getNativeTokenInformation(
      orbitChainInformation.parentChainId,
      orbitChainInformation.core.nativeToken,
    );

    orbitChainInformationForPublicClient.nativeCurrency = {
      name: nativeTokenInformation.name,
      symbol: nativeTokenInformation.symbol,
      decimals: nativeTokenInformation.decimals,
    };
  }

  return createPublicClient({
    chain: defineChainInformation(orbitChainInformationForPublicClient),
    transport: http(orbitChainInformation.rpc),
  }) as PublicClient;
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
};

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
export const getChunkSizeByChainId = (chainId: number) => {
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
