import type { Command } from "commander";
import { readFileSync } from 'node:fs';
import { tryCatch } from "../utils";
import chalk from "chalk";
import type { AssemblyLine } from "@d_tuft/core/types";
import { bytesToHex, hexToBytes } from "@d_tuft/utils";
import { disassemble } from "@d_tuft/core";
import { assemble } from "@d_tuft/core";

export default function roundtrip(program: Command) {
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
}