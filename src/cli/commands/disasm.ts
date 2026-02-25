import { readFileSync, writeFileSync } from 'node:fs';
import type { Command } from "commander";
import { formatAsText } from '~~/formats/text';
import { formatAnnotated } from '~~/formats/annotated';
import { formatAsJSON } from '~~/formats/json';
import {
    tryCatch,
    startSpinner,
    stopSpinner,
    success,
    error,
    hint,
    warn,
    sectionHeader,
    sectionFooter,
    kv
} from "../utils";
import { hexToBytes } from "~~/utils";
import { disassemble } from "~~/core";
import chalk from 'chalk';

export default function disasm(program: Command) {
    program
        .command('disasm')
        .alias('d')
        .description('Disassemble bytecode to opcodes')
        .argument('<input>', 'Bytecode file or hex string (e.g. 0x6060...)')
        .option('-o, --output <file>', 'Write output to file (default: stdout)')
        .option('-f, --format <format>', 'Output format: text, annotated, json', 'text')
        .option('--no-pc', 'Omit program counter from output')
        .option('--gas', 'Include gas cost per instruction')
        .option('--hex', 'Include raw hex bytes per instruction')
        .action(async (input: string, options) => {
            await tryCatch(async () => {
                console.log(sectionHeader("Disassembly"));
                console.log(kv("Input:", input));
                console.log(kv("Format:", options.format));
                if (options.gas) console.log(kv("Show gas:", "Yes"));
                console.log(sectionFooter());

                startSpinner("Reading input…");
                let bytecode: Uint8Array;
                try {
                    if (input.startsWith('0x')) {
                        bytecode = hexToBytes(input);
                    } else {
                        const fileContent = readFileSync(input, 'utf-8').trim();
                        bytecode = hexToBytes(fileContent);
                    }
                } catch (e) {
                    stopSpinner();
                    console.error(error(e instanceof Error ? e.message : String(e)));
                    console.error(hint(`Usage: d_tuft disasm <file.bin|0x...> [-f text|annotated|json]`));
                    process.exit(1);
                }
                stopSpinner();

                console.log(success(`Loaded ${bytecode.length} bytes`));

                startSpinner("Disassembling…");
                const result = disassemble(bytecode, {
                    includePC: options.pc,
                    includeGas: options.gas,
                    identifyFunctions: options.format === 'annotated'
                });
                stopSpinner();

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

                console.log(sectionHeader("Results"));
                console.log(output);

                if (options.output) {
                    writeFileSync(options.output, output);
                    console.log('');
                    console.log(success(`Output written to ${options.output}`));
                }

                console.log(sectionFooter());
                console.log(kv("Instructions:", String(result.instructions.length)));
                console.log(kv("Jump destinations:", String(result.jumpDestinations.size)));

                if (result.warnings.length > 0) {
                    console.log('');
                    for (const w of result.warnings) {
                        console.log(warn(w));
                    }
                }
            });
        });
}
