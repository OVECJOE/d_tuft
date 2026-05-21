/**
 * Lightweight EVM — static-analysis-first execution engine.
 *
 * This is NOT a full consensus-compliant EVM. It is designed for:
 *   - Static analysis and symbolic execution scaffolding
 *   - Bytecode-level auditing and diffing with execution traces
 *   - Gas estimation with dynamic cost modelling
 *   - Vulnerability pattern detection
 *
 * It executes opcodes, tracks stack/memory/storage state, and produces
 * detailed execution traces. It does NOT model:
 *   - Full precompile implementations (stubs only)
 *   - External contract calls (returns default values)
 *   - CREATE / CREATE2 state changes
 *   - Gas refunds (post-London)
 *   - Transient storage (EIP-1153) — basic support only
 *
 * Usage:
 *   const evm = new Evm(bytecode, { block, tx });
 *   const result = evm.run();
 *   console.log(result.trace); // per-instruction trace
 *   console.log(result.gasUsed);
 */

import { keccak256 } from 'js-sha3';
import { disassemble } from '../../core/parser';
import type { Instruction } from '../../core/types';
import { bytesToHex, hexToBytes } from '../../utils/hex';
import {
    type BlockContext,
    type CallContext,
    DEFAULT_BLOCK,
    DEFAULT_TX,
    defaultCallContext,
    type TxContext,
} from './context';
import { EvmMemory } from './memory';
import { getPrecompile, isPrecompile } from './precompiles';
import { EvmStorage } from './storage';

const MAX_CODE_SIZE = 24576;
const MAX_STACK_DEPTH = 1024;

export interface EvmOptions {
    block?: Partial<BlockContext>;
    tx?: Partial<TxContext>;
    call?: Partial<CallContext>;
    gasLimit?: bigint;
}

export interface EvmResult {
    success: boolean;
    returnValue: Uint8Array;
    gasUsed: bigint;
    gasRemaining: bigint;
    trace: ExecutionTraceEntry[];
    logs: LogEntry[];
    error?: string;
}

export interface ExecutionTraceEntry {
    pc: number;
    opcode: string;
    immediate?: string;
    stackBefore: bigint[];
    stackAfter: bigint[];
    memorySize: number;
    gasRemaining: bigint;
    gasCost: bigint;
    depth: number;
}

export interface LogEntry {
    address: string;
    topics: bigint[];
    data: Uint8Array;
}

export class Evm {
    private readonly stack: bigint[] = [];
    private readonly memory = new EvmMemory();
    private readonly storage = new EvmStorage();
    private readonly transientStorage = new Map<string, bigint>();
    private readonly logs: LogEntry[] = [];
    private readonly trace: ExecutionTraceEntry[] = [];
    private readonly instructions: Instruction[];
    private readonly pcIndex: Map<number, number>;
    private readonly block: BlockContext;
    private readonly tx: TxContext;
    private readonly call: CallContext;
    private readonly gasLimit: bigint;
    private gasRemaining: bigint;
    private pc = 0;
    private halted = false;
    private returnData: Uint8Array = new Uint8Array();
    private error?: string;

    constructor(bytecode: Uint8Array | string, options: EvmOptions = {}) {
        const code = typeof bytecode === 'string' ? hexToBytes(bytecode) : bytecode;
        this.instructions = disassemble(code).instructions;
        this.pcIndex = new Map();
        for (let i = 0; i < this.instructions.length; i++) {
            this.pcIndex.set(this.instructions[i]!.pc, i);
        }

        this.block = { ...DEFAULT_BLOCK, ...options.block };
        this.tx = { ...DEFAULT_TX, ...options.tx };
        this.call = { ...defaultCallContext(code), ...options.call };
        this.gasLimit = options.gasLimit ?? 30_000_000n;
        this.gasRemaining = this.gasLimit;
    }

    get storageState(): Map<string, bigint> {
        return this.storage.dump();
    }

    get memoryDump(): string {
        return this.memory.dump(0, this.memory.activeSize);
    }

