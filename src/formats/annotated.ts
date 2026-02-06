import type { DisassemblyResult } from '../core/types';
import { formatInstruction } from './text';

/**
 * Format disassembly with detailed annotations
 */
export function formatAnnotated(result: DisassemblyResult): string {
    const lines: string[] = [];
    
    lines.push('╔═══════════════════════════════════════════════════════════════╗');
    lines.push('║              EVM BYTECODE DISASSEMBLY (Annotated)             ║');
    lines.push('╠═══════════════════════════════════════════════════════════════╣');
    lines.push(`║ Total Size: ${result.totalBytes.toString().padEnd(50, ' ')}║`);
    lines.push(`║ Instructions: ${result.instructions.length.toString().padEnd(48, ' ')}║`);
    lines.push(`║ Jump Destinations: ${result.jumpDestinations.size.toString().padEnd(42, ' ')}║`);
    lines.push('╠═══════════════════════════════════════════════════════════════╣');
    lines.push('║  PC   │ OPCODE       │ OPERAND                 │ STACK EFFECT ║');
    lines.push('╠═══════╪══════════════╪═════════════════════════╪══════════════╣');
    
    for (const instruction of result.instructions) {
        const pc = instruction.pc.toString().padStart(5, '0');
        const mnemonic = instruction.opcode.mnemonic.padEnd(12, ' ');
        
        let operand = instruction.immediate
            ? instruction.immediate.slice(0, 8).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '0x')
            : '';
        if (instruction.immediate && instruction.immediate.length > 8) {
            operand += '...';
        }
        operand = operand.padEnd(23, ' ');
        
        const effect = `(${instruction.opcode.inputs})→(${instruction.opcode.outputs})`.padEnd(12, ' ');
        
        lines.push(`║ ${pc} │ ${mnemonic} │ ${operand} │ ${effect} ║`);
    }
    
    lines.push('╚═══════╧══════════════╧═════════════════════════╧══════════════╝');
    
    // Add warnings if any
    if (result.warnings.length > 0) {
        lines.push('');
        lines.push('⚠️  WARNINGS:');
        for (const warning of result.warnings) {
            lines.push(`    • ${warning}`);
        }
    }
    
    return lines.join('\n');
}
