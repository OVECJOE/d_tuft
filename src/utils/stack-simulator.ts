import type { Instruction, SimulationResult, StackError, StackProfile } from '../core/types';

const EVM_MAX_STACK = 1024;

/**
 * Compute stack depth delta for a single instruction.
 *
 * DUP and SWAP are special: in the opcodes table their inputs/outputs
 * are set to the EVM spec values (DUPn: inputs=n, outputs=n+1;
 * SWAPn: inputs=n+1, outputs=n+1). The net delta is always:
 *   delta = outputs - inputs
 *
 * This correctly yields +1 for DUP, 0 for SWAP, +1 for PUSH, -1 for POP,
 * and the right values for every other opcode.
 */
function stackDelta(instr: Instruction): number {
    return instr.opcode.outputs - instr.opcode.inputs;
}

/**
 * Linear-pass EVM stack simulator.
 *
 * Walks an instruction sequence tracking stack depth, detecting underflow
 * (popping from empty stack), overflow (exceeding 1024), and unbalanced
 * endpoints. Does NOT follow control flow — for that, use the
 * FunctionIdentifier's CFG traversal.
 *
 * Usage:
 *   const sim = new StackSimulator();
 *   const result = sim.simulate(instructions);
 *   const errors = sim.validateDepth(instructions);
 */
export class StackSimulator {
    /**
     * Simulate stack depth across an instruction sequence.
     * Returns depth tracking data and any errors found.
     */
    simulate(instructions: Instruction[]): SimulationResult {
        const errors: StackError[] = [];
        const depthAtPC = new Map<number, number>();
        let depth = 0;
        let maxDepth = 0;
        let minDepth = 0;

        for (const instr of instructions) {
            depthAtPC.set(instr.pc, depth);

            const mn = instr.opcode.mnemonic;
            const inputs = instr.opcode.inputs;

            if (depth < inputs) {
                errors.push({
                    pc: instr.pc,
                    mnemonic: mn,
                    kind: 'underflow',
                    message: `${mn} at PC ${instr.pc} requires ${inputs} stack item(s), but only ${depth} available`,
                });
            }

            depth += stackDelta(instr);

            if (depth > EVM_MAX_STACK) {
                errors.push({
                    pc: instr.pc,
                    mnemonic: mn,
                    kind: 'overflow',
                    message: `Stack depth ${depth} exceeds EVM maximum of ${EVM_MAX_STACK} at PC ${instr.pc}`,
                });
            }

            if (depth > maxDepth) maxDepth = depth;
            if (depth < minDepth) minDepth = depth;

            if (instr.opcode.halts) {
                break;
            }
        }

        return {
            success: errors.length === 0,
            maxDepth,
            minDepth,
            finalDepth: depth,
            errors,
            depthAtPC,
        };
    }

    /**
     * Validate stack depth across instructions, returning only errors.
     * Convenience wrapper around simulate().
     */
    validateDepth(instructions: Instruction[]): StackError[] {
        return this.simulate(instructions).errors;
    }

    /**
     * Extract a compact stack depth profile without error checking.
     */
    getStackProfile(instructions: Instruction[]): StackProfile {
        const result = this.simulate(instructions);
        return {
            maxDepth: result.maxDepth,
            finalDepth: result.finalDepth,
            depthMap: result.depthAtPC,
        };
    }
}
