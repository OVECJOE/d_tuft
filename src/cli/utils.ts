import type { AssemblyLine } from '~~/core/types';
import chalk from 'chalk';
import { readFile } from "node:fs/promises";

export type CompareFormat = 'bytecode' | 'assembly';

// ═══════════════════════════════════════════════════════════════════════════════
// UI/UX Utilities - Making the CLI feel like a frontend
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ASCII art banner for the CLI tool
 */
export const BANNER = `
  ${chalk.white.bold('d_tuft')}  ${chalk.gray('·')}  ${chalk.yellow('EVM Bytecode Toolkit')}  ${chalk.gray('v1.0.0')}
  ${chalk.gray('Disassemble · Assemble · Identify · Compare · Diff · Test')}
  ${chalk.cyan('─'.repeat(56))}
`;

/**
 * Spinner frames for loading animation
 */
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Active spinner instance
 */
let spinnerInterval: ReturnType<typeof setInterval> | null = null;
let spinnerMessage = '';

/**
 * Start a spinner animation
 * @param message Initial message to display
 */
export function startSpinner(message: string = 'Loading'): void {
    let frame = 0;
    spinnerMessage = message;

    stopSpinner();

    spinnerInterval = setInterval(() => {
        const frameChar = chalk.cyan(SPINNER_FRAMES[frame % SPINNER_FRAMES.length]);
        process.stderr.write(`\r${frameChar} ${spinnerMessage}${' '.repeat(Math.max(0, 40 - spinnerMessage.length))}`);
        frame++;
    }, 80);
}

/**
 * Update spinner message
 * @param message New message
 */
export function updateSpinner(message: string): void {
    spinnerMessage = message;
}

/**
 * Stop spinner and clear the line
 */
export function stopSpinner(): void {
    if (spinnerInterval) {
        clearInterval(spinnerInterval);
        spinnerInterval = null;
    }
    process.stderr.write('\r' + ' '.repeat(80) + '\r');
}

/**
 * Success checkmark with styled output
 */
export function success(message: string): string {
    return `${chalk.green('✓')} ${message}`;
}

/**
 * Error X with styled output
 */
export function error(message: string): string {
    return `${chalk.red('✗')} ${message}`;
}

/**
 * Info icon with styled output
 */
export function info(message: string): string {
    return `${chalk.blue('ℹ')} ${message}`;
}

/**
 * Warning icon with styled output
 */
export function warn(message: string): string {
    return `${chalk.yellow('⚠')} ${message}`;
}

/**
 * Contextual usage hint shown after errors or notable outputs
 */
export function hint(message: string): string {
    return chalk.cyan(`  ↳ ${message}`);
}

/**
 * Create a styled section header
 */
export function sectionHeader(title: string, width = 60): string {
    const pad = Math.max(0, width - title.length - 4);
    return chalk.cyan('── ') + chalk.white.bold(title) + chalk.gray(' ' + '─'.repeat(pad));
}

/**
 * Create a styled section footer
 */
export function sectionFooter(width = 60): string {
    return chalk.gray('─'.repeat(width));
}

/**
 * Create a box around content
 */
export function box(content: string, title?: string): string {
    const lines = content.split('\n');
    const titleVisible = title ? title.length + 2 : 0;
    const maxWidth = Math.max(...lines.map(l => stripAnsi(l).length), titleVisible);

    let top: string;
    if (title) {
        const totalInner = maxWidth + 2;
        const sides = Math.max(0, totalInner - title.length - 2);
        const lp = Math.floor(sides / 2);
        const rp = sides - lp;
        top = chalk.cyan('╔') + chalk.gray('═'.repeat(lp)) + chalk.white.bold(` ${title} `) + chalk.gray('═'.repeat(rp)) + chalk.cyan('╗');
    } else {
        top = chalk.cyan('╔' + '═'.repeat(maxWidth + 2) + '╗');
    }

    const middle = lines.map(line => {
        const padding = maxWidth - stripAnsi(line).length;
        return `${chalk.cyan('║')} ${line}${' '.repeat(padding + 1)}${chalk.cyan('║')}`;
    }).join('\n');

    const bottom = chalk.cyan('╚' + '═'.repeat(maxWidth + 2) + '╝');

    return `${top}\n${middle}\n${bottom}`;
}

/**
 * Strip ANSI codes from string (for width calculation)
 */
function stripAnsi(str: string): string {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Progress bar
 */
export function progressBar(current: number, total: number, width = 30): string {
    const percent = Math.min(100, Math.round((current / total) * 100));
    const filled = Math.round((current / total) * width);
    const empty = width - filled;

    const barColor = percent < 50 ? chalk.green : percent < 80 ? chalk.yellow : chalk.red;
    const bar = barColor('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
    return `${bar} ${percent}%`;
}

/**
 * Print a key-value pair with nice formatting
 */
export function kv(key: string, value: string, keyColor = chalk.gray): string {
    return `  ${keyColor(key.padEnd(18))} ${value}`;
}

/**
 * Print a command result header
 */
export function resultHeader(command: string, file: string): string {
    return `${chalk.white.bold(command)} ${chalk.gray('→')} ${chalk.cyan(file)}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Core Utilities
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Abstracts a try-catch block for cleaner error handling in CLI commands
 * @param fn Function to execute
 * @param defaultValue Optional value to return if an error occurs (instead of exiting)
 * @returns The result of the function or the default value if an error occurs
 */
export async function tryCatch<T>(fn: () => T | Promise<T>, defaultValue?: T): Promise<T | undefined> {
    try {
        return await fn();
    } catch (e) {
        if (defaultValue !== undefined) return defaultValue;
        console.error(error(e instanceof Error ? e.message : String(e)));
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
        let switchFlag = 0x0; // 0 → bytecode, 1 → assembly

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
        rawLine = (rawLine.split('//')[0] || '').split('#')[0]?.trim() as string;

        if (!rawLine) continue;

        const parts = rawLine.split(/\s+/);
        const mnemonic = parts[0] as string;
        const operand = parts.slice(1).join(' ') || undefined;

        lines.push({ mnemonic, operand });
    }

    return lines;
}

/**
 * Read multiple files and detect their formats, only when their formats are the same, otherwise throw an error
 * @param paths List of file paths to read and analyze
 * @returns An array of objects containing the content and detected format of each file
 */
export async function readAndDetectFiles(...paths: string[]): Promise<{ content: string; format: CompareFormat }[]> {
    const formats = await detectFormat(...paths);
    const uniqueFormats = new Set(formats);

    if (uniqueFormats.size > 1) {
        console.error(error('Input files have different formats. Please provide files of the same type for comparison.'));
        console.error(hint('Use --format bytecode or --format assembly to force a specific format'));
        process.exit(1);
    }

    const contents = await Promise.all(paths.map(path => readFile(path, 'utf-8')));
    return contents.map((content, index) => ({ content, format: formats[index] as CompareFormat }));
}
