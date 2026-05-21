import { readFileSync } from 'node:fs';
import type { Command } from 'commander';
import { Panel, T } from '~~/cli/ui';
import { assemble, disassemble } from '~~/core';
import type { AssemblyLine } from '~~/core/types';
import { bytesToHex, hexToBytes } from '~~/utils';
import { box, error, kv, sectionFooter, sectionHeader, success, tryCatch } from '../utils';

export default function roundtrip(program: Command) {
    program
        .command('test')
        .description('Test round-trip fidelity: bytecode → opcodes → bytecode')
        .argument('<input>', 'Bytecode file or hex string')
        .action(async (input) => {
            await tryCatch(async () => {
                console.log(sectionHeader('Round-Trip Test'));
                console.log(kv('Input:', T.val.filename(input)));
                console.log(sectionFooter());

                let originalBytecode: Uint8Array;
                if (input.startsWith('0x')) {
                    originalBytecode = hexToBytes(input);
                } else {
                    originalBytecode = hexToBytes(readFileSync(input, 'utf-8').trim());
                }
                console.log(kv('Input size:', `${T.val.number(String(originalBytecode.length))} bytes`));
                console.log('');

                console.log(T.text.muted('  Step 1  Disassembling…'));
                const disassembled = disassemble(originalBytecode);
                console.log(
                    success(
                        `${T.val.number(String(originalBytecode.length))} bytes → ` +
                            `${T.val.number(String(disassembled.instructions.length))} instructions`,
                    ),
                );

                const assemblyLines: AssemblyLine[] = disassembled.instructions.map((inst) => ({
                    mnemonic: inst.opcode.mnemonic,
                    ...(inst.immediate && { operand: bytesToHex(inst.immediate) }),
                }));

                console.log(T.text.muted('  Step 2  Reassembling…'));
                const reassembledBytecode = assemble({ lines: assemblyLines, warnings: [] }) as Uint8Array;
                console.log(
                    success(
                        `${T.val.number(String(assemblyLines.length))} instructions → ` +
                            `${T.val.number(String(reassembledBytecode.length))} bytes`,
                    ),
                );

                console.log(T.text.muted('  Step 3  Comparing…'));

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
                                `    ${T.text.muted(`byte ${i}:`)} ` +
                                    T.diff.removed(
                                        `0x${(originalBytecode[i] as number).toString(16).padStart(2, '0')}`,
                                    ) +
                                    T.text.muted(' → ') +
                                    T.diff.added(
                                        `0x${(reassembledBytecode[i] as number).toString(16).padStart(2, '0')}`,
                                    ),
                            );
                        }
                    }
                }

                if (differences > 5) {
                    console.log(T.text.muted(`    … and ${differences - 5} more`));
                }

                console.log(sectionFooter());
                console.log('');

                console.log(
                    Panel.create('Round-Trip Summary')
                        .stat('Input', input, T.val.filename)
                        .separator()
                        .stat('Original size', `${originalBytecode.length} bytes`, T.val.number)
                        .stat('Reassembled size', `${reassembledBytecode.length} bytes`, T.val.number)
                        .stat(
                            'Byte differences',
                            String(differences),
                            differences === 0 ? T.status.success : T.status.error,
                        )
                        .render(),
                );
                console.log('');

                if (differences === 0) {
                    console.log(
                        box(`${T.status.success('✓')} Perfect round-trip — bytecode is losslessly preserved.`, 'PASS'),
                    );
                } else {
                    console.log(
                        box(
                            `${T.status.error('✗')} ${differences} byte(s) differ between original and re-assembled output.`,
                            'FAIL',
                        ),
                    );
                    process.exit(1);
                }
            });
        });
}
