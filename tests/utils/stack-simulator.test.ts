import { describe, expect, test } from 'vitest';
import { disassemble } from '../../src/core/parser';
import { StackSimulator } from '../../src/utils/stack-simulator';

describe('StackSimulator', () => {
    test('valid bytecode passes simulation', () => {
        const result = disassemble('0x6001600201');
        const sim = new StackSimulator();
        const simResult = sim.simulate(result.instructions);
        expect(simResult.success).toBe(true);
        expect(simResult.errors).toHaveLength(0);
    });

    test('detects stack underflow', () => {
        const result = disassemble('0x01');
        const sim = new StackSimulator();
        const simResult = sim.simulate(result.instructions);
        expect(simResult.success).toBe(false);
        expect(simResult.errors.length).toBeGreaterThan(0);
        expect(simResult.errors[0]!.kind).toBe('underflow');
    });

    test('tracks max depth correctly', () => {
        const result = disassemble('0x6001600260036004');
        const sim = new StackSimulator();
        const simResult = sim.simulate(result.instructions);
        expect(simResult.maxDepth).toBe(4);
    });

    test('tracks min depth correctly', () => {
        const result = disassemble('0x6001600201');
        const sim = new StackSimulator();
        const simResult = sim.simulate(result.instructions);
        expect(simResult.minDepth).toBeLessThanOrEqual(0);
    });

    test('depthAtPC maps all program counters', () => {
        const result = disassemble('0x6001600201');
        const sim = new StackSimulator();
        const simResult = sim.simulate(result.instructions);
        expect(simResult.depthAtPC.size).toBe(3);
    });

    test('validateDepth returns errors', () => {
        const result = disassemble('0x01');
        const sim = new StackSimulator();
        const errors = sim.validateDepth(result.instructions);
        expect(errors.length).toBeGreaterThan(0);
    });

    test('getStackProfile returns profile', () => {
        const result = disassemble('0x6001600201');
        const sim = new StackSimulator();
        const profile = sim.getStackProfile(result.instructions);
        expect(profile.maxDepth).toBe(2);
        expect(profile.depthMap.size).toBe(3);
    });

    test('halts on terminal opcode', () => {
        const result = disassemble('0x6001600201006003');
        const sim = new StackSimulator();
        const simResult = sim.simulate(result.instructions);
        expect(simResult.depthAtPC.size).toBe(4);
    });
});
