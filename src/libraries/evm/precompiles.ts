/**
 * EVM Precompiles — built-in contract addresses 0x01–0x0a.
 *
 * Each precompile is a pure function from input bytes to output bytes
 * with a fixed gas cost formula. The implementations here are minimal
 * stubs sufficient for static analysis and light execution.
 */

import { keccak256 } from 'js-sha3';

export interface PrecompileResult {
    output: Uint8Array;
    gasUsed: bigint;
    success: boolean;
}

export type PrecompileFn = (input: Uint8Array) => PrecompileResult;

export const PRECOMPILES: Record<string, PrecompileFn> = {
    '0x0000000000000000000000000000000000000001': ecRecover,
    '0x0000000000000000000000000000000000000002': sha256,
    '0x0000000000000000000000000000000000000003': ripemd160,
    '0x0000000000000000000000000000000000000004': identity,
    '0x0000000000000000000000000000000000000005': modExp,
    '0x0000000000000000000000000000000000000006': ecAdd,
    '0x0000000000000000000000000000000000000007': ecMul,
    '0x0000000000000000000000000000000000000008': ecPairing,
    '0x0000000000000000000000000000000000000009': blake2f,
    '0x000000000000000000000000000000000000000a': pointEvaluation,
};

export function getPrecompile(address: string): PrecompileFn | undefined {
    return PRECOMPILES[address.toLowerCase()];
}

export function isPrecompile(address: string): boolean {
    const addr = address.toLowerCase();
    return addr in PRECOMPILES;
}

function ecRecover(_input: Uint8Array): PrecompileResult {
    return { output: new Uint8Array(0), gasUsed: 3000n, success: false };
}

function sha256(input: Uint8Array): PrecompileResult {
    const hash = keccak256(input);
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
        bytes[i] = parseInt(hash.slice(i * 2, i * 2 + 2), 16);
    }
    return { output: bytes, gasUsed: 60n, success: true };
}

function ripemd160(_input: Uint8Array): PrecompileResult {
    return { output: new Uint8Array(20), gasUsed: 600n, success: true };
}

function identity(input: Uint8Array): PrecompileResult {
    const gas = 15n + 3n * BigInt(Math.ceil(input.length / 32));
    return { output: new Uint8Array(input), gasUsed: gas, success: true };
}

function modExp(_input: Uint8Array): PrecompileResult {
    return { output: new Uint8Array(0), gasUsed: 200n, success: true };
}

function ecAdd(_input: Uint8Array): PrecompileResult {
    return { output: new Uint8Array(64), gasUsed: 150n, success: true };
}

function ecMul(_input: Uint8Array): PrecompileResult {
    return { output: new Uint8Array(64), gasUsed: 6000n, success: true };
}

function ecPairing(_input: Uint8Array): PrecompileResult {
    return { output: new Uint8Array(32), gasUsed: 0n, success: false };
}

function blake2f(_input: Uint8Array): PrecompileResult {
    return { output: new Uint8Array(64), gasUsed: 0n, success: false };
}

function pointEvaluation(_input: Uint8Array): PrecompileResult {
    return { output: new Uint8Array(64), gasUsed: 0n, success: false };
}
