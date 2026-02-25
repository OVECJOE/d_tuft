import { assemble } from "../../core/assembler";
import { disassemble } from "../../core/parser";
import { OP, TERMINAL_OPCODES } from "./constants";
import type {
    FunctionMap,
    AssemblyProgram,
    ABI,
    SelectorDiff,
    DispatcherEntry,
    Instruction
} from "../../core/types";
import { buildSignature, deriveSelector, immediateToNumber } from "./helpers";
import { addHexPrefix, bytesToHex } from "../../utils";

/**
 * Identifies, maps, and names EVM functions from dissembled bytecode.
 * 
 * Usage:
 *   const fi = new FunctionIdentifier(rawBytecode);
 *   const maps = fi.identify();
 *   fi.resolveNames(abi); // optional - enriches maps with human names
 * 
 * Works on both raw bytecode (Uint8Array) and pre-parsed AssemblyProgram.
 * Internally everything is normalized to Instruction[] at construction time
 * so all methods operate on a single consistent representation.
 */
export class FunctionIdentifier {
    private readonly instructions: Instruction[];

    /**
     * PC -> index into this.instructions for 0(1) lookups by program counter.
     * Built once at construction; never mutated after that.
     */
    private readonly pcIndex: Map<number, number>;

    /**
     * Mutable function map populated by identify() and enriched by
     * resolveNames(). Keyed by selector hex for fast retrieval.
     */
    private functionMaps: Map<string, FunctionMap> = new Map();

    constructor(program: Uint8Array | AssemblyProgram) {
        this.instructions = FunctionIdentifier.normalize(program);
        this.pcIndex = FunctionIdentifier.buildPCIndex(this.instructions);
    }

    /**
     * Scan the bytecode, locate the dispatcher, and return one FunctionMap
     * per public/external function found.
     * 
     * Safe to call multiple times - subsequent calls return the cached result
     * unless the instance was reconstructed.
     */
    identify(): FunctionMap[] {
        if (this.functionMaps.size > 0) {
            return Array.from(this.functionMaps.values());
        }

        const entries = this.findDispatcher();
        if (entries.length === 0) return [];

        const functionStarts = new Set(entries.map((e) => e.jumpDestOffset));

        for (const entry of entries) {
            const startOffset = entry.jumpDestOffset;
            const endOffset = this.findFunctionEnd(startOffset, functionStarts);
            const body = this.sliceBody(startOffset, endOffset);

            const map: FunctionMap = {
                selector: entry.selector,
                startOffset,
                endOffset,
                body,
            };

            this.functionMaps.set(entry.selector, map);
        }

        return Array.from(this.functionMaps.values());
    }

    /**
     * Enrich identified functions with human-readable names derived from the contract ABI.
     * Only function-type entries are processed; events/errors are ignored.
     * 
     * Must be called after identify() - if identify() hasn't run yet, this method runs
     * it automatically.
     * 
     * Returns the updated FunctionMap array so callers can chain:
     *   const maps = fi.identify();
     *   fi.resolveNames(abi);
     * or:
     *   const named = fi.resolveNames(abi); // runs identify() internally
     */
    resolveNames(abi: ABI): FunctionMap[] {
        if (this.functionMaps.size === 0) {
            this.identify();
        }

        for (const entry of abi) {
            if (entry.type !== "function" || !entry.name) continue;

            const selector = deriveSelector(entry).toLowerCase();
            const existing = this.functionMaps.get(selector);
            if (existing) {
                existing.name = buildSignature(entry);
                this.functionMaps.set(selector, existing);
            }

            // If selector not found in our map, the ABI describes a function
            // that doesn't exist in the bytecode - we can choose to ignore it
            // This can happen legitimately (e.g., inherited functions that got optimized out) or due to ABI/bytecode mismatch
        }

        return Array.from(this.functionMaps.values());
    }

    /**
     * Return the instruction body for a given selector.
     * Selector may be provided with or without "0x" prefix.
     * 
     * Returns null if the selector was not found - prefer null over throwing
     * so callers can distinguish "not found" from genuine errors.
     */
    getBody(selector: string): Instruction[] | null {
        const key = selector.replace(/0x/i, "").toLowerCase();
        return this.functionMaps.get(key)?.body || null;
    }

