import { describe, test, expect } from 'vitest';
import { disassemble } from '../../src/core/parser';
import { validate } from '../../src/core/validator';

describe('BytecodeValidator', () => {
    test('valid bytecode passes', () => {
        const result = disassemble('0x600160020100');
        const validation = validate(result);
        expect(validation.valid).toBe(true);
        expect(validation.errors).toHaveLength(0);
    });

    test('detects no terminal warning', () => {
        const result = disassemble('0x6001600201');
        const validation = validate(result);
        expect(validation.warnings.some(w => w.kind === 'no_terminal')).toBe(true);
    });

    test('detects INVALID opcode warning', () => {
        const result = disassemble('0xfe');
        const validation = validate(result);
        expect(validation.warnings.some(w => w.kind === 'invalid_opcode')).toBe(true);
    });

    test('valid JUMP to JUMPDEST passes', () => {
        const result = disassemble('0x600456005b00');
        const validation = validate(result);
        expect(validation.errors.some(e => e.kind === 'invalid_jumpdest')).toBe(false);
    });

    test('truncated PUSH generates error', () => {
        const result = disassemble('0x6112');
        const validation = validate(result);
        expect(validation.errors.some(e => e.kind === 'truncated_push')).toBe(true);
    });
});
