import type { Instruction } from '../../core/types';
import { buildCFG, type ControlFlowGraph } from './cfg';

export interface InferredParameter {
    index: number;
    calldataOffset: number;
    inferredType: SolidityType;
    confidence: number;
    usedInStorage: boolean;
    usedInCall: boolean;
    usedInArithmetic: boolean;
}

export interface InferredFunction {
    selector: string;
    name: string | null;
    parameters: InferredParameter[];
    returnType: string | null;
    stateMutability: 'pure' | 'view' | 'nonpayable' | 'payable';
    confidence: number;
    matchedSignature: string | null;
}

export type SolidityType = 'address' | 'uint256' | 'int256' | 'bool' | 'bytes32' | 'uint' | 'unknown';

const KNOWN_SELECTORS = new Map<string, string>([
    ['0x18160ddd', 'totalSupply()'],
    ['0x70a08231', 'balanceOf(address)'],
    ['0xa9059cbb', 'transfer(address,uint256)'],
    ['0x095ea7b3', 'approve(address,uint256)'],
    ['0x23b872dd', 'transferFrom(address,address,uint256)'],
    ['0xdd62ed3e', 'allowance(address,address)'],
    ['0x06fdde03', 'name()'],
    ['0x95d89b41', 'symbol()'],
    ['0x313ce567', 'decimals()'],
    ['0x8da5cb5b', 'owner()'],
    ['0xf2fde38b', 'transferOwnership(address)'],
    ['0x7ff36ab5', 'swapExactETHForTokens(uint256,address[],address,uint256)'],
    ['0x18cbafe5', 'swapExactTokensForETH(uint256,uint256,address[],address,uint256)'],
    ['0x38ed1739', 'swapExactTokensForTokens(uint256,uint256,address[],address,uint256)'],
    ['0x791ac947', 'swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)'],
    ['0x02751cec', 'removeLiquidityETH(uint256,uint256,address,address,uint256)'],
    ['0xe8e33700', 'addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)'],
    ['0xf305d719', 'addLiquidityETH(address,uint256,uint256,uint256,address,uint256)'],
    ['0x1f00ca74', 'getReserves()'],
    ['0x4a25d94a', 'swapETHForExactTokens(uint256,address[],address,uint256)'],
    ['0xfb3bdb41', 'swapETHForExactTokens(uint256,address[],address,uint256)'],
    ['0x5b0d5984', 'removeLiquidity(uint256,uint256,uint256,address,address,uint256)'],
    ['0x7ecebe00', 'nonces(address)'],
    ['0xd505accf', 'permit(address,address,uint256,uint256,uint8,bytes32,bytes32)'],
    ['0x3593564c', 'execute(bytes)'],
    ['0x47b97e19', 'multicall(bytes[])'],
    ['0xac9650d8', 'multicall(bytes[])'],
    ['0x5ae401dc', 'multicall(uint256,bytes[])'],
    ['0x0c49ccbe', 'refundETH()'],
    ['0xd0e30db0', 'deposit()'],
    ['0x2e1a7d4d', 'withdraw(uint256)'],
    ['0x23b872dd', 'transferFrom(address,address,uint256)'],
]);

export class ABIInferrer {
    private readonly instructions: Instruction[];
    private readonly cfg: ControlFlowGraph;

    constructor(instructions: Instruction[]) {
        this.instructions = instructions;
        this.cfg = buildCFG(instructions);
    }

    inferFunctions(selectors: Array<{ selector: string; startPC: number; body: Instruction[] }>): InferredFunction[] {
        return selectors.map((sel) => this.inferFunction(sel));
    }

    private inferFunction(sel: { selector: string; startPC: number; body: Instruction[] }): InferredFunction {
        const known = KNOWN_SELECTORS.get(sel.selector.toLowerCase());
        if (known) {
            const params = this.inferParametersFromSignature(known);
            return {
                selector: sel.selector,
                name: known.split('(')[0]!,
                parameters: params,
                returnType: this.inferReturnTypeFromSignature(known),
                stateMutability: this.inferStateMutability(sel.body),
                confidence: 0.95,
                matchedSignature: known,
            };
        }

        const params = this.analyzeCalldataAccess(sel.body);
        const returnType = this.inferReturnType(sel.body);
        const stateMutability = this.inferStateMutability(sel.body);

        let name = `unknown_${sel.selector}`;
        let confidence = 0.3;

        if (params.length > 0) {
            name = `fn_${sel.selector}`;
            confidence = 0.5;
        }

        return {
            selector: sel.selector,
            name,
            parameters: params,
            returnType,
            stateMutability,
            confidence,
            matchedSignature: null,
        };
    }

    private inferParametersFromSignature(sig: string): InferredParameter[] {
        const match = sig.match(/\((.*)\)/);
        if (!match) return [];

        const types = match[1]!.split(',').filter((t) => t.length > 0);
        return types.map((type, i) => ({
            index: i,
            calldataOffset: 4 + i * 32,
            inferredType: this.parseType(type.trim()),
            confidence: 0.95,
            usedInStorage: false,
            usedInCall: false,
            usedInArithmetic: false,
        }));
    }

    private parseType(type: string): SolidityType {
        if (type === 'address') return 'address';
        if (type === 'bool') return 'bool';
        if (type === 'bytes32') return 'bytes32';
        if (type.startsWith('uint')) return 'uint256';
        if (type.startsWith('int')) return 'int256';
        return 'unknown';
    }

