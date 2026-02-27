/**
 * CLI utility helpers — styled with the d_tuft design system.
 * All raw chalk usage has been replaced by T.* tokens.
 */
import type { AssemblyLine } from '~~/core/types';
import { T, stripAnsi } from '~~/cli/ui';
import { readFile } from "node:fs/promises";

export type CompareFormat = 'bytecode' | 'assembly';

// ═══════════════════════════════════════════════════════════════════════════════
// Spinner
// ═══════════════════════════════════════════════════════════════════════════════

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerInterval: ReturnType<typeof setInterval> | null = null;
let spinnerMessage = '';

export function startSpinner(message: string = 'Loading'): void {
    let frame = 0;
    spinnerMessage = message;
    stopSpinner();
    spinnerInterval = setInterval(() => {
        const f = T.chrome.spinner(SPINNER_FRAMES[frame % SPINNER_FRAMES.length]!);
        process.stderr.write(`\r${f} ${spinnerMessage}${' '.repeat(Math.max(0, 40 - spinnerMessage.length))}`);
        frame++;
    }, 80);
}

export function updateSpinner(message: string): void {
    spinnerMessage = message;
}

export function stopSpinner(): void {
    if (spinnerInterval) {
        clearInterval(spinnerInterval);
        spinnerInterval = null;
    }
    process.stderr.write('\r' + ' '.repeat(80) + '\r');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Status helpers
// ═══════════════════════════════════════════════════════════════════════════════

export const BANNER = `
  ${T.text.heading('d_tuft')}  ${T.chrome.sep('·')}  ${T.text.subheading('EVM Bytecode Toolkit')}
  ${T.text.muted('Disassemble · Assemble · Identify · Compare · Diff · Test')}
  ${T.chrome.border('─'.repeat(56))}
`;

export function success(message: string): string {
    return `${T.status.success('✓')} ${message}`;
}
export function error(message: string): string {
    return `${T.status.error('✗')} ${message}`;
}
export function info(message: string): string {
    return `${T.status.info('ℹ')} ${message}`;
}
export function warn(message: string): string {
    return `${T.status.warn('⚠')} ${message}`;
}
export function hint(message: string): string {
    return T.status.hint(`  ↳ ${message}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Layout helpers
// ═══════════════════════════════════════════════════════════════════════════════

export function sectionHeader(title: string, width = 60): string {
    const pad = Math.max(0, width - title.length - 4);
    return T.chrome.border('── ') + T.text.heading(title) + T.chrome.sep(' ' + '─'.repeat(pad));
}

export function sectionFooter(width = 60): string {
    return T.chrome.sep('─'.repeat(width));
}

/**
 * Key-value pair with aligned key column.
 * Key is 18 chars wide (padEnd on plain text), value is whatever the caller provides.
 */
export function kv(key: string, value: string): string {
    return `  ${T.text.key(key.padEnd(18))} ${value}`;
}

export function resultHeader(command: string, file: string): string {
    return `${T.text.heading(command)} ${T.chrome.sep('→')} ${T.val.filename(file)}`;
}

/**
 * Render a box around content.  Title is optional; width is auto-computed from
 * the widest line of content.  Uses ANSI-safe visibleLen for width computation.
 */
export function box(content: string, title?: string): string {
    const lines = content.split('\n');
    const titleVisible = title ? title.length + 2 : 0;
    const maxWidth = Math.max(...lines.map(l => stripAnsi(l).length), titleVisible);
    const B = T.chrome.border;
    const H = T.text.heading;

    let top: string;
    if (title) {
        const totalInner = maxWidth + 2;
        const sides = Math.max(0, totalInner - title.length - 2);
        const lp = Math.floor(sides / 2);
        const rp = sides - lp;
        top = B('╔') + B('═'.repeat(lp)) + H(` ${title} `) + B('═'.repeat(rp)) + B('╗');
    } else {
        top = B('╔' + '═'.repeat(maxWidth + 2) + '╗');
    }

    const middle = lines.map(line => {
        const padding = maxWidth - stripAnsi(line).length;
        return `${B('║')} ${line}${' '.repeat(padding + 1)}${B('║')}`;
    }).join('\n');

    const bottom = B('╚' + '═'.repeat(maxWidth + 2) + '╝');
    return `${top}\n${middle}\n${bottom}`;
}

export function progressBar(current: number, total: number, width = 30): string {
    const percent = Math.min(100, Math.round((current / total) * 100));
    const filled = Math.round((current / total) * width);
    const empty = width - filled;
    const barColor = percent < 50 ? T.status.success : percent < 80 ? T.status.warn : T.status.error;
    const bar = barColor('█'.repeat(filled)) + T.text.muted('░'.repeat(empty));
    return `${bar} ${percent}%`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Core helpers
// ═══════════════════════════════════════════════════════════════════════════════

export async function tryCatch<T>(fn: () => T | Promise<T>, defaultValue?: T): Promise<T | undefined> {
    try {
        return await fn();
    } catch (e) {
        if (defaultValue !== undefined) return defaultValue;
        console.error(error(e instanceof Error ? e.message : String(e)));
        process.exit(1);
    }
}

export async function detectFormat(...args: string[]): Promise<CompareFormat[]> {
    return Promise.all(args.map(async (arg) => {
        const content = await readFile(arg, 'utf-8');
        const lines = content.split('\n').map(l => l.trim());
        const hasHex = lines.some(l => /^0x[0-9a-fA-F]+$/.test(l));
        const hasMnemonics = lines.some(l => /^[A-Z]+/.test(l));
        if (hasMnemonics && !hasHex) return 'assembly';
        if (!hasMnemonics && hasHex) return 'bytecode';
        console.warn(T.status.warn(`Warning: Could not detect format of ${arg}. Defaulting to bytecode.`));
        return 'bytecode';
    }));
}

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
