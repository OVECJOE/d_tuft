import chalk from "chalk";
import type { SelectorDiff, FunctionMap, Instruction } from "../core/types";

export { type SelectorDiff };

/**
 * Format a diff result as plain text
 * @param diffs Array of selector diffs between two bytecodes
 * @param firstName Optional name for the first input (e.g., "original")
 * @param secondName Optional name for the second input (e.g., "modified")
 * @returns Formatted text output
 */
export function formatDiffAsText(diffs: SelectorDiff[], firstName = "First", secondName = "Second"): string {
    if (diffs.length === 0) {
        return chalk.green("✓ No differences found between the two bytecodes.");
    }

    const added = diffs.filter((d) => d.kind === "added");
    const removed = diffs.filter((d) => d.kind === "removed");
    const modified = diffs.filter((d) => d.kind === "modified");

    const lines: string[] = [];

    if (added.length > 0) {
        lines.push(chalk.green(`Added functions (in ${secondName}, not in ${firstName}):`));
        for (const fn of added) {
            const label = fn.name ? chalk.green(fn.name) : chalk.gray("<unknown>");
            lines.push(`  ${label} ${chalk.cyan(fn.selector)}`);
        }
        lines.push("");
    }

    if (removed.length > 0) {
        lines.push(chalk.red(`Removed functions (in ${firstName}, not in ${secondName}):`));
        for (const fn of removed) {
            const label = fn.name ? chalk.red(fn.name) : chalk.gray("<unknown>");
            lines.push(`  ${label} ${chalk.cyan(fn.selector)}`);
        }
        lines.push("");
    }

    if (modified.length > 0) {
        lines.push(chalk.yellow(`Modified functions (different bytecode):`));
        for (const fn of modified) {
            const label = fn.name ? chalk.yellow(fn.name) : chalk.gray("<unknown>");
            lines.push(`  ${label} ${chalk.cyan(fn.selector)}`);
        }
        lines.push("");
    }

    // Summary
    const total = diffs.length;
    lines.push(
        chalk.gray(`Summary: ${total} difference(s) — `) +
        (added.length > 0 ? chalk.green(`${added.length} added`) : "") +
        (added.length > 0 && removed.length + modified.length > 0 ? chalk.gray(" · ") : "") +
        (removed.length > 0 ? chalk.red(`${removed.length} removed`) : "") +
        (removed.length > 0 && modified.length > 0 ? chalk.gray(" · ") : "") +
        (modified.length > 0 ? chalk.yellow(`${modified.length} modified`) : "")
    );

    return lines.join("\n");
}

/**
 * Format a diff result as JSON
 * @param diffs Array of selector diffs between two bytecodes
 * @returns JSON string output
 */
export function formatDiffAsJSON(diffs: SelectorDiff[]): string {
    return JSON.stringify(diffs, null, 2);
}

/**
 * Format a diff result with annotated function bodies
 * @param diffs Array of selector diffs between two bytecodes
 * @param firstMaps Function maps from the first bytecode
 * @param secondMaps Function maps from the second bytecode
 * @param firstName Optional name for the first input
 * @param secondName Optional name for the second input
 * @returns Formatted annotated output
 */
export function formatDiffAnnotated(
    diffs: SelectorDiff[],
    firstMaps: FunctionMap[],
    secondMaps: FunctionMap[],
    firstName = "First",
    secondName = "Second"
): string {
    if (diffs.length === 0) {
        return chalk.green("✓ No differences found between the two bytecodes.");
    }

    const lines: string[] = [];
    const firstBySelector = new Map(firstMaps.map((m) => [m.selector, m]));
    const secondBySelector = new Map(secondMaps.map((m) => [m.selector, m]));

    for (const diff of diffs) {
        const label = diff.name
            ? chalk.cyan(diff.name)
            : chalk.gray("<unknown>");

        const selector = chalk.yellow(diff.selector);

        if (diff.kind === "added") {
            lines.push(chalk.green(`╔══ ADDED: ${label} ══ ${selector}`));
            lines.push(chalk.gray(`║   Function exists only in ${secondName}`));
            const secondFn = secondBySelector.get(diff.selector);
            if (secondFn) {
                lines.push(formatAnnotatedBody(secondFn.body, secondName));
            }
            lines.push(chalk.green("╚" + "═".repeat(60)));
            lines.push("");
        } else if (diff.kind === "removed") {
            lines.push(chalk.red(`╔══ REMOVED: ${label} ══ ${selector}`));
            lines.push(chalk.gray(`║   Function exists only in ${firstName}`));
            const firstFn = firstBySelector.get(diff.selector);
            if (firstFn) {
                lines.push(formatAnnotatedBody(firstFn.body, firstName));
            }
            lines.push(chalk.red("╚" + "═".repeat(60)));
            lines.push("");
        } else if (diff.kind === "modified") {
            lines.push(chalk.yellow(`╔══ MODIFIED: ${label} ══ ${selector}`));
            lines.push(chalk.gray(`║   Function bytecode differs between ${firstName} and ${secondName}`));

            const firstFn = firstBySelector.get(diff.selector);
            const secondFn = secondBySelector.get(diff.selector);

            if (firstFn && secondFn) {
                // Use tabular side-by-side diff
                lines.push(formatTabularDiff(firstFn.body, secondFn.body, firstName, secondName));
            } else if (firstFn) {
                lines.push(formatAnnotatedBody(firstFn.body, firstName));
            } else if (secondFn) {
                lines.push(formatAnnotatedBody(secondFn.body, secondName));
            }

            lines.push(chalk.yellow("╚" + "═".repeat(60)));
            lines.push("");
        }
    }

    // Summary footer
    const added = diffs.filter((d) => d.kind === "added").length;
    const removed = diffs.filter((d) => d.kind === "removed").length;
    const modified = diffs.filter((d) => d.kind === "modified").length;

    lines.push(chalk.gray("─".repeat(62)));
    lines.push(
        chalk.gray("Summary: ") +
        (added > 0 ? chalk.green(`${added} added`) : "") +
        (added > 0 && removed + modified > 0 ? chalk.gray(" · ") : "") +
        (removed > 0 ? chalk.red(`${removed} removed`) : "") +
        (removed > 0 && modified > 0 ? chalk.gray(" · ") : "") +
        (modified > 0 ? chalk.yellow(`${modified} modified`) : "")
    );

    return lines.join("\n");
}