    /**
     * Return the FunctionMap for a given selector, or null if not found.
     * Useful when callers want full metadata rather than just the body.
     */
    getFunction(selector: string): FunctionMap | null {
        const key = selector.replace(/0x/i, "").toLowerCase();
        return this.functionMaps.get(key) || null;
    }

    /**
     * Locate all JUMPDESTs that are NOT referenced by any dispatcher entry.
     * These are internal/private functions, modifier bodies, or shared helper
     * routines - all interesting from a security perspective because they represent
     * shared logic paths that multiple public functions flow through.
     */
    findInternalFunctions(): Instruction[] {
        const dispatcherDestinations = new Set(
            this.findDispatcher().map((e) => e.jumpDestOffset)
        );

        return this.instructions.filter(
            (instr) =>
                instr.opcode.value === OP.JUMPDEST
                && !dispatcherDestinations.has(instr.pc)
        );
    }

    /**
     * Compare this contract's function maps against another instance.
     * Returns selectors present in both with differing bodies - indicating
     * a function changed between two deployments. Useful for upgrade auditing.
     * 
     * The comparison is opcode-level: same sequence of opcode values and immediate
     * bytes = identical. PC differences alone do not count as a diff
     * (the function may have shifted position without changing logic).
     */
    diff(other: FunctionIdentifier): SelectorDiff[] {
        const diffs: SelectorDiff[] = [];
        const ourMaps = this.identify();
        const theirMaps = other.identify();
        const theirBySelector = new Map(theirMaps.map((m) => [m.selector, m]));

        const ourStarts = new Set(ourMaps.map((m) => m.startOffset));
        const theirStarts = new Set(theirMaps.map((m) => m.startOffset));

        for (const ours of ourMaps) {
            const theirs = theirBySelector.get(ours.selector);
            if (!theirs) {
                diffs.push({
                    selector: ours.selector,
                    name: ours.name,
                    kind: "removed",
                });
                continue;
            }

            const ourLocal = FunctionIdentifier.normalizeBody(
                FunctionIdentifier.extractLocalBody(ours, ourStarts)
            );
            const theirLocal = FunctionIdentifier.normalizeBody(
                FunctionIdentifier.extractLocalBody(theirs, theirStarts)
            );

            if (!FunctionIdentifier.bodiesEqual(ourLocal, theirLocal)) {
                diffs.push({ selector: ours.selector, name: ours.name, kind: "modified" });
            }
        }

        // Functions in other that don't exist in ours
        for (const theirs of theirMaps) {
            if (!this.functionMaps.has(theirs.selector)) {
                diffs.push({
                    selector: theirs.selector,
                    name: theirs.name,
                    kind: "added",
                });
            }
        }

        return diffs;
    }

    /**
       * Scan instructions from the top for the PUSH4+EQ+JUMPI pattern that
       * forms the function dispatcher.
       */
    private findDispatcher(): DispatcherEntry[] {
        const entries: DispatcherEntry[] = [];
        const len = this.instructions.length;
        const functionStarts = new Set<number>();

        for (let i = 0; i < len; i++) {
            const instr = this.instructions[i];

            if (
                instr?.opcode.value === OP.JUMPDEST &&
                functionStarts.has(instr.pc) &&
                entries.length > 0
            ) break;

            if (instr?.opcode.value !== OP.PUSH4 || !instr.immediate) continue;

            const raw = bytesToHex(instr.immediate);
            const selector = raw.replace(/^0x/i, "").toLowerCase();
            const selectorPC = instr.pc;

            let eqFound = false;
            let destOffset: number | null = null;
            const windowEnd = Math.min(i + 8, len);

            for (let j = i + 1; j < windowEnd; j++) {
                const w = this.instructions[j] as Instruction;
                if (w?.opcode.value === OP.EQ) {
                    eqFound = true;
                    continue;
                }
                if (
                    eqFound &&
                    w.opcode.value >= OP.PUSH1 &&
                    w.opcode.value <= OP.PUSH2 &&
                    w.immediate
                ) {
                    destOffset = immediateToNumber(w.immediate);
                    continue;
                }
                if (eqFound && destOffset !== null && w.opcode.value === OP.JUMPI) {
                    entries.push({ selector, selectorPC, jumpDestOffset: destOffset });
                    functionStarts.add(destOffset);
                    break;
                }
                if (TERMINAL_OPCODES.has(w.opcode.value)) break;
            }
        }

        return entries;
    }