    run(): EvmResult {
        while (!this.halted && this.gasRemaining > 0n) {
            const idx = this.pcIndex.get(this.pc);
            if (idx === undefined) {
                this.halted = true;
                break;
            }

            const instr = this.instructions[idx]!;
            const ok = this.execute(instr);
            if (!ok) break;
        }

        return {
            success: this.halted && !this.error,
            returnValue: this.returnData,
            gasUsed: this.gasLimit - this.gasRemaining,
            gasRemaining: this.gasRemaining,
            trace: [...this.trace],
            logs: [...this.logs],
            error: this.error,
        };
    }

    step(): boolean {
        if (this.halted || this.gasRemaining <= 0n) return false;

        const idx = this.pcIndex.get(this.pc);
        if (idx === undefined) {
            this.halted = true;
            return false;
        }

        return this.execute(this.instructions[idx]!);
    }

    private execute(instr: Instruction): boolean {
        const op = instr.opcode.value;
        const stackBefore = [...this.stack];
        const gasCost = this.computeGasCost(instr);

        if (gasCost > this.gasRemaining) {
            this.halt('Out of gas');
            return false;
        }

        this.gasRemaining -= gasCost;

        const ok = this.dispatch(instr);

        const stackAfter = [...this.stack];
        this.trace.push({
            pc: instr.pc,
            opcode: instr.opcode.mnemonic,
            immediate: instr.immediate ? bytesToHex(instr.immediate) : undefined,
            stackBefore,
            stackAfter,
            memorySize: this.memory.activeSize,
            gasRemaining: this.gasRemaining,
            gasCost,
            depth: this.call.depth,
        });

        return ok;
    }

    private computeGasCost(instr: Instruction): bigint {
        const base = BigInt(instr.opcode.gas);

        switch (instr.opcode.mnemonic) {
            case 'KECCAK256': {
                const size = Number(this.stack[this.stack.length - 2] ?? 0n);
                const memGas = BigInt(this.memory.expand(Number(this.stack[this.stack.length - 1] ?? 0n) + size));
                return base + memGas + BigInt(Math.ceil(size / 32)) * 6n;
            }
            case 'SLOAD': {
                const key = this.stack[this.stack.length - 1] ?? 0n;
                const { cold } = this.storage.get(key);
                return cold ? 2100n : 100n;
            }
            case 'SSTORE': {
                const key = this.stack[this.stack.length - 1] ?? 0n;
                const { cold } = this.storage.get(key);
                return cold ? 22100n : 2900n;
            }
            case 'MLOAD':
            case 'MSTORE':
            case 'MSTORE8': {
                const offset = Number(this.stack[this.stack.length - 1] ?? 0n);
                const size = instr.opcode.mnemonic === 'MSTORE8' ? 1 : 32;
                return base + BigInt(this.memory.expand(offset + size));
            }
            case 'MCOPY': {
                const size = Number(this.stack[this.stack.length - 1] ?? 0n);
                const memGas = BigInt(
                    this.memory.expand(
                        Math.max(
                            Number(this.stack[this.stack.length - 3] ?? 0n) + size,
                            Number(this.stack[this.stack.length - 2] ?? 0n) + size,
                        ),
                    ),
                );
                return base + memGas + BigInt(Math.ceil(size / 32)) * 3n;
            }
            case 'LOG0':
            case 'LOG1':
            case 'LOG2':
            case 'LOG3':
            case 'LOG4': {
                const size = Number(this.stack[this.stack.length - 2] ?? 0n);
                const topics = parseInt(instr.opcode.mnemonic.slice(3), 10) || 0;
                return (
                    base +
                    BigInt(this.memory.expand(Number(this.stack[this.stack.length - 1] ?? 0n) + size)) +
                    BigInt(topics) * 375n +
                    BigInt(size) * 8n
                );
            }
            case 'CALL':
            case 'DELEGATECALL':
            case 'STATICCALL':
            case 'CALLCODE': {
                const retOffset =
                    instr.opcode.mnemonic === 'DELEGATECALL'
                        ? Number(this.stack[this.stack.length - 4] ?? 0n)
                        : Number(this.stack[this.stack.length - 5] ?? 0n);
                const retSize =
                    instr.opcode.mnemonic === 'DELEGATECALL'
                        ? Number(this.stack[this.stack.length - 3] ?? 0n)
                        : Number(this.stack[this.stack.length - 4] ?? 0n);
                return base + BigInt(this.memory.expand(retOffset + retSize));
            }
            case 'EXTCODECOPY': {
                const memOffset = Number(this.stack[this.stack.length - 2] ?? 0n);
                const size = Number(this.stack[this.stack.length - 1] ?? 0n);
                return base + BigInt(this.memory.expand(memOffset + size));
            }
            case 'CODECOPY':
            case 'CALLDATACOPY':
            case 'RETURNDATACOPY': {
                const memOffset = Number(this.stack[this.stack.length - 1] ?? 0n);
                const size = Number(this.stack[this.stack.length - 3] ?? 0n);
                return base + BigInt(this.memory.expand(memOffset + size));
            }
            case 'EXP': {
                const exponent = this.stack[this.stack.length - 2] ?? 0n;
                const byteLen = exponent === 0n ? 0n : BigInt(exponent.toString(2).length + 7) / 8n;
                return base + byteLen * 50n;
            }
            default:
                return base;
        }
    }

