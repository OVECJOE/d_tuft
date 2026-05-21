import type { Instruction } from '../../core/types';
import { bytesToHex } from '../../utils/hex';

export type Expression =
    | { kind: 'literal'; value: bigint; display: string }
    | { kind: 'calldata'; offset: number; display: string }
    | { kind: 'storage'; slot: bigint; display: string }
    | { kind: 'memory'; offset: number; display: string }
    | { kind: 'variable'; name: string }
    | { kind: 'binop'; op: string; left: Expression; right: Expression; display?: string }
    | { kind: 'unop'; op: string; operand: Expression; display?: string }
    | { kind: 'call'; target: Expression; args: Expression[]; display?: string }
    | { kind: 'ternary'; cond: Expression; thenExpr: Expression; elseExpr: Expression; display?: string }
    | { kind: 'unknown'; display: string };

export interface StackFrame {
    stack: Expression[];
}

export interface DataFlowResult {
    expressions: Expression[];
    storageWrites: { slot: Expression; value: Expression; pc: number }[];
    storageReads: { slot: Expression; pc: number }[];
    returns: { value: Expression; pc: number }[];
    reverts: { reason?: Expression; pc: number }[];
    externalCalls: { target: Expression; value: Expression; data: Expression; pc: number }[];
    events: { topics: number; data: Expression; pc: number }[];
    conditionals: { condition: Expression; jumpDest: number; pc: number }[];
    variableAssignments: { name: string; value: Expression; pc: number }[];
}

const ARITHMETIC_OPS: Record<number, string> = {
    0x01: '+', 0x02: '*', 0x03: '-', 0x04: '/', 0x05: 'sdiv',
    0x06: 'mod', 0x07: 'smod', 0x0a: 'exp', 0x0b: 'signextend',
};

const BITWISE_OPS: Record<number, string> = {
    0x16: '&', 0x17: '|', 0x18: '^', 0x1a: 'byte',
};

const SHIFT_OPS: Record<number, string> = {
    0x1b: 'shl', 0x1c: 'shr', 0x1d: 'sar',
};

const COMPARISON_OPS: Record<number, string> = {
    0x10: '<', 0x11: '>', 0x12: 'slt', 0x13: 'sgt', 0x14: '==', 0x15: '!=',
};

export class DataFlowAnalyzer {
    private readonly body: Instruction[];
    private readonly paramNames: Map<number, string>;

    constructor(body: Instruction[], paramNames: Map<number, string> = new Map()) {
        this.body = body;
        this.paramNames = paramNames;
    }

