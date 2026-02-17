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
import { detectFormat, tryCatch, type CompareFormat } from './utils';

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
        tryCatch(() => {
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
        });
    });

// Assemble command
program
    .command('asm')
    .alias('a')
    .description('Assemble opcodes to bytecode')
    .argument('<input>', 'Input assembly file')
    .option('-o, --output <file>', 'Output file (default: stdout)')
    .action(async (input, options) => {
        tryCatch(() => {
            // Read assembly file
            // TODO: Stream content for large files
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
        });
    });

// Compare two assembly files or bytecode files
program
    .command('compare')
    .alias('c')
    .description('Compare two bytecode or assembly files for equivalence')
    .argument('<file1>', 'First input file (bytecode or assembly)')
    .argument('<file2>', 'Second input file (bytecode or assembly)')
    .option('--format <format>', 'Input format: auto, bytecode, assembly', 'auto')
    .action(
        async (
            file1: string,
            file2: string,
            options: { format: 'auto' | CompareFormat } = { format: 'auto' },
        ) => {
            if (['auto', 'bytecode', 'assembly'].indexOf(options.format) === -1) {
                console.error(chalk.red(`Invalid format: ${options.format}. Must be one of auto, bytecode, assembly.`));
                process.exit(1);
            }

            tryCatch(async () => {
                let format: CompareFormat;
                if (options.format === 'auto') {
                    // Detect format
                        const [format1, format2] = (await detectFormat(file1, file2)) as [CompareFormat, CompareFormat];
                        console.error(chalk.blue(`Detected formats: ${file1} → ${format1}, ${file2} → ${format2}`));
                        if (format1 !== format2) {
                            throw new Error(`Input format mismatch: ${file1} is ${format1} but ${file2} is ${format2}`);
                        }

                        format = format1;
                } else {
                    format = options.format;
                }

                console.error(chalk.blue(`Comparing ${file1} and ${file2} as ${format}...`));

                // Read and parse both files
                const content1 = readFileSync(file1, 'utf-8');
                const content2 = readFileSync(file2, 'utf-8');

                let lines1: AssemblyLine[] = [];
                let lines2: AssemblyLine[] = [];

                if (format === 'bytecode') {
                    const bytecode1 = hexToBytes(content1.trim());
                    const bytecode2 = hexToBytes(content2.trim());

                    lines1 = disassemble(bytecode1).instructions.map(inst => ({
                        mnemonic: inst.opcode.mnemonic,
                        ...(inst.immediate && { operand: bytesToHex(inst.immediate) })
                    }));

                    lines2 = disassemble(bytecode2).instructions.map(inst => ({
                        mnemonic: inst.opcode.mnemonic,
                        ...(inst.immediate && { operand: bytesToHex(inst.immediate) })
                    }));
                } else {
                    lines1 = parseAssemblyFile(content1);
                    lines2 = parseAssemblyFile(content2);
                }

                // Compare line by line
                let differences = 0;
                const maxLines = Math.max(lines1.length, lines2.length);
                for (let i = 0; i < maxLines; i++) {
                    const line1 = lines1[i];
                    const line2 = lines2[i];

                    if (!line1) {
                        console.log(chalk.red(`Line ${i + 1}: Missing in ${file1}`));
                        differences++;
                        continue;
                    }

                    if (!line2) {
                        console.log(chalk.red(`Line ${i + 1}: Missing in ${file2}`));
                        differences++;
                        continue;
                    }

                    if (line1.mnemonic !== line2.mnemonic || line1.operand !== line2.operand) {
                        console.log(
                            chalk.red(`Line ${i + 1} differs:`) +
                            `\n  ${file1}: ${line1.mnemonic} ${line1.operand || ''}` +
                            `\n  ${file2}: ${line2.mnemonic} ${line2.operand || ''}`
                        );
                        differences++;
                    }
                }

                if (differences === 0) {
                    console.log(chalk.green('✓ Files are equivalent!'));
                } else {
                    console.log(chalk.red(`✗ ${differences} difference(s) found`));
                    process.exit(1);
                }
            });
        }
    );

// Round-trip test command
program
    .command('test')
    .description('Test round-trip bytecode → opcodes → bytecode')
    .argument('<input>', 'Input bytecode (hex string or file)')
    .action(async (input) => {
        tryCatch(() => {

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
        });
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
