import { describe, test, expect } from 'vitest';
import { BytecodeParser } from '../../src/core/parser';
import { hexToBytes } from '../../src/utils/hex';

describe('BytecodeParser', () => {
    test('parses simple ADD operation', () => {
        // PUSH1 0x01, PUSH1 0x02, ADD
        const bytecode = hexToBytes('0x6001600201');
        const parser = new BytecodeParser();
        const result = parser.parse(bytecode);

        expect(result.instructions).toHaveLength(3);
        expect(result.instructions[0].opcode.mnemonic).toBe('PUSH1');
        expect(result.instructions[1].opcode.mnemonic).toBe('PUSH1');
        expect(result.instructions[2].opcode.mnemonic).toBe('ADD');
        expect(result.warnings).toHaveLength(0);
    });

    test('handles truncated PUSH', () => {
        // PUSH2 with only 1 byte following
        const bytecode = hexToBytes('0x6112');
        const parser = new BytecodeParser();
        const result = parser.parse(bytecode);

        expect(result.instructions).toHaveLength(1);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain('Truncated');
    });

    test('identifies JUMPDEST positions', () => {
        // PUSH1 0x05, JUMP, JUMPDEST
        const bytecode = hexToBytes('0x60055600565b');
        const parser = new BytecodeParser();
        const result = parser.parse(bytecode);

        expect(result.jumpDestinations.has(5)).toBe(true);
    });

    test('handles invalid opcodes', () => {
        // Invalid opcode 0x0c
        const bytecode = hexToBytes('0x0c');
        const parser = new BytecodeParser();
        const result = parser.parse(bytecode);

        expect(result.instructions[0].opcode.mnemonic).toBe('INVALID');
        expect(result.warnings).toHaveLength(1);
    })
});
