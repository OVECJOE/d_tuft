import type { Command } from "commander";
import { readFile } from "node:fs/promises";
import {
    detectFormat, parseAssemblyFile, tryCatch,
    startSpinner, updateSpinner, stopSpinner,
    success, error, info, hint, sectionHeader, sectionFooter, kv,
} from "../utils";
import { hexToBytes } from "~~/utils";
import { FunctionIdentifier } from "~~/analysis/fi";
import type { ABI, AssemblyProgram } from "~~/core/types";
import { writeFileSync } from "node:fs";
import { formatFunctionsAsText, formatFunctionsAsJSON, formatFunctionsAnnotated } from "~~/formats";
import { GasCalculator } from "~~/utils/gas-calculator";
import { T, Table } from '~~/cli/ui';

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
        .option("--gas", "Show gas cost estimates per function")
        .action(async (input: string, options: {
            format: "text" | "annotated" | "json";
            abi?: string;
            output?: string;
            internal: boolean;
            gas: boolean;
        }) => {
            const validFormats = ["text", "annotated", "json"];
            if (!validFormats.includes(options.format)) {
                console.error(error(`Invalid format: "${options.format}". Choose from: ${validFormats.join(", ")}`));
                console.error(hint(`Example: d_tuft identify contract.bin --format annotated`));
                process.exit(1);
            }

            await tryCatch(async () => {
                console.log(sectionHeader("Function Identification"));
                console.log(kv("Input:", T.val.filename(input)));
                console.log(kv("Format:", T.val.format(options.format)));
                if (options.abi) console.log(kv("ABI:", T.val.filename(options.abi)));
                console.log(sectionFooter());

                startSpinner("Reading input…");
                const content = await readFile(input, "utf-8");
                const [format] = await detectFormat(input);
                stopSpinner();

                console.log(success(`Loaded ${T.val.filename(input)} (${T.val.format(format)})`));

                let source: Uint8Array | AssemblyProgram;
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
                    const resolved = maps.filter(m => m.name).length;
                    console.log(success(`Resolved ${T.val.number(String(resolved))}/${maps.length} function name(s) from ABI`));
                }

                const named = maps.filter(m => m.name).length;
                const unnamed = maps.length - named;

                const parts: string[] = [`${maps.length} function(s) found`];
                if (named > 0) parts.push(T.status.success(`${named} named`));
                if (unnamed > 0) parts.push(T.status.warn(`${unnamed} unnamed`));
                console.log(info(parts.join(T.text.muted(' · '))));

                let out: string;
                switch (options.format) {
                    case "annotated": out = formatFunctionsAnnotated(maps); break;
                    case "json": out = formatFunctionsAsJSON(maps); break;
                    default: out = formatFunctionsAsText(maps);
                }

                if (options.internal) {
                    const internals = fi.findInternalFunctions();
                    const internalSection = internals.length > 0
                        ? [
                            "",
                            T.op.jumpdest(sectionHeader(`Internal functions (${internals.length})`)),
                            ...internals.map(i =>
                                `  ${T.val.pc(`@${i.pc}`)}  ${T.op.jumpdest('JUMPDEST')}`
                            ),
                        ].join("\n")
                        : '\n' + T.text.muted("  No internal JUMPDESTs found.");
                    out += internalSection;
                }

                console.log(sectionHeader("Results"));
                console.log(out);

                if (options.output) {
                    writeFileSync(options.output, out.replace(/\x1b\[[0-9;]*[A-Za-z]/g, ""));
                    console.log('');
                    console.log(success(`Output written to ${T.val.filename(options.output)}`));
                }

                console.log(sectionFooter());
                console.log(kv("Total functions:", T.val.number(String(maps.length))));
                console.log(kv("Named:", named > 0 ? T.status.success(String(named)) : '0'));
                console.log(kv("Unnamed:", unnamed > 0 ? T.status.warn(String(unnamed)) : '0'));

                if (options.gas && maps.length > 0) {
                    const gc = new GasCalculator();
                    const estimates = maps
                        .map(m => gc.estimateFunction(m.body, m.selector, m.name))
                        .sort((a, b) => b.totalGas - a.totalGas);

                    console.log('');
                    console.log(sectionHeader('Gas per Function'));

                    const gasTable = Table.create()
                        .column('Selector', 12, { render: v => T.val.selector(v) })
                        .column('Name', 24, { render: v => T.text.body(v) })
                        .column('Instr', 7, { align: 'right', render: v => T.val.number(v) })
                        .column('Gas', 10, { align: 'right', render: v => T.status.warn(v) });

                    for (const fn of estimates) {
                        gasTable.row([
                            fn.selector ?? '',
                            fn.name ?? '<unknown>',
                            String(fn.instructionCount),
                            String(fn.totalGas),
                        ]);
                    }

                    console.log(gasTable.render());
                    console.log(sectionFooter());
                }
            });
        });
}