    analyze(): DataFlowResult {
        const result: DataFlowResult = {
            expressions: [],
            storageWrites: [],
            storageReads: [],
            returns: [],
            reverts: [],
            externalCalls: [],
            events: [],
            conditionals: [],
            variableAssignments: [],
        };

        const stack: Expression[] = [];
        let tempVarCounter = 0;

        for (let i = 0; i < this.body.length; i++) {
            const instr = this.body[i]!;
            const op = instr.opcode.value;
            const mnemonic = instr.opcode.mnemonic;

            // PUSH instructions
            if (op >= 0x60 && op <= 0x7f && instr.immediate) {
                let value = 0n;
                for (const byte of instr.immediate) {
                    value = (value << 8n) | BigInt(byte);
                }
                const display = this.formatLiteral(value);
                stack.push({ kind: 'literal', value, display });
                continue;
            }

            // DUP instructions
            if (op >= 0x80 && op <= 0x8f) {
                const depth = op - 0x80 + 1;
                if (stack.length >= depth) {
                    const dup = stack[stack.length - depth]!;
                    stack.push(dup);
                } else {
                    stack.push({ kind: 'unknown', display: `d_${depth}` });
                }
                continue;
            }

            // SWAP instructions
            if (op >= 0x90 && op <= 0x9f) {
                const depth = op - 0x90 + 2;
                if (stack.length >= depth) {
                    const top = stack[stack.length - 1]!;
                    const swap = stack[stack.length - depth]!;
                    stack[stack.length - 1] = swap;
                    stack[stack.length - depth] = top;
                }
                continue;
            }

            // POP
            if (op === 0x50) {
                stack.pop();
                continue;
            }

            // PUSH0 (EIP-3855)
            if (op === 0x5f) {
                stack.push({ kind: 'literal', value: 0n, display: '0' });
                continue;
            }

            // Arithmetic
            if (ARITHMETIC_OPS[op]) {
                const right = stack.pop() ?? { kind: 'unknown', display: '?' };
                const left = stack.pop() ?? { kind: 'unknown', display: '?' };
                const expr: Expression = { kind: 'binop', op: ARITHMETIC_OPS[op]!, left, right };
                stack.push(expr);
                continue;
            }

            // Bitwise
            if (BITWISE_OPS[op]) {
                const right = stack.pop() ?? { kind: 'unknown', display: '?' };
                const left = stack.pop() ?? { kind: 'unknown', display: '?' };
                const expr: Expression = { kind: 'binop', op: BITWISE_OPS[op]!, left, right };
                stack.push(expr);
                continue;
            }

            // Comparison
            if (COMPARISON_OPS[op]) {
                const right = stack.pop() ?? { kind: 'unknown', display: '?' };
                const left = stack.pop() ?? { kind: 'unknown', display: '?' };
                const expr: Expression = { kind: 'binop', op: COMPARISON_OPS[op]!, left, right };
                stack.push(expr);
                continue;
            }

            // Shift
            if (SHIFT_OPS[op]) {
                const right = stack.pop() ?? { kind: 'unknown', display: '?' };
                const left = stack.pop() ?? { kind: 'unknown', display: '?' };
                const expr: Expression = { kind: 'binop', op: SHIFT_OPS[op]!, left, right };
                stack.push(expr);
                continue;
            }

            // NOT
            if (op === 0x19) {
                const operand = stack.pop() ?? { kind: 'unknown', display: '?' };
                stack.push({ kind: 'unop', op: '~', operand });
                continue;
            }

            // ISZERO
            if (op === 0x15) {
                const operand = stack.pop() ?? { kind: 'unknown', display: '?' };
                stack.push({ kind: 'unop', op: '== 0', operand });
                continue;
            }

            // AND with mask (common pattern: address masking)
            if (op === 0x16) {
                const right = stack.pop() ?? { kind: 'unknown', display: '?' };
                const left = stack.pop() ?? { kind: 'unknown', display: '?' };
                // Detect address masking: AND with 0xffff...ffff (20 bytes)
                if (right.kind === 'literal' && right.value === (1n << 160n) - 1n) {
                    stack.push({ kind: 'unop', op: 'address(', operand: left, display: `address(${this.display(left)})` });
                } else if (left.kind === 'literal' && left.value === (1n << 160n) - 1n) {
                    stack.push({ kind: 'unop', op: 'address(', operand: right, display: `address(${this.display(right)})` });
                } else {
                    stack.push({ kind: 'binop', op: '&', left, right });
                }
                continue;
            }

            // CALLDATALOAD
            if (op === 0x35) {
                const offsetExpr = stack.pop() ?? { kind: 'unknown', display: '?' };
                if (offsetExpr.kind === 'literal') {
                    const offset = Number(offsetExpr.value);
                    const paramName = this.paramNames.get(offset);
                    const display = paramName ?? `calldata[${offset}]`;
                    stack.push({ kind: 'calldata', offset, display });
                } else {
                    stack.push({ kind: 'calldata', offset: -1, display: `calldata[${this.display(offsetExpr)}]` });
                }
                continue;
            }

            // CALLDATASIZE
            if (op === 0x36) {
                stack.push({ kind: 'unknown', display: 'calldata.length' });
                continue;
            }

            // CALLDATACOPY
            if (op === 0x37) {
                stack.pop(); stack.pop(); stack.pop(); // destOffset, offset, size
                continue;
            }

            // SLOAD
            if (op === 0x54) {
                const slotExpr = stack.pop() ?? { kind: 'unknown', display: '?' };
                let display = 'storage[?]';
                if (slotExpr.kind === 'literal') {
                    display = `storage_0x${slotExpr.value.toString(16)}`;
                } else if (slotExpr.kind === 'calldata') {
                    display = `mapping[calldata]`;
                } else {
                    display = `storage[${this.display(slotExpr)}]`;
                }
                result.storageReads.push({ slot: slotExpr, pc: instr.pc });
                stack.push({ kind: 'storage', slot: slotExpr.kind === 'literal' ? slotExpr.value : 0n, display });
                continue;
            }

            // SSTORE
            if (op === 0x55) {
                const slotExpr = stack.pop() ?? { kind: 'unknown', display: '?' };
                const valueExpr = stack.pop() ?? { kind: 'unknown', display: '?' };
                result.storageWrites.push({ slot: slotExpr, value: valueExpr, pc: instr.pc });
                continue;
            }

            // MLOAD
            if (op === 0x51) {
                const offsetExpr = stack.pop() ?? { kind: 'unknown', display: '?' };
                stack.push({ kind: 'memory', offset: offsetExpr.kind === 'literal' ? Number(offsetExpr.value) : -1, display: `memory[${this.display(offsetExpr)}]` });
                continue;
            }

            // MSTORE
            if (op === 0x52) {
                stack.pop(); stack.pop(); // offset, value
                continue;
            }

            // MSTORE8
            if (op === 0x53) {
                stack.pop(); stack.pop();
                continue;
            }

            // RETURN
            if (op === 0xf3) {
                const size = stack.pop() ?? { kind: 'unknown', display: '?' };
                const offset = stack.pop() ?? { kind: 'unknown', display: '?' };
                result.returns.push({ value: { kind: 'memory', offset: offset.kind === 'literal' ? Number(offset.value) : -1, display: `memory[${this.display(offset)}..${this.display(size)}]` }, pc: instr.pc });
                continue;
            }

            // REVERT
            if (op === 0xfd) {
                const size = stack.pop() ?? { kind: 'unknown', display: '?' };
                const offset = stack.pop() ?? { kind: 'unknown', display: '?' };
                result.reverts.push({ reason: { kind: 'memory', offset: offset.kind === 'literal' ? Number(offset.value) : -1, display: `memory[${this.display(offset)}..${this.display(size)}]` }, pc: instr.pc });
                continue;
            }

            // STOP
            if (op === 0x00) {
                continue;
            }

            // CALL, STATICCALL, DELEGATECALL
            if (op === 0xf1 || op === 0xfa || op === 0xf4) {
                if (op === 0xf4) {
                    // DELEGATECALL: gas, address, argsOffset, argsSize, retOffset, retSize
                    const retSize = stack.pop();
                    const retOffset = stack.pop();
                    const argsSize = stack.pop();
                    const argsOffset = stack.pop();
                    const address = stack.pop() ?? { kind: 'unknown', display: '?' };
                    const gas = stack.pop();
                    result.externalCalls.push({ target: address, value: { kind: 'literal', value: 0n, display: '0' }, data: { kind: 'memory', offset: argsOffset?.kind === 'literal' ? Number(argsOffset.value) : -1, display: '...' }, pc: instr.pc });
                } else if (op === 0xfa) {
                    // STATICCALL: gas, address, argsOffset, argsSize, retOffset, retSize
                    const retSize = stack.pop();
                    const retOffset = stack.pop();
                    const argsSize = stack.pop();
                    const argsOffset = stack.pop();
                    const address = stack.pop() ?? { kind: 'unknown', display: '?' };
                    const gas = stack.pop();
                    result.externalCalls.push({ target: address, value: { kind: 'literal', value: 0n, display: '0' }, data: { kind: 'memory', offset: argsOffset?.kind === 'literal' ? Number(argsOffset.value) : -1, display: '...' }, pc: instr.pc });
                } else {
                    // CALL: gas, address, value, argsOffset, argsSize, retOffset, retSize
                    const retSize = stack.pop();
                    const retOffset = stack.pop();
                    const argsSize = stack.pop();
                    const argsOffset = stack.pop();
                    const value = stack.pop() ?? { kind: 'unknown', display: '?' };
                    const address = stack.pop() ?? { kind: 'unknown', display: '?' };
                    const gas = stack.pop();
                    result.externalCalls.push({ target: address, value, data: { kind: 'memory', offset: argsOffset?.kind === 'literal' ? Number(argsOffset.value) : -1, display: '...' }, pc: instr.pc });
                }
                stack.push({ kind: 'unknown', display: 'call_result' });
                continue;
            }

            // CREATE, CREATE2
            if (op === 0xf0 || op === 0xf5) {
                stack.pop(); stack.pop(); stack.pop();
                stack.push({ kind: 'unknown', display: 'new_address' });
                continue;
            }

            // LOG0-LOG4
            if (op >= 0xa0 && op <= 0xa4) {
                const topics = op - 0xa0;
                const size = stack.pop();
                const offset = stack.pop();
                for (let t = 0; t < topics; t++) stack.pop();
                result.events.push({ topics, data: { kind: 'memory', offset: offset?.kind === 'literal' ? Number(offset.value) : -1, display: '...' }, pc: instr.pc });
                continue;
            }

            // JUMPI - conditional
            if (op === 0x57) {
                const dest = stack.pop() ?? { kind: 'unknown', display: '?' };
                const cond = stack.pop() ?? { kind: 'unknown', display: '?' };
                if (dest.kind === 'literal') {
                    result.conditionals.push({ condition: cond, jumpDest: Number(dest.value), pc: instr.pc });
                }
                continue;
            }

            // JUMP
            if (op === 0x56) {
                stack.pop();
                continue;
            }

            // JUMPDEST
            if (op === 0x5b) {
                continue;
            }

            // TIMESTAMP, NUMBER, BLOCKHASH, COINBASE, DIFFICULTY, GASLIMIT, CHAINID, SELFBALANCE, BASEFEE
            if (op === 0x42) { stack.push({ kind: 'unknown', display: 'block.timestamp' }); continue; }
            if (op === 0x43) { stack.push({ kind: 'unknown', display: 'block.number' }); continue; }
            if (op === 0x41) { stack.push({ kind: 'unknown', display: 'block.coinbase' }); continue; }
            if (op === 0x44) { stack.push({ kind: 'unknown', display: 'block.difficulty' }); continue; }
            if (op === 0x45) { stack.push({ kind: 'unknown', display: 'block.gaslimit' }); continue; }
            if (op === 0x46) { stack.push({ kind: 'unknown', display: 'chain.id' }); continue; }
            if (op === 0x47) { stack.push({ kind: 'unknown', display: 'address(this).balance' }); continue; }
            if (op === 0x48) { stack.push({ kind: 'unknown', display: 'block.basefee' }); continue; }

            // ADDRESS, BALANCE, ORIGIN, CALLER, CALLVALUE, GAS, GASPRICE
            if (op === 0x30) { stack.push({ kind: 'unknown', display: 'address(this)' }); continue; }
            if (op === 0x31) { const addr = stack.pop(); stack.push({ kind: 'unknown', display: `address(${this.display(addr!)}).balance` }); continue; }
            if (op === 0x32) { stack.push({ kind: 'unknown', display: 'tx.origin' }); continue; }
            if (op === 0x33) { stack.push({ kind: 'unknown', display: 'msg.sender' }); continue; }
            if (op === 0x34) { stack.push({ kind: 'unknown', display: 'msg.value' }); continue; }
            if (op === 0x5a) { stack.push({ kind: 'unknown', display: 'gasleft()' }); continue; }
            if (op === 0x3a) { stack.push({ kind: 'unknown', display: 'tx.gasprice' }); continue; }

            // RETURNDATASIZE, RETURNDATACOPY
            if (op === 0x3d) { stack.push({ kind: 'unknown', display: 'returndata.length' }); continue; }
            if (op === 0x3e) { stack.pop(); stack.pop(); stack.pop(); continue; }

            // CODESIZE, CODECOPY, EXTCODESIZE, EXTCODECOPY, EXTCODEHASH
            if (op === 0x38) { stack.push({ kind: 'unknown', display: 'address(this).code.length' }); continue; }
            if (op === 0x39) { stack.pop(); stack.pop(); stack.pop(); continue; }
            if (op === 0x3b) { const addr = stack.pop(); stack.push({ kind: 'unknown', display: `address(${this.display(addr!)}).code.length` }); continue; }
            if (op === 0x3c) { stack.pop(); stack.pop(); stack.pop(); stack.pop(); continue; }
            if (op === 0x3f) { const addr = stack.pop(); stack.push({ kind: 'unknown', display: `address(${this.display(addr!)}).codehash` }); continue; }

            // PC, MSIZE
            if (op === 0x58) { stack.push({ kind: 'unknown', display: `pc_${instr.pc}` }); continue; }
            if (op === 0x59) { stack.push({ kind: 'unknown', display: 'memory_size' }); continue; }

            // SHA3/KECCAK256
            if (op === 0x20) {
                const size = stack.pop() ?? { kind: 'unknown', display: '?' };
                const offset = stack.pop() ?? { kind: 'unknown', display: '?' };
                stack.push({ kind: 'unknown', display: `keccak256(memory[${this.display(offset)}..${this.display(size)}])` });
                continue;
            }

            // MULMOD, ADDMOD
            if (op === 0x08 || op === 0x09) {
                const mod = stack.pop() ?? { kind: 'unknown', display: '?' };
                const right = stack.pop() ?? { kind: 'unknown', display: '?' };
                const left = stack.pop() ?? { kind: 'unknown', display: '?' };
                stack.push({ kind: 'binop', op: op === 0x08 ? 'mulmod' : 'addmod', left, right });
                continue;
            }

            // SIGNEXTEND
            if (op === 0x0b) {
                const value = stack.pop() ?? { kind: 'unknown', display: '?' };
                const bytes = stack.pop() ?? { kind: 'unknown', display: '?' };
                stack.push({ kind: 'unop', op: 'signextend', operand: value });
                continue;
            }

            // Default: unknown opcode, pop expected inputs
            const inputs = this.stackInputs(op);
            const outputs = this.stackOutputs(op);
            for (let p = 0; p < inputs; p++) stack.pop();
            for (let p = 0; p < outputs; p++) stack.push({ kind: 'unknown', display: `${mnemonic}_result` });
        }

        result.expressions = stack;
        return result;
    }

