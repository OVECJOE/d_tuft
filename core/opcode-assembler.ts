export type AssemblyLine = {
    programCounter: number;
    mnemonic: string;
    operand?: string; // For PUSH: the hex value.
    comment?: string; // Optional annotation
    gasUsed?: number; // Cumulative gas at this point
}

export type AssemblyProgram = {
    lines: AssemblyLine[];
    warnings?: string[]; // Parse warnings (unknown opcodes, etc.)
}
