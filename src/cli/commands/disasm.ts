import { readFileSync, writeFileSync } from 'node:fs';
import type { Command } from 'commander';
import { Panel, T, Table } from '~~/cli/ui';
import { disassemble } from '~~/core';
import { formatAnnotated } from '~~/formats/annotated';
import { colorizeOpcode } from '~~/formats/colors';
import { formatAsJSON } from '~~/formats/json';
import { formatAsText } from '~~/formats/text';
import { hexToBytes } from '~~/utils';
import { StackSimulator } from '~~/utils/stack-simulator';
import {
    error,
    hint,
    kv,
    sectionFooter,
    sectionHeader,
    startSpinner,
    stopSpinner,
    success,
    tryCatch,
    warn,
} from '../utils';

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
        .option('--stack', 'Run stack depth validation after disassembly')
        .action(async (input: string, options) => {
            await tryCatch(async () => {
                console.log(sectionHeader('Disassembly'));
                console.log(kv('Input:', T.val.filename(input)));
                console.log(kv('Format:', T.val.format(options.format)));
                if (options.gas) console.log(kv('Show gas:', T.status.success('Yes')));
                console.log(sectionFooter());

                startSpinner('Reading input…');
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
                console.log(success(`Loaded ${T.val.number(String(bytecode.length))} bytes`));

                startSpinner('Disassembling…');
                const result = disassemble(bytecode, {
                    includePC: options.pc,
                    includeGas: options.gas,
                    identifyFunctions: options.format === 'annotated',
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
                    default:
                        output = formatAsText(result, {
                            includePC: options.pc,
                            includeGas: options.gas,
                            includeHex: options.hex,
                        });
                }

                console.log(sectionHeader('Results'));
                console.log(output);

                if (options.output) {
                    writeFileSync(options.output, output);
                    console.log('');
                    console.log(success(`Output written to ${T.val.filename(options.output)}`));
                }

                console.log(sectionFooter());
                console.log(kv('Instructions:', T.val.number(String(result.instructions.length))));
                console.log(kv('Jump destinations:', T.op.jumpdest(String(result.jumpDestinations.size))));

                if (result.warnings.length > 0) {
                    console.log('');
                    for (const w of result.warnings) console.log(warn(w));
                }

                if (options.stack) {
                    const sim = new StackSimulator();
                    const simResult = sim.simulate(result.instructions);
                    console.log('');

                    console.log(
                        Panel.create('Stack Validation')
                            .stat('Max depth', String(simResult.maxDepth), T.val.number)
                            .stat('Final depth', String(simResult.finalDepth), T.text.body)
                            .stat(
                                'Errors',
                                simResult.errors.length === 0 ? '0 — valid' : String(simResult.errors.length),
                                simResult.errors.length === 0 ? T.status.success : T.status.error,
                            )
                            .render(),
                    );

                    if (simResult.errors.length > 0) {
                        console.log('');
                        const errTable = Table.create()
                            .column('', 2, { render: (v) => T.status.error(v) })
                            .column('PC', 7, { render: (v) => T.val.pc(v) })
                            .column('Opcode', 12, { render: (v) => colorizeOpcode(v)(v) })
                            .column('Kind', 10, { render: (v) => T.status.error(v) });

                        for (const err of simResult.errors.slice(0, 10)) {
                            const icon = err.kind === 'underflow' ? '↓' : '↑';
                            errTable.row([icon, String(err.pc), err.mnemonic, err.kind], 'error');
                        }

                        console.log(errTable.render());

                        if (simResult.errors.length > 10) {
                            console.log(T.text.muted(`  … ${simResult.errors.length - 10} more`));
                        }
                    }
                    console.log(sectionFooter());
                }
            });
        });
}
