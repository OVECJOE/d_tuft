import { hexToBytes } from "~~/utils";
import { FunctionIdentifier } from "~~/analysis/fi";
import type { Command } from "commander";
import chalk from "chalk";
import {
    readAndDetectFiles,
    tryCatch,
    parseAssemblyFile,
    startSpinner,
    stopSpinner,
    success,
    error,
    hint,
    info,
    sectionHeader,
    sectionFooter,
    kv,
    box
} from "../utils";
import { formatDiffAsText, formatDiffAsJSON, formatDiffAnnotated } from "~~/formats";
import type { AssemblyProgram } from "~~/core/types";

export default function diff(program: Command) {
    program
        .command("diff")
        .description("Compare two contracts at function level to identify changes")
        .argument("<first>", "First input (bytecode file or hex string)")
        .argument("<second>", "Second input (bytecode file or hex string)")
        .option("--format <format>", "Output format: text, annotated, json", "text")
        .action(
            async (
                firstInput: string,
                secondInput: string,
                options: { format: "text" | "annotated" | "json" }
            ) => {
                const validFormats = ["text", "annotated", "json"];
                if (!validFormats.includes(options.format)) {
                    console.error(error(`Invalid format: "${options.format}". Choose from: ${validFormats.join(", ")}`));
                    process.exit(1);
                }

                await tryCatch(async () => {
                    console.log(sectionHeader("Function Diff"));
                    console.log(kv("First:", firstInput));
                    console.log(kv("Second:", secondInput));
                    console.log(kv("Format:", options.format));
                    console.log(sectionFooter());

                    startSpinner("Reading input files…");
                    const [firstResult, secondResult] = await readAndDetectFiles(firstInput, secondInput);
                    stopSpinner();

                    if (!firstResult || !secondResult) {
                        console.error(error("Failed to read input files"));
                        console.error(hint(`Usage: d_tuft diff <first.bin> <second.bin> [--format text|annotated|json]`));
                        process.exit(1);
                    }

                    console.log(success(`Loaded ${firstInput} (${chalk.cyan(firstResult.format)})`));
                    console.log(success(`Loaded ${secondInput} (${chalk.cyan(secondResult.format)})`));

                    let source1: Uint8Array | AssemblyProgram;
                    let source2: Uint8Array | AssemblyProgram;

                    startSpinner("Parsing bytecode…");

                    if (firstResult.format === "bytecode") {
                        source1 = hexToBytes(firstResult.content.trim());
                    } else {
                        source1 = { lines: parseAssemblyFile(firstResult.content), warnings: [] };
                    }

                    if (secondResult.format === "bytecode") {
                        source2 = hexToBytes(secondResult.content.trim());
                    } else {
                        source2 = { lines: parseAssemblyFile(secondResult.content), warnings: [] };
                    }

                    stopSpinner();

                    startSpinner("Analyzing function differences…");
                    const fi1 = new FunctionIdentifier(source1);
                    const fi2 = new FunctionIdentifier(source2);

                    const maps1 = fi1.identify();
                    const maps2 = fi2.identify();
                    const diffs = fi1.diff(fi2);
                    stopSpinner();

                    const added = diffs.filter((d) => d.kind === "added").length;
                    const removed = diffs.filter((d) => d.kind === "removed").length;
                    const modified = diffs.filter((d) => d.kind === "modified").length;
                    const total = added + removed + modified;

                    console.log(sectionHeader("Results"));

                    if (total === 0) {
                        console.log('');
                        console.log(box(
                            `${chalk.green('✓')} No functional differences found between the two inputs.`,
                            'IDENTICAL'
                        ));
                    } else {
                        console.log(info(
                            (added > 0 ? chalk.green(`${added} added`) : '') +
                            (added > 0 && (removed + modified) > 0 ? chalk.gray('  ·  ') : '') +
                            (removed > 0 ? chalk.red(`${removed} removed`) : '') +
                            (removed > 0 && modified > 0 ? chalk.gray('  ·  ') : '') +
                            (modified > 0 ? chalk.yellow(`${modified} modified`) : '')
                        ));
                        console.log('');

                        let out: string;
                        switch (options.format) {
                            case "annotated":
                                out = formatDiffAnnotated(diffs, maps1, maps2, firstInput, secondInput);
                                break;
                            case "json":
                                out = formatDiffAsJSON(diffs);
                                break;
                            case "text":
                            default:
                                out = formatDiffAsText(diffs, firstInput, secondInput);
                        }

                        console.log(out);
                    }

                    console.log(sectionFooter());
                });
            }
        );
}
