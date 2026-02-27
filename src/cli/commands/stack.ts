import type { Command } from "commander";
import { readFileSync } from "node:fs";
import {
    tryCatch, startSpinner, stopSpinner,
    success, error, hint, sectionHeader, sectionFooter, kv, box,
} from "../utils";
import { hexToBytes } from "~~/utils";
import { StackSimulator } from "~~/utils/stack-simulator";
import { disassemble } from "~~/core";
import { T } from '~~/cli/ui';
import { colorizeOpcode } from '~~/formats/colors';
import { padR } from '~~/cli/ui/ansi';

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
                console.log(kv("Input:", T.val.filename(input)));
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
                console.log(success(`Loaded ${T.val.number(String(bytecode.length))} bytes`));

                startSpinner("Disassembling…");
                const result = disassemble(bytecode);
                stopSpinner();

                startSpinner("Simulating stack…");
                const sim = new StackSimulator();
                const simResult = sim.simulate(result.instructions);
                stopSpinner();

                console.log(sectionHeader("Stack Profile"));
                console.log(kv("Max depth:", T.val.number(String(simResult.maxDepth))));
                console.log(kv("Min depth:", String(simResult.minDepth)));
                console.log(kv("Final depth:", String(simResult.finalDepth)));
                console.log(kv("Instructions:", T.val.number(String(result.instructions.length))));
                console.log(kv("Errors:",
                    simResult.errors.length === 0
                        ? T.status.success("0")
                        : T.status.error(String(simResult.errors.length))
                ));
                console.log("");

                // ── Depth histogram ───────────────────────────────────────────
                const depthCounts = new Map<number, number>();
                for (const d of simResult.depthAtPC.values()) {
                    depthCounts.set(d, (depthCounts.get(d) ?? 0) + 1);
                }
                const sortedDepths = [...depthCounts.entries()].sort((a, b) => a[0] - b[0]);
                const maxCount = Math.max(...sortedDepths.map(([, c]) => c), 1);

                console.log(sectionHeader("Depth Distribution"));
                for (const [depth, count] of sortedDepths) {
                    const barLen = Math.round((count / maxCount) * 30);
                    const bar = T.val.number('█'.repeat(barLen)) + T.text.muted('░'.repeat(30 - barLen));
                    console.log(`  ${T.text.body(String(depth).padStart(4))} ${bar} ${T.text.muted(String(count) + 'x')}`);
                }
                console.log("");

                // ── Errors ────────────────────────────────────────────────────
                if (simResult.errors.length > 0) {
                    console.log(sectionHeader(`Errors (${simResult.errors.length})`));
                    for (const err of simResult.errors.slice(0, 20)) {
                        const icon = err.kind === "underflow"
                            ? T.status.error("↓")
                            : T.status.error("↑");
                        const colorizer = colorizeOpcode(err.mnemonic);
                        console.log(
                            `  ${icon} ${T.val.pc(`PC ${err.pc}`)} ` +
                            `${padR(colorizer(err.mnemonic), 12)} ` +
                            `${T.status.error(err.kind)} ${T.text.muted('— ' + err.message)}`
                        );
                    }
                    if (simResult.errors.length > 20) {
                        console.log(T.text.muted(`  … ${simResult.errors.length - 20} more`));
                    }
                    console.log("");
                }

                // ── Trace ─────────────────────────────────────────────────────
                if (options.trace) {
                    const limit = parseInt(options.limit, 10) || 50;
                    console.log(sectionHeader(`Execution Trace (first ${Math.min(limit, result.instructions.length)})`));
                    console.log(
                        `  ${T.text.key('PC'.padStart(5))} ${T.text.key('Opcode'.padEnd(14))} ` +
                        `${T.text.key('Operand'.padEnd(20))} ${T.text.key('Depth'.padStart(5))} ` +
                        `${T.text.key('Delta'.padStart(6))} ${T.text.key('Visual')}`
                    );

                    for (const instr of result.instructions.slice(0, limit)) {
                        const depth = simResult.depthAtPC.get(instr.pc) ?? 0;
                        const delta = instr.opcode.outputs - instr.opcode.inputs;
                        const deltaStr = delta >= 0 ? T.val.stackNet(delta) : T.val.stackNet(delta);

                        const imm = instr.immediate
                            ? "0x" + [...instr.immediate].map(b => b.toString(16).padStart(2, "0")).join("")
                            : "";

                        const postDepth = depth + delta;
                        const stackVis = postDepth > 0
                            ? T.val.number('│'.repeat(Math.min(postDepth, 30))) + (postDepth > 30 ? T.text.muted('…') : '')
                            : T.text.muted('·');

                        const colorizer = colorizeOpcode(instr.opcode.mnemonic, instr.opcode.value);
                        console.log(
                            `  ${T.val.pc(String(instr.pc).padStart(5))} ` +
                            `${padR(colorizer(instr.opcode.mnemonic), 14)} ` +
                            `${T.text.muted(imm.padEnd(20))} ${String(depth).padStart(5)} ` +
                            `${String(deltaStr).padStart(15)} ${stackVis}`
                        );
                    }

                    if (result.instructions.length > limit) {
                        console.log(T.text.muted(`  … ${result.instructions.length - limit} more instructions`));
                    }
                    console.log("");
                }

                console.log(sectionFooter());

                if (simResult.success) {
                    console.log(box(
                        `${T.status.success("✓")} Stack simulation passed — no underflow or overflow detected.\n` +
                        `  Max depth: ${simResult.maxDepth}  Final depth: ${simResult.finalDepth}`,
                        'VALID'
                    ));
                } else {
                    console.log(box(
                        `${T.status.error("✗")} ${simResult.errors.length} stack error(s) detected.\n` +
                        `  Max depth: ${simResult.maxDepth}  Errors: ${simResult.errors.length}`,
                        'INVALID'
                    ));
                }
            });
        });
}
