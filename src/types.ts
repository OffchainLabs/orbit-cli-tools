import { CoreContracts } from '@arbitrum/orbit-sdk';
import { Address } from 'viem';

export type AbiEventItem = {
  inputs: { indexed: boolean; internalType: string; name: string; type: string }[];
  name: string;
  type: 'event';
};

export type OrbitChainInformation = {
  id: number;
  name: string;
  rpc: string;
  parentChainId: number;
  parentChainRpc: string;
  explorerUrl: string;
  parentChainExplorerUrl: string;
  core: CoreContractsWithCreator;
  tokenBridge: TokenBridgeContractsWithCreators;
};

export type CoreContractsWithCreator = CoreContracts & {
  rollupCreator: Address;
};

// This should come from the Orbit SDK, but it is not exported right now.
// Once we export that type, we should remove this one and grab it from there.
export type TokenBridgeContractsWithCreators = {
  parentChainContracts: {
    tokenBridgeCreator: Address;
    router: Address;
    standardGateway: Address;
    customGateway: Address;
    wethGateway: Address;
    weth: Address;
    multicall: Address;
  };
  orbitChainContracts: {
    tokenBridgeCreator: Address;
    router: Address;
    standardGateway: Address;
    customGateway: Address;
    wethGateway: Address;
    weth: Address;
    proxyAdmin: Address;
    beaconProxyFactory: Address;
    upgradeExecutor: Address;
    multicall: Address;
  };
};
