import type { Command } from "commander";
import { readFile } from "node:fs/promises";
import { detectFormat, parseAssemblyFile, tryCatch } from "../utils";
import chalk from "chalk";
import { hexToBytes } from "~~/utils";
import { FunctionIdentifier } from "~~/analysis/fi";
import type { ABI, AssemblyProgram } from "~~/core/types";
import { writeFileSync } from "node:fs";
import { formatFunctionsAsText, formatFunctionsAsJSON, formatFunctionsAnnotated } from "~~/formats";

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
                let source: Uint8Array | AssemblyProgram;
                const content = await readFile(input, "utf-8");
                const [format] = await detectFormat(input);

                if (format === "bytecode") {
                    source = hexToBytes(content.trim());
                } else {
                    source = { lines: parseAssemblyFile(content), warnings: [] };
                }

                console.error(chalk.blue(`Identifying functions in "${input}"...`));

                const fi = new FunctionIdentifier(source);
                let maps = fi.identify();

                if (options.abi) {
                    const abiContent = await readFile(options.abi, "utf-8");
                    const abi = JSON.parse(abiContent) as ABI;
                    maps = fi.resolveNames(abi);
                    const resolved = maps.filter((m) => m.name).length;
                    console.error(chalk.gray(`Resolved ${resolved}/${maps.length} function names from ABI`));
                }

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

                if (options.output) {
                    writeFileSync(options.output, out.replace(/\x1b\[[0-9;]*m/g, ""));
                    console.error(chalk.green(`✓ Output written to ${options.output}`));
                } else {
                    console.log(out);
                }

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
