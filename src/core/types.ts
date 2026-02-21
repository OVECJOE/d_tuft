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

    /** Convert to intermediate representation (array of instructions) */
    toInstructions?: boolean;
}

/**
 * Represents a function mapping for function selector identification
 */
export interface FunctionMap {
    /** The function signature selector (first 4 bytes) */
    selector: string;

    /** The function name */
    name?: string;

    /** The start offset in the bytecode */
    startOffset: number;

    /** The end offset in the bytecode */
    endOffset?: number;

    /** The function body (bytecode chunk) containing the actual function code */
    body: Instruction[];
}

/**
 * A parsed ABI input/output parameter
 */
export interface ABIParameter {
    /** Parameter name */
    name: string;
    /** Parameter type (e.g., "uint256", "address", "tuple") */
    type: string;
    /** For tuple types, the components of the tuple */
    components?: ABIParameter[]; // For tuples
}

/**
 * A single ABI entry (function, event, error, constructor)
 */
export interface ABIEntry {
    /** Type of the ABI entry */
    type: "function" | "constructor" | "receive" | "fallback" | "event" | "error";
    /** Name of the function/event/error (not applicable for constructor/receive/fallback) */
    name?: string;
    /** Input parameters (for functions, events, errors) */
    inputs?: ABIParameter[];
    /** Output parameters (for functions) */
    outputs?: ABIParameter[];
    /** State mutability (for functions) */
    stateMutability?: "pure" | "view" | "nonpayable" | "payable";
}

/**
 * Full contract ABI - array of entries
 */
export type ABI = ABIEntry[];

/**
 * A single entry found in the dispatcher - one PUSH4+EQ+JUMPI triplet
 */
export interface DispatcherEntry {
    /** The function selector (4-byte value) */
    selector: string;

    /** The PC of the PUSH4 instruction that loaded this selector */
    selectorPC: number;

    /** The jump destination offset (value from the PUSH2 before JUMPI) */
    jumpDestOffset: number;
}

/**
 * Result of a diff() comparison between two contract deployments.
 */
export interface SelectorDiff {
    /** The 4-byte selector hex */
    selector: string;
    /** Human name if resolved via resolveNames() */
    name?: string;
    /** What changed */
    kind: "added" | "removed" | "modified";
}
