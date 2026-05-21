import type { DisassemblyResult, Instruction, OpcodeValue } from './types';

const TERMINAL_OPS = new Set<OpcodeValue>([
    0x00, // STOP
    0xf3, // RETURN
    0xfd, // REVERT
    0xfe, // INVALID
    0xff, // SELFDESTRUCT
]);

export class BytecodeValidator {
    validate(disassembly: DisassemblyResult): ValidationResult {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        this.validateOpcodes(disassembly, warnings);
        this.validateJumpDestinations(disassembly, errors, warnings);
        this.validateTerminals(disassembly, warnings);
        this.validatePushData(disassembly, errors, warnings);

        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }

    private validateOpcodes(_disassembly: DisassemblyResult, warnings: ValidationWarning[]): void {
        for (const instr of _disassembly.instructions) {
            if (instr.opcode.value === 0xfe && instr.opcode.mnemonic === 'INVALID') {
                warnings.push({
                    pc: instr.pc,
                    kind: 'invalid_opcode',
                    message: `INVALID (0xfe) at PC ${instr.pc} — will revert if reached`,
                });
            }
        }
    }

    private validateJumpDestinations(
        disassembly: DisassemblyResult,
        errors: ValidationError[],
        _warnings: ValidationWarning[],
    ): void {
        const jumpDestSet = new Set(disassembly.jumpDestinations);

        for (const instr of disassembly.instructions) {
            if (instr.opcode.mnemonic === 'JUMP' || instr.opcode.mnemonic === 'JUMPI') {
                const target = this.resolveJumpTarget(instr, disassembly.instructions);
                if (target !== null && !jumpDestSet.has(target)) {
                    errors.push({
                        pc: instr.pc,
                        kind: 'invalid_jumpdest',
                        message: `${instr.opcode.mnemonic} at PC ${instr.pc} targets PC ${target}, which is not a JUMPDEST`,
                    });
                }
            }
        }
    }

    private validateTerminals(disassembly: DisassemblyResult, warnings: ValidationWarning[]): void {
        const lastInstr = disassembly.instructions[disassembly.instructions.length - 1];
        if (lastInstr && !TERMINAL_OPS.has(lastInstr.opcode.value)) {
            warnings.push({
                pc: lastInstr.pc,
                kind: 'no_terminal',
                message: `Bytecode does not end with a terminal opcode (last: ${lastInstr.opcode.mnemonic} at PC ${lastInstr.pc})`,
            });
        }
    }

    private validatePushData(
        disassembly: DisassemblyResult,
        errors: ValidationError[],
        _warnings: ValidationWarning[],
    ): void {
        for (const w of disassembly.warnings) {
            if (w.includes('Truncated')) {
                const match = w.match(/at position (\d+)/);
                if (match) {
                    const pc = parseInt(match[1]!, 10);
                    const instr = disassembly.instructions.find((i) => i.pc === pc);
                    if (instr) {
                        errors.push({
                            pc,
                            kind: 'truncated_push',
                            message: w,
                        });
                    }
                }
            }
        }
    }

    private resolveJumpTarget(jumpInstr: Instruction, instructions: Instruction[]): number | null {
        const idx = instructions.findIndex((i) => i.pc === jumpInstr.pc);
        if (idx < 0) return null;

        for (let k = idx - 1; k >= Math.max(0, idx - 5); k--) {
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
}

export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}

export interface ValidationError {
    pc: number;
    kind: 'invalid_jumpdest' | 'truncated_push';
    message: string;
}

export interface ValidationWarning {
    pc: number;
    kind: 'invalid_opcode' | 'unreachable_jumpdest' | 'no_terminal';
    message: string;
}

export function validate(disassembly: DisassemblyResult): ValidationResult {
    return new BytecodeValidator().validate(disassembly);
}
