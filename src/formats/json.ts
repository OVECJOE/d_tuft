import type { DisassemblyResult, Instruction } from '../core/types';
import { bytesToHex } from '../utils/hex';

/**
 * Format diassembly as JSON
 */
export function formatAsJSON(result: DisassemblyResult, pretty: boolean = true): string {
    const data = {
        metadata: {
            totalBytes: result.totalBytes,
            instructionCount: result.instructions.length,
            jumpDestinations: Array.from(result.jumpDestinations).sort((a, b) => a - b),
            warnings: result.warnings,
        },
        instructions: result.instructions.map(formatInstructionJSON),
    };

    return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
}

function formatInstructionJSON(instruction: Instruction) {
    return {
        pc: instruction.pc,
        opcode: {
            value: `0x${instruction.opcode.value.toString(16).padStart(2, '0')}`,
            mnemonic: instruction.opcode.mnemonic,
            gas: instruction.opcode.gas,
            inputs: instruction.opcode.inputs,
            outputs: instruction.opcode.outputs,
        },
        ...(instruction.immediate && {
            immediate: bytesToHex(instruction.immediate),
        }),
    };
}
