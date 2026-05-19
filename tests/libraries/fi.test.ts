import { describe, test, expect } from 'vitest';
import { FunctionIdentifier } from '../../src/libraries/fi';
import { disassemble } from '../../src/core/parser';

describe('FunctionIdentifier', () => {
    test('identifies functions from bytecode with dispatcher', () => {
        const bytecode = '0x608060405234801561001057600080fd5b50600436106100415760003560e01c806306fdde0314610046578063095ea7b31461006457806318160ddd14610084575b600080fd5b';
        const fi = new FunctionIdentifier(new Uint8Array(
            bytecode.match(/.{2}/g)!.map(b => parseInt(b, 16))
        ));
        const maps = fi.identify();
        expect(maps.length).toBeGreaterThan(0);
    });

    test('returns empty array for bytecode without dispatcher', () => {
        const bytecode = '0x600160020100';
        const fi = new FunctionIdentifier(new Uint8Array(
            bytecode.match(/.{2}/g)!.map(b => parseInt(b, 16))
        ));
        const maps = fi.identify();
        expect(maps).toEqual([]);
    });

    test('getBody returns null for unknown selector', () => {
        const bytecode = '0x600160020100';
        const fi = new FunctionIdentifier(new Uint8Array(
            bytecode.match(/.{2}/g)!.map(b => parseInt(b, 16))
        ));
        expect(fi.getBody('0x12345678')).toBeNull();
    });

    test('getFunction returns null for unknown selector', () => {
        const bytecode = '0x600160020100';
        const fi = new FunctionIdentifier(new Uint8Array(
            bytecode.match(/.{2}/g)!.map(b => parseInt(b, 16))
        ));
        expect(fi.getFunction('0x12345678')).toBeNull();
    });

    test('findInternalFunctions returns empty for simple bytecode', () => {
        const bytecode = '0x600160020100';
        const fi = new FunctionIdentifier(new Uint8Array(
            bytecode.match(/.{2}/g)!.map(b => parseInt(b, 16))
        ));
        const internals = fi.findInternalFunctions();
        expect(internals.length).toBe(0);
    });

    test('caches identify() results', () => {
        const bytecode = '0x608060405234801561001057600080fd5b50600436106100415760003560e01c806306fdde0314610046578063095ea7b31461006457806318160ddd14610084575b600080fd5b';
        const fi = new FunctionIdentifier(new Uint8Array(
            bytecode.match(/.{2}/g)!.map(b => parseInt(b, 16))
        ));
        const first = fi.identify();
        const second = fi.identify();
        expect(first).toStrictEqual(second);
    });

    test('diff detects added functions', () => {
        const bytecode1 = '0x600160020100';
        const bytecode2 = '0x608060405234801561001057600080fd5b50600436106100415760003560e01c806306fdde0314610046578063095ea7b31461006457806318160ddd14610084575b600080fd5b';
        const fi1 = new FunctionIdentifier(new Uint8Array(
            bytecode1.match(/.{2}/g)!.map(b => parseInt(b, 16))
        ));
        const fi2 = new FunctionIdentifier(new Uint8Array(
            bytecode2.match(/.{2}/g)!.map(b => parseInt(b, 16))
        ));
        const diffs = fi1.diff(fi2);
        expect(diffs.length).toBeGreaterThan(0);
    });

    test('diff returns empty for identical bytecode', () => {
        const bytecode = '0x608060405234801561001057600080fd5b50600436106100415760003560e01c806306fdde0314610046578063095ea7b31461006457806318160ddd14610084575b600080fd5b';
        const bytes = new Uint8Array(
            bytecode.match(/.{2}/g)!.map(b => parseInt(b, 16))
        );
        const fi1 = new FunctionIdentifier(bytes);
        const fi2 = new FunctionIdentifier(bytes);
        const diffs = fi1.diff(fi2);
        expect(diffs).toEqual([]);
    });
});
