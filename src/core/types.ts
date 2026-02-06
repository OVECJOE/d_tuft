/**
 * Represents a single byte value (0x00 - 0xFF)
 */
export type ByteValue = number;

/**
 * All valid EVM opcode byte values
 */
export type OpcodeValue = ByteValue;

/**
 * Opcode metadata structure
 */
export interface Opcode {
    /** Byte value of the opcode */
    value: OpcodeValue;

    /** Human-readable name of the opcode (e.g., "ADD", "PUSH1") */
    mnemonic: string

    /** Number of items popped from stack */
    inputs: number;

    /** Number of items pushed to stack */
    outputs: number;

    /** Base gas cost (may have additional dynamic costs) */
    gas: number;

    /** For PUSH opcodes, number of bytes that follow (1-32) */
    pushBytes?: number;

    /** Description of what the opcode does */
    description: string;

    /** Whether this opcode halts execution */
    halts?: boolean;

    /** Whether this opcode is deprecated */
    deprecated?: boolean;
}

/**
 * A single parsed instruction from bytecode
 */
export interface Instruction {
    /** The opcode definition */
    opcode: Opcode;

    /** Position in original bytecode (program counter) */
    pc: number;

    /** Immediate data for PUSH operations */
    immediate?: Uint8Array;
}

/**
 * Result of disassembling bytecode
 */
export interface DisassemblyResult {
    /** Parsed instructions */
    instructions: Instruction[];

    /** Warnings encountered during parsing */
    warnings: string[];

    /** Set of all valid jump destinations (JUMPEST positions) */
    jumpDestinations: Set<number>;

    /** Total byte length */
    totalBytes: number;
}

/**
 * A line in human-readable assembly
 */
export interface AssemblyLine {
    /** Program counter (optional for input) */
    pc?: number;
    
    /** Opcode mnemonic */
    mnemonic: string;
    
    /** Operand (for PUSH operations) */
    operand?: string;
    
    /** Optional comment */
    comment?: string;
}

/**
 * Assembly program structure
 */
export interface AssemblyProgram {
    /** Assembly lines */
    lines: AssemblyLine[];

    /** Any warnings or errors */
    warnings: string[];
}

/**
 * Options for disassembly
 */
export interface DisassemblyOptions {
    /** Include gas costs in output */
    includeGas?: boolean;

    /** Include program counter in output */
    includePC?: boolean;

    /** Attempt to identify function selectors */
    identifyFunctions?: boolean;
}

/**
 * Options for assembly
 */
export interface AssemblyOptions {
    /** Validate jump destinations */
    validateJumps?: boolean;
    
    /** Optimize PUSH sizes */
    optimizePush?: boolean;
}
