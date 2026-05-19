import { keccak256 } from "js-sha3";
import type { ABIEntry, ABIParameter } from "../../core/types";

export function encodeParam(param: ABIParameter): string {
    if (param.type === "tuple" || param.type.startsWith("tuple[")) {
        const inner = (param.components || []).map(encodeParam).join(",");
        const arraySuffix = param.type.slice("tuple".length);
        return `(${inner})${arraySuffix}`;
    }
    return param.type;
}

export function buildSignature(entry: ABIEntry): string {
    const name = entry.name || "";
    const params = (entry.inputs || []).map(encodeParam).join(",");
    return `${name}(${params})`;
}

export function deriveSelector(entry: ABIEntry): string {
    const signature = buildSignature(entry);
    return keccak256(signature).slice(0, 8); // First 4 bytes (8 hex chars)
}

export function immediateToNumber(immediate: Uint8Array): number {
    let value = 0;
    for (const byte of immediate) {
        value = value * 256 + byte;
    }
    return value;
}