    private formatLiteral(value: bigint): string {
        if (value === 0n) return '0';
        if (value === 1n) return '1';

        // Check if it's a valid address (20 bytes, non-zero)
        if (value < (1n << 160n) && value > 0n) {
            return `0x${value.toString(16).padStart(40, '0')}`;
        }

        // Check if it's a slot index (small number)
        if (value < 1000n) {
            return value.toString();
        }

        // Check if it's a selector (4 bytes)
        if (value < (1n << 32n)) {
            return `0x${value.toString(16).padStart(8, '0')}`;
        }

        // Large number - show as hex
        return `0x${value.toString(16)}`;
    }

    private display(expr: Expression): string {
        switch (expr.kind) {
            case 'literal': return expr.display;
            case 'calldata': return expr.display;
            case 'storage': return expr.display;
            case 'memory': return expr.display;
            case 'variable': return expr.name;
            case 'binop': return `(${this.display(expr.left)} ${expr.op} ${this.display(expr.right)})`;
            case 'unop': return `${expr.op}${this.display(expr.operand)}`;
            case 'call': return expr.display ?? 'call(...)';
            case 'ternary': return expr.display ?? '(cond ? a : b)';
            case 'unknown': return expr.display;
        }
    }

    private stackInputs(opcode: number): number {
        switch (opcode) {
            case 0x01: case 0x02: case 0x03: case 0x04: case 0x05:
            case 0x06: case 0x07: case 0x08: case 0x09: case 0x0a:
            case 0x0b: case 0x10: case 0x11: case 0x12: case 0x13:
            case 0x14: case 0x16: case 0x17: case 0x18: case 0x1a:
            case 0x1b: case 0x1c: case 0x1d: return 2;
            case 0x19: return 1;
            case 0x54: case 0x35: case 0x31: case 0x3b: case 0x3f: return 1;
            case 0x55: return 2;
            case 0x51: return 1;
            case 0x52: case 0x53: return 2;
            case 0x56: return 1;
            case 0x57: return 2;
            case 0x50: return 1;
            case 0xf3: case 0xfd: return 2;
            case 0xf1: return 7;
            case 0xf4: case 0xfa: return 6;
            case 0xf0: return 3;
            case 0xf5: return 4;
            case 0x20: return 2;
            case 0x37: case 0x39: case 0x3c: case 0x3e: return 3;
            case 0xa0: return 2;
            case 0xa1: return 3;
            case 0xa2: return 4;
            case 0xa3: return 5;
            case 0xa4: return 6;
            default: return 0;
        }
    }

    private stackOutputs(opcode: number): number {
        switch (opcode) {
            case 0x00: case 0x50: case 0x52: case 0x53: case 0x55:
            case 0x56: case 0x57: case 0x5b: case 0xf3: case 0xfd:
            case 0x37: case 0x39: case 0x3c: case 0x3e: return 0;
            case 0x54: case 0x35: case 0x30: case 0x31: case 0x32:
            case 0x33: case 0x34: case 0x36: case 0x38: case 0x3a:
            case 0x3b: case 0x3d: case 0x3f: case 0x41: case 0x42:
            case 0x43: case 0x44: case 0x45: case 0x46: case 0x47:
            case 0x48: case 0x51: case 0x58: case 0x59: case 0x5a:
            case 0x20: case 0xf0: case 0xf5: case 0x5f: return 1;
            case 0xf1: case 0xf4: case 0xfa: return 1;
            case 0xa0: case 0xa1: case 0xa2: case 0xa3: case 0xa4: return 0;
            default: return 1;
        }
    }
}

export function analyzeDataFlow(body: Instruction[], paramNames?: Map<number, string>): DataFlowResult {
    return new DataFlowAnalyzer(body, paramNames).analyze();
}
