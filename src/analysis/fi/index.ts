import { sha3_256 } from "js-sha3";
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
import { bytesToHex } from "../../utils";

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

        for (const entry of entries) {
            const startOffset = entry.jumpDestOffset;
            const endOffset = this.findFunctionEnd(startOffset);
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

            const selector = deriveSelector(entry);
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

            if (!FunctionIdentifier.bodiesEqual(ours.body, theirs.body)) {
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
     * 
     * EVM compilers (solc, vyper) emit one block per public function:
     * 
     *   PUSH4 <selector> // push 4-byte selector
     *   DUP1 // (solc >= 0.8 sometimes emits DUP1 here)
     *   EQ // compare with calldata selector
     *   PUSH2 <dest> // push jump destination
     *   JUMPI // conditional jump to function body if match
     * 
     * We tolerate DUP1 between PUSH4 and EQ since solc emits it when there are multiple functions
     * (it DUPs the calldata selector before each EQ to avoid reloading it).
     * The window search below handles this naturally.
     * 
     * Stops scanning once we leave the dispatcher region - detected by encountering
     * a JUMPDEST at a position referenced by a dispatcher entry, which marks the start
     * of actual function bodies.
     */
    private findDispatcher(): DispatcherEntry[] {
        const entries: DispatcherEntry[] = [];
        const len = this.instructions.length;

        // Collect jump destinations from dispatcher entries as we find them
        // so we know when to stop (first JUMPDEST that IS a function entry)
        const functionStarts = new Set<number>();

        for (let i = 0; i < len; i++) {
            const instr = this.instructions[i];

            // Stop when we hit a JUMPDEST that's already been registered as a function start - we've left the dispatcher region
            if (
                instr?.opcode.value === OP.JUMPDEST
                && functionStarts.has(instr.pc)
                && entries.length > 0
            ) break;

            // Look for PUSH4 - the selector load
            if (instr?.opcode.value !== OP.PUSH4 || !instr.immediate) continue;

            const selector = bytesToHex(instr.immediate);
            const selectorPC = instr.pc;

            // Lookahead window: find EQ and PUSH2/PUSH1 + JUMPI within the
            // next 5 instructions (tolerates DUP1 and compiler variations)
            let eqFound = false;
            let destOffset: number | null = null;
            
            const windowEnd = Math.min(i + 5, len);
            for (let j = i + 1; j < windowEnd; j++) {
                const w = this.instructions[j] as Instruction;
        
                if (w?.opcode.value === OP.EQ) {
                    eqFound = true;
                    continue;
                }

                // PUSH1 or PUSH2 carrying the jump destination
                if (eqFound &&
                    w.opcode.value >= OP.PUSH1 &&
                    w.opcode.value <= OP.PUSH2 &&
                    w.immediate
                ) {
                    destOffset = immediateToNumber(w.immediate);
                    continue;
                }

                if (eqFound && destOffset !== null && w.opcode.value === OP.JUMPI) {
                    // Valid dispatcher entry found
                    entries.push({
                        selector,
                        selectorPC,
                        jumpDestOffset: destOffset,
                    });
                    functionStarts.add(destOffset);
                    break;
                }

                // Abort lookahead on unexpected terminal opcodes
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
    private findFunctionEnd(startOffset: number): number {
        const startIdx = this.pcIndex.get(startOffset);

        if (startIdx === undefined) {
            // Offset not found - defensive fallback
            return startOffset;
        }

        // Confirm the entry point is indeed a JUMPDEST
        const entry = this.instructions[startIdx];
        if (entry?.opcode.value !== OP.JUMPDEST) {
            return startOffset;
        }

        let depth = 0; // tracking nesting of conditional jumps

        for (let i = startIdx + 1; i < this.instructions.length; i++) {
            const instr = this.instructions[i] as Instruction;
            const op = instr.opcode.value;

            // JUMPDEST encountered mid-scan = entering a nested block (loop body, else branch)
            // Track depth so we don't stop prematurely.
            if (op === OP.JUMPDEST) {
                depth++;
                continue;
            }

            if (TERMINAL_OPCODES.has(op)) {
                if (depth === 0) {
                    return instr?.pc || startOffset; // End of function body
                }
                depth = Math.max(0, depth - 1);
                continue;
            }

            // Unconditional JUMP at depth 0 is an exist (tail call / return
            // via shared cleanup block). At depth > 0 it's a loop back-edge.
            if (op === OP.JUMP && depth === 0) {
                return instr?.pc || startOffset;
            }
        }

        // Fell off the end of bytecode without finding a terminal -
        // return the PC of the last instruction as a safe fallback.
        return this.instructions[this.instructions.length - 1]?.pc || startOffset;
    }

    /**
     * Slice instructions between startOffset and endOffset (inclusive).
     * Uses the PC index for 0(1) start lookup.
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
     * This is the ONLY place that touches the raw input — everything else
     * works on this.instructions.
     */
    private static normalize(program: Uint8Array | AssemblyProgram): Instruction[] {
        if (program instanceof Uint8Array) {
            return disassemble(program).instructions;
        }
        // assemble() with toInstructions:true returns Instruction[] directly
        return assemble(program, { toInstructions: true }) as Instruction[];
    }

    /**
     * Build a Map<pc, index> for O(1) instruction lookup by program counter.
     * Called once at construction time.
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
     * Ignores PC values (position-independent comparison) - 
     * only opcode values and immediate bytes matter.
     */
    private static bodiesEqual(a: Instruction[], b: Instruction[]): boolean {
        if (a.length !== b.length) return false;

        for (let i = 0; i < a.length; i++) {
            if (a[i]?.opcode.value !== b[i]?.opcode.value) return false;

            const immA = a[i]!.immediate;
            const immB = b[i]!.immediate;

            if ((immA === undefined) !== (immB === undefined)) return false; // One has immediate, the other doesn't
            if (immA && immB) {
                if (immA.length !== immB.length) return false;
                for (let j = 0; j < immA.length; j++) {
                    if (immA[j] !== immB[j]) return false;
                }
            }
        }

        return true;
    }
}
