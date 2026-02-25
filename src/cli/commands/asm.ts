import type { Command } from "commander";
import { readFileSync, writeFileSync } from 'node:fs';
import { assemble } from "~~/core";
import { bytesToHex } from "~~/utils";
import chalk from 'chalk';
import { parseAssemblyFile, tryCatch, sectionHeader, sectionFooter, success, error, hint, kv } from "../utils";

export default function asm(program: Command) {
    program
        .command('asm')
        .alias('a')
        .description('Assemble opcodes to bytecode')
        .argument('<input>', 'Input assembly file (.evm)')
        .option('-o, --output <file>', 'Output file (default: stdout)')
        .action(async (input, options) => {
            await tryCatch(async () => {
                console.error(sectionHeader("Assembly"));
                console.error(kv("Input:", input));
                console.error(kv("Output:", options.output ?? 'stdout'));
                console.error(sectionFooter());

                let content: string;
                try {
                    content = readFileSync(input, 'utf-8');
                } catch {
                    console.error(error(`Cannot read file: ${input}`));
                    console.error(hint(`Usage: d_tuft asm <input.evm> [-o output.bin]`));
                    process.exit(1);
                }

                const lines = parseAssemblyFile(content);
                console.error(chalk.gray(`  Found ${lines.length} instruction(s)`));

                const bytecode = assemble({ lines, warnings: [] }) as Uint8Array;
                const output = bytesToHex(bytecode);

                if (options.output) {
                    writeFileSync(options.output, output);
                    console.error('');
                    console.error(success(`Assembled ${lines.length} instructions → ${bytecode.length} bytes`));
                    console.error(success(`Output written to ${options.output}`));
                } else {
                    console.error('');
                    console.error(success(`Assembled ${lines.length} instructions → ${bytecode.length} bytes`));
                    console.log(output);
                }

                console.error(sectionFooter());
            });
        });
}