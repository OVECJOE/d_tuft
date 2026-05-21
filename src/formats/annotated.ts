import { Panel } from '~~/cli/ui/panel';
import { Table } from '~~/cli/ui/table';
import { T } from '~~/cli/ui/theme';
import type { DisassemblyResult } from '../core/types';
import { bytesToHex } from '../utils/hex';
import { colorizeOpcode, colorizeStackEffect } from './colors';

/**
 * Format disassembly as a beautifully annotated, fully colorized table.
 * Uses the Panel + Table UI components so all alignment is ANSI-safe.
 */
export function formatAnnotated(result: DisassemblyResult): string {
    const sections: string[] = [];

    // ── Header panel ──────────────────────────────────────────────────────────
    const panel = Panel.create('EVM Bytecode Disassembly', 65)
        .stat('Size', `${result.totalBytes} bytes`, T.val.number)
        .stat('Instructions', String(result.instructions.length), T.val.number)
        .separator()
        .stat('Jump dests', String(result.jumpDestinations.size), T.op.jumpdest);

    sections.push(panel.render());
    sections.push('');

    // ── Instruction table ─────────────────────────────────────────────────────
    const table = Table.create()
        .column('PC', 6, {
            align: 'right',
            render: (v) => T.val.pc(v),
        })
        .column('OPCODE', 12, {
            render: (v) => colorizeOpcode(v)(v),
        })
        .column('OPERAND', 24, {
            render: (v) => (v ? T.val.immediate(v) : ''),
        })
        .column('STACK EFFECT', 14, {
            // render receives "(in)→(out) netStr"  — split and re-color
            render: (v) => {
                const match = v.match(/^\((\d+)\)→\((\d+)\)\s*([+-±]\d+|±0)$/);
                if (!match) return v;
                const [, ins, outs] = match;
                return colorizeStackEffect(Number(ins), Number(outs), 14);
            },
        });

    for (const { opcode, pc, immediate } of result.instructions) {
        const isJumpDest = opcode.mnemonic === 'JUMPDEST';
        const net = opcode.outputs - opcode.inputs;
        const netStr = net > 0 ? `+${net}` : net < 0 ? String(net) : '±0';

        const operand = immediate
            ? ((): string => {
                  const hex = bytesToHex(immediate);
                  return hex.length > 22 ? `${hex.slice(0, 21)}…` : hex;
              })()
            : '';

        table.row(
            [
                pc.toString().padStart(5, '0'),
                opcode.mnemonic,
                operand,
                `(${opcode.inputs})→(${opcode.outputs}) ${netStr}`,
            ],
            isJumpDest ? 'jumpdest' : 'none',
        );
    }

    sections.push(table.render());

    // ── Warnings ──────────────────────────────────────────────────────────────
    if (result.warnings.length > 0) {
        sections.push('');
        sections.push(T.status.warn('⚠  WARNINGS:'));
        for (const w of result.warnings) {
            sections.push(T.status.warn(`    • ${w}`));
        }
    }

    return sections.join('\n');
}
