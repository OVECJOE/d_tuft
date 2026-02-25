import type { Command } from "commander";
import { readFileSync } from "node:fs";
import {
    tryCatch,
    startSpinner,
    stopSpinner,
    success,
    error,
    hint,
    sectionHeader,
    sectionFooter,
    kv,
    box,
} from "../utils";
import chalk from "chalk";
import { hexToBytes } from "~~/utils";
import { GasCalculator } from "~~/utils/gas-calculator";
import { disassemble } from "~~/core";
import { FunctionIdentifier } from "~~/analysis/fi";

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
                console.log(kv("Input:", input));
                console.log(sectionFooter());

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
                console.log(success(`Loaded ${bytecode.length} bytes`));

                startSpinner("Disassembling…");
                const result = disassemble(bytecode);
                stopSpinner();

                const gc = new GasCalculator();
                const report = gc.analyze(result.instructions);

                console.log(sectionHeader("Overview"));
                console.log(kv("Instructions:", String(report.instructionCount)));
                console.log(kv("Total gas:", chalk.yellow.bold(String(report.totalGas))));
                console.log("");

                console.log(sectionHeader("Gas by Category"));
                const categories = [...report.byCategory.entries()].sort((a, b) => b[1] - a[1]);
                const maxCatGas = categories[0]?.[1] ?? 1;

                for (const [cat, catGas] of categories) {
                    const pct = ((catGas / report.totalGas) * 100).toFixed(1);
                    const barLen = Math.round((catGas / maxCatGas) * 20);
                    const bar = chalk.cyan("█".repeat(barLen)) + chalk.gray("░".repeat(20 - barLen));
                    console.log(`  ${chalk.white(cat.padEnd(14))} ${bar} ${chalk.yellow(String(catGas).padStart(6))} ${chalk.gray(`(${pct}%)`)}`);
                }
                console.log("");

                console.log(sectionHeader("Top Opcodes by Gas"));
                const topOpcodes = [...report.byOpcode.entries()]
                    .sort((a, b) => b[1].gas - a[1].gas)
                    .slice(0, 10);

                console.log(
                    `  ${chalk.gray("Opcode".padEnd(14))} ${chalk.gray("Count".padStart(6))} ${chalk.gray("Gas".padStart(8))} ${chalk.gray("Avg".padStart(6))}`
                );
                for (const [mn, entry] of topOpcodes) {
                    const avg = (entry.gas / entry.count).toFixed(1);
                    console.log(
                        `  ${chalk.white(mn.padEnd(14))} ${String(entry.count).padStart(6)} ${chalk.yellow(String(entry.gas).padStart(8))} ${chalk.gray(avg.padStart(6))}`
                    );
                }
                console.log("");

                const topN = parseInt(options.top, 10) || 5;
                const windowSize = parseInt(options.window, 10) || 10;
                const hotspots = gc.hotspots(result.instructions, topN, windowSize);

                if (hotspots.length > 0) {
                    console.log(sectionHeader(`Top ${hotspots.length} Hotspots (window=${windowSize})`));
                    for (let h = 0; h < hotspots.length; h++) {
                        const spot = hotspots[h]!;
                        console.log(
                            `  ${chalk.gray(`#${h + 1}`)} PC ${chalk.cyan(String(spot.startPC))}→${chalk.cyan(String(spot.endPC))}  ${chalk.yellow.bold(String(spot.gas) + " gas")}`
                        );
                        for (const instr of spot.instructions.slice(0, 4)) {
                            const imm = instr.immediate ? ` ${chalk.gray("0x" + [...instr.immediate].map(b => b.toString(16).padStart(2, "0")).join(""))}` : "";
                            console.log(`    ${chalk.gray(String(instr.pc).padStart(5))} ${chalk.white(instr.opcode.mnemonic.padEnd(12))}${imm}  ${chalk.yellow(String(instr.opcode.gas) + "g")}`);
                        }
                        if (spot.instructions.length > 4) {
                            console.log(chalk.gray(`    … ${spot.instructions.length - 4} more`));
                        }
                        console.log("");
                    }
                }

                if (options.functions) {
                    startSpinner("Identifying functions…");
                    const fi = new FunctionIdentifier(bytecode);
                    const maps = fi.identify();
                    stopSpinner();

                    console.log(sectionHeader(`Gas by Function (${maps.length})`));
                    const fnEstimates = maps
                        .map((m) => gc.estimateFunction(m.body, m.selector, m.name))
                        .sort((a, b) => b.totalGas - a.totalGas);

                    console.log(
                        `  ${chalk.gray("Selector".padEnd(12))} ${chalk.gray("Name".padEnd(24))} ${chalk.gray("Instr".padStart(6))} ${chalk.gray("Gas".padStart(8))}`
                    );
                    for (const fn of fnEstimates) {
                        console.log(
                            `  ${chalk.cyan((fn.selector ?? "").padEnd(12))} ${chalk.white((fn.name ?? "<unknown>").padEnd(24))} ${String(fn.instructionCount).padStart(6)} ${chalk.yellow(String(fn.totalGas).padStart(8))}`
                        );
                    }
                    console.log("");
                }

                console.log(sectionFooter());
            });
        });
}
