import type { AssemblyLine } from '~~/core/types';
import chalk from 'chalk';
import { readFile } from "node:fs/promises";

export type CompareFormat = 'bytecode' | 'assembly';

/**
 * Abstracts a try-catch block for cleaner error handling in CLI commands
 * @param fn Function to execute
 * @param defaultValue Optional value to return if an error occurs (instead of exiting)
 * @returns The result of the function or the default value if an error occurs
 */
export function tryCatch<T>(fn: () => T, defaultValue?: T): T | undefined {
    try {
        if (defaultValue) return fn();
        fn();
    } catch (error) {
        if (defaultValue) return defaultValue;
        console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

/**
 * Detects the format of input files for comparison (bytecode vs assembly)
 * Uses heuristics based on content (e.g., presence of mnemonics vs hex patterns)
 * @param args List of input file paths to analyze
 * @returns Detected format for each input (bytecode or assembly)
 */
export async function detectFormat(...args: string[]): Promise<CompareFormat[]> {
    return Promise.all(args.map(async (arg) => {
        let switchFlag = 0x1 // 0 → bytecode, 1 → assembly;

        const content = await readFile(arg, 'utf-8');
        const lines = content.split('\n').map(line => line.trim());
        const hasHex = lines.some(line => /^0x[0-9a-fA-F]+$/.test(line));
        const hasMnemonics = lines.some(line => /^[A-Z]+/.test(line));

        if (hasHex && !hasMnemonics) {
            switchFlag &= 0x0; // Bytecode
        } else if (hasMnemonics && !hasHex) {
            switchFlag = 0x1; // Assembly
        }

        switch (switchFlag) {
            case 0: return 'bytecode';
            case 1: return 'assembly';
            default:
                console.warn(chalk.yellow(`Warning: Could not detect format of ${arg}. Defaulting to bytecode.`));
                return 'bytecode';
        }
    }));
}

/**
 * Parse assembly file format
 * Supports:
 * - One instruction per line
 * - Comments starting with //  or #
 * - Empty lines
 */
export function parseAssemblyFile(content: string): AssemblyLine[] {
    const lines: AssemblyLine[] = [];

    for (let rawLine of content.split('\n')) {
        // Remove comments
        rawLine = (rawLine.split('//')[0] || '').split('#')[0]?.trim() as string;

        // Skip empty lines
        if (!rawLine) continue;

        // Parse instruction
        const parts = rawLine.split(/\s+/);
        const mnemonic = parts[0] as string;
        const operand = parts.slice(1).join(' ') || undefined;

        lines.push({ mnemonic, operand });
    }

    return lines;
}
