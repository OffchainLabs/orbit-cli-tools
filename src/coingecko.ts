import { Address } from 'viem';
import dotenv from 'dotenv';
import { coingeckoApiMaxAttempts, coingeckoSecondsBetweenAttempts } from './constants';
import { sleep } from './utils';
dotenv.config();

export const getTokenPrice = async (parentChainId: number, address: Address | 'ethereum') => {
  if (!process.env.COINGECKO_DEMO_API_KEY) {
    console.warn(`COINGECKO_DEMO_API_KEY env variable is needed to obtain coin prices.`);
    return 0;
  }

  // Obtaining the network id for Coingecko
  let networkId = '';
  switch (parentChainId) {
    case 1:
      networkId = 'ethereum';
      break;
    case 42161:
      networkId = 'arbitrum-one';
      break;
    case 42170:
      networkId = 'arbitrum-nova';
      break;
    case 8453:
      networkId = 'base';
      break;
  }
  if (networkId === '') {
    throw new Error(`Chain ${parentChainId} not recognized.`);
  }

  // URL to fetch
  // (https://docs.coingecko.com/v3.0.1/reference/simple-token-price)
  const apiEndpoint = address === 'ethereum' ? 'price' : `token_price/${networkId}`;
  const tokenParameter = address === 'ethereum' ? 'ids' : 'contract_addresses';
  const tokenAddress = address.toLowerCase();
  const url = `https://api.coingecko.com/api/v3/simple/${apiEndpoint}?${tokenParameter}=${tokenAddress}&vs_currencies=usd&x_cg_demo_api_key=${process.env.COINGECKO_DEMO_API_KEY}`;

  // Querying API
  let result = undefined;
  let attempts = 0;
  while (attempts < coingeckoApiMaxAttempts) {
    try {
      const response = await fetch(url);
      result = await response.json();
      break;
    } catch (error) {
      attempts++;

      if (attempts >= coingeckoApiMaxAttempts) {
        console.error(`Failed to get logs after ${coingeckoApiMaxAttempts} attempts:`, error);
        throw error;
      }

      console.warn(`Attempt ${attempts} failed. Retrying...`);
      await sleep(1000 * (attempts + coingeckoSecondsBetweenAttempts));
    }
  }

  // Error checking
  if (!result) {
    console.log(`No data found on ${parentChainId} for coin ${address}`);
    return 0;
  }
  if (!result[tokenAddress]) {
    console.log(`No token data found on ${parentChainId} for coin ${address}`);
    return 0;
  }
  if (!result[tokenAddress].usd) {
    console.log(`No usd price found on ${parentChainId} for coin ${address}`);
    return 0;
  }

  return result[tokenAddress].usd;
};
