import { hexToBytes } from "../utils/hex";
import { OPCODES, INVALID_OPCODE } from "./opcodes";
import type {
    Instruction,
    DisassemblyResult,
    DisassemblyOptions,
    Opcode
} from "./types";

/**
 * Bytecode parser - converts bytecode to instructions
 */
export class BytecodeParser {
    private bytecode: Uint8Array = new Uint8Array();
    private position: number = 0;
    private instructions: Instruction[] = [];
    private warnings: string[] = [];
    private jumpDestinations: Set<number> = new Set();

    constructor(private options: DisassemblyOptions = {}) {}

    /**
     * Main parsing function
     */
    parse(bytecode: Uint8Array): DisassemblyResult {
        this.reset();
        this.bytecode = bytecode;

        // First pass: parse all instructions
        while (this.position < this.bytecode.length) {
            const instruction = this.parseNextInstruction();
            this.instructions.push(instruction);

            // Track JUMPDEST positions
            if (instruction.opcode.mnemonic === 'JUMPDEST') {
                this.jumpDestinations.add(instruction.pc);
            }
        }

        return {
            instructions: this.instructions,
            warnings: this.warnings,
            jumpDestinations: this.jumpDestinations,
            totalBytes: this.bytecode.length
        };
    }

    /**
     * Parse a single instruction at current position
     */
    private parseNextInstruction(): Instruction {
        const pc = this.position;
        const byte = this.readByte();
        
        // Look up opcode
        const opcode = OPCODES[byte];
        
        if (!opcode) {
            this.warn(`Unknown opcode 0x${byte.toString(16).padStart(2, '0')} at position ${pc}`);
            return this.createInvalidInstruction(pc);
        }

        // Handle PUSH opcodes
        if (opcode.pushBytes) {
            const [immediate, truncated] = this.readImmediateData(opcode.pushBytes);
            
            // Warn if truncated
            if (truncated) {
                this.warn(
                    `Truncated ${opcode.mnemonic} at position ${pc}: ` +
                    `expected ${opcode.pushBytes} bytes, got ${immediate.length}`
                );
            }

            return {
                opcode,
                pc,
                immediate
            };
        }
        
        // Regular opcode
        return {
            opcode,
            pc
        };
    }

    /**
     * Read a single byte and advance position
     */
    private readByte(): number {
        if (this.position >= this.bytecode.length) {
            throw new Error('Unexpected end of bytecode');
        }
        return this.bytecode[this.position++] as number;
    }

    /**
     * Read immediate data for PUSH operations
     */
    private readImmediateData(count: number): [Uint8Array, boolean] {
        const available = this.bytecode.length - this.position;
        const toRead = Math.min(count, available);
        
        const data = new Uint8Array(count);
        
        // Read available bytes
        for (let i = 0; i < toRead; i++) {
            data[i] = this.bytecode[this.position++] as number;
        }
        
        // Remaining bytes are implicitly 0x00 (already zero-initialized)
        
        return [data, toRead < count];
    }

    /**
     * Create an invalid instruction
     */
    private createInvalidInstruction(pc: number): Instruction {
        return { opcode: INVALID_OPCODE, pc };
    }

    /**
     * Add a warning
     */
    private warn(message: string): void {
        this.warnings.push(message);
    }

    /**
     * Reset parser state
     */
    private reset(): void {
        this.position = 0;
        this.instructions = [];
        this.warnings = [];
        this.jumpDestinations = new Set();
    }
}

/**
 * Convenience function to parse bytecode
 */
export function disassemble(
    bytecode: Uint8Array | string,
    options?: DisassemblyOptions
): DisassemblyResult {
    // Convert hex string to bytes if needed
    if (typeof bytecode === 'string') {
        bytecode = hexToBytes(bytecode);
    }

    const parser = new BytecodeParser(options);
    return parser.parse(bytecode);
}
