import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { disassemble } from '../../src/core/parser';

describe('Real contract bytecode', () => {
    test('can parse Uniswap V2 Router', () => {
        // Real bytecode from deployed Uniswap V2 Router
        const bytecode = readFileSync('./tests/fixtures/uniswap-v2-router.bin', 'utf-8');

        const result = disassemble(bytecode);

        expect(result.instructions.length).toBeGreaterThan(0);
        expect(result.warnings.length).toBeLessThan(50);
    });

    test('can parse simple ERC20 contract', () => {
        const bytecode = readFileSync('./tests/fixtures/erc20.bin', 'utf-8');

        const result = disassemble(bytecode);

        expect(result.instructions.length).toBeGreaterThan(0);
        // ERC20 contracts should have function dispatching
        expect(result.jumpDestinations.size).toBeGreaterThan(0);
    });
});
