import type { Instruction } from '../../core/types';

export interface BasicBlock {
    id: string;
    startPC: number;
    endPC: number;
    instructions: Instruction[];
    predecessors: string[];
    successors: string[];
    isEntry: boolean;
    isExit: boolean;
    jumpType: 'fallthrough' | 'conditional' | 'unconditional' | 'dynamic' | 'terminal';
}

export interface ControlFlowGraph {
    blocks: Map<string, BasicBlock>;
    entryBlock: string;
    exitBlocks: string[];
    jumpDestToBlock: Map<number, string>;
    pcToBlock: Map<number, string>;
}

export interface DataFlowEdge {
    from: string;
    to: string;
    type: 'fallthrough' | 'jump' | 'conditional-true' | 'conditional-false';
}

const TERMINAL_OPS = new Set([0x00, 0xf3, 0xfd, 0xfe, 0xff]);

export class CFGBuilder {
    build(instructions: Instruction[]): ControlFlowGraph {
        if (instructions.length === 0) {
            return {
                blocks: new Map(),
                entryBlock: '',
                exitBlocks: [],
                jumpDestToBlock: new Map(),
                pcToBlock: new Map(),
            };
        }

        const jumpDests = new Set<number>();
        const jumpTargets = new Map<number, number>();
        const dynamicJumps = new Set<number>();

        for (let i = 0; i < instructions.length; i++) {
            const instr = instructions[i]!;
            const op = instr.opcode.value;

            if (op === 0x5b) {
                jumpDests.add(instr.pc);
            }

            if (op === 0x56 || op === 0x57) {
                const target = this.resolveJumpTarget(i, instructions);
                if (target !== null) {
                    jumpTargets.set(instr.pc, target);
                } else {
                    dynamicJumps.add(instr.pc);
                }
            }
        }

        const blockStarts = new Set<number>([instructions[0]!.pc, ...jumpDests]);
        for (const [_, target] of jumpTargets) {
            blockStarts.add(target);
        }

        const sortedStarts = Array.from(blockStarts).sort((a, b) => a - b);
        const blocks = new Map<string, BasicBlock>();
        const jumpDestToBlock = new Map<number, string>();
        const pcToBlock = new Map<number, string>();

        for (let i = 0; i < sortedStarts.length; i++) {
            const start = sortedStarts[i]!;
            const end =
                i + 1 < sortedStarts.length ? sortedStarts[i + 1]! - 1 : instructions[instructions.length - 1]!.pc;

            const blockInstrs = instructions.filter((instr) => instr.pc >= start && instr.pc <= end);

            if (blockInstrs.length === 0) continue;

            const id = `bb_${start.toString(16).padStart(4, '0')}`;
            const lastInstr = blockInstrs[blockInstrs.length - 1]!;
            const lastOp = lastInstr.opcode.value;

            let jumpType: BasicBlock['jumpType'] = 'fallthrough';
            if (TERMINAL_OPS.has(lastOp)) jumpType = 'terminal';
            else if (lastOp === 0x56) jumpType = 'unconditional';
            else if (lastOp === 0x57) jumpType = 'conditional';
            else if (dynamicJumps.has(lastInstr.pc)) jumpType = 'dynamic';

            const block: BasicBlock = {
                id,
                startPC: start,
                endPC: end,
                instructions: blockInstrs,
                predecessors: [],
                successors: [],
                isEntry: start === instructions[0]!.pc,
                isExit: TERMINAL_OPS.has(lastOp),
                jumpType,
            };

            blocks.set(id, block);
            jumpDestToBlock.set(start, id);

            for (const instr of blockInstrs) {
                pcToBlock.set(instr.pc, id);
            }
        }

        const edges: DataFlowEdge[] = [];

        for (const [id, block] of blocks) {
            const lastInstr = block.instructions[block.instructions.length - 1]!;
            const lastOp = lastInstr.opcode.value;

            if (lastOp === 0x56) {
                const target = jumpTargets.get(lastInstr.pc);
                if (target !== undefined && target !== null) {
                    const targetBlock = jumpDestToBlock.get(target);
                    if (targetBlock) {
                        block.successors.push(targetBlock);
                        blocks.get(targetBlock)!.predecessors.push(id);
                        edges.push({ from: id, to: targetBlock, type: 'jump' });
                    }
                }
            } else if (lastOp === 0x57) {
                const target = jumpTargets.get(lastInstr.pc);
                if (target !== undefined && target !== null) {
                    const targetBlock = jumpDestToBlock.get(target);
                    if (targetBlock) {
                        block.successors.push(targetBlock);
                        blocks.get(targetBlock)!.predecessors.push(id);
                        edges.push({ from: id, to: targetBlock, type: 'conditional-true' });
                    }
                }
                const fallthrough = this.findFallthroughBlock(block.endPC, sortedStarts, blocks);
                if (fallthrough) {
                    block.successors.push(fallthrough);
                    blocks.get(fallthrough)!.predecessors.push(id);
                    edges.push({ from: id, to: fallthrough, type: 'conditional-false' });
                }
            } else if (!TERMINAL_OPS.has(lastOp)) {
                const fallthrough = this.findFallthroughBlock(block.endPC, sortedStarts, blocks);
                if (fallthrough) {
                    block.successors.push(fallthrough);
                    blocks.get(fallthrough)!.predecessors.push(id);
                    edges.push({ from: id, to: fallthrough, type: 'fallthrough' });
                }
            }
        }

        const exitBlocks = [...blocks.values()].filter((b) => b.isExit).map((b) => b.id);

        return {
            blocks,
            entryBlock: blocks.get(`bb_${instructions[0]!.pc.toString(16).padStart(4, '0')}`)?.id ?? '',
            exitBlocks,
            jumpDestToBlock,
            pcToBlock,
        };
    }

    private resolveJumpTarget(jumpIdx: number, instructions: Instruction[]): number | null {
        for (let k = jumpIdx - 1; k >= Math.max(0, jumpIdx - 5); k--) {
            const prev = instructions[k];
            if (!prev) continue;
            const op = prev.opcode.value;
            if (op >= 0x60 && op <= 0x7f && prev.immediate) {
                let value = 0;
                for (const byte of prev.immediate) {
                    value = value * 256 + byte;
                }
                return value;
            }
            if (op < 0x80 || op > 0x9f) break;
        }
        return null;
    }

    private findFallthroughBlock(
        endPC: number,
        sortedStarts: number[],
        blocks: Map<string, BasicBlock>,
    ): string | null {
        for (const start of sortedStarts) {
            if (start > endPC) {
                const id = `bb_${start.toString(16).padStart(4, '0')}`;
                if (blocks.has(id)) return id;
            }
        }
        return null;
    }
}

export function buildCFG(instructions: Instruction[]): ControlFlowGraph {
    return new CFGBuilder().build(instructions);
}
