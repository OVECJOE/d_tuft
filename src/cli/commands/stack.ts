import { readFileSync } from 'node:fs';
import type { Command } from 'commander';
import { Panel, T, Table } from '~~/cli/ui';
import { disassemble } from '~~/core';
import { colorizeOpcode } from '~~/formats/colors';
import { hexToBytes } from '~~/utils';
import { StackSimulator } from '~~/utils/stack-simulator';
import { box, error, hint, sectionFooter, sectionHeader, startSpinner, stopSpinner, success, tryCatch } from '../utils';

export default function stack(program: Command) {
    program
        .command('stack')
        .alias('s')
        .description('Simulate EVM stack and visualise depth across execution')
        .argument('<input>', 'Bytecode file or hex string')
        .option('--trace', 'Show per-instruction stack depth trace')
        .option('--limit <n>', 'Max trace lines to display', '50')
        .action(async (input: string, options: { trace: boolean; limit: string }) => {
            await tryCatch(async () => {
                console.log(sectionHeader('Stack Simulation'));

                startSpinner('Reading input…');
                let bytecode: Uint8Array;
                try {
                    if (input.startsWith('0x')) {
                        bytecode = hexToBytes(input);
                    } else {
                        bytecode = hexToBytes(readFileSync(input, 'utf-8').trim());
                    }
                } catch (e) {
                    stopSpinner();
                    console.error(error(e instanceof Error ? e.message : String(e)));
                    console.error(hint('Usage: d_tuft stack <file.bin|0x...> [--trace] [--limit 50]'));
                    process.exit(1);
                }
                stopSpinner();
                console.log(success(`Loaded ${T.val.number(String(bytecode.length))} bytes`));

                startSpinner('Disassembling…');
                const result = disassemble(bytecode);
                stopSpinner();

                startSpinner('Simulating stack…');
                const sim = new StackSimulator();
                const simResult = sim.simulate(result.instructions);
                stopSpinner();

                // ── Stack Profile Panel ───────────────────────────────────────
                console.log('');
                console.log(
                    Panel.create('Stack Profile')
                        .stat('Input', input, T.val.filename)
                        .separator()
                        .stat('Max depth', String(simResult.maxDepth), T.val.number)
                        .stat('Min depth', String(simResult.minDepth), T.text.body)
                        .stat('Final depth', String(simResult.finalDepth), T.text.body)
                        .stat('Instructions', String(result.instructions.length), T.val.number)
                        .stat(
                            'Errors',
                            String(simResult.errors.length),
                            simResult.errors.length === 0 ? T.status.success : T.status.error,
                        )
                        .render(),
                );

                // ── Depth histogram ───────────────────────────────────────────
                const depthCounts = new Map<number, number>();
                for (const d of simResult.depthAtPC.values()) {
                    depthCounts.set(d, (depthCounts.get(d) ?? 0) + 1);
                }
                const sortedDepths = [...depthCounts.entries()].sort((a, b) => a[0] - b[0]);
                const maxCount = Math.max(...sortedDepths.map(([, c]) => c), 1);

                console.log('');
                console.log(sectionHeader('Depth Distribution'));
                for (const [depth, count] of sortedDepths) {
                    const barLen = Math.round((count / maxCount) * 30);
                    const bar = T.val.number('█'.repeat(barLen)) + T.text.muted('░'.repeat(30 - barLen));
                    console.log(
                        `  ${T.text.body(String(depth).padStart(4))} ${bar} ${T.text.muted(`${String(count)}x`)}`,
                    );
                }
                console.log('');

                // ── Errors ────────────────────────────────────────────────────
                if (simResult.errors.length > 0) {
                    console.log(sectionHeader(`Errors (${simResult.errors.length})`));

                    const errTable = Table.create()
                        .column('PC', 7, { render: (v) => T.val.pc(v) })
                        .column('Opcode', 12, { render: (v) => colorizeOpcode(v)(v) })
                        .column('Kind', 10, { render: (v) => T.status.error(v) })
                        .column('Message', 38, { render: (v) => T.text.muted(v) });

                    for (const err of simResult.errors.slice(0, 20)) {
                        errTable.row([String(err.pc), err.mnemonic, err.kind, err.message], 'error');
                    }

                    console.log(errTable.render());

                    if (simResult.errors.length > 20) {
                        console.log(T.text.muted(`  … ${simResult.errors.length - 20} more`));
                    }
                    console.log('');
                }

                // ── Trace ─────────────────────────────────────────────────────
                if (options.trace) {
                    const limit = parseInt(options.limit, 10) || 50;
                    console.log(
                        sectionHeader(`Execution Trace (first ${Math.min(limit, result.instructions.length)})`),
                    );

                    const traceTable = Table.create()
                        .column('PC', 6, { align: 'right', render: (v) => T.val.pc(v) })
                        .column('Opcode', 12, { render: (v) => colorizeOpcode(v)(v) })
                        .column('Operand', 20, { render: (v) => T.text.muted(v) })
                        .column('Depth', 5, { align: 'right' })
                        .column('Delta', 6, { align: 'right', render: (v) => T.val.stackNet(Number(v)) })
                        .column('Visual', 32, { render: (v) => v });

                    for (const instr of result.instructions.slice(0, limit)) {
                        const depth = simResult.depthAtPC.get(instr.pc) ?? 0;
                        const delta = instr.opcode.outputs - instr.opcode.inputs;
                        const imm = instr.immediate
                            ? `0x${[...instr.immediate].map((b) => b.toString(16).padStart(2, '0')).join('')}`
                            : '';
                        const postDepth = depth + delta;
                        const stackVis =
                            postDepth > 0
                                ? T.val.number('│'.repeat(Math.min(postDepth, 30))) +
                                  (postDepth > 30 ? T.text.muted('…') : '')
                                : T.text.muted('·');

                        traceTable.row([
                            String(instr.pc),
                            instr.opcode.mnemonic,
                            imm,
                            String(depth),
                            String(delta),
                            stackVis,
                        ]);
                    }

                    console.log(traceTable.render());

                    if (result.instructions.length > limit) {
                        console.log(T.text.muted(`  … ${result.instructions.length - limit} more instructions`));
                    }
                    console.log('');
                }

                console.log(sectionFooter());

                if (simResult.success) {
                    console.log(
                        box(
                            `${T.status.success('✓')} Stack simulation passed — no underflow or overflow detected.\n` +
                                `  Max depth: ${simResult.maxDepth}  Final depth: ${simResult.finalDepth}`,
                            'VALID',
                        ),
                    );
                } else {
                    console.log(
                        box(
                            `${T.status.error('✗')} ${simResult.errors.length} stack error(s) detected.\n` +
                                `  Max depth: ${simResult.maxDepth}  Errors: ${simResult.errors.length}`,
                            'INVALID',
                        ),
                    );
                }
            });
        });
}
