import {
  Address,
  createPublicClient,
  formatUnits,
  http,
  parseAbi,
  PublicClient,
  zeroAddress,
} from 'viem';
import { getParentChainFromId } from '@arbitrum/orbit-sdk/utils';
import { getChain } from '../src/getChain';
import { getTokenPrice } from '../src/coingecko';
import { getDefaultChainRpc } from './utils';

export type ChainTvlResult = {
  nativeToken: Address;
  nativeTokenSymbol: string;
  bridgedNativeToken: Number;
  bridgedUsd: Number;
  bridge: Address;
};

export const calculateChainTvl = async (chainId: Number): Promise<ChainTvlResult> => {
  // Get chain information
  const orbitChainInformation = await getChain({
    id: Number(chainId),
  });

  if (!orbitChainInformation) {
    throw new Error(`Chain ${chainId} was not found in the chains JSON file`);
  }

  // Parent chain client
  const parentChainInformation = getParentChainFromId(orbitChainInformation.parentChainId);
  const parentChainPublicClient = createPublicClient({
    chain: parentChainInformation,
    transport: http(getDefaultChainRpc(parentChainInformation)),
  }) as PublicClient;

  if (orbitChainInformation.core.nativeToken == zeroAddress) {
    //
    // Chains without custom gas token
    //
    const bridgedNativeTokenRaw = await parentChainPublicClient.getBalance({
      address: orbitChainInformation.core.bridge,
    });
    const bridgedNativeToken = Number(formatUnits(bridgedNativeTokenRaw, 18));
    const tokenPrice = await getTokenPrice(orbitChainInformation.parentChainId, 'ethereum');
    const bridgedUsd = bridgedNativeToken * tokenPrice;

    // Adding it to the result object
    return {
      nativeToken: orbitChainInformation.core.nativeToken,
      nativeTokenSymbol: 'ETH',
      bridgedNativeToken,
      bridgedUsd,
      bridge: orbitChainInformation.core.bridge,
    };
  } else {
    //
    // Chains with custom gas token
    //
    const nativeTokenSymbol = await parentChainPublicClient.readContract({
      address: orbitChainInformation.core.nativeToken,
      abi: parseAbi(['function symbol() view returns (string)']),
      functionName: 'symbol',
    });

    const nativeTokenDecimals = await parentChainPublicClient.readContract({
      address: orbitChainInformation.core.nativeToken,
      abi: parseAbi(['function decimals() view returns (uint8)']),
      functionName: 'decimals',
    });

    const bridgedNativeTokenRaw = await parentChainPublicClient.readContract({
      address: orbitChainInformation.core.nativeToken,
      abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
      functionName: 'balanceOf',
      args: [orbitChainInformation.core.bridge],
    });
    const bridgedNativeToken = Number(formatUnits(bridgedNativeTokenRaw, nativeTokenDecimals));
    const tokenPrice = await getTokenPrice(
      orbitChainInformation.parentChainId,
      orbitChainInformation.core.nativeToken,
    );
    const bridgedUsd = bridgedNativeToken * tokenPrice;

    // Adding it to the result object
    return {
      nativeToken: orbitChainInformation.core.nativeToken,
      nativeTokenSymbol,
      bridgedNativeToken,
      bridgedUsd,
      bridge: orbitChainInformation.core.bridge,
    };
  }
};
