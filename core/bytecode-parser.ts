import { type Opcode, OPCODES } from "./opcodes";

export type AnnotatedBytecode = {
    bytes: Uint8Array;
    origin?: "compiled" | "user-provided" | "on-chain";
    address?: string; // Contract address if from chain
    creationCode?: boolean; // Constructor code vs runtime code
}

export type Instruction = {
    type: Opcode;
    programCounter: number; // Position in bytecode
    immediateData?: Uint8Array; // For PUSH instructions
}

export type DisassembledCode = {
    instructions: Instruction[];
    metadata?: {
        totalBytes: number;
        invalidOpcodes: number[];
        jumpDestinations: Set<number>; // All valid JUMPDEST positions
    }
}

export function fromBytecode(bytecode: AnnotatedBytecode): DisassembledCode {
    const instructions: Instruction[] = [];
    const metadata: DisassembledCode["metadata"] = {
        totalBytes: bytecode.bytes.length,
        invalidOpcodes: [],
        jumpDestinations: new Set<number>(),
    };

    let position = 0;
    while (position < metadata.totalBytes) {
        const opcodeValue = bytecode.bytes[position] as keyof typeof OPCODES;
        const opcode = OPCODES[opcodeValue];

        if (!opcode) {
            metadata.invalidOpcodes.push(position);
            position += 1;
            continue;
        }

        if (opcode.mnemonic === "JUMPDEST") {
            metadata.jumpDestinations.add(position);
        }

        if (opcode.pushBytes !== undefined && opcode.pushBytes > 0) {
            const immediateData = bytecode.bytes.slice(
                position + 1,
                position + 1 + opcode.pushBytes
            );
            instructions.push({
                type: opcode,
                programCounter: position,
                immediateData
            });
            position += 1 + opcode.pushBytes;
        } else {
            instructions.push({
                type: opcode,
                programCounter: position
            });
            position += 1;
        }
    }

    return { instructions, metadata };
}
