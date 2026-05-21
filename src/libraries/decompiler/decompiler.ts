import { disassemble } from '../../core/parser';
import type { Instruction } from '../../core/types';
import { hexToBytes } from '../../utils/hex';
import { FunctionIdentifier } from '../fi';
import { type InferredFunction, inferABI } from './abi-inference';
import { analyzeDataFlow, type Expression } from './data-flow';
import { type MatchedPattern, matchPatterns } from './signatures';
import { analyzeStorage, type StorageSlot } from './storage';

export interface DecompiledFunction {
    selector: string;
    name: string;
    signature: string;
    parameters: string;
    returnType: string | null;
    stateMutability: string;
    body: string;
    storageSlots: StorageSlot[];
    confidence: number;
}

export interface DecompiledContract {
    name: string;
    matchedPatterns: MatchedPattern[];
    functions: DecompiledFunction[];
    storage: StorageSlot[];
    bytecodeSize: number;
    instructionCount: number;
    warnings: string[];
    solidity: string;
}

export interface DecompileOptions {
    includeComments?: boolean;
    includeStorage?: boolean;
    includeCFG?: boolean;
    format?: 'solidity' | 'yul' | 'pseudocode';
}

interface ObfuscatorState {
    storageCounter: number;
    functionCounter: number;
    eventCounter: number;
    variableCounter: number;
    selector: string;
}

interface EventInfo {
    name: string;
    topicCount: number;
    pc: number;
}

function obfStorage(idx: number): string {
    const h = (0xdeadbeef + idx * 0x5bd1e995) >>> 0;
    return `s_${h.toString(16).slice(0, 6)}`;
}

function obfFunction(idx: number): string {
    const h = (0xcafebabe + idx * 0x6c62272e) >>> 0;
    return `f_${h.toString(16).slice(0, 6)}`;
}

function obfEvent(idx: number): string {
    const h = (0xfeedface + idx * 0x7ed55d16) >>> 0;
    return `e_${h.toString(16).slice(0, 6)}`;
}

interface InternalFunction {
    pc: number;
    body: Instruction[];
}

export class Decompiler {
    private readonly instructions: Instruction[];
    private readonly fi: FunctionIdentifier;
    private readonly options: Required<DecompileOptions>;

    constructor(bytecode: Uint8Array | string, options: DecompileOptions = {}) {
        const code = typeof bytecode === 'string' ? hexToBytes(bytecode) : bytecode;
        this.instructions = disassemble(code).instructions;
        this.fi = new FunctionIdentifier(code);
        this.options = {
            includeComments: true,
            includeStorage: true,
            includeCFG: false,
            format: 'solidity',
            ...options,
        };
    }

    decompile(): DecompiledContract {
        const functionMaps = this.fi.identify();
        const selectors = functionMaps.map((m) => ({
            selector: m.selector,
            startPC: m.startOffset,
            body: m.body,
        }));

        // Extract internal functions (JUMPDESTs not in the dispatcher)
        const internalFuncs = this.extractInternalFunctions(functionMaps);

        const inferred = inferABI(this.instructions, selectors);
        const allStorage = this.analyzeAllStorage(functionMaps);
        const patterns = matchPatterns(
            functionMaps.map((m) => m.selector.toLowerCase()),
            allStorage.map((s) => Number(s.slot)),
        );

        const obfState: ObfuscatorState = {
            storageCounter: 0,
            functionCounter: 0,
            eventCounter: 0,
            variableCounter: 0,
            selector: '',
        };

        // Assign obfuscated names to internal functions
        const internalNames = new Map<number, string>();
        for (let i = 0; i < internalFuncs.length; i++) {
            internalNames.set(internalFuncs[i]!.pc, `_$${obfFunction(i).slice(2)}`);
        }

        const functions = functionMaps.map((map, i) => {
            const inf = inferred[i]!;
            obfState.selector = map.selector;
            return this.decompileFunction(map, inf, allStorage, obfState, i, internalFuncs, internalNames);
        });

        // Generate internal function bodies
        const internalBodies: Array<{ name: string; body: string }> = [];
        for (const internal of internalFuncs) {
            const name = internalNames.get(internal.pc)!;
            const body = this.generateInternalBody(internal.body, allStorage, obfState);
            internalBodies.push({ name, body });
        }

        const name = 'C_a1b2c3';
        const warnings = this.generateWarnings(functions, allStorage);
        const solidity = this.generateSolidity(
            name,
            functions,
            allStorage,
            patterns,
            warnings,
            obfState,
            internalBodies,
        );

        return {
            name,
            matchedPatterns: patterns,
            functions,
            storage: allStorage,
            bytecodeSize: this.instructions.reduce((sum, i) => {
                return sum + (i.immediate ? 1 + i.immediate.length : 1);
            }, 0),
            instructionCount: this.instructions.length,
            warnings,
            solidity,
        };
    }

