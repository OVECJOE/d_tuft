import { OPCODES } from '../../src/core/opcodes';
import type { Opcode } from '../../src/core/types';

/**
 * Generate bytecode containing all valid EVM opcodes.
 * For PUSH opcodes, includes appropriate immediate data.
 * Skips undefined opcode values (gaps in the opcode table).
 */
export function generateAllOpcodesBytecode(): Uint8Array {
    const bytes: number[] = [];

    // Iterate through all possible opcode values (0x00 - 0xff)
    for (let i = 0; i <= 0xff; i++) {
        const opcode = OPCODES[i as keyof typeof OPCODES] as Opcode | undefined;

        // Skip undefined opcodes (gaps in the EVM opcode table)
        if (!opcode) {
            continue;
        }

        // Add the opcode byte
        bytes.push(opcode.value);

        // For PUSH opcodes, add the required immediate bytes
        if (opcode.pushBytes && opcode.pushBytes > 0) {
            for (let j = 0; j < opcode.pushBytes; j++) {
                // Use varying data to ensure proper parsing (not just zeros)
                // Pattern: 0xAB for first byte, then incrementing values
                bytes.push((j + 1) & 0xff);
            }
        }
    }

    return new Uint8Array(bytes);
}
