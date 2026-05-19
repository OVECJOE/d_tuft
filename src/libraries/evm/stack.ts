import type { Instruction, SimulationResult, StackError, StackProfile } from "../../core/types";

const EVM_MAX_STACK = 1024;

function stackDelta(instr: Instruction): number {
    return instr.opcode.outputs - instr.opcode.inputs;
}

export class StackSimulator {
    simulate(instructions: Instruction[]): SimulationResult {
        const errors: StackError[] = [];
        const depthAtPC = new Map<number, number>();
        let depth = 0;
        let maxDepth = 0;
        let minDepth = 0;

        for (const instr of instructions) {
            depthAtPC.set(instr.pc, depth);

            const inputs = instr.opcode.inputs;

            if (depth < inputs) {
                errors.push({
                    pc: instr.pc,
                    mnemonic: instr.opcode.mnemonic,
                    kind: 'underflow',
                    message: `${instr.opcode.mnemonic} at PC ${instr.pc} requires ${inputs} stack item(s), but only ${depth} available`,
                });
            }

            depth += stackDelta(instr);

            if (depth > EVM_MAX_STACK) {
                errors.push({
                    pc: instr.pc,
                    mnemonic: instr.opcode.mnemonic,
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

    validateDepth(instructions: Instruction[]): StackError[] {
        return this.simulate(instructions).errors;
    }

    getStackProfile(instructions: Instruction[]): StackProfile {
        const result = this.simulate(instructions);
        return {
            maxDepth: result.maxDepth,
            finalDepth: result.finalDepth,
            depthMap: result.depthAtPC,
        };
    }
}