    private extractInternalFunctions(
        functionMaps: Array<{ selector: string; startOffset: number; body: Instruction[] }>,
    ): InternalFunction[] {
        const dispatcherDestinations = new Set(functionMaps.map((m) => m.startOffset));
        const allStarts = new Set(functionMaps.map((m) => m.startOffset));

        // Find all JUMPDESTs not in the dispatcher
        const internalJumps = this.instructions.filter(
            (instr) => instr.opcode.value === 0x5b && !dispatcherDestinations.has(instr.pc),
        );

        const internals: InternalFunction[] = [];
        const sortedStarts = Array.from(allStarts).sort((a, b) => a - b);

        for (const jump of internalJumps) {
            // Find the end of this internal function (next JUMPDEST or terminal)
            const startIdx = this.instructions.indexOf(jump);
            let endIdx = startIdx + 1;
            while (endIdx < this.instructions.length) {
                const instr = this.instructions[endIdx]!;
                const op = instr.opcode.value;
                if (op === 0x5b && !dispatcherDestinations.has(instr.pc)) break; // Another internal function
                if (op === 0xf3 || op === 0xfd || op === 0x00) {
                    endIdx = endIdx + 1;
                    break;
                }
                if (op === 0x56) {
                    // Check if this jumps back to a public function
                    const target = this.resolveJumpTarget(endIdx);
                    if (target !== null && dispatcherDestinations.has(target)) {
                        endIdx = endIdx + 1;
                        break;
                    }
                }
                endIdx++;
            }

            const body = this.instructions.slice(startIdx, endIdx);
            if (body.length > 3) {
                // Skip trivial bodies
                internals.push({ pc: jump.pc, body });
            }
        }

        return internals;
    }

    private resolveJumpTarget(jumpIdx: number): number | null {
        for (let k = jumpIdx - 1; k >= Math.max(0, jumpIdx - 5); k--) {
            const prev = this.instructions[k];
            if (!prev) continue;
            const op = prev.opcode.value;
            if (op >= 0x60 && op <= 0x7f && prev.immediate) {
                let value = 0n;
                for (const byte of prev.immediate) {
                    value = (value << 8n) | BigInt(byte);
                }
                return Number(value);
            }
            if (op < 0x80 || op > 0x9f) break;
        }
        return null;
    }

