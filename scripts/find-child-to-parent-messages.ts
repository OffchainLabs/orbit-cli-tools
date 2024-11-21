import { getChain } from '../src/getChain';
import yargs from 'yargs/yargs';
import {
  createPublicClientForOrbitChain,
  getDefaultChainRpc,
  getChunkSizeByChainId,
} from '../src/utils';
import {
  Address,
  createPublicClient,
  decodeEventLog,
  encodeEventTopics,
  encodeFunctionData,
  GetBlockReturnType,
  http,
  parseAbi,
  PublicClient,
} from 'viem';
import { Outbox__factory } from '@arbitrum/sdk/dist/lib/abi/factories/Outbox__factory';
import { ArbSys__factory } from '@arbitrum/sdk/dist/lib/abi/factories/ArbSys__factory';
import { getParentChainFromId } from '@arbitrum/orbit-sdk/utils';
import { AbiEventItem } from '../src/types';
import { NODE_INTERFACE_ADDRESS } from '@arbitrum/sdk/dist/lib/dataEntities/constants';

//
/////////////////////////
// Types and constants //
/////////////////////////
//
type FindChildToParentMessagesOptions = {
  id?: number;
  rpc?: string;
  rollup?: string;
  transactionHash: string;
};

type L2ToL1TxEventArgs = {
  caller: Address;
  destination: Address;
  hash: bigint;
  position: bigint;
  arbBlockNum: bigint;
  ethBlockNum: bigint;
  timestamp: bigint;
  callvalue: bigint;
  data: `0x${string}`;
};

type SendRootUpdatedEventArgs = {
  outputRoot: `0x${string}`;
  l2BlockHash: `0x${string}`;
};

type ArbitrumTransaction = GetBlockReturnType & {
  sendCount: bigint;
  sendRoot: `0x${string}`;
};

type OutboxProofParameters = {
  send: `0x${string}`;
  root: `0x${string}`;
  proof: readonly `0x${string}`[];
};

