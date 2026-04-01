import type { Command } from "commander";
import { readFileSync } from "node:fs";
import {
    tryCatch, startSpinner, stopSpinner,
    success, error, hint, sectionHeader, sectionFooter, kv,
} from "../utils";
import { hexToBytes } from "~~/utils";
import { GasCalculator } from "~~/utils/gas-calculator";
import { disassemble } from "~~/core";
import { FunctionIdentifier } from "~~/libraries/fi";
import { T, Table, Panel } from '~~/cli/ui';
import { colorizeOpcode, colorizeImmediate } from '~~/formats/colors';
import { padR } from '~~/cli/ui/ansi';

export default function gas(program: Command) {
    program
        .command("gas")
        .alias("g")
        .description("Analyse gas costs per opcode, category, and function")
        .argument("<input>", "Bytecode file or hex string")
        .option("--top <n>", "Number of hotspots to show", "5")
        .option("--window <n>", "Hotspot sliding window size (instructions)", "10")
        .option("--functions", "Break down gas per identified function")
        .action(async (input: string, options: { top: string; window: string; functions: boolean }) => {
            await tryCatch(async () => {
                console.log(sectionHeader("Gas Analysis"));

                startSpinner("Reading input…");
                let bytecode: Uint8Array;
                try {
                    if (input.startsWith("0x")) {
                        bytecode = hexToBytes(input);
                    } else {
                        bytecode = hexToBytes(readFileSync(input, "utf-8").trim());
                    }
                } catch (e) {
                    stopSpinner();
                    console.error(error(e instanceof Error ? e.message : String(e)));
                    console.error(hint("Usage: d_tuft gas <file.bin|0x...> [--functions] [--top 5]"));
                    process.exit(1);
                }
                stopSpinner();
                console.log(success(`Loaded ${T.val.number(String(bytecode.length))} bytes`));

                startSpinner("Disassembling…");
                const result = disassemble(bytecode);
                stopSpinner();

                const gc = new GasCalculator();
                const report = gc.analyze(result.instructions);

                // ── Overview Panel ────────────────────────────────────────────
                console.log('');
                console.log(Panel.create("Gas Overview")
                    .stat("Input", input, T.val.filename)
                    .separator()
                    .stat("Instructions", String(report.instructionCount), T.val.number)
                    .stat("Total gas", String(report.totalGas), T.status.warn)
                    .render()
                );

                // ── Gas by category bar chart ─────────────────────────────────
                console.log('');
                console.log(sectionHeader("Gas by Category"));
                const categories = [...report.byCategory.entries()].sort((a, b) => b[1] - a[1]);
                const maxCatGas = categories[0]?.[1] ?? 1;

                for (const [cat, catGas] of categories) {
                    const pct = ((catGas / report.totalGas) * 100).toFixed(1);
                    const barLen = Math.round((catGas / maxCatGas) * 20);
                    const bar = T.val.number('█'.repeat(barLen)) + T.text.muted('░'.repeat(20 - barLen));
                    console.log(
                        `  ${T.text.body(cat.padEnd(14))} ${bar} ` +
                        `${T.status.warn(String(catGas).padStart(6))} ${T.text.muted(`(${pct}%)`)}`
                    );
                }
                console.log("");

                // ── Top opcodes table ─────────────────────────────────────────
                console.log(sectionHeader("Top Opcodes by Gas"));
                const topOpcodes = [...report.byOpcode.entries()]
                    .sort((a, b) => b[1].gas - a[1].gas)
                    .slice(0, 10);

                const opcodeTable = Table.create()
                    .column("Opcode", 14, { render: v => colorizeOpcode(v)(v) })
                    .column("Count", 8, { align: 'right', render: v => T.val.number(v) })
                    .column("Gas", 10, { align: 'right', render: v => T.status.warn(v) })
                    .column("Avg gas", 8, { align: 'right', render: v => T.text.muted(v) });

                for (const [mn, entry] of topOpcodes) {
                    const avg = (entry.gas / entry.count).toFixed(1);
                    opcodeTable.row([mn, String(entry.count), String(entry.gas), avg]);
                }

                console.log(opcodeTable.render());
                console.log("");

                // ── Hotspots ──────────────────────────────────────────────────
                const topN = parseInt(options.top, 10) || 5;
                const windowSize = parseInt(options.window, 10) || 10;
                const hotspots = gc.hotspots(result.instructions, topN, windowSize);

                if (hotspots.length > 0) {
                    console.log(sectionHeader(`Top ${hotspots.length} Hotspots (window=${windowSize})`));
                    for (let h = 0; h < hotspots.length; h++) {
                        const spot = hotspots[h]!;
                        console.log(
                            `  ${T.text.muted(`#${h + 1}`)} PC ` +
                            `${T.val.number(String(spot.startPC))}→${T.val.number(String(spot.endPC))}  ` +
                            `${T.status.warn(String(spot.gas))} gas`
                        );
                        for (const instr of spot.instructions.slice(0, 4)) {
                            const imm = instr.immediate
                                ? ` ${colorizeImmediate('0x' + [...instr.immediate].map(b => b.toString(16).padStart(2, '0')).join(''))}`
                                : '';
                            const colorizer = colorizeOpcode(instr.opcode.mnemonic, instr.opcode.value);
                            console.log(
                                `    ${T.val.pc(String(instr.pc).padStart(5))} ` +
                                `${padR(colorizer(instr.opcode.mnemonic), 12)}${imm}  ` +
                                `${T.val.gas(instr.opcode.gas)}`
                            );
                        }
                        if (spot.instructions.length > 4) {
                            console.log(T.text.muted(`    … ${spot.instructions.length - 4} more`));
                        }
                        console.log("");
                    }
                }

                // ── Function breakdown ────────────────────────────────────────
                if (options.functions) {
                    startSpinner("Identifying functions…");
                    const fi = new FunctionIdentifier(bytecode);
                    const maps = fi.identify();
                    stopSpinner();

                    console.log(sectionHeader(`Gas by Function (${maps.length})`));
                    const fnEstimates = maps
                        .map((m) => gc.estimateFunction(m.body, m.selector, m.name))
                        .sort((a, b) => b.totalGas - a.totalGas);

                    const fnTable = Table.create()
                        .column("Selector", 12, { render: v => T.val.selector(v) })
                        .column("Name", 24, { render: v => T.text.body(v) })
                        .column("Instr", 7, { align: 'right', render: v => T.val.number(v) })
                        .column("Gas", 10, { align: 'right', render: v => T.status.warn(v) });

                    for (const fn of fnEstimates) {
                        fnTable.row([
                            fn.selector ?? '',
                            fn.name ?? '<unknown>',
                            String(fn.instructionCount),
                            String(fn.totalGas),
                        ]);
                    }

                    console.log(fnTable.render());
                    console.log("");
                }

                console.log(sectionFooter());
            });
        });
}
