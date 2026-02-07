import { describe, test, expect } from 'vitest';
import { disassemble } from '../../src/core/parser';
import { assemble } from '../../src/core/assembler';
import { bytesToHex } from '../../src/utils/hex';
import { generateAllOpcodesBytecode } from '../utils/generators';

describe('Round-trip fidelity', () => {
    test('simple bytecode round-trips perfectly', () => {
        const original = '0x6001600201';

        // Disassemble
        const disassembled = disassemble(original);

        // Convert to assembly
        const assembly = disassembled.instructions.map(instr => ({
            mnemonic: instr.opcode.mnemonic,
            ...(instr.immediate && { operand: bytesToHex(instr.immediate) })
        }));

        // Re-assemble
        const reassembled = assemble({ lines: assembly, warnings: [] });
        
        expect(bytesToHex(reassembled)).toBe(original);
    });

    test('all opcodes round-trip', () => {
        const allOpcodesBytecode = generateAllOpcodesBytecode();

        const disassembled = disassemble(allOpcodesBytecode);
        const assembly = disassembled.instructions.map(instr => ({
            mnemonic: instr.opcode.mnemonic,
            ...(instr.immediate && { operand: bytesToHex(instr.immediate) })
        }));

        const reassembled = assemble({ lines: assembly, warnings: [] });

        expect(bytesToHex(reassembled)).toBe(bytesToHex(allOpcodesBytecode));
    })
});
