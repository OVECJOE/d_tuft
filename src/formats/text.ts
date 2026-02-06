import type { DisassemblyResult, Instruction } from "../core/types";
import { bytesToHex } from "../utils/hex";

export interface TextFormatOptions {
    includePC?: boolean;
    includeGas?: boolean;
    includeHex?: boolean;
    indentSize?: number;
}

/**
 * Format disassembly as human-readable text
 */
export function formatAsText(
    result: DisassemblyResult,
    options: TextFormatOptions = {}
): string {
    const {
        includePC = true,
        includeGas = false,
        includeHex = false,
        indentSize = 0
    } = options;

    const lines: string[] = [];
    const indent = ' '.repeat(indentSize);

    // Header
    lines.push(`${indent}Disassembly (${result.totalBytes} bytes)`);
    lines.push(`${indent}${'='.repeat(50)}`);
    lines.push('');

    // Instructions
    for (const instruction of result.instructions) {
        lines.push(indent + formatInstruction(instruction, {
            includePC,
            includeGas,
            includeHex
        }));
    }

    // Warnings
    if (result.warnings.length > 0) {
        lines.push('');
        lines.push(`${indent}Warnings:`);
        for (const warning of result.warnings) {
            lines.push(`${indent} - ${warning}`);
        }
    }

    // JUMP destinations
    if (result.jumpDestinations.size > 0) {
        lines.push('');
        lines.push(`${indent}Valid Jump Destinations:`);
        lines.push(`${indent}  ${Array.from(result.jumpDestinations).sort((a, b) => a - b).join(', ')}`);
    }

    return lines.join('\n');
}

/**
 * Format a single instruction
 */
export function formatInstruction(
    instruction: Instruction,
    options: Partial<TextFormatOptions> = {}
): string {
    const parts: string[] = [];
    
    // Program counter
    if (options.includePC !== false) {
        parts.push(`[${instruction.pc.toString().padStart(5, '0')}]`);
    }
    
    // Mnemonic
    parts.push(instruction.opcode.mnemonic.padEnd(12, ' '));
    
    // Operand (for PUSH)
    if (instruction.immediate) {
        parts.push(bytesToHex(instruction.immediate));
    }
    
    // Gas cost
    if (options.includeGas) {
        parts.push(`(${instruction.opcode.gas} gas)`);
    }
    
    // Hex bytes
    if (options.includeHex) {
        const hex = instruction.immediate
            ? `${instruction.opcode.value.toString(16).padStart(2, '0')} ${bytesToHex(instruction.immediate).slice(2)}`
            : instruction.opcode.value.toString(16).padStart(2, '0');
        parts.push(`// 0x${hex}`);
    }
    
    return parts.join(' ');
}
