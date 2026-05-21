export const OP = {
    STOP: 0x00,
    JUMPDEST: 0x5b,
    JUMP: 0x56,
    JUMPI: 0x57,
    PUSH1: 0x60,
    PUSH2: 0x61,
    PUSH4: 0x63,
    PUSH32: 0x7f,
    EQ: 0x14,
    RETURN: 0xf3,
    REVERT: 0xfd,
    INVALID: 0xfe,
    SELFDESTRUCT: 0xff,
} as const;

/**
 * Opcodes that unconditionally terminate a code path
 */
export const TERMINAL_OPCODES: Set<number> = new Set([OP.STOP, OP.RETURN, OP.REVERT, OP.INVALID, OP.SELFDESTRUCT]);
