import chalk from "chalk";
import type { FunctionMap } from "../core/types";

export { type FunctionMap };

export function formatFunctionsAsText(maps: FunctionMap[]): string {
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

export function formatFunctionsAsJSON(maps: FunctionMap[]): string {
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

export function formatFunctionsAnnotated(maps: FunctionMap[]): string {
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