/**
 * Format a function body for annotated output (simple list view)
 */
function formatAnnotatedBody(body: Instruction[], sourceLabel: string): string {
    const lines: string[] = [];

    for (const instr of body) {
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

    return lines.join("\n");
}

/**
 * Format two instruction bodies as a tabular side-by-side diff
 * Shows instructions line-by-line with highlighting for differences
 */
function formatTabularDiff(
    firstBody: Instruction[],
    secondBody: Instruction[],
    firstName: string,
    secondName: string
): string {
    const lines: string[] = [];
    
    // Header row
    const headerPc = chalk.gray("PC".padStart(6));
    const headerOp1 = chalk.gray(firstName.padEnd(14));
    const headerOp2 = chalk.gray(secondName.padEnd(14));
    const headerImm = chalk.gray("IMMEDIATE");
    lines.push(`║ ${headerPc}  ${headerOp1}  ${headerOp2}  ${headerImm}`);
    lines.push(chalk.gray("╟" + "─".repeat(6) + "──" + "─".repeat(14) + "──" + "─".repeat(14) + "──" + "─".repeat(20)));

    // Compare instructions
    const maxLen = Math.max(firstBody.length, secondBody.length);
    
    for (let i = 0; i < maxLen; i++) {
        const first = firstBody[i];
        const second = secondBody[i];
        
        const pc1 = first ? chalk.gray(String(first.pc).padStart(6)) : "".padStart(6);
        const pc2 = second ? chalk.gray(String(second.pc).padStart(6)) : "".padStart(6);
        
        // Determine if this row is a difference
        const isDiff = !first || !second || 
            first.opcode.mnemonic !== second.opcode.mnemonic ||
            !compareImmediate(first.immediate, second.immediate);
        
        // Format first instruction
        let op1: string;
        if (!first) {
            op1 = chalk.red("<missing>").padEnd(14);
        } else if (isDiff) {
            op1 = chalk.red(first.opcode.mnemonic.padEnd(14));
        } else {
            op1 = chalk.white(first.opcode.mnemonic.padEnd(14));
        }
        
        // Format second instruction
        let op2: string;
        if (!second) {
            op2 = chalk.red("<missing>").padEnd(14);
        } else if (isDiff) {
            op2 = chalk.red(second.opcode.mnemonic.padEnd(14));
        } else {
            op2 = chalk.white(second.opcode.mnemonic.padEnd(14));
        }
        
        // Format immediate
        let imm: string;
        if (!first && !second) {
            imm = "";
        } else if (isDiff) {
            const imm1 = first?.immediate ? formatImmediate(first.immediate) : "";
            const imm2 = second?.immediate ? formatImmediate(second.immediate) : "";
            imm = chalk.red(`${imm1} → ${imm2}`);
        } else {
            imm = first?.immediate ? formatImmediate(first.immediate) : "";
        }
        
        // Use markers for changed rows
        const marker = isDiff ? chalk.red("│") : chalk.gray("│");
        
        lines.push(`║ ${pc1}  ${marker} ${op1}  ${marker} ${op2}  ${imm}`);
    }

    return lines.join("\n");
}

/**
 * Compare two immediate values for equality
 */
function compareImmediate(a?: Uint8Array, b?: Uint8Array): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

/**
 * Format immediate value as hex string
 */
function formatImmediate(imm: Uint8Array): string {
    return "0x" + Array.from(imm).map(b => b.toString(16).padStart(2, "0")).join("");
}
