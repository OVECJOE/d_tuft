/**
 * EVM Memory — 256-bit word-addressable, with expansion gas tracking.
 *
 * Memory grows in 32-byte words. Each expansion costs:
 *   memoryExpansionGas = G_memory × i + floor(i² / 512)
 *   where i = ceil(newSize / 32) and G_memory = 3
 *
 * The memory space is sparse — only accessed words are allocated.
 */

const G_MEMORY = 3;

export class EvmMemory {
    private readonly data = new Map<number, number>();
    private _activeSize = 0;

    get activeSize(): number {
        return this._activeSize;
    }

    load(offset: number): bigint {
        let result = 0n;
        for (let i = 0; i < 32; i++) {
            result = (result << 8n) | BigInt(this.data.get(offset + i) ?? 0);
        }
        return result;
    }

    loadBytes(offset: number, size: number): Uint8Array {
        const result = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
            result[i] = this.data.get(offset + i) ?? 0;
        }
        return result;
    }

    store(offset: number, value: bigint): void {
        this.expand(offset + 32);
        for (let i = 31; i >= 0; i--) {
            this.data.set(offset + i, Number(value & 0xffn));
            value >>= 8n;
        }
    }

    storeBytes(offset: number, bytes: Uint8Array): void {
        this.expand(offset + bytes.length);
        for (let i = 0; i < bytes.length; i++) {
            this.data.set(offset + i, bytes[i] as number);
        }
    }

    expand(requiredSize: number): number {
        if (requiredSize <= this._activeSize) return 0;

        const oldWords = this.wordsForBytes(this._activeSize);
        const newWords = this.wordsForBytes(requiredSize);
        const gas = this.memoryCost(newWords) - this.memoryCost(oldWords);

        this._activeSize = newWords * 32;
        return gas;
    }

    private wordsForBytes(size: number): number {
        return Math.ceil(size / 32);
    }

    private memoryCost(words: number): number {
        return G_MEMORY * words + Math.floor((words * words) / 512);
    }

    dump(offset: number, size: number): string {
        const bytes: string[] = [];
        for (let i = 0; i < size; i++) {
            const b = this.data.get(offset + i) ?? 0;
            bytes.push(b.toString(16).padStart(2, '0'));
        }
        return '0x' + bytes.join('');
    }
}