    private generateInternalBody(body: Instruction[], allStorage: StorageSlot[], obfState: ObfuscatorState): string {
        const flow = analyzeDataFlow(body);
        const storageNames = new Map<string, string>();
        for (const slot of allStorage) {
            const key = slot.slot.toString(16);
            if (slot.inferredName) {
                storageNames.set(key, slot.inferredName);
            }
        }

        interface Stmt {
            pc: number;
            text: string;
        }
        const stmts: Stmt[] = [];
        const pad = '        ';

        for (const w of flow.storageWrites) {
            try {
                const slotStr = this.exprToString(w.slot, storageNames);
                const valueStr = this.exprToString(w.value, storageNames);
                if (
                    valueStr &&
                    valueStr !== '?' &&
                    !valueStr.includes('d_') &&
                    !slotStr.includes('keccak256') &&
                    !slotStr.includes('memory[') &&
                    !valueStr.includes('?')
                ) {
                    const slotName = this.resolveStorageSlot(w.slot, storageNames);
                    stmts.push({ pc: w.pc, text: `${pad}${slotName} = ${valueStr};` });
                }
            } catch {
                // Skip problematic writes
            }
        }

        for (const c of flow.externalCalls) {
            try {
                const target = this.exprToString(c.target, storageNames);
                const value = this.exprToString(c.value, storageNames);
                if (target.includes('d_') || target === '?' || value.includes('keccak256') || value.includes('memory['))
                    continue;
                if (c.value.kind === 'literal' && c.value.value === 0n) {
                    stmts.push({ pc: c.pc, text: `${pad}(bool success_, ) = ${target}.call("");` });
                } else {
                    stmts.push({ pc: c.pc, text: `${pad}(bool success_, ) = ${target}.call{value: ${value}}("");` });
                }
            } catch {
                // Skip problematic calls
            }
        }

        const events: EventInfo[] = [];
        for (const event of flow.events) {
            events.push({ name: obfEvent(obfState.eventCounter++), topicCount: event.topics, pc: event.pc });
        }
        for (const e of events) {
            stmts.push({ pc: e.pc, text: `${pad}emit ${e.name}();` });
        }

        for (const r of flow.returns) {
            stmts.push({ pc: r.pc, text: `${pad}return;` });
        }
        for (const rev of flow.reverts) {
            stmts.push({ pc: rev.pc, text: `${pad}revert();` });
        }

        stmts.sort((a, b) => a.pc - b.pc);
        const seen = new Set<string>();
        const unique = stmts.filter((s) => {
            const key = `${s.pc}:${s.text}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        if (unique.length === 0) {
            return `${pad}// Internal helper`;
        }

        return unique.map((s) => s.text).join('\n');
    }

    private analyzeAllStorage(functionMaps: Array<{ selector: string; body: Instruction[] }>): StorageSlot[] {
        const slotMap = new Map<string, StorageSlot>();

        for (const fn of functionMaps) {
            const slots = analyzeStorage(fn.body, fn.selector);
            for (const slot of slots) {
                const key = slot.slot.toString(16);
                const existing = slotMap.get(key);
                if (existing) {
                    existing.reads += slot.reads;
                    existing.writes += slot.writes;
                    for (const f of slot.accessedByFunctions) {
                        if (!existing.accessedByFunctions.includes(f)) {
                            existing.accessedByFunctions.push(f);
                        }
                    }
                    existing.confidence = Math.max(existing.confidence, slot.confidence);
                } else {
                    slotMap.set(key, slot);
                }
            }
        }

        this.refineStorageTypes(slotMap, functionMaps);

        const sorted = Array.from(slotMap.values()).sort((a, b) => Number(a.slot - b.slot));
        sorted.forEach((slot, idx) => {
            slot.inferredName = obfStorage(idx);
        });

        return sorted;
    }

    private refineStorageTypes(
        slotMap: Map<string, StorageSlot>,
        functionMaps: Array<{ selector: string; body: Instruction[] }>,
    ): void {
        for (const [key, slot] of slotMap) {
            const slotBigInt = slot.slot;

            let hasAddressMasking = false;
            let hasArithmetic = false;
            let hasMappingAccess = false;

            for (const fn of functionMaps) {
                const flow = analyzeDataFlow(fn.body);

                for (const write of flow.storageWrites) {
                    if (this.slotMatches(write.slot, slotBigInt)) {
                        if (
                            write.value.kind === 'literal' &&
                            write.value.value < 1n << 160n &&
                            write.value.value > 0n
                        ) {
                            hasAddressMasking = true;
                        }
                        if (write.value.kind === 'unop' && write.value.op === 'address(') {
                            hasAddressMasking = true;
                        }
                    }
                }

                for (const read of flow.storageReads) {
                    if (read.slot.kind === 'calldata' || (read.slot.kind === 'binop' && read.slot.op === '+')) {
                        hasMappingAccess = true;
                    }
                }

                for (const instr of fn.body) {
                    if (instr.opcode.value >= 0x01 && instr.opcode.value <= 0x0b) {
                        hasArithmetic = true;
                    }
                }
            }

            if (hasAddressMasking) {
                slot.inferredType = 'address';
                slot.confidence = Math.max(slot.confidence, 0.7);
            } else if (hasMappingAccess) {
                slot.inferredType = 'mapping';
                slot.confidence = Math.max(slot.confidence, 0.5);
            } else if (hasArithmetic) {
                slot.inferredType = 'uint256';
                slot.confidence = Math.max(slot.confidence, 0.5);
            } else if (slot.writes === 0 && slot.reads > 0) {
                slot.inferredType = 'uint256';
                slot.confidence = Math.max(slot.confidence, 0.4);
            } else if (slotBigInt < 10n && slot.writes > 0) {
                slot.inferredType = slot.inferredType === 'unknown' ? 'uint256' : slot.inferredType;
                slot.confidence = Math.max(slot.confidence, 0.5);
            }
        }
    }

    private slotMatches(expr: Expression, slot: bigint): boolean {
        if (expr.kind === 'literal') return expr.value === slot;
        if (expr.kind === 'storage') return expr.slot === slot;
        return false;
    }

    private decompileFunction(
        map: { selector: string; name?: string; body: Instruction[] },
        inferred: InferredFunction,
        allStorage: StorageSlot[],
        obfState: ObfuscatorState,
        funcIndex: number,
        _internalFuncs: Array<{ pc: number; body: Instruction[] }>,
        internalNames: Map<number, string>,
    ): DecompiledFunction {
        const paramNames = new Map<number, string>();
        for (let i = 0; i < inferred.parameters.length; i++) {
            const p = inferred.parameters[i]!;
            paramNames.set(p.calldataOffset, `param${i}`);
        }

        const params = inferred.parameters
            .map((p, i) => {
                const type = p.inferredType === 'unknown' ? 'bytes32' : p.inferredType;
                return `${type} param${i}`;
            })
            .join(', ');

        const returnType = inferred.returnType ?? (inferred.stateMutability === 'view' ? 'uint256' : null);
        const mutability = inferred.stateMutability === 'nonpayable' ? '' : ` ${inferred.stateMutability}`;

        const funcName = obfFunction(funcIndex);

        // Find internal functions called by this function
        const calledInternals = this.findCalledInternals(map.body, internalNames);

        const body = this.generateFunctionBody(map.body, inferred, allStorage, paramNames, obfState, calledInternals);

        const confidence = this.calculateFunctionConfidence(inferred, map.body, allStorage, map.selector);

        return {
            selector: map.selector,
            name: funcName,
            signature: `${funcName}(${params})${returnType ? ` returns (${returnType})` : ''}`,
            parameters: params,
            returnType,
            stateMutability: inferred.stateMutability,
            body,
            storageSlots: allStorage.filter((s) => s.accessedByFunctions.includes(map.selector)),
            confidence,
        };
    }

    private findCalledInternals(body: Instruction[], internalNames: Map<number, string>): string[] {
        const called = new Set<string>();
        for (const instr of body) {
            if (instr.opcode.value === 0x56 || instr.opcode.value === 0x57) {
                const target = this.resolveJumpTarget(body.indexOf(instr));
                if (target !== null && internalNames.has(target)) {
                    called.add(internalNames.get(target)!);
                }
            }
        }
        return Array.from(called);
    }

    private calculateFunctionConfidence(
        inferred: InferredFunction,
        body: Instruction[],
        storage: StorageSlot[],
        selector: string,
    ): number {
        let score = 0.0;
        let factors = 0;

        if (inferred.matchedSignature) {
            score += 0.95;
        } else {
            score += 0.3;
        }
        factors++;

        if (inferred.parameters.length > 0) {
            const typedParams = inferred.parameters.filter((p) => p.inferredType !== 'unknown').length;
            score += typedParams / inferred.parameters.length;
        } else {
            score += 0.5;
        }
        factors++;

        const fnStorage = storage.filter((s) => s.accessedByFunctions.includes(selector));
        if (fnStorage.length > 0) {
            const identified = fnStorage.filter((s) => s.inferredType !== 'unknown').length;
            score += identified / fnStorage.length;
        } else {
            score += 0.6;
        }
        factors++;

        const flow = analyzeDataFlow(body);
        const hasClearControlFlow = flow.conditionals.length > 0 || flow.returns.length > 0;
        score += hasClearControlFlow ? 0.7 : 0.4;
        factors++;

        if (flow.externalCalls.length > 0) {
            score += 0.6;
        } else {
            score += 0.7;
        }
        factors++;

        return factors > 0 ? score / factors : 0.3;
    }

    private generateFunctionBody(
        body: Instruction[],
        _inferred: InferredFunction,
        allStorage: StorageSlot[],
        paramNames: Map<number, string>,
        obfState: ObfuscatorState,
        calledInternals: string[],
    ): string {
        const flow = analyzeDataFlow(body, paramNames);
        const storageNames = new Map<string, string>();
        for (const slot of allStorage) {
            const key = slot.slot.toString(16);
            if (slot.inferredName) {
                storageNames.set(key, slot.inferredName);
            }
        }

        const pcToIdx = new Map<number, number>();
        for (let i = 0; i < body.length; i++) {
            pcToIdx.set(body[i]!.pc, i);
        }

        const events: EventInfo[] = [];
        for (const event of flow.events) {
            events.push({
                name: obfEvent(obfState.eventCounter++),
                topicCount: event.topics,
                pc: event.pc,
            });
        }

        interface Stmt {
            pc: number;
            text: string;
        }
        const stmts: Stmt[] = [];
        const pad = '        ';

        // Storage writes - filter out keccak256 memory patterns and unknown values
        for (const w of flow.storageWrites) {
            const slotStr = this.exprToString(w.slot, storageNames);
            const valueStr = this.exprToString(w.value, storageNames);
            // Skip writes with unknown values or keccak256 memory slot patterns
            if (
                valueStr &&
                !valueStr.includes('d_') &&
                !slotStr.includes('keccak256') &&
                !slotStr.includes('memory[')
            ) {
                const slotName = this.resolveStorageSlot(w.slot, storageNames);
                stmts.push({ pc: w.pc, text: `${pad}${slotName} = ${valueStr};` });
            }
        }

        // External calls
        for (const c of flow.externalCalls) {
            const target = this.exprToString(c.target, storageNames);
            const value = this.exprToString(c.value, storageNames);
            if (c.value.kind === 'literal' && c.value.value === 0n) {
                stmts.push({ pc: c.pc, text: `${pad}(bool success_, ) = ${target}.call("");` });
            } else {
                stmts.push({ pc: c.pc, text: `${pad}(bool success_, ) = ${target}.call{value: ${value}}("");` });
            }
        }

        // Events
        for (const e of events) {
            stmts.push({ pc: e.pc, text: `${pad}emit ${e.name}();` });
        }

        // Conditionals - requires (filter out nonsensical ones)
        for (const cond of flow.conditionals) {
            const targetIdx = pcToIdx.get(cond.jumpDest);
            const isRequire = targetIdx === undefined || this.isRequirePattern(body, cond.jumpDest, pcToIdx);
            if (isRequire) {
                const condStr = this.exprToString(cond.condition, storageNames);
                if (condStr && this.isValidRequireCondition(condStr)) {
                    // Invert condition for JUMPI-to-revert: if cond then revert = require(!cond)
                    // But msg.value check is special: CALLVALUE followed by ISZERO + JUMPI to revert = require(!msg.value)
                    // If it's just CALLVALUE + JUMPI to revert = require(msg.value)
                    const isInverted = this.isInvertedCondition(body, cond.pc, pcToIdx, cond.condition);
                    const finalCond = isInverted ? `!(${condStr})` : condStr;
                    stmts.push({ pc: cond.pc, text: `${pad}require(${finalCond});` });
                }
            }
        }

        // Returns - only keep the first one
        let hasReturn = false;
        for (const r of flow.returns) {
            if (!hasReturn) {
                const valueStr = this.exprToString(r.value, storageNames);
                if (valueStr && !valueStr.includes('memory[')) {
                    stmts.push({ pc: r.pc, text: `${pad}return ${valueStr};` });
                } else {
                    stmts.push({ pc: r.pc, text: `${pad}return;` });
                }
                hasReturn = true;
            }
        }

        // Reverts - only keep if no return
        if (!hasReturn) {
            for (const rev of flow.reverts) {
                stmts.push({ pc: rev.pc, text: `${pad}revert();` });
                break;
            }
        }

        // Sort by PC, deduplicate
        stmts.sort((a, b) => a.pc - b.pc);
        const seen = new Set<string>();
        const unique = stmts.filter((s) => {
            const key = `${s.pc}:${s.text}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // Truncate after first terminal (return/revert)
        const truncated: Stmt[] = [];
        for (const s of unique) {
            truncated.push(s);
            if (s.text.includes('return;') || s.text.includes('return ') || s.text.includes('revert();')) {
                break;
            }
        }

        // Add internal function calls before the return
        const callLines = calledInternals.map((name) => `${pad}${name}();`);

        // Find the index of the first terminal statement
        const terminalIdx = truncated.findIndex(
            (s) => s.text.includes('return;') || s.text.includes('return ') || s.text.includes('revert();'),
        );

        let allLines: string[];
        if (terminalIdx >= 0 && callLines.length > 0) {
            allLines = [
                ...truncated.slice(0, terminalIdx).map((s) => s.text),
                ...callLines,
                ...truncated.slice(terminalIdx).map((s) => s.text),
            ];
        } else {
            allLines = [...truncated.map((s) => s.text), ...callLines];
        }

        if (allLines.length === 0) {
            return `${pad}// No high-level patterns detected`;
        }

        return allLines.join('\n');
    }

    private isValidRequireCondition(cond: string): boolean {
        // Filter out nonsensical conditions
        if (cond.includes('d_')) return false;
        if (cond.includes('!=') && cond.split('!=').length > 2) return false;
        if (cond.length > 200) return false;
        // Filter out raw EVM comparison ops
        if (cond.includes('slt') || cond.includes('sgt')) return false;
        return true;
    }

    private isInvertedCondition(
        body: Instruction[],
        condPC: number,
        pcToIdx: Map<number, number>,
        condition: Expression,
    ): boolean {
        // Check if the condition was inverted (ISZERO before JUMPI)
        const idx = pcToIdx.get(condPC);
        if (idx === undefined) return false;
        // Look back for ISZERO
        for (let i = idx - 1; i >= Math.max(0, idx - 5); i--) {
            const op = body[i]?.opcode.value;
            if (op === 0x15) return true; // ISZERO found - condition is inverted
            if (op === 0x57) return false; // Another JUMPI - stop
            if (op === 0x56) return false; // JUMP - stop
        }
        // Special case: CALLVALUE (msg.value) as direct condition means "if msg.value then revert"
        // which is require(!msg.value)
        if (condition.kind === 'unknown' && condition.display === 'msg.value') {
            return true;
        }
        return false;
    }

    private exprToString(expr: Expression, storageNames: Map<string, string>): string {
        if (!expr) return '?';
        switch (expr.kind) {
            case 'literal':
                return expr.display;
            case 'calldata':
                return expr.display;
            case 'storage': {
                const key = expr.slot.toString(16);
                return storageNames.get(key) ?? `s_${key.slice(0, 6)}`;
            }
            case 'memory':
                return expr.display;
            case 'variable':
                return expr.name;
            case 'binop': {
                const left = this.exprToString(expr.left, storageNames);
                const right = this.exprToString(expr.right, storageNames);

                // Simplify common patterns
                if (expr.op === 'shl' && left === '1') {
                    return `(1 << ${right})`;
                }
                if (expr.op === 'shr' && right === '1') {
                    return `(${left} >> 1)`;
                }
                if (expr.op === '&' && expr.right.kind === 'literal' && expr.right.value === (1n << 160n) - 1n) {
                    return `address(${left})`;
                }
                if (expr.op === '&' && expr.left.kind === 'literal' && expr.left.value === (1n << 160n) - 1n) {
                    return `address(${right})`;
                }

                return `(${left} ${expr.op} ${right})`;
            }
            case 'unop':
                if (expr.op === '== 0') {
                    const inner = this.exprToString(expr.operand, storageNames);
                    return `!(${inner})`;
                }
                if (expr.op === 'address(') {
                    const inner = this.exprToString(expr.operand, storageNames);
                    return `address(${inner})`;
                }
                if (expr.op === '~') {
                    const inner = this.exprToString(expr.operand, storageNames);
                    return `(~${inner})`;
                }
                return `${expr.op}(${this.exprToString(expr.operand, storageNames)})`;
            case 'unknown':
                return expr.display;
            default:
                return '?';
        }
    }

    private isRequirePattern(body: Instruction[], jumpDest: number, pcToIdx: Map<number, number>): boolean {
        const startIdx = pcToIdx.get(jumpDest);
        if (startIdx === undefined) return false;
        for (let i = startIdx; i < Math.min(startIdx + 10, body.length); i++) {
            const op = body[i]!.opcode.value;
            if (op === 0xfd) return true;
            if (op === 0xf3 || op === 0x56) return false;
        }
        return false;
    }

    private resolveStorageSlot(expr: Expression, storageNames: Map<string, string>): string {
        if (!expr) return 's_0';
        if (expr.kind === 'literal') {
            const key = expr.value.toString(16);
            return storageNames.get(key) ?? `s_${key.slice(0, 6)}`;
        }
        if (expr.kind === 'storage') {
            const key = expr.slot.toString(16);
            return storageNames.get(key) ?? `s_${key.slice(0, 6)}`;
        }
        // Mapping access: keccak256(...) or slot + offset
        return `storage[${this.exprToString(expr, storageNames)}]`;
    }

    private generateWarnings(functions: DecompiledFunction[], storage: StorageSlot[]): string[] {
        const warnings: string[] = [];

        const lowConfidence = functions.filter((f) => f.confidence < 0.5);
        if (lowConfidence.length > 0) {
            warnings.push(`${lowConfidence.length} function(s) could not be matched to known signatures`);
        }

        const unknownStorage = storage.filter((s) => s.inferredType === 'unknown');
        if (unknownStorage.length > 0) {
            warnings.push(`${unknownStorage.length} storage slot(s) could not be identified`);
        }

        const hasSelfDestruct = this.instructions.some((i) => i.opcode.mnemonic === 'SELFDESTRUCT');
        if (hasSelfDestruct) {
            warnings.push('Contract contains SELFDESTRUCT — can be destroyed by owner');
        }

        const hasCall = this.instructions.some(
            (i) => i.opcode.mnemonic === 'CALL' || i.opcode.mnemonic === 'DELEGATECALL',
        );
        if (hasCall) {
            warnings.push('Contract makes external calls — potential reentrancy risk');
        }

        return warnings;
    }

    private generateSolidity(
        name: string,
        functions: DecompiledFunction[],
        storage: StorageSlot[],
        _patterns: MatchedPattern[],
        _warnings: string[],
        _obfState: ObfuscatorState,
        internalBodies: Array<{ name: string; body: string }>,
    ): string {
        const lines: string[] = [];

        lines.push(`// SPDX-License-Identifier: UNLICENSED`);
        lines.push(`// Decompiled by d_tuft v1.0.0`);
        lines.push(`// Bytecode size: ${this.instructions.length} instructions`);
        lines.push(`// Confidence: ${this.computeOverallConfidence(functions).toFixed(0)}%`);
        lines.push('');

        lines.push(`pragma solidity ^0.8.0;`);
        lines.push('');
        lines.push(`contract ${name} {`);
        lines.push('');

        // State variables
        if (this.options.includeStorage && storage.length > 0) {
            for (const slot of storage) {
                const type = slot.inferredType === 'unknown' ? 'bytes32' : slot.inferredType;
                const sName = slot.inferredName ?? obfStorage(storage.indexOf(slot));
                if (type === 'mapping') {
                    lines.push(`    mapping(bytes32 => bytes32) internal ${sName};`);
                } else {
                    lines.push(`    ${type} internal ${sName};`);
                }
            }
            lines.push('');
        }

        // Event declarations
        const events = this.collectAllEvents(functions, internalBodies);
        if (events.length > 0) {
            for (const evt of events) {
                lines.push(`    event ${evt.name}();`);
            }
            lines.push('');
        }

        // Internal functions
        for (const internal of internalBodies) {
            lines.push(`    function ${internal.name}() internal {`);
            lines.push(internal.body);
            lines.push(`    }`);
            lines.push('');
        }

        // Public functions
        for (const fn of functions) {
            const returns = fn.returnType ? ` returns (${fn.returnType})` : '';
            const mutability = fn.stateMutability === 'nonpayable' ? '' : ` ${fn.stateMutability}`;
            const comment = fn.confidence < 0.7 ? ` // confidence: ${(fn.confidence * 100).toFixed(0)}%` : '';

            lines.push(`    function ${fn.name}(${fn.parameters}) external${mutability}${returns} {${comment}`);
            lines.push(fn.body);
            lines.push(`    }`);
            lines.push('');
        }

        lines.push(`}`);

        return lines.join('\n');
    }

    private collectAllEvents(
        functions: DecompiledFunction[],
        internalBodies: Array<{ name: string; body: string }>,
    ): Array<{ name: string; topicCount: number }> {
        const events: Array<{ name: string; topicCount: number }> = [];
        const seen = new Set<string>();

        for (const fn of functions) {
            const eventMatches = fn.body.match(/emit (e_[0-9a-f]+)\(\)/g);
            if (eventMatches) {
                for (const match of eventMatches) {
                    const name = match.replace('emit ', '').replace('()', '');
                    if (!seen.has(name)) {
                        seen.add(name);
                        events.push({ name, topicCount: 0 });
                    }
                }
            }
        }

        for (const internal of internalBodies) {
            const eventMatches = internal.body.match(/emit (e_[0-9a-f]+)\(\)/g);
            if (eventMatches) {
                for (const match of eventMatches) {
                    const name = match.replace('emit ', '').replace('()', '');
                    if (!seen.has(name)) {
                        seen.add(name);
                        events.push({ name, topicCount: 0 });
                    }
                }
            }
        }

        return events;
    }

    private computeOverallConfidence(functions: DecompiledFunction[]): number {
        if (functions.length === 0) return 0;
        const total = functions.reduce((sum, f) => sum + f.confidence, 0);
        return (total / functions.length) * 100;
    }
}

export function decompile(bytecode: Uint8Array | string, options?: DecompileOptions): DecompiledContract {
    return new Decompiler(bytecode, options).decompile();
}
