import { describe, test, expect } from "vitest";
import { OpcodeAssembler } from "../../src/core/assembler";
import { bytesToHex } from "../../src/utils/hex";

describe("OpcodeAssembler", () => {
    test('assembles simple operations', () => {
        const assembler = new OpcodeAssembler();
        const bytecode = assembler.assemble({
            lines: [
                { mnemonic: 'PUSH1', operand: '0x01' },
                { mnemonic: 'PUSH1', operand: '0x02' },
                { mnemonic: 'ADD' }
            ],
            warnings: []
        });

        expect(bytesToHex(bytecode)).toBe('0x6001600201');
    });

    test('pads short operands', () => {
        const assembler = new OpcodeAssembler();
        const bytecode = assembler.assemble({
            lines: [
                { mnemonic: 'PUSH2', operand: '0x01' } // Should pad to 2 bytes
            ],
            warnings: []
        });

        expect(bytesToHex(bytecode)).toBe('0x610001');
    });

    test('throws on unknown mnemonic', () => {
        const assembler = new OpcodeAssembler();

        expect(() => {
            assembler.assemble({
                lines: [{ mnemonic: 'UNKNOWN' }],
                warnings: []
            });
        }).toThrow('Unknown mnemonic');
    });
});
