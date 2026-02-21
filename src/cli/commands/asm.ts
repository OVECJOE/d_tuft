import type { Command } from "commander";
import { readFileSync, writeFileSync } from 'node:fs';
import { assemble } from "~~/core";
import { bytesToHex } from "~~/utils";
import chalk from 'chalk';
import { parseAssemblyFile, tryCatch } from "../utils";

export default function asm(program: Command) {
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
            const bytecode = assemble({ lines, warnings: [] }) as Uint8Array;

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
}