    /**
     * Walk forward from a JUMPDEST at startOffset until we hit a terminal opcode
     * (RETURN, REVERT, STOP, INVALID, SELFDESTRUCT) or an unconditional JUMP
     * back out of the function body.
     * 
     * Returns the PC of the terminal instruction (inclusive end of body).
     * 
     * Handles nested control flow (loops, if/else) by tracking a depth counter for conditional jumps:
     * we only consider the function ended when we reach a terminal at depth 0.
     */
    private findFunctionEnd(startOffset: number, functionStarts: Set<number>): number {
        const startIdx = this.pcIndex.get(startOffset);
        if (startIdx === undefined) return startOffset;

        const entry = this.instructions[startIdx];
        if (entry?.opcode.value !== OP.JUMPDEST) return startOffset;

        const visited = new Set<number>(); // visited instruction indices
        const worklist: number[] = [startIdx]; // indices to process
        let maxPC = startOffset;

        while (worklist.length > 0) {
            const idx = worklist.pop()!;
            if (visited.has(idx)) continue;
            visited.add(idx);

            const instr = this.instructions[idx];
            if (!instr) continue;

            // Cap at another public function's entry point (but allow our own start).
            if (instr.pc !== startOffset && functionStarts.has(instr.pc)) continue;

            if (instr.pc > maxPC) maxPC = instr.pc;

            const op = instr.opcode.value;

            // Terminal — this branch ends here, don't follow fall-through.
            if (TERMINAL_OPCODES.has(op)) continue;

            // Unconditional JUMP — resolve target from the preceding PUSH immediate.
            // Fall-through is NOT reachable after an unconditional jump.
            if (op === OP.JUMP) {
                const target = this.resolveJumpTarget(idx);
                if (target !== null) {
                    const targetIdx = this.pcIndex.get(target);
                    if (
                        targetIdx !== undefined &&
                        !visited.has(targetIdx) &&
                        // Back-edge guard: if target is before start it's a loop into
                        // a shared helper — don't follow to avoid escaping the function.
                        this.instructions[targetIdx]!.pc >= startOffset
                    ) {
                        worklist.push(targetIdx);
                    }
                }
                continue; // do NOT enqueue fall-through
            }

            // Conditional JUMPI — both fall-through (idx+1) and taken branch are reachable.
            if (op === OP.JUMPI) {
                const target = this.resolveJumpTarget(idx);
                if (target !== null) {
                    const targetIdx = this.pcIndex.get(target);
                    if (
                        targetIdx !== undefined &&
                        !visited.has(targetIdx) &&
                        this.instructions[targetIdx]!.pc >= startOffset
                    ) {
                        worklist.push(targetIdx);
                    }
                }
                // Fall-through is always reachable (when condition is false).
                if (idx + 1 < this.instructions.length && !visited.has(idx + 1)) {
                    worklist.push(idx + 1);
                }
                continue;
            }

            // Normal instruction — fall through to next.
            if (idx + 1 < this.instructions.length && !visited.has(idx + 1)) {
                const next = this.instructions[idx + 1]!;
                if (next.pc !== startOffset && functionStarts.has(next.pc)) continue;
                worklist.push(idx + 1);
            }
        }

        return maxPC;
    }

