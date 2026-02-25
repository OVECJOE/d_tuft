import type { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { tryCatch, sectionHeader, sectionFooter, success, error, kv, box } from "../utils";
import chalk from "chalk";
import type { AssemblyLine } from "~~/core/types";
import { bytesToHex, hexToBytes } from "~~/utils";
import { disassemble } from "~~/core";
import { assemble } from "~~/core";

export default function roundtrip(program: Command) {
    program
        .command('test')
        .description('Test round-trip fidelity: bytecode → opcodes → bytecode')
        .argument('<input>', 'Bytecode file or hex string')
        .action(async (input) => {
            await tryCatch(async () => {
                console.log(sectionHeader("Round-Trip Test"));
                console.log(kv("Input:", input));
                console.log(sectionFooter());

                let originalBytecode: Uint8Array;
                if (input.startsWith('0x')) {
                    originalBytecode = hexToBytes(input);
                } else {
                    const fileContent = readFileSync(input, 'utf-8').trim();
                    originalBytecode = hexToBytes(fileContent);
                }

                console.log(kv("Input size:", `${originalBytecode.length} bytes`));
                console.log('');

                console.log(chalk.gray(`  Step 1  Disassembling…`));
                const disassembled = disassemble(originalBytecode);
                console.log(success(`${originalBytecode.length} bytes → ${disassembled.instructions.length} instructions`));

                const assemblyLines: AssemblyLine[] = disassembled.instructions.map(inst => ({
                    mnemonic: inst.opcode.mnemonic,
                    ...(inst.immediate && { operand: bytesToHex(inst.immediate) })
                }));

                console.log(chalk.gray(`  Step 2  Reassembling…`));
                const reassembledBytecode = assemble({ lines: assemblyLines, warnings: [] }) as Uint8Array;
                console.log(success(`${assemblyLines.length} instructions → ${reassembledBytecode.length} bytes`));

                console.log(chalk.gray(`  Step 3  Comparing…`));

                if (reassembledBytecode.length !== originalBytecode.length) {
                    console.log(error(`Length mismatch: ${originalBytecode.length} → ${reassembledBytecode.length}`));
                    process.exit(1);
                }

                let differences = 0;
                for (let i = 0; i < originalBytecode.length; i++) {
                    if (originalBytecode[i] !== reassembledBytecode[i]) {
                        differences++;
                        if (differences <= 5) {
                            console.log(
                                `    ${chalk.gray(`byte ${i}:`)} ` +
                                chalk.red(`0x${(originalBytecode[i] as number).toString(16).padStart(2, '0')}`) +
                                chalk.gray(' → ') +
                                chalk.green(`0x${(reassembledBytecode[i] as number).toString(16).padStart(2, '0')}`)
                            );
                        }
                    }
                }

                if (differences > 5) {
                    console.log(chalk.gray(`    … and ${differences - 5} more`));
                }

                console.log(sectionFooter());
                console.log('');

                if (differences === 0) {
                    console.log(box(
                        `${chalk.green('✓')} Perfect round-trip — bytecode is losslessly preserved.`,
                        'PASS'
                    ));
                } else {
                    console.log(box(
                        `${chalk.red('✗')} ${differences} byte(s) differ between original and re-assembled output.`,
                        'FAIL'
                    ));
                    process.exit(1);
                }
            });
        });
}