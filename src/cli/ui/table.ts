/**
 * Table — fluent builder for ANSI-aware box-drawn tables.
 *
 * Column widths are specified in *visible* characters.  Cell renderers receive
 * plain text and may return ANSI-colored strings; padding is applied after
 * coloring using the ANSI-aware padR() helper so nothing breaks.
 *
 *   ╔══════╤══════════════╤═════════════════════════╤══════════════╗
 *   ║  PC  │ OPCODE       │ OPERAND                 │ STACK EFFECT ║
 *   ╠══════╪══════════════╪═════════════════════════╪══════════════╣
 *   ║ 00000│ PUSH1        │ 0x80                    │ (0)→(1)  +1  ║
 *   ╚══════╧══════════════╧═════════════════════════╧══════════════╝
 */

import { padL, padR, truncate } from './ansi';
import { T } from './theme';

export type Alignment = 'left' | 'right' | 'center';

export interface ColDef {
    header: string;
    width: number;
    align?: Alignment;
    /** Transform the *plain-text* cell value into a (possibly colored) string. */
    render?: (plain: string) => string;
}

/** Highlight style applied to an entire row */
export type RowHighlight = 'jumpdest' | 'warn' | 'error' | 'success' | 'none';

export class Table {
    private _cols: ColDef[] = [];
    private _rows: Array<{ cells: string[]; highlight: RowHighlight }> = [];

    static create(): Table {
        return new Table();
    }

    column(header: string, width: number, opts: Partial<Omit<ColDef, 'header' | 'width'>> = {}): Table {
        this._cols.push({ header, width, align: 'left', ...opts });
        return this;
    }

    row(cells: string[], highlight: RowHighlight = 'none'): Table {
        this._rows.push({ cells, highlight });
        return this;
    }

    render(): string {
        const cols = this._cols;
        const B = T.chrome.border;
        const H = T.text.heading;
        const lines: string[] = [];

        // ── Border/separator factories ─────────────────────────────────────────
        const hline = (l: string, _mid: string, r: string, colSep: string, fill = '═'): string =>
            B(l + cols.map((c) => fill.repeat(c.width + 2)).join(colSep) + r);

        // ── Top border ─────────────────────────────────────────────────────────
        lines.push(hline('╔', '═', '╗', '╤'));

        // ── Header row ─────────────────────────────────────────────────────────
        const headerCells = cols.map((c) => ` ${padR(H(c.header), c.width)} `);
        lines.push(B('║') + headerCells.join(B('│')) + B('║'));

        // ── Header/body separator ──────────────────────────────────────────────
        lines.push(hline('╠', '═', '╣', '╪'));

        // ── Data rows ──────────────────────────────────────────────────────────
        for (const { cells, highlight } of this._rows) {
            // Pick border color by highlight kind
            const borderColor =
                highlight === 'jumpdest'
                    ? T.op.jumpdest
                    : highlight === 'warn'
                      ? T.status.warn
                      : highlight === 'error'
                        ? T.status.error
                        : highlight === 'success'
                          ? T.status.success
                          : B;

            const border = borderColor('║');
            const sep = highlight !== 'none' ? borderColor('│') : B('│');

            const rendered = cols.map((col, i) => {
                const raw = cells[i] ?? '';
                const plain = truncate(raw, col.width);
                const colored = col.render ? col.render(plain) : plain;
                const padded =
                    col.align === 'right'
                        ? padL(colored, col.width)
                        : col.align === 'center'
                          ? /* padC — reuse padR */ padR(colored, col.width)
                          : padR(colored, col.width);
                return ` ${padded} `;
            });

            lines.push(border + rendered.join(sep) + border);
        }

        // ── Bottom border ──────────────────────────────────────────────────────
        lines.push(hline('╚', '═', '╝', '╧'));

        return lines.join('\n');
    }
}