    private dispatch(instr: Instruction): boolean {
        const op = instr.opcode.value;

        switch (op) {
            case 0x00:
                this.halt(null);
                break;
            case 0x01:
                this.push(this.pop() + this.pop());
                break;
            case 0x02:
                this.push(this.pop() * this.pop());
                break;
            case 0x03: {
                const b = this.pop();
                this.push(this.pop() - b);
                break;
            }
            case 0x04: {
                const b = this.pop();
                this.push(b === 0n ? 0n : this.pop() / b);
                break;
            }
            case 0x05: {
                const b = toSigned(this.pop());
                this.push(b === 0n ? 0n : toSigned(this.pop()) / b);
                break;
            }
            case 0x06: {
                const b = this.pop();
                this.push(b === 0n ? 0n : this.pop() % b);
                break;
            }
            case 0x07: {
                const b = toSigned(this.pop());
                this.push(b === 0n ? 0n : toSigned(this.pop()) % b);
                break;
            }
            case 0x08: {
                const c = this.pop();
                const a = this.pop();
                const b = this.pop();
                this.push(c === 0n ? 0n : (a + b) % c);
                break;
            }
            case 0x09: {
                const c = this.pop();
                const a = this.pop();
                const b = this.pop();
                this.push(c === 0n ? 0n : (a * b) % c);
                break;
            }
            case 0x0a:
                this.push(pow256(this.pop(), this.pop()));
                break;
            case 0x0b:
                this.push(signExtend(this.pop(), this.pop()));
                break;

            case 0x10: {
                const b = this.pop();
                this.push(bool(this.pop() < b));
                break;
            }
            case 0x11: {
                const b = this.pop();
                this.push(bool(this.pop() > b));
                break;
            }
            case 0x12: {
                const b = this.pop();
                this.push(bool(toSigned(this.pop()) < toSigned(b)));
                break;
            }
            case 0x13: {
                const b = this.pop();
                this.push(bool(toSigned(this.pop()) > toSigned(b)));
                break;
            }
            case 0x14: {
                // biome-ignore lint/suspicious/noSelfCompare: EQ pops two stack values and compares them
                this.push(bool(this.pop() === this.pop()));
                break;
            }
            case 0x15:
                this.push(bool(this.pop() === 0n));
                break;
            case 0x16:
                this.push(this.pop() & this.pop());
                break;
            case 0x17:
                this.push(this.pop() | this.pop());
                break;
            case 0x18:
                this.push(this.pop() ^ this.pop());
                break;
            case 0x19:
                this.push(~this.pop() & MASK256);
                break;
            case 0x1a:
                this.push(getByte(this.pop(), this.pop()));
                break;
            case 0x1b:
                this.push(shl256(this.pop(), this.pop()));
                break;
            case 0x1c:
                this.push(this.pop() >> (this.pop() & 0xffn));
                break;
            case 0x1d:
                this.push(sar256(this.pop(), this.pop()));
                break;
            case 0x1e:
                this.push(clz256(this.pop()));
                break;

            case 0x20: {
                const size = Number(this.pop());
                const offset = Number(this.pop());
                const data = this.memory.loadBytes(offset, size);
                this.push(BigInt(`0x${keccak256(data)}`));
                break;
            }

            case 0x30:
                this.push(BigInt(`0x${this.call.address.slice(2).padStart(40, '0')}`));
                break;
            case 0x31:
                this.push(0n);
                break;
            case 0x32:
                this.push(BigInt(`0x${this.tx.origin.slice(2).padStart(40, '0')}`));
                break;
            case 0x33:
                this.push(BigInt(`0x${this.call.caller.slice(2).padStart(40, '0')}`));
                break;
            case 0x34:
                this.push(this.call.value);
                break;
            case 0x35:
                this.push(this.loadCalldataWord(this.pop()));
                break;
            case 0x36:
                this.push(BigInt(this.call.calldata.length));
                break;
            case 0x37:
                this.copyCalldataToMemory();
                break;
            case 0x38:
                this.push(BigInt(this.call.code.length));
                break;
            case 0x39:
                this.copyCodeToMemory();
                break;
            case 0x3a:
                this.push(this.tx.gasPrice);
                break;
            case 0x3b:
                this.push(0n);
                break;
            case 0x3c:
                break;
            case 0x3d:
                this.push(BigInt(this.returnData.length));
                break;
            case 0x3e:
                this.copyReturnDataToMemory();
                break;
            case 0x3f:
                this.push(0n);
                break;

            case 0x40:
                this.push(0n);
                break;
            case 0x41:
                this.push(BigInt(`0x${this.block.coinbase.slice(2).padStart(40, '0')}`));
                break;
            case 0x42:
                this.push(this.block.timestamp);
                break;
            case 0x43:
                this.push(this.block.number);
                break;
            case 0x44:
                this.push(this.block.prevrandao);
                break;
            case 0x45:
                this.push(this.block.gasLimit);
                break;
            case 0x46:
                this.push(this.block.chainId);
                break;
            case 0x47:
                this.push(0n);
                break;
            case 0x48:
                this.push(this.block.baseFee);
                break;
            case 0x49:
                this.push(0n);
                break;
            case 0x4a:
                this.push(this.block.blobBaseFee);
                break;

            case 0x50:
                this.pop();
                break;
            case 0x51:
                this.push(this.memory.load(Number(this.pop())));
                break;
            case 0x52:
                this.memory.store(Number(this.pop()), this.pop());
                break;
            case 0x53:
                this.memory.storeBytes(Number(this.pop()), new Uint8Array([Number(this.pop() & 0xffn)]));
                break;
            case 0x54: {
                const { value } = this.storage.get(this.pop());
                this.push(value);
                break;
            }
            case 0x55:
                this.storage.set(this.pop(), this.pop());
                break;
            case 0x56:
                this.pc = Number(this.pop());
                return true;
            case 0x57: {
                const dest = this.pop();
                const cond = this.pop();
                if (cond !== 0n) {
                    this.pc = Number(dest);
                    return true;
                }
                break;
            }
            case 0x58:
                this.push(BigInt(this.pc));
                break;
            case 0x59:
                this.push(BigInt(this.memory.activeSize));
                break;
            case 0x5a:
                this.push(this.gasRemaining);
                break;
            case 0x5b:
                break;
            case 0x5c:
                this.push(this.transientStorage.get(this.pop().toString(16)) ?? 0n);
                break;
            case 0x5d:
                this.transientStorage.set(this.pop().toString(16), this.pop());
                break;
            case 0x5e:
                this.mcopy();
                break;

            case 0x5f:
                this.push(0n);
                break;
        }

        if (op >= 0x60 && op <= 0x7f) {
            const n = op - 0x5f;
            const imm = instr.immediate ?? new Uint8Array(n);
            const val = immToBigInt(imm);
            this.push(val);
        }

        if (op >= 0x80 && op <= 0x8f) {
            const n = op - 0x7f;
            const idx = this.stack.length - n;
            if (idx < 0) {
                this.halt(`DUP${n} underflow`);
                return false;
            }
            this.push(this.stack[idx]!);
        }

        if (op >= 0x90 && op <= 0x9f) {
            const n = op - 0x8f;
            const idx = this.stack.length - 1 - n;
            if (idx < 0) {
                this.halt(`SWAP${n} underflow`);
                return false;
            }
            const top = this.stack[this.stack.length - 1]!;
            this.stack[this.stack.length - 1] = this.stack[idx]!;
            this.stack[idx] = top;
        }

        if (op >= 0xa0 && op <= 0xa4) {
            const topics = op - 0xa0;
            const offset = Number(this.pop());
            const size = Number(this.pop());
            const topicList: bigint[] = [];
            for (let i = 0; i < topics; i++) {
                topicList.push(this.pop());
            }
            this.logs.push({
                address: this.call.address,
                topics: topicList.reverse(),
                data: this.memory.loadBytes(offset, size),
            });
        }

        if (op >= 0xf0 && op <= 0xff) {
            return this.dispatchSystem(op, instr);
        }

        this.pc += instr.immediate ? 1 + instr.immediate.length : 1;
        return true;
    }

