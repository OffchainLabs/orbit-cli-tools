import { getChain } from '../src/getChain';
import yargs from 'yargs/yargs';
import { createPublicClientForOrbitChain, getDefaultChainRpc } from '../src/utils';
import {
  concat,
  createPublicClient,
  decodeAbiParameters,
  decodeEventLog,
  encodeEventTopics,
  getAddress,
  http,
  keccak256,
  pad,
  PublicClient,
  toHex,
  toRlp,
  trim,
} from 'viem';
import { Inbox__factory } from '@arbitrum/sdk/dist/lib/abi/factories/Inbox__factory';
import { Bridge__factory } from '@arbitrum/sdk/dist/lib/abi/factories/Bridge__factory';
import { ArbRetryableTx__factory } from '@arbitrum/sdk/dist/lib/abi/factories/ArbRetryableTx__factory';
import { getParentChainFromId } from '@arbitrum/orbit-sdk/utils';


//
/////////////////////////
// Types and constants //
/////////////////////////
//
type FindRetryableTicketsOptions = {
  id?: number;
  rpc?: string;
  rollup?: string;
  transactionHash: string;
};

type InboxMessageDeliveredEventArgs = {
  messageNum: bigint;
  data: `0x${string}`;
};

type BridgeMessageDeliveredEventArgs = {
  messageIndex: bigint;
  beforeInboxAcc: `0x${string}`;
  inbox: `0x${string}`;
  kind: number;
  sender: `0x${string}`;
  messageDataHash: `0x${string}`;
  baseFeeL1: bigint;
  timestamp: bigint;
};

type RedeemScheduledEventArgs = {
  ticketId: `0x${string}`;
  retryTxHash: `0x${string}`;
  sequenceNum: bigint;
  donatedGas: bigint;
  gasDonor: `0x${string}`;
  maxRefund: bigint;
  submissionFeeRefund: bigint;
};


//
///////////////////////////////////////////////////////
// Helper functions for retryable tickets (kind = 9) //
///////////////////////////////////////////////////////
//
const processRetryableTicket = async (
  inboxMessageDeliveredLogArgs: InboxMessageDeliveredEventArgs,
  bridgeMessageDeliveredLogArgs: BridgeMessageDeliveredEventArgs,
  chainId: number,
  publicClient?: PublicClient,
) => {
  // Parse the message data
  const messageData = parseMessageDataForRetryableTicket(inboxMessageDeliveredLogArgs.data);

  // Calculate the transaction hash that creates the retryable in the Orbit chain
  const createRetryableTransactionHash = calculateCreateRetryableTransactionHash({
    orbitChainId: chainId,
    fromAddress: bridgeMessageDeliveredLogArgs.sender,
    messageNumber: bridgeMessageDeliveredLogArgs.messageIndex,
    baseFee: bridgeMessageDeliveredLogArgs.baseFeeL1,
    destAddress: messageData.destAddress,
    orbitChainCallValue: messageData.orbitChainCallValue,
    callValue: messageData.callValue,
    maxSubmissionFee: messageData.maxSubmissionFee,
    excessFeeRefundAddress: messageData.excessFeeRefundAddress,
    callValueRefundAddress: messageData.callValueRefundAddress,
    gasLimit: messageData.gasLimit,
    maxFeePerGas: messageData.maxFeePerGas,
    data: messageData.data,
  });

  console.log(`Hash: ${createRetryableTransactionHash}`);

  if (!publicClient) {
    console.error(`The specified chain ${chainId} does not have an RPC available.`);
    return;
  }

  // Get the receipt of that hash
  const createRetryableTransactionReceipt = await publicClient.getTransactionReceipt({
    hash: createRetryableTransactionHash,
  });
  if (!createRetryableTransactionReceipt) {
    console.warn(
      `SubmitRetryable transaction was not found on the orbit chain: ${createRetryableTransactionHash}`,
    );
    return;
  }

  // Transaction reverted
  if (createRetryableTransactionReceipt.status != 'success') {
    console.warn(
      `SubmitRetryable transaction reverted on the orbit chain: ${createRetryableTransactionHash}`,
    );
    return;
  }

  // Find RedeemScheduled events in that receipt
  const redeemScheduledLog = createRetryableTransactionReceipt.logs.filter(
    (log) =>
      log.topics[0] ==
      encodeEventTopics({
        abi: ArbRetryableTx__factory.abi,
        eventName: 'RedeemScheduled',
      })[0],
  )[0];

  if (!redeemScheduledLog) {
    console.warn(
      `Retryable ticket was not auto-redeemed on the orbit chain: ${createRetryableTransactionHash}`,
    );
    return;
  }

  // Find Retryable execution transaction
  const redeemScheduledLogArgs = decodeEventLog({
    abi: ArbRetryableTx__factory.abi,
    data: redeemScheduledLog.data,
    topics: redeemScheduledLog.topics,
  }).args as unknown as RedeemScheduledEventArgs;
  const executeRetryableTransactionReceipt = await publicClient.getTransactionReceipt({
    hash: redeemScheduledLogArgs.retryTxHash,
  });

  if (!executeRetryableTransactionReceipt) {
    console.warn(
      `Retryable ticket failed execution on the orbit chain: ${redeemScheduledLogArgs.retryTxHash}`,
    );
    return;
  }

  // Transaction reverted
  if (executeRetryableTransactionReceipt.status != 'success') {
    console.warn(
      `Retryable ticket failed execution on the orbit chain: ${redeemScheduledLogArgs.retryTxHash}`,
    );
    return;
  }

  // Retryable was auto-redeemed
  console.log(
    `Retryable ticket was auto-redeemed on the orbit chain: ${redeemScheduledLogArgs.retryTxHash}`,
  );
};

