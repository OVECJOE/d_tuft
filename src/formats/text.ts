import { padR } from '~~/cli/ui/ansi';
import { T } from '~~/cli/ui/theme';
import type { DisassemblyResult, Instruction } from '../core/types';
import { bytesToHex } from '../utils/hex';
import { colorizeGas, colorizeHexComment, colorizeImmediate, colorizeOpcode, colorizePC } from './colors';

export interface TextFormatOptions {
    includePC?: boolean;
    includeGas?: boolean;
    includeHex?: boolean;
    indentSize?: number;
}

/** Format disassembly as human-readable, colorized text */
export function formatAsText(result: DisassemblyResult, options: TextFormatOptions = {}): string {
    const { includePC = true, includeGas = false, includeHex = false, indentSize = 0 } = options;

    const lines: string[] = [];
    const indent = ' '.repeat(indentSize);

    // Header
    lines.push(`${indent}${T.text.muted('Disassembly')}  ${T.val.number(`${result.totalBytes} bytes`)}`);
    lines.push(`${indent}${T.chrome.sep('─'.repeat(50))}`);
    lines.push('');

    // Instructions
    for (const instruction of result.instructions) {
        lines.push(indent + formatInstruction(instruction, { includePC, includeGas, includeHex }));
    }

    // Warnings
    if (result.warnings.length > 0) {
        lines.push('');
        lines.push(`${indent}${T.status.warn('Warnings:')}`);
        for (const warning of result.warnings) {
            lines.push(`${indent}  ${T.status.warn('⚠')} ${T.status.warn(warning)}`);
        }
    }

    // Jump destinations
    if (result.jumpDestinations.size > 0) {
        lines.push('');
        lines.push(`${indent}${T.op.jumpdest('Jump Destinations:')}`);
        const dests = Array.from(result.jumpDestinations).sort((a, b) => a - b);
        lines.push(`${indent}  ${dests.map((d) => T.op.jumpdest(String(d))).join(T.chrome.sep(', '))}`);
    }

    return lines.join('\n');
}

/** Format a single instruction with rich per-field colors */
export function formatInstruction(instruction: Instruction, options: Partial<TextFormatOptions> = {}): string {
    const parts: string[] = [];

    // PC  [00042]
    if (options.includePC !== false) {
        parts.push(colorizePC(`[${instruction.pc.toString().padStart(5, '0')}]`));
    }

    // Mnemonic — right-padded to 12 chars *inside* the colorizer via padR
    const colorizer = colorizeOpcode(instruction.opcode.mnemonic, instruction.opcode.value);
    parts.push(padR(colorizer(instruction.opcode.mnemonic), 12));

    // Immediate (PUSH operand)
    if (instruction.immediate) {
        parts.push(colorizeImmediate(bytesToHex(instruction.immediate)));
    }

    // Gas cost
    if (options.includeGas) {
        parts.push(colorizeGas(instruction.opcode.gas));
    }

    // Raw hex bytes
    if (options.includeHex) {
        const hex = instruction.immediate
            ? `${instruction.opcode.value.toString(16).padStart(2, '0')} ${bytesToHex(instruction.immediate).slice(2)}`
            : instruction.opcode.value.toString(16).padStart(2, '0');
        parts.push(colorizeHexComment(`0x${hex}`));
    }

    return parts.join(' ');
}