    private dispatchSystem(op: number, instr: Instruction): boolean {
        switch (op) {
            case 0xf0: {
                this.pop();
                this.pop();
                this.pop();
                this.push(0n);
                this.pc += 1;
                return true;
            }
            case 0xf1:
                return this.handleCall(instr, 'call');
            case 0xf2: {
                this.pop();
                this.pop();
                this.pop();
                this.pop();
                this.pop();
                this.pop();
                this.pop();
                this.push(0n);
                this.pc += 1;
                return true;
            }
            case 0xf3:
                this.opReturn();
                return false;
            case 0xf4:
                return this.handleCall(instr, 'delegatecall');
            case 0xf5: {
                this.pop();
                this.pop();
                this.pop();
                this.pop();
                this.push(0n);
                this.pc += 1;
                return true;
            }
            case 0xfa:
                return this.handleCall(instr, 'staticcall');
            case 0xfd:
                this.opRevert();
                return false;
            case 0xfe:
                this.halt('INVALID');
                return false;
            case 0xff:
                this.halt('SELFDESTRUCT');
                return false;
            default:
                this.pc += 1;
                return true;
        }
    }

    private handleCall(_instr: Instruction, kind: 'call' | 'delegatecall' | 'staticcall'): boolean {
        const isDelegate = kind === 'delegatecall';
        const gas = this.pop();
        const addr = this.pop();
        const value = isDelegate ? 0n : this.pop();
        const argsOffset = isDelegate ? Number(this.pop()) : Number(this.pop());
        const argsSize = isDelegate ? Number(this.pop()) : Number(this.pop());
        const retOffset = isDelegate ? Number(this.pop()) : Number(this.pop());
        const retSize = isDelegate ? Number(this.pop()) : Number(this.pop());

        const addrHex = `0x${addr.toString(16).padStart(40, '0')}`;

        if (isPrecompile(addrHex)) {
            const fn = getPrecompile(addrHex)!;
            const input = this.memory.loadBytes(argsOffset, argsSize);
            const result = fn(input);
            if (result.success) {
                this.memory.storeBytes(retOffset, result.output.slice(0, retSize));
                this.returnData = Uint8Array.from(result.output);
            }
            this.push(bool(result.success));
        } else {
            this.push(1n);
        }

        this.pc += 1;
        return true;
    }

