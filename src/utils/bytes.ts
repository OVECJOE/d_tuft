/**
 * Byte array utilities
 */

/**
 * Concatenate multiple Uint8Arrays
 */
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);

    let offset = 0;
    for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }

    return result;
}

/**
 * Compare two Uint8Arrays for equality
 */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }

    return true;
}

/**
 * Slice bytes array (wrapper for better type safety)
 */
export function sliceBytes(bytes: Uint8Array, start: number, end?: number): Uint8Array {
    return bytes.slice(start, end);
}

/**
 * Get a single byte from array with bounds checking
 */
export function getByte(bytes: Uint8Array, index: number): number {
    if (index < 0 || index >= bytes.length) {
        throw new Error(`Index ${index} out of bounds for byte array of length ${bytes.length}`);
    }
    return bytes[index] as number;
}

/**
 * Convert byte to binary string
 * @example byteToBinary(0xA5) → '10100101'
 */
export function byteToBinary(byte: number): string {
    return byte.toString(2).padStart(8, '0');
}

/**
 * Create empty byte array of specified size
 */
export function createBytes(size: number, fill: number = 0): Uint8Array {
    const bytes = new Uint8Array(size);
    if (fill !== 0) {
        bytes.fill(fill);
    }
    return bytes;
}
