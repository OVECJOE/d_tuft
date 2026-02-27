import type { Command } from "commander";
import { readFileSync, writeFileSync } from 'node:fs';
import { assemble } from "~~/core";
import { bytesToHex } from "~~/utils";
import { parseAssemblyFile, tryCatch, sectionHeader, sectionFooter, success, error, hint, kv } from "../utils";
import { T } from '~~/cli/ui';
import { colorizeOpcode, colorizeImmediate } from "~~/formats/colors";
import { padR } from '~~/cli/ui/ansi';

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
                console.error(kv("Input:", T.val.filename(input)));
                console.error(kv("Output:", options.output ? T.val.filename(options.output) : T.text.muted('stdout')));
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

                // Colorized instruction preview
                console.error(T.chrome.border(`  ┌─ ${lines.length} instruction(s) ${'─'.repeat(Math.max(0, 44 - String(lines.length).length))}`));
                for (const line of lines) {
                    const colorizer = colorizeOpcode(line.mnemonic);
                    const mnemonicStr = padR(colorizer(line.mnemonic), 12);
                    const operandStr = line.operand ? colorizeImmediate(line.operand) : '';
                    console.error(`  ${T.chrome.border('│')} ${mnemonicStr}  ${operandStr}`);
                }
                console.error(T.chrome.border(`  └${'─'.repeat(47)}`));

                const bytecode = assemble({ lines, warnings: [] }) as Uint8Array;
                const output = bytesToHex(bytecode);

                console.error('');
                console.error(success(
                    `Assembled ${T.val.number(String(lines.length))} instructions → ${T.val.number(String(bytecode.length))} bytes`
                ));

                if (options.output) {
                    writeFileSync(options.output, output);
                    console.error(success(`Output written to ${T.val.filename(options.output)}`));
                } else {
                    console.log(output);
                }

                console.error(sectionFooter());
            });
        });
}