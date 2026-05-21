import { describe, expect, test } from 'vitest';
import { disassemble } from '../../src/core/parser';
import { GasCalculator } from '../../src/utils/gas-calculator';

describe('GasCalculator', () => {
    test('analyzes simple bytecode', () => {
        const result = disassemble('0x6001600201');
        const gc = new GasCalculator();
        const report = gc.analyze(result.instructions);
        expect(report.totalGas).toBeGreaterThan(0);
        expect(report.instructionCount).toBe(3);
    });

    test('categorizes opcodes correctly', () => {
        const result = disassemble('0x6001600201');
        const gc = new GasCalculator();
        const report = gc.analyze(result.instructions);
        expect(report.byCategory.has('stack')).toBe(true);
        expect(report.byCategory.has('arithmetic')).toBe(true);
    });

    test('finds hotspots', () => {
        const bytecode = `0x${'54'.repeat(20)}`;
        const result = disassemble(bytecode);
        const gc = new GasCalculator();
        const hotspots = gc.hotspots(result.instructions, 3, 5);
        expect(hotspots.length).toBe(3);
        expect(hotspots[0]!.gas).toBeGreaterThan(0);
    });

    test('estimates function gas', () => {
        const result = disassemble('0x6001600201');
        const gc = new GasCalculator();
        const estimate = gc.estimateFunction(result.instructions, '0x12345678', 'test');
        expect(estimate.totalGas).toBeGreaterThan(0);
        expect(estimate.selector).toBe('0x12345678');
        expect(estimate.name).toBe('test');
    });

    test('handles empty instructions', () => {
        const gc = new GasCalculator();
        const hotspots = gc.hotspots([], 5, 10);
        expect(hotspots).toEqual([]);
    });

    test('SLOAD has higher gas than ADD', () => {
        const gc = new GasCalculator();
        const sloadReport = gc.analyze(disassemble('0x600054').instructions);
        const addReport = gc.analyze(disassemble('0x6001600201').instructions);
        expect(sloadReport.totalGas).toBeGreaterThan(addReport.totalGas);
    });
});