const parseMessageDataForRetryableTicket = (rawMessageData: `0x${string}`) => {
  const messageDataParsed = decodeAbiParameters(
    [
      { name: 'destAddress', type: 'uint256' },
      { name: 'orbitChainCallValue', type: 'uint256' },
      { name: 'callValue', type: 'uint256' },
      { name: 'maxSubmissionFee', type: 'uint256' },
      { name: 'excessFeeRefundAddress', type: 'uint256' },
      { name: 'callValueRefundAddress', type: 'uint256' },
      { name: 'gasLimit', type: 'uint256' },
      { name: 'maxFeePerGas', type: 'uint256' },
      { name: 'callDataLength', type: 'uint256' },
    ],
    rawMessageData,
  );

  const messageData = {
    destAddress: getAddress(pad(toHex(messageDataParsed[0]), { size: 20 })),
    orbitChainCallValue: messageDataParsed[1],
    callValue: messageDataParsed[2],
    maxSubmissionFee: messageDataParsed[3],
    excessFeeRefundAddress: getAddress(pad(toHex(messageDataParsed[4]), { size: 20 })),
    callValueRefundAddress: getAddress(pad(toHex(messageDataParsed[5]), { size: 20 })),
    gasLimit: messageDataParsed[6],
    maxFeePerGas: messageDataParsed[7],
    callDataLength: messageDataParsed[8],
    data: ('0x' +
      rawMessageData.substring(
        rawMessageData.length - Number(messageDataParsed[8] * 2n),
      )) as `0x${string}`,
  };

  return messageData;
};