    private opReturn(): void {
        const offset = Number(this.pop());
        const size = Number(this.pop());
        this.returnData = Uint8Array.from(this.memory.loadBytes(offset, size));
        this.halted = true;
    }

    private opRevert(): void {
        const offset = Number(this.pop());
        const size = Number(this.pop());
        this.returnData = Uint8Array.from(this.memory.loadBytes(offset, size));
        this.halted = true;
        this.error = 'REVERT';
    }

    private mcopy(): void {
        const size = Number(this.pop());
        const src = Number(this.pop());
        const dest = Number(this.pop());
        const data = this.memory.loadBytes(src, size);
        this.memory.storeBytes(dest, data);
    }

    private copyCalldataToMemory(): void {
        const memOffset = Number(this.pop());
        const dataOffset = Number(this.pop());
        const size = Number(this.pop());
        const data = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
            data[i] = this.call.calldata[dataOffset + i] ?? 0;
        }
        this.memory.storeBytes(memOffset, data);
    }

    private copyCodeToMemory(): void {
        const memOffset = Number(this.pop());
        const codeOffset = Number(this.pop());
        const size = Number(this.pop());
        const data = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
            data[i] = this.call.code[codeOffset + i] ?? 0;
        }
        this.memory.storeBytes(memOffset, data);
    }

    private copyReturnDataToMemory(): void {
        const memOffset = Number(this.pop());
        const dataOffset = Number(this.pop());
        const size = Number(this.pop());
        const data = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
            data[i] = this.returnData[dataOffset + i] ?? 0;
        }
        this.memory.storeBytes(memOffset, data);
    }

    private loadCalldataWord(offset: bigint): bigint {
        const off = Number(offset);
        let result = 0n;
        for (let i = 0; i < 32; i++) {
            result = (result << 8n) | BigInt(this.call.calldata[off + i] ?? 0);
        }
        return result;
    }

    private push(value: bigint): void {
        if (this.stack.length >= MAX_STACK_DEPTH) {
            this.halt('Stack overflow');
            return;
        }
        this.stack.push(value & MASK256);
    }

    private pop(): bigint {
        if (this.stack.length === 0) {
            this.halt('Stack underflow');
            return 0n;
        }
        return this.stack.pop()!;
    }

    private halt(reason: string | null): void {
        this.halted = true;
        if (reason) this.error = reason;
    }
}

