/**
 * Opcode colorizer — maps mnemonic + byte value to a theme color token.
 * All colors come from T.op in the design system; no raw chalk here.
 */
import { T } from '~~/cli/ui/theme';

const EXACT: Record<string, typeof T.op[keyof typeof T.op]> = {
    // Halt
    STOP: T.op.halt,
    RETURN: T.op.halt,
    REVERT: T.op.halt,
    INVALID: T.op.halt,
    SELFDESTRUCT: T.op.halt,
    // Control flow
    JUMP: T.op.jump,
    JUMPI: T.op.jump,
    JUMPDEST: T.op.jumpdest,
    // Storage reads
    SLOAD: T.op.storage,
    TLOAD: T.op.storage,
    // Storage writes
    SSTORE: T.op.storageWrite,
    TSTORE: T.op.storageWrite,
    // Crypto
    KECCAK256: T.op.crypto,
    // External calls
    CALL: T.op.system,
    CALLCODE: T.op.deprecated,
    STATICCALL: T.op.system,
    DELEGATECALL: T.op.system,
    // Creators
    CREATE: T.op.create,
    CREATE2: T.op.create,
};

const PREFIXES: Array<[string, typeof T.op[keyof typeof T.op]]> = [
    ['PUSH', T.op.push],
    ['DUP', T.op.dup],
    ['SWAP', T.op.swap],
    ['LOG', T.op.log],
];

function byRange(value: number): typeof T.op[keyof typeof T.op] {
    if (value >= 0x00 && value <= 0x0b) return T.op.arithmetic;
    if (value >= 0x10 && value <= 0x1e) return T.op.comparison;
    if (value >= 0x30 && value <= 0x4a) return T.op.environment;
    if (value >= 0x50 && value <= 0x5e) return T.op.memory;
    return T.op.unknown;
}

/**
 * Return a chalk styler for the given EVM opcode.
 * @param mnemonic  e.g. "ADD", "PUSH1", "JUMPI"
 * @param value     opcode byte value — used for range heuristic fallback
 */
export function colorizeOpcode(mnemonic: string, value?: number) {
    if (EXACT[mnemonic]) return EXACT[mnemonic];
    for (const [prefix, color] of PREFIXES) {
        if (mnemonic.startsWith(prefix)) return color;
    }
    if (value !== undefined) return byRange(value);
    return T.op.unknown;
}

/** PC field  e.g. "00042" */
export function colorizePC(pc: string): string {
    return T.val.pc(pc);
}

/** Immediate (PUSH operand)  e.g. "0xdeadbeef" */
export function colorizeImmediate(hex: string): string {
    return T.val.immediate(hex);
}

/** Gas cost annotation */
export function colorizeGas(cost: number): string {
    return T.val.gas(cost);
}

/** Raw hex bytes annotation */
export function colorizeHexComment(hex: string): string {
    return T.val.hex(`// ${hex}`);
}

/**
 * Stack effect string.
 * Visible padding is handled here so callers never need to .padEnd() an ANSI string.
 */
export function colorizeStackEffect(inputs: number, outputs: number, width = 14): string {
    const net = outputs - inputs;
    const netStr = net > 0 ? `+${net}` : net < 0 ? String(net) : '±0';
    const baseVis = `(${inputs})→(${outputs}) `;
    const totalVis = baseVis.length + netStr.length;
    const padding = ' '.repeat(Math.max(0, width - totalVis));

    return T.text.muted(baseVis) + T.val.stackNet(net) + padding;
}
