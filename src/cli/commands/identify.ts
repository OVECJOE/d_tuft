import type { Command } from "commander";
import { readFile } from "node:fs/promises";
import {
    detectFormat,
    parseAssemblyFile,
    tryCatch,
    startSpinner,
    updateSpinner,
    stopSpinner,
    success,
    error,
    info,
    hint,
    sectionHeader,
    sectionFooter,
    kv
} from "../utils";
import chalk from 'chalk';
import { hexToBytes } from "~~/utils";
import { FunctionIdentifier } from "~~/analysis/fi";
import type { ABI, AssemblyProgram } from "~~/core/types";
import { writeFileSync } from "node:fs";
import { formatFunctionsAsText, formatFunctionsAsJSON, formatFunctionsAnnotated } from "~~/formats";

export default function identify(program: Command) {
    program
        .command("identify")
        .alias("id")
        .description("Identify public functions and their boundaries in bytecode")
        .argument("<input>", "Bytecode file or hex string, or assembly file")
        .option("--format <format>", "Output format: text, annotated, json", "text")
        .option("--abi <file>", "ABI JSON file for resolving function names")
        .option("-d, --diff <second_input>", "Compare functions between two inputs")
        .option("-o, --output <file>", "Write output to file (default: stdout)")
        .option("--internal", "Also list internal/private functions (orphan JUMPDESTs)")
        .action(async (input: string, options: {
            format: "text" | "annotated" | "json";
            abi?: string;
            output?: string;
            internal: boolean;
        }) => {
            const validFormats = ["text", "annotated", "json"];
            if (!validFormats.includes(options.format)) {
                console.error(error(`Invalid format: "${options.format}". Choose from: ${validFormats.join(", ")}`));
                console.error(hint(`Example: d_tuft identify contract.bin --format annotated`));
                process.exit(1);
            }

            await tryCatch(async () => {
                console.log(sectionHeader("Function Identification"));
                console.log(kv("Input:", input));
                console.log(kv("Format:", options.format));
                if (options.abi) console.log(kv("ABI:", options.abi));
                console.log(sectionFooter());

                startSpinner("Reading input…");
                let source: Uint8Array | AssemblyProgram;
                const content = await readFile(input, "utf-8");
                const [format] = await detectFormat(input);
                stopSpinner();

                console.log(success(`Loaded ${input} (${chalk.cyan(format)})`));

                if (format === "bytecode") {
                    source = hexToBytes(content.trim());
                } else {
                    source = { lines: parseAssemblyFile(content), warnings: [] };
                }

                updateSpinner("Identifying functions…");
                startSpinner("Identifying functions…");
                const fi = new FunctionIdentifier(source);
                let maps = fi.identify();
                stopSpinner();

                if (options.abi) {
                    startSpinner("Resolving function names from ABI…");
                    const abiContent = await readFile(options.abi, "utf-8");
                    const abi = JSON.parse(abiContent) as ABI;
                    maps = fi.resolveNames(abi);
                    stopSpinner();
                    const resolved = maps.filter((m) => m.name).length;
                    console.log(success(`Resolved ${resolved}/${maps.length} function name(s) from ABI`));
                }

                const named = maps.filter((m) => m.name).length;
                const unnamed = maps.length - named;

                console.log(info(
                    `${maps.length} function(s) found` +
                    (named > 0 ? chalk.gray(` · ${chalk.green(named + ' named')}`) : '') +
                    (unnamed > 0 ? chalk.gray(` · ${chalk.yellow(unnamed + ' unnamed')}`) : '')
                ));

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
                            chalk.magenta(sectionHeader(`Internal functions (${internals.length})`)),
                            ...internals.map((i) =>
                                `  ${chalk.gray(`@${i.pc}`)}  ${chalk.gray("JUMPDEST")}`
                            ),
                        ].join("\n")
                        : '\n' + chalk.gray("  No internal JUMPDESTs found.");

                    out += internalSection;
                }

                console.log(sectionHeader("Results"));
                console.log(out);

                if (options.output) {
                    writeFileSync(options.output, out.replace(/\x1b\[[0-9;]*m/g, ""));
                    console.log('');
                    console.log(success(`Output written to ${options.output}`));
                }

                console.log(sectionFooter());
                console.log(kv("Total functions:", String(maps.length)));
                console.log(kv("Named:", named > 0 ? chalk.green(String(named)) : '0'));
                console.log(kv("Unnamed:", unnamed > 0 ? chalk.yellow(String(unnamed)) : '0'));
            });
        });
}
