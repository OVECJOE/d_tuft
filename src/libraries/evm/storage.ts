/**
 * EVM Storage — key-value map with EIP-2929 cold/warm slot tracking.
 *
 * Each storage slot is a 256-bit word (bigint). SLOTS are keyed by
 * 256-bit keys. The storage is persisted across transactions for a
 * given account.
 *
 * Gas costs (post-Berlin / EIP-2929):
 *   - Cold SLOAD: 2100 gas
 *   - Warm SLOAD: 100 gas
 *   - Cold SSTORE (new): 22100 gas
 *   - Warm SSTORE (0→0): 2900 gas
 *   - Warm SSTORE (0→non-zero): 22100 gas
 *   - Warm SSTORE (non-zero→0): 2900 gas (plus refund)
 *   - Warm SSTORE (non-zero→non-zero): 2900 gas
 */

export class EvmStorage {
    private readonly data = new Map<string, bigint>();
    private readonly warmSlots = new Set<string>();

    get(key: bigint): { value: bigint; cold: boolean } {
        const slotKey = slotKeyStr(key);
        const cold = !this.warmSlots.has(slotKey);
        if (cold) {
            this.warmSlots.add(slotKey);
        }
        return { value: this.data.get(slotKey) ?? 0n, cold };
    }

    set(key: bigint, value: bigint): StorageChange {
        const slotKey = slotKeyStr(key);
        const original = this.data.get(slotKey) ?? 0n;
        const current = original;
        const cold = !this.warmSlots.has(slotKey);
        this.warmSlots.add(slotKey);

        if (value !== 0n) {
            this.data.set(slotKey, value);
        } else {
            this.data.delete(slotKey);
        }

        return { original, current, newValue: value, cold };
    }

    isWarm(key: bigint): boolean {
        return this.warmSlots.has(slotKeyStr(key));
    }

    warmSlot(key: bigint): void {
        this.warmSlots.add(slotKeyStr(key));
    }

    dump(): Map<string, bigint> {
        return new Map(this.data);
    }

    clear(): void {
        this.data.clear();
        this.warmSlots.clear();
    }
}

export interface StorageChange {
    original: bigint;
    current: bigint;
    newValue: bigint;
    cold: boolean;
}

function slotKeyStr(key: bigint): string {
    return key.toString(16).padStart(64, '0');
}
