#!/usr/bin/env bun

import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'node:fs';
import chalk from 'chalk';
import { disassemble } from '../core/parser';
import { assemble } from '../core/assembler';
import { formatAsText } from '../formats/text';
import { formatAnnotated } from '../formats/annotated';
import { formatAsJSON } from '../formats/json';
import { hexToBytes, bytesToHex } from '../utils/hex';
import type { AssemblyLine } from '../core/types';

const program = new Command();

program
    .name('d_tuft')
    .description('Bidirectional EVM bytecode ↔ opcode transformer')
    .version('1.0.0');

// Disassemble command
program
    .command('disasm')
    .alias('d')
    .description('Disassemble bytecode to opcodes')
    .argument('<input>', 'Input bytecode file (hex string or file path)')
    .option('-o, --output <file>', 'Output file (defaults to stdout)')
    .option('-f, --format <format>', 'Output format: text, annotated, json', 'text')
    .option('--no-pc', 'Omit program counter')
    .option('--gas', 'Include gas costs in output')
    .option('--hex', 'Include hex bytes')
    .action(async (input: string, options) => {
        try {
            // Read input
            let bytecode: Uint8Array;
            if (input.startsWith('0x')) {
                bytecode = hexToBytes(input); // Hex string
            } else {
                const fileContent = readFileSync(input, 'utf-8').trim(); // File
                bytecode = hexToBytes(fileContent);
            }

            console.error(chalk.blue(`Disassembling ${bytecode.length} bytes...`));

            // Disassemble
            const result = disassemble(bytecode, {
                includePC: options.pc,
                includeGas: options.gas,
                identifyFunctions: options.format === 'annotated' // coming soon: 4-byte function selector analysis
            });

            // Format output
            let output: string;
            switch (options.format) {
                case 'annotated':
                    output = formatAnnotated(result);
                    break;
                case 'json':
                    output = formatAsJSON(result);
                    break;
                case 'text':
                default:
                    output = formatAsText(result, {
                        includePC: options.pc,
                        includeGas: options.gas,
                        includeHex: options.hex
                    });
            }

            // Write output
            if (options.output) {
                writeFileSync(options.output, output);
                console.error(chalk.green(`✓ Output written to ${options.output}`));
            } else {
                console.log(output);
            }

            // Show summary
            console.error(chalk.gray(`\nDisassembled ${result.instructions.length} instructions`));
            if (result.warnings.length > 0) {
                console.error(chalk.yellow(`⚠ ${result.warnings.length} warning(s)`));
            }
        } catch (error) {
            console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

// Assemble command
program
    .command('asm')
    .alias('a')
    .description('Assemble opcodes to bytecode')
    .argument('<input>', 'Input assembly file')
    .option('-o, --output <file>', 'Output file (default: stdout)')
    .action(async (input, options) => {
        try {
            // Read assembly file
            const content = readFileSync(input, 'utf-8');
            const lines = parseAssemblyFile(content);
            
            console.error(chalk.blue(`Assembling ${lines.length} instructions...`));
            
            // Assemble
            const bytecode = assemble({ lines, warnings: [] });
            
            // Format output
            const output = bytesToHex(bytecode);
            
            // Write output
            if (options.output) {
                writeFileSync(options.output, output);
                console.error(chalk.green(`✓ Output written to ${options.output}`));
            } else {
                console.log(output);
            }
            
            // Show summary
            console.error(chalk.gray(`\nAssembled ${bytecode.length} bytes`));
            
        } catch (error) {
            console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

// Round-trip test command
program
    .command('test')
    .description('Test round-trip bytecode → opcodes → bytecode')
    .argument('<input>', 'Input bytecode (hex string or file)')
    .action(async (input) => {
        try {
            // Read input
            let originalBytecode: Uint8Array;
            if (input.startsWith('0x')) {
                originalBytecode = hexToBytes(input);
            } else {
                const fileContent = readFileSync(input, 'utf-8').trim();
                originalBytecode = hexToBytes(fileContent);
            }
            
            console.log(chalk.blue('Testing round-trip fidelity...\n'));
            
            // Step 1: Disassemble
            console.log(chalk.gray('Step 1: Disassembling...'));
            const disassembled = disassemble(originalBytecode);
            console.log(chalk.green(`✓ Disassembled ${disassembled.instructions.length} instructions`));
            
            // Step 2: Convert to assembly
            const assemblyLines: AssemblyLine[] = disassembled.instructions.map(inst => ({
                mnemonic: inst.opcode.mnemonic,
                ...(inst.immediate && { operand: bytesToHex(inst.immediate) })
            }));
            
            // Step 3: Reassemble
            console.log(chalk.gray('Step 2: Reassembling...'));
            const reassembledBytecode = assemble({ lines: assemblyLines, warnings: [] });
            console.log(chalk.green(`✓ Reassembled ${reassembledBytecode.length} bytes`));
            
            // Step 4: Compare
            console.log(chalk.gray('Step 3: Comparing...'));
            
            if (reassembledBytecode.length !== originalBytecode.length) {
                console.log(chalk.red(`✗ Length mismatch: ${originalBytecode.length} → ${reassembledBytecode.length}`));
                process.exit(1);
            }
            
            let differences = 0;
            for (let i = 0; i < originalBytecode.length; i++) {
                if (originalBytecode[i] !== reassembledBytecode[i]) {
                    differences++;
                    console.log(
                        chalk.red(
                            `  Difference at byte ${i}: ` +
                            `0x${(originalBytecode[i] as number).toString(16).padStart(2, '0')} → ` +
                            `0x${(reassembledBytecode[i] as number).toString(16).padStart(2, '0')}`
                        )
                    );
                }
            }
            
            if (differences === 0) {
                console.log(chalk.green('\n✓ Perfect round-trip! Bytecode matches exactly.'));
            } else {
                console.log(chalk.red(`\n✗ ${differences} byte(s) differ`));
                process.exit(1);
            }
            
        } catch (error) {
            console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

program.parse();

/**
 * Parse assembly file format
 * Supports:
 * - One instruction per line
 * - Comments starting with //  or #
 * - Empty lines
 */
function parseAssemblyFile(content: string): AssemblyLine[] {
    const lines: AssemblyLine[] = [];
    
    for (let rawLine of content.split('\n')) {
        // Remove comments
        rawLine = (rawLine.split('//')[0] || '').split('#')[0]?.trim() as string;
        
        // Skip empty lines
        if (!rawLine) continue;
        
        // Parse instruction
        const parts = rawLine.split(/\s+/);
        const mnemonic = parts[0] as string;
        const operand = parts.slice(1).join(' ') || undefined;
        
        lines.push({ mnemonic, operand });
    }
    
    return lines;
}
