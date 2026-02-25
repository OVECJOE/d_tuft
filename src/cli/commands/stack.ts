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
import { StackSimulator } from "~~/utils/stack-simulator";
import { disassemble } from "~~/core";

export default function stack(program: Command) {
    program
        .command("stack")
        .alias("s")
        .description("Simulate EVM stack and visualise depth across execution")
        .argument("<input>", "Bytecode file or hex string")
        .option("--trace", "Show per-instruction stack depth trace")
        .option("--limit <n>", "Max trace lines to display", "50")
        .action(async (input: string, options: { trace: boolean; limit: string }) => {
            await tryCatch(async () => {
                console.log(sectionHeader("Stack Simulation"));
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
                    console.error(hint("Usage: d_tuft stack <file.bin|0x...> [--trace] [--limit 50]"));
                    process.exit(1);
                }
                stopSpinner();
                console.log(success(`Loaded ${bytecode.length} bytes`));

                startSpinner("Disassembling…");
                const result = disassemble(bytecode);
                stopSpinner();

                startSpinner("Simulating stack…");
                const sim = new StackSimulator();
                const simResult = sim.simulate(result.instructions);
                stopSpinner();

                console.log(sectionHeader("Stack Profile"));
                console.log(kv("Max depth:", chalk.cyan.bold(String(simResult.maxDepth))));
                console.log(kv("Min depth:", String(simResult.minDepth)));
                console.log(kv("Final depth:", String(simResult.finalDepth)));
                console.log(kv("Instructions:", String(result.instructions.length)));
                console.log(kv("Errors:", simResult.errors.length === 0
                    ? chalk.green("0")
                    : chalk.red(String(simResult.errors.length))));
                console.log("");

                // Depth histogram
                const depthCounts = new Map<number, number>();
                for (const d of simResult.depthAtPC.values()) {
                    depthCounts.set(d, (depthCounts.get(d) ?? 0) + 1);
                }
                const sortedDepths = [...depthCounts.entries()].sort((a, b) => a[0] - b[0]);
                const maxCount = Math.max(...sortedDepths.map(([, c]) => c), 1);

                console.log(sectionHeader("Depth Distribution"));
                for (const [depth, count] of sortedDepths) {
                    const barLen = Math.round((count / maxCount) * 30);
                    const bar = chalk.cyan("█".repeat(barLen)) + chalk.gray("░".repeat(30 - barLen));
                    console.log(`  ${chalk.white(String(depth).padStart(4))} ${bar} ${chalk.gray(String(count) + "x")}`);
                }
                console.log("");

                if (simResult.errors.length > 0) {
                    console.log(sectionHeader(`Errors (${simResult.errors.length})`));
                    for (const err of simResult.errors.slice(0, 20)) {
                        const icon = err.kind === "underflow" ? chalk.red("↓") : chalk.red("↑");
                        console.log(`  ${icon} ${chalk.gray(`PC ${err.pc}`)} ${chalk.white(err.mnemonic.padEnd(12))} ${chalk.red(err.kind)} ${chalk.gray("— " + err.message)}`);
                    }
                    if (simResult.errors.length > 20) {
                        console.log(chalk.gray(`  … ${simResult.errors.length - 20} more`));
                    }
                    console.log("");
                }

                if (options.trace) {
                    const limit = parseInt(options.limit, 10) || 50;
                    console.log(sectionHeader(`Execution Trace (first ${Math.min(limit, result.instructions.length)} instructions)`));
                    console.log(
                        `  ${chalk.gray("PC".padStart(5))} ${chalk.gray("Opcode".padEnd(14))} ${chalk.gray("Operand".padEnd(20))} ${chalk.gray("Depth".padStart(5))} ${chalk.gray("Delta".padStart(6))} ${chalk.gray("Visual")}`
                    );

                    const traceInstructions = result.instructions.slice(0, limit);
                    for (const instr of traceInstructions) {
                        const depth = simResult.depthAtPC.get(instr.pc) ?? 0;
                        const delta = instr.opcode.outputs - instr.opcode.inputs;
                        const deltaStr = delta >= 0 ? chalk.green(`+${delta}`) : chalk.red(String(delta));

                        const imm = instr.immediate
                            ? "0x" + [...instr.immediate].map(b => b.toString(16).padStart(2, "0")).join("")
                            : "";

                        const postDepth = depth + delta;
                        const stackVis = postDepth > 0
                            ? chalk.cyan("│".repeat(Math.min(postDepth, 30))) + (postDepth > 30 ? chalk.gray("…") : "")
                            : chalk.gray("·");

                        console.log(
                            `  ${chalk.gray(String(instr.pc).padStart(5))} ${chalk.white(instr.opcode.mnemonic.padEnd(14))} ${chalk.gray(imm.padEnd(20))} ${String(depth).padStart(5)} ${deltaStr.padStart(15)} ${stackVis}`
                        );
                    }

                    if (result.instructions.length > limit) {
                        console.log(chalk.gray(`  … ${result.instructions.length - limit} more instructions`));
                    }
                    console.log("");
                }

                console.log(sectionFooter());

                if (simResult.success) {
                    console.log(box(
                        `${chalk.green("✓")} Stack simulation passed — no underflow or overflow detected.\n` +
                        `  Max depth: ${simResult.maxDepth}  Final depth: ${simResult.finalDepth}`,
                        "VALID"
                    ));
                } else {
                    console.log(box(
                        `${chalk.red("✗")} ${simResult.errors.length} stack error(s) detected.\n` +
                        `  Max depth: ${simResult.maxDepth}  Errors: ${simResult.errors.length}`,
                        "INVALID"
                    ));
                }
            });
        });
}
