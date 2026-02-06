import { MNEMONIC_TO_OPCODE } from "./opcodes";
import type { AssemblyLine, AssemblyProgram, AssemblyOptions } from "./types";
import { hexToBytes, removeHexPrefix, isHexString, addHexPrefix } from "../utils/hex";
import { concatBytes } from "../utils/bytes";

/**
 * Opcode assembler - converts assembly to bytecode
 */
export class OpcodeAssembler {
    private _warnings: string[] = [];

    constructor(private options: AssemblyOptions = {}) {}

    /**
     * Get warnings from last assembly
     */
    get warnings(): string[] {
        return this._warnings;
    }

    /**
     * Main assembly function
     */
    assemble(program: AssemblyProgram): Uint8Array {
        this._warnings = [];
        const bytecodeChunks: Uint8Array[] = [];

        for (let i = 0; i < program.lines.length; i++) {
            const line = program.lines[i] as AssemblyLine;
            try {
                const bytes = this.assembleLine(line, i);
                bytecodeChunks.push(bytes);
            } catch (error) {
                throw new Error(
                    `Error assembling line ${i + 1} ("${line.mnemonic}"): ${
                        error instanceof Error ? error.message : String(error)
                    }`
                )
            }
        }

        return concatBytes(...bytecodeChunks);
    }

    /**
     * Assemble a single line
     */
    private assembleLine(line: AssemblyLine, lineNumber: number): Uint8Array {
        const mnemonic = line.mnemonic.toUpperCase();
        const opcode = MNEMONIC_TO_OPCODE[mnemonic];
        if (!opcode) {
            throw new Error(`Unknown mnemonic: ${mnemonic}`);
        }

        // Simple opcode without immediate data
        if (!opcode.pushBytes) {
            if (line.operand) {
                this.warn(
                    `Line ${lineNumber + 1}: ${mnemonic} doesn't take an operand, ignoring "${line.operand}"`
                );
            }
            return new Uint8Array([opcode.value]);
        }

        // PUSH opcode - needs immediate data
        if (!line.operand) {
            throw new Error(`Line ${lineNumber + 1}: ${mnemonic} requires an operand`);
        }

        const immediateData = this.parseOperand(line.operand, opcode.pushBytes, mnemonic);

        return concatBytes(
            new Uint8Array([opcode.value]),
            immediateData
        );
    }

    /**
     * Parse operand value and convert to bytes
     */
    private parseOperand(operand: string, expectedBytes: number, mnemonic: string): Uint8Array {
        // Remove whitespace
        operand = operand.trim();

        // Check if it's a hex string
        if (!isHexString(operand)) {
            throw new Error(
                `Invalid operand for ${mnemonic}: "${operand}" (expected hex string)`
            );
        }

        // Convert to bytes
        const bytes = hexToBytes(addHexPrefix(operand));

        // Pad or truncate to expected size
        if (bytes.length < expectedBytes) {
            // Pad left with zeros (big-endian)
            const padded = new Uint8Array(expectedBytes);
            padded.set(bytes, expectedBytes - bytes.length);
            return padded;
        } else if (bytes.length > expectedBytes) {
            // Truncate (take rightmost bytes)
            this.warn(
                `Operand "${operand}" is larger than ${expectedBytes} bytes, truncating`
            );
            return bytes.slice(bytes.length - expectedBytes);
        }

        return bytes;
    }

    /**
     * Get PUSH opcode for value (determines minimum size needed)
     * Useful for optimizing: PUSH 0x01 -> PUSH1, not PUSH32
     */
    determinePushSize(value: string): number {
        const hex = removeHexPrefix(value);
        const bytes = Math.ceil(hex.length / 2);
        return Math.max(1, Math.min(32, bytes));
    }

    /**
     * Log a warning
     */
    warn(message: string): void {
        this._warnings.push(message);
    }
}

/**
 * Convenience function to assemble opcodes
 */
export function assemble(
    program: AssemblyProgram | AssemblyLine[],
    options?: AssemblyOptions
): Uint8Array {
    const normalizedProgram: AssemblyProgram = Array.isArray(program)
        ? { lines: program, warnings: [] }
        : program;
    
    const assembler = new OpcodeAssembler(options);
    return assembler.assemble(normalizedProgram);
}
