import type { FunctionGasEstimate, GasHotspot, GasReport, Instruction, OpcodeGasEntry } from '../core/types';

const CATEGORY_MAP: Record<string, string> = {
    STOP: 'control',
    ADD: 'arithmetic',
    MUL: 'arithmetic',
    SUB: 'arithmetic',
    DIV: 'arithmetic',
    SDIV: 'arithmetic',
    MOD: 'arithmetic',
    SMOD: 'arithmetic',
    ADDMOD: 'arithmetic',
    MULMOD: 'arithmetic',
    EXP: 'arithmetic',
    SIGNEXTEND: 'arithmetic',
    LT: 'comparison',
    GT: 'comparison',
    SLT: 'comparison',
    SGT: 'comparison',
    EQ: 'comparison',
    ISZERO: 'comparison',
    AND: 'bitwise',
    OR: 'bitwise',
    XOR: 'bitwise',
    NOT: 'bitwise',
    BYTE: 'bitwise',
    SHL: 'bitwise',
    SHR: 'bitwise',
    SAR: 'bitwise',
    CLZ: 'bitwise',
    KECCAK256: 'crypto',
    ADDRESS: 'environment',
    BALANCE: 'environment',
    ORIGIN: 'environment',
    CALLER: 'environment',
    CALLVALUE: 'environment',
    CALLDATALOAD: 'environment',
    CALLDATASIZE: 'environment',
    CALLDATACOPY: 'environment',
    CODESIZE: 'environment',
    CODECOPY: 'environment',
    GASPRICE: 'environment',
    EXTCODESIZE: 'environment',
    EXTCODECOPY: 'environment',
    RETURNDATASIZE: 'environment',
    RETURNDATACOPY: 'environment',
    EXTCODEHASH: 'environment',
    BLOCKHASH: 'block',
    COINBASE: 'block',
    TIMESTAMP: 'block',
    NUMBER: 'block',
    PREVRANDAO: 'block',
    GASLIMIT: 'block',
    CHAINID: 'block',
    SELFBALANCE: 'block',
    BASEFEE: 'block',
    BLOBHASH: 'block',
    BLOBBASEFEE: 'block',
    POP: 'stack',
    MLOAD: 'memory',
    MSTORE: 'memory',
    MSTORE8: 'memory',
    SLOAD: 'storage',
    SSTORE: 'storage',
    JUMP: 'control',
    JUMPI: 'control',
    PC: 'stack',
    MSIZE: 'memory',
    GAS: 'environment',
    JUMPDEST: 'control',
    TLOAD: 'storage',
    TSTORE: 'storage',
    MCOPY: 'memory',
    PUSH0: 'stack',
    CREATE: 'system',
    CALL: 'system',
    CALLCODE: 'system',
    RETURN: 'control',
    DELEGATECALL: 'system',
    CREATE2: 'system',
    STATICCALL: 'system',
    REVERT: 'control',
    INVALID: 'control',
    SELFDESTRUCT: 'system',
};

/**
 * Resolves the category for any opcode mnemonic, including generated
 * PUSH1-32, DUP1-16, SWAP1-16, and LOG0-4.
 */
function resolveCategory(mnemonic: string): string {
    if (CATEGORY_MAP[mnemonic]) return CATEGORY_MAP[mnemonic] as string;
    if (mnemonic.startsWith('PUSH')) return 'stack';
    if (mnemonic.startsWith('DUP')) return 'stack';
    if (mnemonic.startsWith('SWAP')) return 'stack';
    if (mnemonic.startsWith('LOG')) return 'logging';
    return 'unknown';
}

/**
 * Estimate dynamic gas for opcodes whose cost depends on operands.
 * Falls back to the opcode's base gas for opcodes without special handling.
 */
function estimateGas(instr: Instruction): number {
    const mnemonic = instr.opcode.mnemonic;

    if (mnemonic === 'KECCAK256') {
        return 30; // base only — word cost requires runtime data size
    }

    if (mnemonic.startsWith('LOG')) {
        const topics = parseInt(mnemonic.slice(3), 10) || 0;
        return 375 + 375 * topics; // data cost requires runtime size
    }

    if (mnemonic === 'EXP') {
        return 10; // base only — byte-of-exponent cost requires runtime value
    }

    return instr.opcode.gas;
}

/**
 * Static gas cost analyser for EVM instruction sequences.
 *
 * Computes base gas costs from opcode metadata and provides per-opcode
 * and per-category breakdowns. Dynamic costs (memory expansion, call
 * stipends, etc.) require runtime state and are not modelled — the
 * analyser uses base costs as documented in the Yellow Paper.
 */
export class GasCalculator {
    /**
     * Analyse a full instruction sequence and return a detailed gas report.
     */
    analyze(instructions: Instruction[]): GasReport {
        const byOpcode = new Map<string, OpcodeGasEntry>();
        const byCategory = new Map<string, number>();
        let totalGas = 0;

        for (const instr of instructions) {
            const gas = estimateGas(instr);
            totalGas += gas;

            const mn = instr.opcode.mnemonic;
            const existing = byOpcode.get(mn);
            if (existing) {
                existing.count++;
                existing.gas += gas;
            } else {
                byOpcode.set(mn, { count: 1, gas });
            }

            const category = resolveCategory(mn);
            byCategory.set(category, (byCategory.get(category) ?? 0) + gas);
        }

        return { totalGas, instructionCount: instructions.length, byOpcode, byCategory };
    }

    /**
     * Estimate gas for a single function body (from FunctionIdentifier output).
     */
    estimateFunction(body: Instruction[], selector?: string, name?: string): FunctionGasEstimate {
        const report = this.analyze(body);
        return {
            selector,
            name,
            totalGas: report.totalGas,
            instructionCount: report.instructionCount,
            byOpcode: report.byOpcode,
        };
    }

    /**
     * Find the N most gas-expensive contiguous instruction windows.
     * Uses a sliding window of `windowSize` instructions.
     */
    hotspots(instructions: Instruction[], topN = 5, windowSize = 10): GasHotspot[] {
        if (instructions.length === 0) return [];

        const spots: GasHotspot[] = [];
        const effectiveWindow = Math.min(windowSize, instructions.length);

        let windowGas = 0;
        for (let i = 0; i < effectiveWindow; i++) {
            windowGas += estimateGas(instructions[i]!);
        }

        spots.push({
            startPC: instructions[0]!.pc,
            endPC: instructions[effectiveWindow - 1]!.pc,
            gas: windowGas,
            instructions: instructions.slice(0, effectiveWindow),
        });

        for (let i = effectiveWindow; i < instructions.length; i++) {
            windowGas += estimateGas(instructions[i]!);
            windowGas -= estimateGas(instructions[i - effectiveWindow]!);

            spots.push({
                startPC: instructions[i - effectiveWindow + 1]!.pc,
                endPC: instructions[i]!.pc,
                gas: windowGas,
                instructions: instructions.slice(i - effectiveWindow + 1, i + 1),
            });
        }

        spots.sort((a, b) => b.gas - a.gas);
        return spots.slice(0, topN);
    }
}
