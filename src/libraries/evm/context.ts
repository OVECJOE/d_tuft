/**
 * EVM execution context — block, transaction, and call-level state.
 *
 * Provides the environmental data that opcodes read from (BLOCKHASH,
 * COINBASE, TIMESTAMP, NUMBER, etc.) and the call context (caller,
 * value, calldata, code).
 */

export interface BlockContext {
    coinbase: string;
    timestamp: bigint;
    number: bigint;
    prevrandao: bigint;
    gasLimit: bigint;
    chainId: bigint;
    baseFee: bigint;
    blobBaseFee: bigint;
    blockHash: (n: bigint) => string;
}

export interface TxContext {
    gasPrice: bigint;
    origin: string;
    blobHashes: string[];
}

export interface CallContext {
    caller: string;
    address: string;
    value: bigint;
    calldata: Uint8Array;
    code: Uint8Array;
    depth: number;
    kind: CallKind;
}

export type CallKind = 'call' | 'delegatecall' | 'staticcall' | 'create' | 'create2';

export const DEFAULT_BLOCK: BlockContext = {
    coinbase: '0x0000000000000000000000000000000000000000',
    timestamp: BigInt(Math.floor(Date.now() / 1000)),
    number: 1n,
    prevrandao: 0n,
    gasLimit: 30_000_000n,
    chainId: 1n,
    baseFee: 1_000_000_000n,
    blobBaseFee: 1_000_000_000n,
    blockHash: () => '0x' + '00'.repeat(32),
};

export const DEFAULT_TX: TxContext = {
    gasPrice: 1_000_000_000n,
    origin: '0x0000000000000000000000000000000000000000',
    blobHashes: [],
};

export function defaultCallContext(code: Uint8Array): CallContext {
    return {
        caller: '0x0000000000000000000000000000000000000000',
        address: '0x0000000000000000000000000000000000000000',
        value: 0n,
        calldata: new Uint8Array(),
        code,
        depth: 0,
        kind: 'call',
    };
}