const calculateCreateRetryableTransactionHash = (retryableInformation: {
  orbitChainId: number;
  fromAddress: `0x${string}`;
  messageNumber: bigint;
  baseFee: bigint;
  destAddress: `0x${string}`;
  orbitChainCallValue: bigint;
  callValue: bigint;
  maxSubmissionFee: bigint;
  excessFeeRefundAddress: `0x${string}`;
  callValueRefundAddress: `0x${string}`;
  gasLimit: bigint;
  maxFeePerGas: bigint;
  data: `0x${string}`;
}) => {
  const formatNumber = (value: bigint) => {
    return trim(toHex(value));
  };
  const fields = [
    formatNumber(BigInt(retryableInformation.orbitChainId)),
    pad(formatNumber(retryableInformation.messageNumber), { size: 32 }),
    retryableInformation.fromAddress,
    formatNumber(retryableInformation.baseFee),
    formatNumber(retryableInformation.callValue),
    formatNumber(retryableInformation.maxFeePerGas),
    formatNumber(retryableInformation.gasLimit),
    retryableInformation.destAddress,
    formatNumber(retryableInformation.orbitChainCallValue),
    retryableInformation.callValueRefundAddress,
    formatNumber(retryableInformation.maxSubmissionFee),
    retryableInformation.excessFeeRefundAddress,
    retryableInformation.data,
  ];

  // All fields need to be transformed into byte arrays
  const byteArrayFields = fields.map((field) =>
    Number(field) == 0 ? new Uint8Array() : new Uint8Array(Buffer.from(field.substring(2), 'hex')),
  );

  // Arbitrum submit retryable transactions have type 0x69
  const rlpEnc = concat(['0x69', toRlp(byteArrayFields)]);
  return keccak256(rlpEnc);
};


//
///////////////////////////////////////////////
// Helper functions for deposits (kind = 12) //
///////////////////////////////////////////////
//
const processDeposit = async (
  inboxMessageDeliveredLogArgs: InboxMessageDeliveredEventArgs,
  bridgeMessageDeliveredLogArgs: BridgeMessageDeliveredEventArgs,
  chainId: number,
  publicClient?: PublicClient,
) => {
  // Parse the message data
  const messageData = parseMessageDataForDeposit(inboxMessageDeliveredLogArgs.data);

  // Calculate the transaction hash that creates the deposit transaction in the Orbit chain
  const depositTransactionHash = calculateDepositTransactionHash({
    orbitChainId: chainId,
    messageNumber: bridgeMessageDeliveredLogArgs.messageIndex,
    fromAddress: bridgeMessageDeliveredLogArgs.sender,
    destAddress: messageData.destAddress,
    callValue: messageData.callValue,
  });

  console.log(`Deposit transcation hash: ${depositTransactionHash}`);

  if (!publicClient) {
    console.error(`The specified chain ${chainId} does not have an RPC available.`);
    return;
  }

  // Get the receipt of that hash
  const depositTransactionReceipt = await publicClient.getTransactionReceipt({
    hash: depositTransactionHash,
  });
  if (!depositTransactionReceipt) {
    console.warn(`Deposit transaction was not found on the orbit chain: ${depositTransactionHash}`);
    return;
  }

  // Transaction reverted
  if (depositTransactionReceipt.status != 'success') {
    console.warn(`Deposit transaction reverted on the orbit chain: ${depositTransactionHash}`);
    return;
  }

  // Deposit was executed
  console.log(`Deposit was executed on the orbit chain: ${depositTransactionHash}`);
};

const parseMessageDataForDeposit = (rawMessageData: `0x${string}`) => {
  // Hardcode parsing
  const addressStringSize = 2 + 20 * 2;
  const destinationAddressRaw = '0x' + rawMessageData.substring(2, addressStringSize);
  const callValueRaw = '0x' + rawMessageData.substring(addressStringSize);

  const messageData = {
    destAddress: getAddress(destinationAddressRaw),
    callValue: BigInt(callValueRaw),
  };

  return messageData;
};

const calculateDepositTransactionHash = (depositInformation: {
  orbitChainId: number;
  messageNumber: bigint;
  fromAddress: `0x${string}`;
  destAddress: `0x${string}`;
  callValue: bigint;
}) => {
  const formatNumber = (value: bigint) => {
    return trim(toHex(value));
  };
  const fields = [
    formatNumber(BigInt(depositInformation.orbitChainId)),
    pad(formatNumber(depositInformation.messageNumber), { size: 32 }),
    depositInformation.fromAddress,
    depositInformation.destAddress,
    formatNumber(depositInformation.callValue),
  ];

  // All fields need to be transformed into byte arrays
  const byteArrayFields = fields.map((field) =>
    Number(field) == 0 ? new Uint8Array() : new Uint8Array(Buffer.from(field.substring(2), 'hex')),
  );

  // Arbitrum deposit transactions have type 0x64
  const rlpEnc = concat(['0x64', toRlp(byteArrayFields)]);
  return keccak256(rlpEnc);
};