const MASK256 = (1n << 256n) - 1n;

function immToBigInt(imm: Uint8Array): bigint {
    let v = 0n;
    for (const b of imm) v = (v << 8n) | BigInt(b);
    return v;
}

function bool(cond: boolean): bigint {
    return cond ? 1n : 0n;
}

function toSigned(v: bigint): bigint {
    return v & (1n << 255n) ? v - (1n << 256n) : v;
}

function getByte(index: bigint, value: bigint): bigint {
    const idx = Number(index);
    if (idx < 0 || idx >= 32) return 0n;
    return (value >> (248n - BigInt(idx) * 8n)) & 0xffn;
}

function shl256(shift: bigint, value: bigint): bigint {
    const s = shift & 0xffn;
    return (value << s) & MASK256;
}

function sar256(shift: bigint, value: bigint): bigint {
    const s = Number(shift & 0xffn);
    if (s === 0) return value;
    const signed = toSigned(value);
    const result = signed >> BigInt(s);
    return result < 0n ? (result | ((1n << 256n) - (1n << BigInt(256 - s)))) & MASK256 : result;
}

function clz256(value: bigint): bigint {
    if (value === 0n) return 256n;
    const hex = value.toString(16).padStart(64, '0');
    let count = 0;
    for (const ch of hex) {
        const nibble = parseInt(ch, 16);
        if (nibble === 0) {
            count += 4;
            continue;
        }
        count += Math.clz32(nibble) - 28;
        break;
    }
    return BigInt(count);
}

function signExtend(ext: bigint, value: bigint): bigint {
    const byteIndex = Number(ext);
    if (byteIndex >= 31) return value & MASK256;
    const bitIndex = BigInt(byteIndex * 8 + 7);
    const mask = (1n << bitIndex) - 1n;
    const signBit = value & (1n << bitIndex);
    if (signBit === 0n) return value & mask;
    return (value & mask) | (~mask & MASK256);
}

function pow256(base: bigint, exp: bigint): bigint {
    let result = 1n;
    let b = base & MASK256;
    let e = exp;
    while (e > 0n) {
        if (e & 1n) result = (result * b) & MASK256;
        b = (b * b) & MASK256;
        e >>= 1n;
    }
    return result;
}