    /**
     * Resolve a JUMP or JUMPI target by walking backwards from the jump
     * instruction to find the most recent PUSH that supplies the destination.
     *
     * This covers the overwhelming majority of real-world compiled EVM code
     * where the pattern is:
     *   PUSH2 <dest>
     *   JUMPI            (or JUMP)
     *
     * Returns null when the target cannot be statically determined (e.g. when
     * the destination comes from a dynamic computation rather than a literal PUSH).
     */
    private resolveJumpTarget(jumpIdx: number): number | null {
        // Walk backwards up to 5 slots looking for a PUSH with an immediate.
        for (let k = jumpIdx - 1; k >= Math.max(0, jumpIdx - 5); k--) {
            const prev = this.instructions[k];
            if (!prev) continue;
            const op = prev.opcode.value;
            if (op >= OP.PUSH1 && op <= OP.PUSH32 && prev.immediate) {
                return immediateToNumber(prev.immediate);
            }
            // If we hit another jump or a non-push opcode that isn't a DUP/SWAP
            // (which are stack-manipulation but don't introduce new values), stop.
            // DUP/SWAP range: 0x80-0x9f
            if (op < 0x80 || op > 0x9f) break;
        }
        return null;
    }

    /**
   * Slice instructions between startOffset and endOffset (inclusive).
   */
    private sliceBody(startOffset: number, endOffset: number): Instruction[] {
        const startIdx = this.pcIndex.get(startOffset);
        if (startIdx === undefined) return [];

        const body: Instruction[] = [];
        for (let i = startIdx; i < this.instructions.length; i++) {
            const instr = this.instructions[i] as Instruction;
            body.push(instr);
            if (instr.pc >= endOffset) break;
        }
        return body;
    }

    /**
     * Normalise either input form into Instruction[].
     */
    private static normalize(program: Uint8Array | AssemblyProgram): Instruction[] {
        if (program instanceof Uint8Array) {
            return disassemble(program).instructions;
        }
        return assemble(program, { toInstructions: true }) as Instruction[];
    }

    /**
     * Build a Map<PC, index> for O(1) instruction lookup by program counter.
     */
    private static buildPCIndex(instructions: Instruction[]): Map<number, number> {
        const index = new Map<number, number>();
        for (let i = 0; i < instructions.length; i++) {
            index.set(instructions[i]!.pc, i);
        }
        return index;
    }

    /**
     * Compare two instruction bodies for logical equivalence.
     * Ignores PC values — only opcode values and immediate bytes matter.
     */
    private static bodiesEqual(a: Instruction[], b: Instruction[]): boolean {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i]?.opcode.value !== b[i]?.opcode.value) return false;
            const immA = a[i]!.immediate;
            const immB = b[i]!.immediate;
            if ((immA === undefined) !== (immB === undefined)) return false;
            if (immA && immB) {
                if (immA.length !== immB.length) return false;
                for (let j = 0; j < immA.length; j++) {
                    if (immA[j] !== immB[j]) return false;
                }
            }
        }
        return true;
    }

    /**
     * Extract only the instructions within a function's own contiguous PC
     * region, excluding shared internal helpers that live at other addresses.
     * The boundary is the next public function's start offset.
     */
    private static extractLocalBody(map: FunctionMap, allStarts: Set<number>): Instruction[] {
        const sorted = Array.from(allStarts).sort((a, b) => a - b);
        const idx = sorted.indexOf(map.startOffset);
        const nextStart = idx >= 0 && idx + 1 < sorted.length
            ? sorted[idx + 1] as number
            : Infinity;

        return map.body.filter(
            (instr) => instr.pc >= map.startOffset && instr.pc < nextStart
        );
    }

    /**
     * Zero out PUSH immediates that feed directly into JUMP or JUMPI.
     * These are absolute addresses that change when code is relocated
     * without any actual logic change.
     *
     * Returns a shallow copy — the original instruction array is not mutated.
     */
    private static normalizeBody(body: Instruction[]): Instruction[] {
        return body.map((instr, i) => {
            if (!instr.immediate) return instr;

            const op = instr.opcode.value;
            if (op < OP.PUSH1 || op > OP.PUSH32) return instr;

            const next = body[i + 1];
            if (!next) return instr;

            const nextOp = next.opcode.value;
            if (nextOp !== OP.JUMP && nextOp !== OP.JUMPI) return instr;

            return {
                ...instr,
                immediate: new Uint8Array(instr.immediate.length),
            };
        });
    }
}
