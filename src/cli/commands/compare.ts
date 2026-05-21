import { readFileSync } from 'node:fs';
import type { Command } from 'commander';
import { T, Table } from '~~/cli/ui';
import { disassemble } from '~~/core';
import type { AssemblyLine } from '~~/core/types';
import { bytesToHex, hexToBytes } from '~~/utils';
import {
    box,
    type CompareFormat,
    detectFormat,
    error,
    hint,
    info,
    kv,
    parseAssemblyFile,
    sectionFooter,
    sectionHeader,
    startSpinner,
    stopSpinner,
    success,
    tryCatch,
} from '../utils';

export default function compare(program: Command) {
    program
        .command('compare')
        .alias('c')
        .description('Compare two bytecode or assembly files for equivalence')
        .argument('<file1>', 'First input file (bytecode or assembly)')
        .argument('<file2>', 'Second input file (bytecode or assembly)')
        .option('--format <format>', 'Input format: auto, bytecode, assembly', 'auto')
        .action(
            async (file1: string, file2: string, options: { format: 'auto' | CompareFormat } = { format: 'auto' }) => {
                if (['auto', 'bytecode', 'assembly'].indexOf(options.format) === -1) {
                    console.error(error(`Invalid format: ${options.format}. Must be one of auto, bytecode, assembly.`));
                    process.exit(1);
                }

                await tryCatch(async () => {
                    console.log(sectionHeader('Bytecode Comparison'));
                    console.log(kv('File 1:', T.val.filename(file1)));
                    console.log(kv('File 2:', T.val.filename(file2)));
                    console.log(kv('Format:', T.val.format(options.format)));
                    console.log(sectionFooter());

                    let format: CompareFormat;

                    if (options.format === 'auto') {
                        startSpinner('Detecting file formats…');
                        const [format1, format2] = (await detectFormat(file1, file2)) as [CompareFormat, CompareFormat];
                        stopSpinner();

                        console.log(info(`${file1} → ${T.val.format(format1)}`));
                        console.log(info(`${file2} → ${T.val.format(format2)}`));

                        if (format1 !== format2) {
                            console.error(
                                error(`Format mismatch: "${file1}" is ${format1} but "${file2}" is ${format2}`),
                            );
                            console.error(hint(`Use --format bytecode or --format assembly to override detection`));
                            process.exit(1);
                        }
                        format = format1;
                    } else {
                        format = options.format;
                    }

                    startSpinner('Reading files…');
                    const content1 = readFileSync(file1, 'utf-8');
                    const content2 = readFileSync(file2, 'utf-8');
                    stopSpinner();

                    console.log(success(`Loaded ${T.val.filename(file1)}`));
                    console.log(success(`Loaded ${T.val.filename(file2)}`));

                    startSpinner('Analyzing instructions…');
                    let lines1: AssemblyLine[] = [];
                    let lines2: AssemblyLine[] = [];

                    if (format === 'bytecode') {
                        const bytecode1 = hexToBytes(content1.trim());
                        const bytecode2 = hexToBytes(content2.trim());
                        lines1 = disassemble(bytecode1).instructions.map((inst) => ({
                            mnemonic: inst.opcode.mnemonic,
                            ...(inst.immediate && { operand: bytesToHex(inst.immediate) }),
                        }));
                        lines2 = disassemble(bytecode2).instructions.map((inst) => ({
                            mnemonic: inst.opcode.mnemonic,
                            ...(inst.immediate && { operand: bytesToHex(inst.immediate) }),
                        }));
                    } else {
                        lines1 = parseAssemblyFile(content1);
                        lines2 = parseAssemblyFile(content2);
                    }
                    stopSpinner();

                    console.log(sectionHeader('Results'));

                    const diffTable = Table.create()
                        .column('Line', 6, { align: 'right', render: (v) => T.text.muted(v) })
                        .column(file1, 30, { render: (v) => T.diff.removed(v) })
                        .column(file2, 30, { render: (v) => T.diff.added(v) })
                        .column('Status', 12, { render: (v) => T.status.error(v) });

                    let differences = 0;
                    const maxLines = Math.max(lines1.length, lines2.length);

                    for (let i = 0; i < maxLines; i++) {
                        const line1 = lines1[i];
                        const line2 = lines2[i];

                        if (!line1) {
                            const op2 = `${line2!.mnemonic}${line2?.operand ? ` ${line2.operand}` : ''}`;
                            diffTable.row([String(i + 1), '', op2, 'only in file2'], 'error');
                            differences++;
                            continue;
                        }
                        if (!line2) {
                            const op1 = `${line1.mnemonic}${line1.operand ? ` ${line1.operand}` : ''}`;
                            diffTable.row([String(i + 1), op1, '', 'only in file1'], 'error');
                            differences++;
                            continue;
                        }
                        if (line1.mnemonic !== line2.mnemonic || line1.operand !== line2.operand) {
                            const op1 = `${line1.mnemonic}${line1.operand ? ` ${line1.operand}` : ''}`;
                            const op2 = `${line2.mnemonic}${line2.operand ? ` ${line2.operand}` : ''}`;
                            diffTable.row([String(i + 1), op1, op2, 'changed'], 'error');
                            differences++;
                        }
                    }

                    if (differences > 0) console.log(diffTable.render());

                    console.log(sectionFooter());
                    console.log('');

                    if (differences === 0) {
                        console.log(
                            box(`${T.status.success('✓')} Files are equivalent — zero differences found.`, 'MATCH'),
                        );
                    } else {
                        console.log(
                            box(
                                `${T.status.error('✗')} ${differences} difference(s) found between the two files.`,
                                'MISMATCH',
                            ),
                        );
                        process.exit(1);
                    }
                });
            },
        );
}
