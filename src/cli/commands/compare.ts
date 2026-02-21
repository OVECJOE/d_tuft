import type { Command } from "commander";
import { readFileSync, writeFileSync } from 'node:fs';
import { detectFormat, parseAssemblyFile, tryCatch, type CompareFormat } from "../utils";
import chalk from "chalk";
import type { AssemblyLine } from "@d_tuft/core/types";
import { bytesToHex, hexToBytes } from "@d_tuft/utils";
import { disassemble } from "@d_tuft/core";

export default function compare(program: Command) {
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
                            `\n  ${file1}: ${chalk.underline(line1.mnemonic)} ${line1.operand || ''}` +
                            `\n  ${file2}: ${chalk.underline(line2.mnemonic)} ${line2.operand || ''}`
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
}