//
///////////////////
// Main function //
///////////////////
//
const main = async (options: FindRetryableTicketsOptions) => {
  // Get chain information
  const orbitChainInformation = await getChain({
    ...options,
    verbose: true,
  });
  if (!orbitChainInformation) {
    throw new Error('Chain was not found');
  }

  // Create client for the parent chain
  const parentChainInformation = getParentChainFromId(orbitChainInformation.parentChainId);
  const parentChainPublicClient = createPublicClient({
    chain: parentChainInformation,
    transport: http(getDefaultChainRpc(parentChainInformation)),
  }) as PublicClient;

  // Chain key
  const orbitChainKey =
    orbitChainInformation.parentChainId + '_' + orbitChainInformation.core.rollup;

  // Checking RPC existence and create public client for the orbit chain if possible
  const publicClient = orbitChainInformation.rpc
    ? await createPublicClientForOrbitChain(orbitChainKey)
    : undefined;

  // Get transaction receipt
  const transactionReceipt = await parentChainPublicClient.getTransactionReceipt({
    hash: options.transactionHash as `0x${string}`,
  });
  if (!transactionReceipt) {
    throw new Error(`Transaction ${options.transactionHash} was not found on parent chain.`);
  }

  // Get the InboxMessageDelivered and MessageDelivered logs
  const inboxMessageDeliveredLogs = transactionReceipt.logs
    .filter(
      (log) =>
        log.topics[0] ==
        encodeEventTopics({
          abi: Inbox__factory.abi,
          eventName: 'InboxMessageDelivered',
        })[0],
    )
    .map((event) =>
      decodeEventLog({
        abi: Inbox__factory.abi,
        data: event.data,
        topics: event.topics,
      }),
    );
  const messageDeliveredLogs = transactionReceipt.logs
    .filter(
      (log) =>
        log.topics[0] ==
        encodeEventTopics({
          abi: Bridge__factory.abi,
          eventName: 'MessageDelivered',
        })[0],
    )
    .map((event) =>
      decodeEventLog({
        abi: Bridge__factory.abi,
        data: event.data,
        topics: event.topics,
      }),
    );

  // Log number of messages found
  console.log(`Found ${inboxMessageDeliveredLogs.length} cross-chain messages`);

  await Promise.all(
    inboxMessageDeliveredLogs.map(async (inboxMessageDeliveredLog) => {
      // Getting the log args
      const inboxMessageDeliveredLogArgs =
        inboxMessageDeliveredLog.args as unknown as InboxMessageDeliveredEventArgs;

      // Finding the corresponding MessageDelivered event
      const bridgeMessageDeliveredLogArgs = messageDeliveredLogs.filter(
        (event) =>
          (event.args as unknown as BridgeMessageDeliveredEventArgs).messageIndex ==
          inboxMessageDeliveredLogArgs.messageNum,
      )[0].args as unknown as BridgeMessageDeliveredEventArgs;

      switch (bridgeMessageDeliveredLogArgs.kind) {
        // Retryable ticket
        case 9:
          await processRetryableTicket(
            inboxMessageDeliveredLogArgs,
            bridgeMessageDeliveredLogArgs,
            orbitChainInformation.id,
            publicClient,
          );
          break;

        case 12:
          await processDeposit(
            inboxMessageDeliveredLogArgs,
            bridgeMessageDeliveredLogArgs,
            orbitChainInformation.id,
            publicClient,
          );
          break;

        default:
          console.log(`Unprocessed message kind ${bridgeMessageDeliveredLogArgs.kind}`);
          break;
      }
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
