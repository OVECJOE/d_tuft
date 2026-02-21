import type { Command } from "commander";
import { readFile } from "node:fs/promises";
import { detectFormat, parseAssemblyFile, tryCatch } from "../utils";
import chalk from "chalk";
import { hexToBytes } from "@d_tuft/utils";
import { FunctionIdentifier } from "@d_tuft/analysis/fi";
import type { ABI, AssemblyProgram, FunctionMap } from "@d_tuft/core/types";
import { writeFileSync } from "node:fs";

// ===================== Formatters =======================

function formatFunctionsAsText(maps: FunctionMap[]): string {
    if (maps.length === 0) {
        return chalk.yellow("No public functions found. Contract may be a library, proxy, or use custom dispatch logic.");
    }

    const lines: string[] = [];

    for (const fn of maps) {
        const label = fn.name
            ? chalk.green(fn.name)
            : chalk.gray(`<unknown> ${fn.selector}`);

        const selector = chalk.cyan(fn.selector);
        const start = chalk.gray(`@${fn.startOffset}`);
        const end = fn.endOffset !== undefined ? chalk.gray(`→ @${fn.endOffset}`) : "";
        const bodySize = chalk.gray(`(${fn.body.length} instructions)`);

        lines.push(`  ${label}`);
        lines.push(`    selector  ${selector}`);
        lines.push(`    offset    ${start} ${end} ${bodySize}`);
        lines.push("");
    }

    return lines.join("\n");
}

function formatFunctionsAsJSON(maps: FunctionMap[]): string {
    const serializable = maps.map((fn) => ({
        selector: fn.selector,
        name: fn.name ?? null,
        startOffset: fn.startOffset,
        endOffset: fn.endOffset ?? null,
        bodyLength: fn.body.length,
        opcodes: fn.body.map((instr) => ({
            pc: instr.pc,
            mnemonic: instr.opcode.mnemonic,
            immediate: instr.immediate
                ? Array.from(instr.immediate)
                    .map((b) => b.toString(16).padStart(2, "0"))
                    .join("")
                : undefined,
        })),
    }));

    return JSON.stringify(serializable, null, 2);
}

function formatFunctionsAnnotated(maps: FunctionMap[]): string {
    if (maps.length === 0) {
        return chalk.yellow("No public functions identified.");
    }

    const lines: string[] = [];

    for (const fn of maps) {
        const header = fn.name
            ? `╔══ ${fn.name} ══ ${fn.selector}`
            : `╔══ <unresolved> ══ ${fn.selector}`;

        lines.push(chalk.cyan(header));
        lines.push(chalk.gray(`║   offset: @${fn.startOffset} → @${fn.endOffset ?? "?"}`));
        lines.push(chalk.gray(`║   body:   ${fn.body.length} instructions`));
        lines.push(chalk.gray("║"));

        for (const instr of fn.body) {
            const pc = chalk.gray(String(instr.pc).padStart(6));
            const op = chalk.white(instr.opcode.mnemonic.padEnd(14));
            const imm = instr.immediate
                ? chalk.yellow(
                    "0x" +
                    Array.from(instr.immediate)
                        .map((b) => b.toString(16).padStart(2, "0"))
                        .join("")
                )
                : "";
            const gas = chalk.gray(`[${instr.opcode.gas} gas]`);

            lines.push(`║  ${pc}  ${op} ${imm.padEnd(20)} ${gas}`);
        }

        lines.push(chalk.cyan("╚" + "═".repeat(60)));
        lines.push("");
    }

    return lines.join("\n");
}

export default function identify(program: Command) {
    program
        .command("identify")
        .alias("id")
        .description("Analyze input to identify functions and their boundaries")
        .argument("<input>", "Input bytecode (hex string or file) or assembly file")
        .option("--format <format>", "Output format: text, annotated, json", "text")
        .option("--abi <file>", "ABI JSON file for resolving function names")
        .option("-o, --output <file>", "Output file (defaults to stdout)")
        .option("--internal", "Also list internal/private functions (orphan JUMPDESTs)")
        .action(async (input: string, options: {
            format: "text" | "annotated" | "json";
            abi?: string;
            output?: string;
            internal: boolean;
        }) => {
            const validFormats = ["text", "annotated", "json"];
            if (!validFormats.includes(options.format)) {
                console.error(chalk.red(`Invalid format: "${options.format}". Choose from: ${validFormats.join(", ")}`));
                process.exit(1);
            }

            await tryCatch(async () => {
                // ── 1. Read and parse input ───────────────────────────────────
                let source: Uint8Array | AssemblyProgram;
                const content = await readFile(input, "utf-8");
                const [format] = await detectFormat(input);

                if (format === "bytecode") {
                    source = hexToBytes(content.trim());
                } else {
                    source = { lines: parseAssemblyFile(content), warnings: [] };
                }

                console.error(chalk.blue(`Identifying functions in "${input}"...`));

                // ── 2. Run identification ─────────────────────────────────────
                const fi = new FunctionIdentifier(source);
                let maps = fi.identify();

                // ── 3. Resolve names from ABI if provided ─────────────────────
                if (options.abi) {
                    const abiContent = await readFile(options.abi, "utf-8");
                    const abi = JSON.parse(abiContent) as ABI;
                    maps = fi.resolveNames(abi);
                    const resolved = maps.filter((m) => m.name).length;
                    console.error(chalk.gray(`Resolved ${resolved}/${maps.length} function names from ABI`));
                }

                // ── 4. Format output ──────────────────────────────────────────
                let out: string;
                switch (options.format) {
                    case "annotated":
                        out = formatFunctionsAnnotated(maps);
                        break;
                    case "json":
                        out = formatFunctionsAsJSON(maps);
                        break;
                    case "text":
                    default:
                        out = formatFunctionsAsText(maps);
                }

                // ── 5. Internal functions (optional) ──────────────────────────
                if (options.internal) {
                    const internals = fi.findInternalFunctions();
                    const internalSection = internals.length > 0
                        ? [
                            "",
                            chalk.magenta(`Internal / private functions (${internals.length} JUMPDEST targets):`),
                            ...internals.map((i) =>
                                `  ${chalk.gray(`@${i.pc}`)}  ${chalk.gray("JUMPDEST")}`
                            ),
                        ].join("\n")
                        : chalk.gray("\nNo orphan JUMPDESTs found.");

                    out += internalSection;
                }

                // ── 6. Write output ───────────────────────────────────────────
                if (options.output) {
                    // Strip chalk color codes for file output
                    writeFileSync(options.output, out.replace(/\x1b\[[0-9;]*m/g, ""));
                    console.error(chalk.green(`✓ Output written to ${options.output}`));
                } else {
                    console.log(out);
                }

                // ── 7. Summary ────────────────────────────────────────────────
                const named = maps.filter((m) => m.name).length;
                const unnamed = maps.length - named;

                console.error(
                    chalk.gray(
                        `\nFound ${maps.length} public function(s)` +
                        (named > 0 ? chalk.green(` · ${named} named`) : "") +
                        (unnamed > 0 ? chalk.yellow(` · ${unnamed} unnamed`) : "")
                    )
                );
            });
        });
}