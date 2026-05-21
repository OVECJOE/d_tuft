/**
 * Hexadecimal string utilities
 */

/**
 * Check if string is valid hex (with or without 0x prefix)
 */
export function isHexString(str: string): boolean {
    const cleaned = str.startsWith('0x') ? str.slice(2) : str;
    return /^[0-9a-fA-F]*$/.test(cleaned) && cleaned.length % 2 === 0;
}

/**
 * Check if string is valid hex characters but odd length (missing leading zero)
 */
export function isOddLengthHex(str: string): boolean {
    const cleaned = str.startsWith('0x') ? str.slice(2) : str;
    return /^[0-9a-fA-F]+$/.test(cleaned) && cleaned.length % 2 === 1;
}

/**
 * Normalize hex string by padding odd-length hex with leading zero
 */
export function normalizeHex(str: string): string {
    const prefix = str.startsWith('0x') ? '0x' : '';
    const cleaned = str.startsWith('0x') ? str.slice(2) : str;
    if (cleaned.length % 2 === 1) {
        return `${prefix}0${cleaned}`;
    }
    return str;
}

/**
 * Add 0x prefix if not present
 */
export function addHexPrefix(hex: string): string {
    return hex.startsWith('0x') ? hex : `0x${hex}`;
}

/**
 * Remove 0x prefix if present
 */
export function removeHexPrefix(hex: string): string {
    return hex.startsWith('0x') ? hex.slice(2) : hex;
}

/**
 * Convert hex string to Uint8Array
 * @example hexToBytes('0x123456') -> Uint8Array([0x12, 0x34, 0x56])
 */
export function hexToBytes(hex: string): Uint8Array {
    const cleaned = removeHexPrefix(hex);

    if (isOddLengthHex(cleaned)) {
        throw new Error(`Invalid hex string "${hex}": odd number of hex digits. Use normalizeHex() to pad it`);
    }

    if (!isHexString(cleaned)) {
        throw new Error(`Invalid hex string: ${hex}`);
    }

    const bytes = new Uint8Array(cleaned.length / 2);
    for (let i = 0; i < cleaned.length; i += 2) {
        bytes[i / 2] = parseInt(cleaned.substring(i, i + 2), 16);
    }

    return bytes;
}

/**
 * Convert Uint8Array to hex string (with 0x prefix)
 * @example bytesToHex(Uint8Array([0x12, 0x34, 0x56])) -> '0x123456'
 */
export function bytesToHex(bytes: Uint8Array): string {
    return (
        '0x' +
        Array.from(bytes)
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('')
    );
}

/**
 * Pad hex string to specified byte length (left-padding with zeros)
 * @example padHex('0x1234', 4) -> '0x00001234'
 */
export function padHex(hex: string, bytes: number): string {
    const cleaned = removeHexPrefix(hex);
    const targetLength = bytes * 2;
    return addHexPrefix(cleaned.padStart(targetLength, '0'));
}

/**
 * Truncate or pad bytes array to exact length
 */
export function resizeBytes(bytes: Uint8Array, length: number): Uint8Array {
    if (bytes.length === length) {
        return bytes;
    }

    const result = new Uint8Array(length);
    if (bytes.length < length) {
        // Pad with zeros on the left (big-endian)
        result.set(bytes, length - bytes.length);
    } else {
        // Truncate from the left (keep rightmost bytes)
        result.set(bytes.slice(bytes.length - length));
    }

    return result;
}
