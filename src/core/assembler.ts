import { MNEMONIC_TO_OPCODE } from "./opcodes";
import type { AssemblyLine, AssemblyProgram, AssemblyOptions, Instruction, Opcode } from "./types";
import { hexToBytes, removeHexPrefix, isHexString, isOddLengthHex, normalizeHex, addHexPrefix } from "../utils/hex";
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
     * Assemble to the intermediate representation (array of instructions) instead of raw bytecode
     * Useful for analysis or transformations before final bytecode generation
     */
    assembleToInstructions(program: AssemblyProgram): Instruction[] {
        this._warnings = [];
        const instructions: Instruction[] = [];

        for (let i = 0; i < program.lines.length; i++) {
            const line = program.lines[i] as AssemblyLine;
            try {
                instructions.push({
                    opcode: MNEMONIC_TO_OPCODE[line.mnemonic.toUpperCase()] as Opcode,
                    pc: line.pc ?? 0, // If pc is not provided, default to 0 (or could calculate based on previous instructions)
                    immediate: line.operand ? this.parseOperand(line.operand, 32, line.mnemonic) : undefined
                });
            } catch (error) {
                throw new Error(
                    `Error assembling line ${i + 1} ("${line.mnemonic}"): ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
            }
        }

        return instructions;
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

        // Handle PUSH0 explicitly - it takes no operand
        if (opcode.mnemonic === 'PUSH0') {
            if (line.operand) {
                this.warn(
                    `Line ${lineNumber + 1}: PUSH0 doesn't take an operand, ignoring "${line.operand}"`
                );
            }
            return new Uint8Array([opcode.value]);
        }

        // Handle PUSH1-PUSH32 - require immediate data
        if (opcode.pushBytes !== undefined && opcode.pushBytes > 0) {
            if (!line.operand) {
                throw new Error(`Line ${lineNumber + 1}: ${mnemonic} requires an operand`);
            }

            const immediateData = this.parseOperand(line.operand, opcode.pushBytes, mnemonic);

            return concatBytes(
                new Uint8Array([opcode.value]),
                immediateData
            );
        }

        // Simple opcode without immediate data
        if (line.operand) {
            this.warn(
                `Line ${lineNumber + 1}: ${mnemonic} doesn't take an operand, ignoring "${line.operand}"`
            );
        }
        return new Uint8Array([opcode.value]);
    }

    /**
     * Parse operand value and convert to bytes
     */
    private parseOperand(operand: string, expectedBytes: number, mnemonic: string): Uint8Array {
        // Remove whitespace
        operand = operand.trim();

        // Check if it's a hex string
        if (!isHexString(operand)) {
            // Provide helpful error for common mistake of odd-length hex
            if (isOddLengthHex(operand)) {
                const normalized = normalizeHex(operand);
                throw new Error(
                    `Invalid operand for ${mnemonic}: "${operand}" has odd length. Did you mean "${normalized}"?`
                );
            }
            throw new Error(
                `Invalid operand for ${mnemonic}: "${operand}" (expected hex string)`
            );
        }

        // Convert to bytes
        const bytes = hexToBytes(addHexPrefix(operand));
        
        if (bytes.length < expectedBytes) {
            // Pad left with zeros (big-endian)
            const padded = new Uint8Array(expectedBytes);
            padded.set(bytes, expectedBytes - bytes.length);
            return padded;
        } else if (bytes.length > expectedBytes) {
            // Truncate - take LEFTMOST (most significant) bytes
            // This matches EVM behavior where if you somehow had extra bytes,
            // the instruction would consume only what it needs from the beginning
            this.warn(
                `Operand "${operand}" is larger than ${expectedBytes} bytes, truncating to leftmost ${expectedBytes} bytes`
            );
            return bytes.slice(0, expectedBytes);
        }

        return bytes;
    }

    /**
     * Determine optimal PUSH opcode for a value
     * Returns the minimum PUSH size needed, with 0 indicating PUSH0 should be used
     * Useful for optimizing: PUSH 0x00 -> PUSH0, PUSH 0x01 -> PUSH1, etc.
     */
    determinePushSize(value: string): number {
        const hex = removeHexPrefix(value);
        
        // Empty or all zeros should use PUSH0 (EIP-3855)
        if (hex.length === 0 || /^0+$/.test(hex)) {
            return 0;
        }

        // Calculate minimum bytes needed (removing leading zeros)
        const trimmed = hex.replace(/^0+/, '');
        const bytes = Math.ceil(trimmed.length / 2);
        
        // Clamp to valid range: 1-32 bytes
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
): Uint8Array | Instruction[] {
    const normalizedProgram: AssemblyProgram = Array.isArray(program)
        ? { lines: program, warnings: [] }
        : program;
    
    const assembler = new OpcodeAssembler(options);
    if (options?.toInstructions) {
        return assembler.assembleToInstructions(normalizedProgram);
    }
    return assembler.assemble(normalizedProgram);
}