    private inferReturnTypeFromSignature(sig: string): string | null {
        const match = sig.match(/\)\s*(returns?\s*)?\((.*)\)/);
        if (match && match[2]) return match[2].trim();
        const returnsMatch = sig.match(/returns?\s*\((.*)\)/);
        if (returnsMatch) return returnsMatch[1]!.trim();
        return null;
    }

    private analyzeCalldataAccess(body: Instruction[]): InferredParameter[] {
        const calldataOffsets = new Map<number, { count: number; context: Set<string> }>();

        for (let i = 0; i < body.length; i++) {
            const instr = body[i]!;

            if (instr.opcode.mnemonic === 'CALLDATALOAD') {
                const pushInstr = this.findPushBefore(i, body);
                if (pushInstr?.immediate) {
                    let offset = 0;
                    for (const byte of pushInstr.immediate) {
                        offset = offset * 256 + byte;
                    }
                    const existing = calldataOffsets.get(offset) ?? { count: 0, context: new Set() };
                    existing.count++;
                    this.analyzeContext(i, body, existing.context);
                    calldataOffsets.set(offset, existing);
                }
            }
        }

        const params: InferredParameter[] = [];
        const sortedOffsets = Array.from(calldataOffsets.entries())
            .filter(([offset]) => offset >= 4)
            .sort((a, b) => a[0] - b[0]);

        for (let i = 0; i < sortedOffsets.length; i++) {
            const [offset, data] = sortedOffsets[i]!;
            params.push({
                index: i,
                calldataOffset: offset,
                inferredType: this.inferTypeFromContext(data.context),
                confidence: data.count > 2 ? 0.6 : 0.3,
                usedInStorage: data.context.has('storage'),
                usedInCall: data.context.has('call'),
                usedInArithmetic: data.context.has('arithmetic'),
            });
        }

        return params;
    }

    private findPushBefore(index: number, body: Instruction[]): Instruction | null {
        for (let i = index - 1; i >= Math.max(0, index - 8); i--) {
            const instr = body[i];
            if (!instr) break;
            if (instr.opcode.value >= 0x60 && instr.opcode.value <= 0x7f) {
                return instr;
            }
            if (instr.opcode.value >= 0x80 && instr.opcode.value <= 0x9f) continue;
            if (instr.opcode.value === 0x50) continue;
            break;
        }
        return null;
    }

    private analyzeContext(index: number, body: Instruction[], context: Set<string>): void {
        for (let i = index + 1; i < Math.min(index + 15, body.length); i++) {
            const op = body[i]?.opcode.mnemonic;
            if (!op) continue;

            if (op === 'SSTORE' || op === 'SLOAD') context.add('storage');
            if (op === 'CALL' || op === 'STATICCALL' || op === 'DELEGATECALL') context.add('call');
            if (op === 'ADD' || op === 'SUB' || op === 'MUL' || op === 'DIV' || op === 'MOD') context.add('arithmetic');
            if (op === 'LT' || op === 'GT' || op === 'EQ' || op === 'SLT' || op === 'SGT') context.add('comparison');
            if (op === 'AND' || op === 'OR' || op === 'XOR') context.add('bitwise');
            if (op === 'LOG0' || op === 'LOG1' || op === 'LOG2' || op === 'LOG3' || op === 'LOG4') context.add('event');
            if (op === 'RETURN' || op === 'REVERT') break;
        }
    }

    private inferTypeFromContext(context: Set<string>): SolidityType {
        if (context.has('call') && context.has('storage')) return 'address';
        if (context.has('arithmetic')) return 'uint256';
        if (context.has('comparison') && !context.has('arithmetic')) return 'uint256';
        if (context.has('event')) return 'uint256';
        return 'unknown';
    }

    private inferReturnType(body: Instruction[]): string | null {
        for (let i = body.length - 1; i >= 0; i--) {
            const instr = body[i]!;
            if (instr.opcode.mnemonic === 'RETURN') {
                const pushInstr = this.findPushBefore(i, body);
                if (pushInstr?.immediate) {
                    let size = 0;
                    for (const byte of pushInstr.immediate) {
                        size = size * 256 + byte;
                    }
                    if (size === 32) return 'uint256';
                    if (size === 20) return 'address';
                    if (size === 1) return 'bool';
                    return 'bytes';
                }
                return 'bytes';
            }
        }
        return null;
    }

    private inferStateMutability(body: Instruction[]): 'pure' | 'view' | 'nonpayable' | 'payable' {
        let hasStorageRead = false;
        let hasStorageWrite = false;
        let hasCall = false;
        let hasCallvalue = false;

        for (const instr of body) {
            if (instr.opcode.mnemonic === 'SLOAD') hasStorageRead = true;
            if (instr.opcode.mnemonic === 'SSTORE') hasStorageWrite = true;
            if (instr.opcode.mnemonic === 'CALL' || instr.opcode.mnemonic === 'STATICCALL') hasCall = true;
            if (instr.opcode.mnemonic === 'CALLVALUE') hasCallvalue = true;
        }

        if (hasStorageWrite || hasCall) return 'nonpayable';
        if (hasStorageRead) return 'view';
        if (hasCallvalue) return 'payable';
        return 'pure';
    }
}

export function inferABI(instructions: Instruction[], selectors: Array<{ selector: string; startPC: number; body: Instruction[] }>): InferredFunction[] {
    return new ABIInferrer(instructions).inferFunctions(selectors);
}
