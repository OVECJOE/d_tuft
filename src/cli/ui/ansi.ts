/**
 * ANSI-aware string utilities.
 *
 * All padding / truncation helpers here measure the VISIBLE (printed) width of
 * a string, ignoring any embedded ANSI escape sequences.
 */

/** Strip every ANSI CSI escape sequence from a string */
export function stripAnsi(str: string): string {
    // Covers SGR (color/style), cursor moves, etc.
    const ESC = String.fromCharCode(0x1b);
    return str.replace(new RegExp(`${ESC}\\[[0-9;]*[A-Za-z]`, 'g'), '');
}

/** Visible (printed) length — excludes escape sequences */
export function visibleLen(str: string): number {
    return stripAnsi(str).length;
}

/**
 * Right-pad a (potentially ANSI-colored) string to a desired visible width.
 * Safe: padding is added *after* the color codes, so terminal rendering is correct.
 */
export function padR(str: string, width: number, fill = ' '): string {
    const diff = width - visibleLen(str);
    return diff > 0 ? str + fill.repeat(diff) : str;
}

/**
 * Left-pad a (potentially ANSI-colored) string to a desired visible width.
 */
export function padL(str: string, width: number, fill = ' '): string {
    const diff = width - visibleLen(str);
    return diff > 0 ? fill.repeat(diff) + str : str;
}

/**
 * Center a string within a given visible width.
 */
export function padC(str: string, width: number, fill = ' '): string {
    const diff = Math.max(0, width - visibleLen(str));
    const lp = Math.floor(diff / 2);
    const rp = diff - lp;
    return fill.repeat(lp) + str + fill.repeat(rp);
}

/**
 * Truncate a *plain* string to `width` visible chars, appending `ellipsis`
 * when truncation actually occurs.
 * Apply ANSI coloring *after* truncation so the ellipsis is part of the
 * visible text, not wrapped inside an escape.
 */
export function truncate(str: string, width: number, ellipsis = '…'): string {
    const visible = stripAnsi(str);
    if (visible.length <= width) return str;
    return visible.slice(0, width - ellipsis.length) + ellipsis;
}
