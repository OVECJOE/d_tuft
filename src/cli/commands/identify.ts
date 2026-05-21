import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Command } from 'commander';
import { T, Table } from '~~/cli/ui';
import type { ABI, AssemblyProgram } from '~~/core/types';
import { formatFunctionsAnnotated, formatFunctionsAsJSON, formatFunctionsAsText } from '~~/formats';
import { FunctionIdentifier } from '~~/libraries/fi';
import { hexToBytes } from '~~/utils';
import { GasCalculator } from '~~/utils/gas-calculator';
import {
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
    updateSpinner,
} from '../utils';

export default function identify(program: Command) {
    program
        .command('identify')
        .alias('id')
        .description('Identify public functions and their boundaries in bytecode')
        .argument('<input>', 'Bytecode file or hex string, or assembly file')
        .option('--format <format>', 'Output format: text, annotated, json', 'text')
        .option('--abi <file>', 'ABI JSON file for resolving function names')
        .option('-d, --diff <second_input>', 'Compare functions between two inputs')
        .option('-o, --output [dir]', 'Save each function to its own file inside a named directory')
        .option('--internal', 'Also list internal/private functions (orphan JUMPDESTs)')
        .option('--gas', 'Show gas cost estimates per function')
        .action(
            async (
                input: string,
                options: {
                    format: 'text' | 'annotated' | 'json';
                    abi?: string;
                    output?: string | boolean;
                    internal: boolean;
                    gas: boolean;
                },
            ) => {
                const validFormats = ['text', 'annotated', 'json'];
                if (!validFormats.includes(options.format)) {
                    console.error(
                        error(`Invalid format: "${options.format}". Choose from: ${validFormats.join(', ')}`),
                    );
                    console.error(hint(`Example: d_tuft identify contract.bin --format annotated`));
                    process.exit(1);
                }

                await tryCatch(async () => {
                    console.log(sectionHeader('Function Identification'));
                    console.log(kv('Input:', T.val.filename(input)));
                    console.log(kv('Format:', T.val.format(options.format)));
                    if (options.abi) console.log(kv('ABI:', T.val.filename(options.abi)));
                    console.log(sectionFooter());

                    startSpinner('Reading input…');
                    const content = await readFile(input, 'utf-8');
                    const [format] = await detectFormat(input);
                    stopSpinner();

                    console.log(success(`Loaded ${T.val.filename(input)} (${T.val.format(format)})`));

                    let source: Uint8Array | AssemblyProgram;
                    if (format === 'bytecode') {
                        source = hexToBytes(content.trim());
                    } else {
                        source = { lines: parseAssemblyFile(content), warnings: [] };
                    }

                    updateSpinner('Identifying functions…');
                    startSpinner('Identifying functions…');
                    const fi = new FunctionIdentifier(source);
                    let maps = fi.identify();
                    stopSpinner();

                    if (options.abi) {
                        startSpinner('Resolving function names from ABI…');
                        const abiContent = await readFile(options.abi, 'utf-8');
                        const abi = JSON.parse(abiContent) as ABI;
                        maps = fi.resolveNames(abi);
                        stopSpinner();
                        const resolved = maps.filter((m) => m.name).length;
                        console.log(
                            success(
                                `Resolved ${T.val.number(String(resolved))}/${maps.length} function name(s) from ABI`,
                            ),
                        );
                    }

                    const named = maps.filter((m) => m.name).length;
                    const unnamed = maps.length - named;

                    const parts: string[] = [`${maps.length} function(s) found`];
                    if (named > 0) parts.push(T.status.success(`${named} named`));
                    if (unnamed > 0) parts.push(T.status.warn(`${unnamed} unnamed`));
                    console.log(info(parts.join(T.text.muted(' · '))));

                    let out: string;
                    switch (options.format) {
                        case 'annotated':
                            out = formatFunctionsAnnotated(maps);
                            break;
                        case 'json':
                            out = formatFunctionsAsJSON(maps);
                            break;
                        default:
                            out = formatFunctionsAsText(maps);
                    }

                    if (options.internal) {
                        const internals = fi.findInternalFunctions();
                        const internalSection =
                            internals.length > 0
                                ? [
                                      '',
                                      T.op.jumpdest(sectionHeader(`Internal functions (${internals.length})`)),
                                      ...internals.map(
                                          (i) => `  ${T.val.pc(`@${i.pc}`)}  ${T.op.jumpdest('JUMPDEST')}`,
                                      ),
                                  ].join('\n')
                                : `\n${T.text.muted('  No internal JUMPDESTs found.')}`;
                        out += internalSection;
                    }

                    if (options.output === undefined) {
                        console.log(sectionHeader('Results'));
                        console.log(out);
                    }

                    if (options.output !== undefined) {
                        const ESC = String.fromCharCode(0x1b);
                        const stripped = (s: string) => s.replace(new RegExp(`${ESC}\\[[0-9;]*[A-Za-z]`, 'g'), '');
                        const raw = typeof options.output === 'string' ? options.output : 'functions';
                        const fnDir = raw.startsWith('(') && raw.endsWith(')') ? raw : `(${raw})`;

                        mkdirSync(fnDir, { recursive: true });

                        for (const fn of maps) {
                            const label = fn.name ? fn.name.replace(/\//g, '-') : fn.selector;
                            writeFileSync(join(fnDir, `${label}.txt`), stripped(formatFunctionsAnnotated([fn])));
                        }

                        console.log('');
                        console.log(success(`${maps.length} function file(s) written to ${T.val.filename(fnDir)}`));
                    }

                    console.log(sectionFooter());
                    console.log(kv('Total functions:', T.val.number(String(maps.length))));
                    console.log(kv('Named:', named > 0 ? T.status.success(String(named)) : '0'));
                    console.log(kv('Unnamed:', unnamed > 0 ? T.status.warn(String(unnamed)) : '0'));

                    if (options.gas && maps.length > 0) {
                        const gc = new GasCalculator();
                        const estimates = maps
                            .map((m) => gc.estimateFunction(m.body, m.selector, m.name))
                            .sort((a, b) => b.totalGas - a.totalGas);

                        console.log('');
                        console.log(sectionHeader('Gas per Function'));

                        const gasTable = Table.create()
                            .column('Selector', 12, { render: (v) => T.val.selector(v) })
                            .column('Name', 24, { render: (v) => T.text.body(v) })
                            .column('Instr', 7, { align: 'right', render: (v) => T.val.number(v) })
                            .column('Gas', 10, { align: 'right', render: (v) => T.status.warn(v) });

                        for (const fn of estimates) {
                            gasTable.row([
                                fn.selector ?? '',
                                fn.name ?? '<unknown>',
                                String(fn.instructionCount),
                                String(fn.totalGas),
                            ]);
                        }

                        console.log(gasTable.render());
                        console.log(sectionFooter());
                    }
                });
            },
        );
}
