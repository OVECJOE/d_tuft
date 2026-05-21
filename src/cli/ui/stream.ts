/**
 * Streaming output utilities — make CLI output feel like AI responses.
 *
 * Characters are written to stdout one-by-one (or in small chunks)
 * with a configurable delay, creating the illusion of real-time
 * generation.
 */

export interface StreamOptions {
    /** Delay between each chunk in milliseconds (default: 2) */
    chunkDelay?: number;
    /** Characters per chunk (default: 3) */
    chunkSize?: number;
    /** Skip streaming for non-TTY terminals (default: true) */
    skipNonTty?: boolean;
}

export async function streamText(
    text: string,
    options: StreamOptions = {}
): Promise<void> {
    const {
        chunkDelay = 2,
        chunkSize = 3,
        skipNonTty = true,
    } = options;

    // If not a TTY, just print everything at once
    if (skipNonTty && !process.stdout.isTTY) {
        process.stdout.write(text);
        return;
    }

    const lines = text.split('\n');

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx]!;

        // Stream each character of the line
        for (let i = 0; i < line.length; i += chunkSize) {
            const chunk = line.slice(i, i + chunkSize);
            process.stdout.write(chunk);
            await sleep(chunkDelay);
        }

        // Newline between lines (instant)
        if (lineIdx < lines.length - 1) {
            process.stdout.write('\n');
        }
    }
}

export async function streamHighlighted(
    text: string,
    options: StreamOptions = {}
): Promise<void> {
    const {
        chunkDelay = 2,
        chunkSize = 4,
        skipNonTty = true,
    } = options;

    if (skipNonTty && !process.stdout.isTTY) {
        process.stdout.write(text);
        return;
    }

    const lines = text.split('\n');

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx]!;

        // For ANSI-colored lines, we stream by "visible" chunks
        // to avoid breaking escape sequences
        const chunks = splitIntoChunks(line, chunkSize);

        for (const chunk of chunks) {
            process.stdout.write(chunk);
            await sleep(chunkDelay);
        }

        if (lineIdx < lines.length - 1) {
            process.stdout.write('\n');
        }
    }
}

function splitIntoChunks(str: string, size: number): string[] {
    const chunks: string[] = [];
    let visibleCount = 0;
    let chunkStart = 0;
    let inEscape = false;

    for (let i = 0; i < str.length; i++) {
        const ch = str[i]!;

        if (ch === '\x1b') {
            inEscape = true;
            continue;
        }

        if (inEscape) {
            if (/[A-Za-z]/.test(ch)) {
                inEscape = false;
            }
            continue;
        }

        visibleCount++;

        if (visibleCount >= size) {
            chunks.push(str.slice(chunkStart, i + 1));
            chunkStart = i + 1;
            visibleCount = 0;
        }
    }

    if (chunkStart < str.length) {
        chunks.push(str.slice(chunkStart));
    }

    return chunks;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
