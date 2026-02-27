/**
 * Panel — fluent builder for bordered, title-decorated info boxes.
 *
 * A Panel is rendered as a box-drawn rectangle containing a title and
 * a list of key→value stat rows, optionally separated by dividers.
 *
 *   ╔═══ Disassembly ═══════════╗
 *   ║ Size           15037      ║
 *   ║ Instructions   7909       ║
 *   ╠═══════════════════════════╣
 *   ║ Jump dests     727        ║
 *   ╚═══════════════════════════╝
 *
 * All widths are measured in *visible* (non-ANSI) characters, so coloured
 * values don't break alignment.
 */
import chalk from 'chalk';
import { T } from './theme';
import { padR, padC, visibleLen } from './ansi';

export type PanelItem =
    | { kind: 'stat'; key: string; value: string; color?: typeof chalk }
    | { kind: 'sep' }
    | { kind: 'row'; content: string };  // free-form colored row

export class Panel {
    private _title: string;
    private _width: number;             // total outer width (including ║ ║)
    private _items: PanelItem[] = [];

    private constructor(title: string, width: number) {
        this._title = title;
        this._width = width;
    }

    /** Create a new panel.  `width` is the total outer character width (default 65). */
    static create(title: string, width = 65): Panel {
        return new Panel(title, width);
    }

    stat(key: string, value: string, color: typeof chalk = T.val.number): Panel {
        this._items.push({ kind: 'stat', key, value, color });
        return this;
    }

    separator(): Panel {
        this._items.push({ kind: 'sep' });
        return this;
    }

    /** A full-width free-form row (e.g. column headers). */
    row(content: string): Panel {
        this._items.push({ kind: 'row', content });
        return this;
    }

    render(): string {
        const w = this._width;
        const inner = w - 2;                   // chars between ║ and ║
        const B = T.chrome.border;
        const H = T.text.heading;
        const lines: string[] = [];

        // ── Top border with centered title ────────────────────────────────────
        const titleVis = ` ${this._title} `;
        const innerFill = inner - visibleLen(titleVis);
        const lp = Math.floor(innerFill / 2);
        const rp = innerFill - lp;
        lines.push(B('╔' + '═'.repeat(lp)) + H(titleVis) + B('═'.repeat(rp) + '╗'));

        // ── Items ─────────────────────────────────────────────────────────────
        for (const item of this._items) {
            if (item.kind === 'sep') {
                lines.push(B('╠' + '═'.repeat(inner) + '╣'));
                continue;
            }

            if (item.kind === 'row') {
                // Free-form — pad to inner width
                const cell = padR('', inner - visibleLen(item.content));
                lines.push(B('║') + item.content + cell + B('║'));
                continue;
            }

            // Stat row:  ║ key    value                     ║
            // key column = 16 chars, value fills the rest
            const KEY_W = 16;
            const VAL_W = inner - KEY_W - 2; // -2 for leading space + trailing space
            const keyStr = T.text.key(item.key.padEnd(KEY_W));
            const rawVal = item.value;
            const coloredVal = (item.color ?? T.val.number)(rawVal);
            const padding = ' '.repeat(Math.max(0, VAL_W - rawVal.length));
            lines.push(B('║') + ' ' + keyStr + coloredVal + padding + ' ' + B('║'));
        }

        // ── Bottom border ─────────────────────────────────────────────────────
        lines.push(B('╚' + '═'.repeat(inner) + '╝'));

        return lines.join('\n');
    }
}
