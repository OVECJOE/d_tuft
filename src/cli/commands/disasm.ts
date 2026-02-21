import { readFileSync, writeFileSync } from 'node:fs';
import type { Command } from "commander";
import { formatAsText } from '~~/formats/text';
import { formatAnnotated } from '~~/formats/annotated';
import { formatAsJSON } from '~~/formats/json';
import { tryCatch } from "../utils";
import { hexToBytes } from "~~/utils";
import { disassemble } from "~~/core";
import chalk from 'chalk';

export default function disasm(program: Command) {
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
}