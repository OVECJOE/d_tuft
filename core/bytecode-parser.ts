import { type Opcode, OPCODES, type OpcodeValue } from "./opcodes";

export type AnnotatedBytecode = {
    bytes: Uint8Array;
    origin?: "compiled" | "user-provided" | "on-chain";
    address?: string; // Contract address if from chain
    creationCode?: boolean; // Constructor code vs runtime code
}

export type Instruction = {
    opcode: Opcode;
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

export class BytecodeParser {
    private position: number = 0;
    private bytecode: Uint8Array = new Uint8Array();
    private instructions: Instruction[] = [];

    private static INVALID_OPCODE(byte: number): Opcode {
        return {
            value: byte as OpcodeValue,
            mnemonic: 'INVALID',
            inputs: 0,
            outputs: 0,
            gasBase: 0
        };
    }

    parse(bytecode: Uint8Array): DisassembledCode {
        this.bytecode = bytecode;
        this.position = 0;
        this.instructions = [];

        while (this.position < this.bytecode.length) {
            this.parseNextInst();
        }

        return {
            instructions: this.instructions,
            metadata: this.computeMetadata()
        };
    }

    private parseNextInst(): void {
        const pc = this.position;
        const byte = this.bytecode[pc] as keyof typeof OPCODES;
        const opcode = OPCODES[byte];

        if (!opcode) {
            // Handle invalid opcode
            this.instructions.push({
                opcode: BytecodeParser.INVALID_OPCODE(byte),
                programCounter: pc
            });
            this.position++;
            return;
        }

        if (opcode.pushBytes) {
            const immediateData = this.readBytes(opcode.pushBytes);
            this.instructions.push({
                opcode,
                programCounter: pc,
                immediateData
            });
        } else {
            this.instructions.push({ opcode, programCounter: pc });
        }

        this.position++;
    }

    private readBytes(count: number): Uint8Array {
        const available = this.bytecode.length - (this.position + 1);
        const toRead = Math.min(count, available);
        const bytes = new Uint8Array(count);

        for (let i = 0; i < toRead; i++) {
            bytes[i] = this.bytecode[this.position + 1 + i] || 0x00;
        }

        this.position += toRead; // Move position past the immediate data
        return bytes;
    }

    private computeMetadata() {
        const totalBytes = this.bytecode.length;
        const invalidOpcodes = this.instructions
            .filter(inst => inst.opcode.mnemonic === 'INVALID')
            .map(inst => inst.programCounter);
        const jumpDestinations = new Set(
            this.instructions
                .filter(inst => inst.opcode.mnemonic === 'JUMPDEST')
                .map(inst => inst.programCounter)
        );

        return { totalBytes, invalidOpcodes, jumpDestinations };
    }
}

export function fromBytecode(bytecode: string): DisassembledCode {
    const bytes = Uint8Array.from(Buffer.from(bytecode, "hex"));
    const parser = new BytecodeParser();
    return parser.parse(bytes);
}
