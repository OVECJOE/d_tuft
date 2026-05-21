import type { Instruction } from '../../core/types';

export interface StorageSlot {
    slot: bigint;
    reads: number;
    writes: number;
    inferredType: StorageType;
    inferredName: string | null;
    mappingKeyType: string | null;
    confidence: number;
    accessedByFunctions: string[];
}

export type StorageType = 'uint256' | 'address' | 'bool' | 'bytes32' | 'mapping' | 'array' | 'struct' | 'unknown';

const STORAGE_PATTERNS = new Map<string, { type: StorageType; name: string }>([
    ['0x00', { type: 'mapping', name: '_balances' }],
    ['0x01', { type: 'mapping', name: '_allowances' }],
    ['0x02', { type: 'uint256', name: '_totalSupply' }],
    ['0x03', { type: 'address', name: '_owner' }],
    ['0x04', { type: 'uint256', name: '_paused' }],
    ['0x05', { type: 'address', name: '_factory' }],
    ['0x06', { type: 'address', name: '_WETH' }],
]);

export class StorageAnalyzer {
    analyze(body: Instruction[], selector?: string): StorageSlot[] {
        const slots = new Map<string, StorageSlot>();

        for (let i = 0; i < body.length; i++) {
            const instr = body[i]!;

            if (instr.opcode.mnemonic === 'SLOAD' || instr.opcode.mnemonic === 'SSTORE') {
                const slotValue = this.resolveSlotKey(i, body);
                if (slotValue !== null) {
                    const key = slotValue.toString(16);
                    const existing = slots.get(key) ?? {
                        slot: slotValue,
                        reads: 0,
                        writes: 0,
                        inferredType: 'unknown' as StorageType,
                        inferredName: null,
                        mappingKeyType: null,
                        confidence: 0.3,
                        accessedByFunctions: [],
                    };

                    if (instr.opcode.mnemonic === 'SLOAD') existing.reads++;
                    else existing.writes++;

                    if (selector && !existing.accessedByFunctions.includes(selector)) {
                        existing.accessedByFunctions.push(selector);
                    }

                    slots.set(key, existing);
                }
            }
        }

        for (const [_, slot] of slots) {
            this.inferSlotType(slot, body);
        }

        return Array.from(slots.values()).sort((a, b) => Number(a.slot - b.slot));
    }

    private resolveSlotKey(index: number, body: Instruction[]): bigint | null {
        for (let i = index - 1; i >= Math.max(0, index - 15); i--) {
            const instr = body[i]!;
            const op = instr.opcode.value;

            if (op >= 0x60 && op <= 0x7f && instr.immediate) {
                let value = 0n;
                for (const byte of instr.immediate) {
                    value = (value << 8n) | BigInt(byte);
                }
                return value;
            }

            if (op === 0x50 || (op >= 0x80 && op <= 0x9f)) continue;
            if (op >= 0x01 && op <= 0x1e) {
                const left = this.resolveSlotKey(i, body);
                const right = this.resolveSlotKey(i, body);
                if (left !== null && right !== null) {
                    switch (op) {
                        case 0x01:
                            return left + right;
                        case 0x02:
                            return left * right;
                        case 0x16:
                            return left & right;
                        case 0x17:
                            return left | right;
                        case 0x18:
                            return left ^ right;
                    }
                }
            }
            break;
        }
        return null;
    }

    private inferSlotType(slot: StorageSlot, _body: Instruction[]): void {
        const pattern = STORAGE_PATTERNS.get(slot.slot.toString(16));
        if (pattern) {
            slot.inferredType = pattern.type;
            slot.inferredName = pattern.name;
            slot.confidence = 0.8;
        }

        if (slot.writes > 0 && slot.reads > slot.writes * 2) {
            slot.inferredType = 'mapping';
            slot.confidence = Math.max(slot.confidence, 0.5);
        }

        if (slot.writes === 0 && slot.reads > 0) {
            slot.inferredType = 'uint256';
            slot.confidence = Math.max(slot.confidence, 0.4);
        }

        if (slot.slot === 0n || slot.slot === 1n || slot.slot === 2n) {
            if (!pattern) {
                slot.inferredType = slot.slot === 0n ? 'mapping' : 'uint256';
                slot.confidence = Math.max(slot.confidence, 0.4);
            }
        }

        if (slot.accessedByFunctions.length > 2) {
            slot.inferredType = 'mapping';
            slot.confidence = Math.max(slot.confidence, 0.6);
        }
    }
}

export function analyzeStorage(body: Instruction[], selector?: string): StorageSlot[] {
    return new StorageAnalyzer().analyze(body, selector);
}
