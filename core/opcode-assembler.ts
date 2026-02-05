import type { DisassembledCode } from "./bytecode-parser";

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

export function assemble(dissembled: DisassembledCode): AssemblyProgram {
    const lines: AssemblyLine[] = [];
    const warnings: string[] = [];

    for (const inst of dissembled.instructions) {
        if (inst.opcode.mnemonic === 'INVALID') {
            warnings.push(`Invalid opcode 0x${inst.opcode.value.toString(16)} at PC ${inst.programCounter}`);
            continue;
        }

        // if (inst.)
        // TODO: Handle immediate data for PUSH opcode and then whatever conversion is necessary, do.
    }

    return { lines, warnings };
}