//
///////////////////
// Main function //
///////////////////
//
const main = async (options: FindChildToParentMessagesOptions) => {
  // Get chain information
  const orbitChainInformation = await getChain({
    ...options,
    verbose: true,
  });
  if (!orbitChainInformation) {
    throw new Error('Chain was not found');
  }

  // Chain key
  const orbitChainKey =
    orbitChainInformation.parentChainId + '_' + orbitChainInformation.core.rollup;

  // Create client for the chain
  const publicClient = await createPublicClientForOrbitChain(orbitChainKey);
  if (!publicClient) {
    throw new Error(`An RPC for the chain is needed to use this script.`);
  }

  // Create client for the parent chain
  const parentChainInformation = getParentChainFromId(orbitChainInformation.parentChainId);
  const parentChainPublicClient = createPublicClient({
    chain: parentChainInformation,
    transport: http(getDefaultChainRpc(parentChainInformation)),
  }) as PublicClient;

  // Get transaction receipt
  const transactionReceipt = await publicClient.getTransactionReceipt({
    hash: options.transactionHash as `0x${string}`,
  });
  if (!transactionReceipt) {
    throw new Error(`Transaction ${options.transactionHash} was not found on the chain.`);
  }

  // Get the L2ToL1Tx logs
  const l2ToL1TxLogs = transactionReceipt.logs
    .filter(
      (log) =>
        log.topics[0] ==
        encodeEventTopics({
          abi: ArbSys__factory.abi,
          eventName: 'L2ToL1Tx',
        })[0],
    )
    .map((event) =>
      decodeEventLog({
        abi: ArbSys__factory.abi,
        data: event.data,
        topics: event.topics,
      }),
    );

  // Log number of messages found
  console.log(`Found ${l2ToL1TxLogs.length} cross-chain messages`);

  await Promise.all(
    l2ToL1TxLogs.map(async (l2ToL1TxLog) => {
      // Getting the log args
      const l2ToL1TxLogArgs = l2ToL1TxLog.args as unknown as L2ToL1TxEventArgs;

      // Checking if the message was executed on the parent chain
      const isSpent = await parentChainPublicClient.readContract({
        address: orbitChainInformation.core.outbox,
        abi: Outbox__factory.abi,
        functionName: 'isSpent',
        args: [l2ToL1TxLogArgs.position],
      });
      if (isSpent) {
        // TODO: try to find the transaction hash where it was executed
        console.log(
          `Message ${l2ToL1TxLogArgs.position} was executed on the parent chain. Transaction hash is ...`,
        );
        return;
      }

      // Checking if the message can be executed
      // Note: in this case we are just querying the latest `SendRootUpdated` logs in the Outbox contract
      // If for some reason logs can't be found there, we can also use the latestConfirmed assertion to
      // find the last child-chain block processed for that assertion.
      // Source: https://github.com/OffchainLabs/arbitrum-sdk/blob/main/src/lib/message/ChildToParentMessageNitro.ts#L425
      const logs = await parentChainPublicClient.getLogs({
        address: orbitChainInformation.core.outbox,
        event: Outbox__factory.abi.filter(
          (abiItem) => abiItem.name === 'SendRootUpdated',
        )[0] as AbiEventItem,
        fromBlock:
          (await parentChainPublicClient.getBlockNumber()) -
          getChunkSizeByChainId(orbitChainInformation.parentChainId),
      });
      if (logs.length === 0) {
        console.warn(
          `No SendRootUpdated logs found in the Outbox contract of the parent chain. Message ${l2ToL1TxLogArgs.position} is likely to be able to be executed.`,
        );
        return;
      }
      const lastLogArgs = logs[logs.length - 1].args as SendRootUpdatedEventArgs;
      const lastProcessedBlock = (await publicClient.getBlock({
        blockHash: lastLogArgs.l2BlockHash,
      })) as ArbitrumTransaction;

      if (transactionReceipt.blockNumber > lastProcessedBlock.number) {
        console.log(
          `Message ${l2ToL1TxLogArgs.position} can't be executed yet. Its in block ${transactionReceipt.blockNumber} and the last processed block is ${lastProcessedBlock.number}.`,
        );
        return;
      }

      // Message can be executed, so we provide instructions
      console.log(
        `Message ${l2ToL1TxLogArgs.position} can be executed. Use the following parameters to call Outbox.executeTransaction:`,
      );

      // Get the proof
      const outboxProofParameters: OutboxProofParameters = await publicClient
        .readContract({
          address: NODE_INTERFACE_ADDRESS,
          abi: parseAbi([
            'function constructOutboxProof(uint64,uint64) view returns (bytes32,bytes32,bytes32[])',
          ]),
          functionName: 'constructOutboxProof',
          args: [lastProcessedBlock.sendCount, l2ToL1TxLogArgs.position],
        })
        .then(
          ([send, root, proof]): OutboxProofParameters => ({
            send,
            root,
            proof,
          }),
        );

      // Show all parameters needed for the call
      console.log(`Proof: `, outboxProofParameters.proof);
      console.log(`Index: ${l2ToL1TxLogArgs.position}`);
      console.log(`l2Sender: ${transactionReceipt.from}`);
      console.log(`to: ${l2ToL1TxLogArgs.destination}`);
      console.log(`l2Block: ${l2ToL1TxLogArgs.arbBlockNum}`);
      console.log(`l1Block: ${l2ToL1TxLogArgs.ethBlockNum}`);
      console.log(`l2Timestamp: ${l2ToL1TxLogArgs.timestamp}`);
      console.log(`value: ${l2ToL1TxLogArgs.callvalue}`);
      console.log(`data: ${l2ToL1TxLogArgs.data}`);

      // Show the encoded calldata
      const encodedCallData = encodeFunctionData({
        abi: Outbox__factory.abi,
        functionName: 'executeTransaction',
        args: [
          outboxProofParameters.proof,
          l2ToL1TxLogArgs.position,
          transactionReceipt.from,
          l2ToL1TxLogArgs.destination,
          l2ToL1TxLogArgs.arbBlockNum,
          l2ToL1TxLogArgs.ethBlockNum,
          l2ToL1TxLogArgs.timestamp,
          l2ToL1TxLogArgs.callvalue,
          l2ToL1TxLogArgs.data,
        ],
      });
      console.log('');
      console.log('You can also send the following raw calldata to the Outbox contract:');
      console.log(encodedCallData);
    }),
  );
};

//
/////////////////////
// Start execution //
/////////////////////
//
const options = yargs(process.argv.slice(2))
  .options({
    id: { type: 'number' },
    rpc: { type: 'string' },
    rollup: { type: 'string' },
    transactionHash: { type: 'string', demandOption: true, requiresArg: true },
  })
  .check((argv) => {
    if (!argv.rollup && !argv.id && !argv.rpc) {
      throw new Error('At least one of these options needs to be specified: id, rpc, rollup');
    }

    return true;
  })
  .parseSync();

main(options)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
