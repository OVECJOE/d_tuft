import { readFileSync, writeFileSync } from 'node:fs';
import type { Command } from 'commander';
import { Panel, T, Table } from '~~/cli/ui';
import { streamHighlighted } from '~~/cli/ui/stream';
import { highlightSolidity } from '~~/formats/highlight';
import { decompile } from '~~/libraries/decompiler';
import { hexToBytes } from '~~/utils';
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
    updateSpinner,
} from '../utils';

export default function decompileCmd(program: Command) {
    program
        .command('decompile')
        .alias('dec')
        .description('Decompile bytecode to Solidity-like pseudocode with function inference')
        .argument('<input>', 'Bytecode file, hex string, or contract address (0x...)')
        .option('-o, --output <file>', 'Write decompiled output to file')
        .option('--format <format>', 'Output format: solidity, pseudocode', 'solidity')
        .option('--no-storage', 'Hide inferred storage variables')
        .option('--no-comments', 'Hide decompiler comments')
        .option('--no-stream', 'Print output instantly instead of streaming')
        .option('--rpc <url>', 'RPC endpoint to fetch bytecode from (default: public Ethereum RPC)')
        .action(
            async (
                input: string,
                options: {
                    output?: string;
                    format: string;
                    storage: boolean;
                    comments: boolean;
                    stream: boolean;
                    rpc?: string;
                },
            ) => {
                await tryCatch(async () => {
                    console.log(sectionHeader('Decompilation'));
                    console.log(kv('Input:', T.val.filename(input)));
                    console.log(kv('Format:', T.val.format(options.format)));
                    console.log(sectionFooter());

                    startSpinner('Loading bytecode…');
                    let bytecode: Uint8Array;

                    if (input.startsWith('0x') && input.length === 42) {
                        const rpcUrl = options.rpc ?? 'https://eth.llamarpc.com';
                        updateSpinner(`Fetching bytecode from chain (${input})…`);
                        const code = await fetchBytecode(input, rpcUrl);
                        if (!code || code === '0x') {
                            stopSpinner();
                            console.error(error(`No bytecode found at address ${input}`));
                            console.error(hint('Make sure the address is correct and the contract is deployed'));
                            process.exit(1);
                        }
                        bytecode = hexToBytes(code);
                    } else if (input.startsWith('0x')) {
                        bytecode = hexToBytes(input);
                    } else {
                        const content = readFileSync(input, 'utf-8').trim();
                        bytecode = hexToBytes(content);
                    }
                    stopSpinner();
                    console.log(success(`Loaded ${T.val.number(String(bytecode.length))} bytes`));

                    startSpinner('Analyzing bytecode…');
                    const result = decompile(bytecode, {
                        includeComments: options.comments,
                        includeStorage: options.storage,
                        format: options.format as 'solidity' | 'pseudocode',
                    });
                    stopSpinner();

                    const totalFunctions = result.functions.length;
                    const namedFunctions = result.functions.filter((f) => f.confidence >= 0.5).length;
                    const matchedPatterns = result.matchedPatterns.length;

                    console.log('');
                    console.log(
                        Panel.create('Decompilation Summary')
                            .stat('Contract', result.name, T.text.heading)
                            .separator()
                            .stat('Bytecode size', `${result.bytecodeSize} bytes`, T.val.number)
                            .stat('Instructions', String(result.instructionCount), T.val.number)
                            .stat('Functions found', String(totalFunctions), T.val.number)
                            .stat('Functions identified', `${namedFunctions}/${totalFunctions}`, T.status.success)
                            .stat('Patterns matched', String(matchedPatterns), T.op.jumpdest)
                            .stat('Storage slots', String(result.storage.length), T.op.storage)
                            .separator()
                            .stat(
                                'Overall confidence',
                                `${computeOverallConfidence(result.functions).toFixed(0)}%`,
                                T.status.warn,
                            )
                            .render(),
                    );

                    if (result.matchedPatterns.length > 0) {
                        console.log('');
                        console.log(sectionHeader('Matched Patterns'));
                        for (const p of result.matchedPatterns) {
                            console.log(
                                `  ${T.status.success('✓')} ${T.text.body(p.name)} ` +
                                    `${T.text.muted(p.version ? `(${p.version})` : '')} ` +
                                    `${T.text.muted(`— ${(p.confidence * 100).toFixed(0)}% match`)}`,
                            );
                        }
                    }

                    if (result.functions.length > 0) {
                        console.log('');
                        console.log(sectionHeader('Functions'));

                        const fnTable = Table.create()
                            .column('Selector', 12, { render: (v) => T.val.selector(v) })
                            .column('Name', 30, { render: (v) => T.text.body(v) })
                            .column('Params', 8, { align: 'right', render: (v) => T.val.number(v) })
                            .column('Type', 10, { render: (v) => T.op.jumpdest(v) })
                            .column('Confidence', 12, { align: 'right', render: (v) => formatConfidence(Number(v)) });

                        for (const fn of result.functions) {
                            const paramCount = fn.parameters
                                ? fn.parameters.split(',').filter((p) => p.trim()).length
                                : 0;
                            fnTable.row([
                                fn.selector,
                                fn.name,
                                String(paramCount),
                                fn.stateMutability,
                                (fn.confidence * 100).toFixed(0),
                            ]);
                        }

                        console.log(fnTable.render());
                    }

                    if (result.warnings.length > 0) {
                        console.log('');
                        console.log(sectionHeader('Warnings'));
                        for (const w of result.warnings) {
                            console.log(`  ${T.status.warn('⚠')} ${T.text.body(w)}`);
                        }
                    }

                    console.log('');
                    console.log(sectionHeader('Decompiled Output'));

                    const highlighted = highlightSolidity(result.solidity);

                    if (options.output) {
                        // Write raw (unhighlighted) output to file
                        writeFileSync(options.output, result.solidity);
                        // Print highlighted to terminal
                        if (options.stream) {
                            await streamHighlighted(highlighted);
                        } else {
                            process.stdout.write(highlighted);
                        }
                        console.log('');
                        console.log(success(`Output written to ${T.val.filename(options.output)}`));
                    } else {
                        if (options.stream) {
                            await streamHighlighted(highlighted);
                        } else {
                            process.stdout.write(highlighted);
                        }
                    }

                    console.log('');
                    console.log(sectionFooter());
                });
            },
        );
}

async function fetchBytecode(address: string, rpcUrl: string): Promise<string | null> {
    try {
        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_getCode',
                params: [address, 'latest'],
                id: 1,
            }),
        });

        if (!response.ok) return null;

        const data = (await response.json()) as { result?: string };
        return data.result ?? null;
    } catch {
        return null;
    }
}

function computeOverallConfidence(functions: Array<{ confidence: number }>): number {
    if (functions.length === 0) return 0;
    const total = functions.reduce((sum, f) => sum + f.confidence, 0);
    return (total / functions.length) * 100;
}

function formatConfidence(pct: number): string {
    if (pct >= 90) return T.status.success(`${pct}%`);
    if (pct >= 70) return T.status.warn(`${pct}%`);
    return T.status.error(`${pct}%`);
}
