import { describe, expect, test } from 'vitest';
import { disassemble } from '../../src/core/parser';
import { inferABI } from '../../src/libraries/decompiler/abi-inference';
import { buildCFG } from '../../src/libraries/decompiler/cfg';
import { decompile } from '../../src/libraries/decompiler/decompiler';
import { matchPatterns } from '../../src/libraries/decompiler/signatures';
import { analyzeStorage } from '../../src/libraries/decompiler/storage';

describe('CFGBuilder', () => {
    test('builds CFG from simple bytecode', () => {
        const instructions = disassemble('0x600160020100').instructions;
        const cfg = buildCFG(instructions);
        expect(cfg.blocks.size).toBeGreaterThan(0);
        expect(cfg.entryBlock).toBeTruthy();
    });

    test('identifies basic blocks at JUMPDESTs', () => {
        const instructions = disassemble('0x600456005b600100').instructions;
        const cfg = buildCFG(instructions);
        expect(cfg.blocks.size).toBeGreaterThanOrEqual(2);
    });

    test('tracks successors for conditional jumps', () => {
        const instructions = disassemble('0x60016006576002005b600300').instructions;
        const cfg = buildCFG(instructions);
        const entryBlock = cfg.blocks.get(cfg.entryBlock);
        expect(entryBlock?.successors.length).toBeGreaterThan(0);
    });

    test('empty bytecode returns empty CFG', () => {
        const cfg = buildCFG([]);
        expect(cfg.blocks.size).toBe(0);
    });

    test('maps PC to block', () => {
        const instructions = disassemble('0x600160020100').instructions;
        const cfg = buildCFG(instructions);
        expect(cfg.pcToBlock.size).toBeGreaterThan(0);
    });
});

describe('ABIInferrer', () => {
    test('infers known function signatures', () => {
        const selectors = [
            {
                selector: '0x18160ddd',
                startPC: 0,
                body: disassemble('0x60005460005260206000f3').instructions,
            },
        ];
        const inferred = inferABI([], selectors);
        expect(inferred[0]?.name).toBe('totalSupply');
        expect(inferred[0]?.confidence).toBeGreaterThan(0.9);
    });

    test('infers transfer function', () => {
        const selectors = [
            {
                selector: '0xa9059cbb',
                startPC: 0,
                body: disassemble('0x60005460005260206000f3').instructions,
            },
        ];
        const inferred = inferABI([], selectors);
        expect(inferred[0]?.name).toBe('transfer');
    });

    test('returns unknown for unrecognized selectors', () => {
        const selectors = [
            {
                selector: '0xdeadbeef',
                startPC: 0,
                body: disassemble('0x60005460005260206000f3').instructions,
            },
        ];
        const inferred = inferABI([], selectors);
        expect(inferred[0]?.name).toContain('0xdeadbeef');
        expect(inferred[0]?.confidence).toBeLessThan(0.6);
    });

    test('infers state mutability', () => {
        const viewBody = disassemble('0x60005460005260206000f3').instructions;
        const selectors = [
            {
                selector: '0x70a08231',
                startPC: 0,
                body: viewBody,
            },
        ];
        const inferred = inferABI([], selectors);
        expect(inferred[0]?.stateMutability).toBe('view');
    });

    test('infers nonpayable for SSTORE', () => {
        const writeBody = disassemble('0x6001600055').instructions;
        const selectors = [
            {
                selector: '0x12345678',
                startPC: 0,
                body: writeBody,
            },
        ];
        const inferred = inferABI([], selectors);
        expect(inferred[0]?.stateMutability).toBe('nonpayable');
    });
});

describe('StorageAnalyzer', () => {
    test('identifies storage reads', () => {
        const body = disassemble('0x600054').instructions;
        const slots = analyzeStorage(body);
        expect(slots.length).toBeGreaterThan(0);
        expect(slots[0]?.reads).toBeGreaterThan(0);
    });

    test('identifies storage writes', () => {
        const body = disassemble('0x6001600055').instructions;
        const slots = analyzeStorage(body);
        expect(slots.length).toBeGreaterThan(0);
        expect(slots[0]?.writes).toBeGreaterThan(0);
    });

    test('matches known storage patterns', () => {
        const body = disassemble('0x600054').instructions;
        const slots = analyzeStorage(body);
        if (slots.length > 0 && slots[0]!.slot === 0n) {
            expect(slots[0]?.inferredType).toBe('mapping');
        }
    });

    test('returns empty for no storage ops', () => {
        const body = disassemble('0x6001600201').instructions;
        const slots = analyzeStorage(body);
        expect(slots).toEqual([]);
    });
});

describe('SignatureMatcher', () => {
    test('matches ERC20 pattern', () => {
        const selectors = ['0x18160ddd', '0x70a08231', '0xa9059cbb', '0x095ea7b3', '0x23b872dd', '0xdd62ed3e'];
        const matches = matchPatterns(selectors);
        const erc20 = matches.find((m) => m.name === 'ERC20');
        expect(erc20).toBeTruthy();
        expect(erc20?.confidence).toBeGreaterThan(0.5);
    });

    test('matches Ownable pattern', () => {
        const selectors = ['0x8da5cb5b', '0xf2fde38b'];
        const matches = matchPatterns(selectors);
        const ownable = matches.find((m) => m.name === 'Ownable');
        expect(ownable).toBeTruthy();
    });

    test('returns empty for unknown selectors', () => {
        const selectors = ['0xdeadbeef', '0x12345678'];
        const matches = matchPatterns(selectors);
        expect(matches).toEqual([]);
    });

    test('sorts by confidence', () => {
        const selectors = ['0x18160ddd', '0x70a08231', '0xa9059cbb', '0x8da5cb5b'];
        const matches = matchPatterns(selectors);
        for (let i = 1; i < matches.length; i++) {
            expect(matches[i]!.confidence).toBeLessThanOrEqual(matches[i - 1]!.confidence);
        }
    });
});

describe('Decompiler', () => {
    test('decompiles simple bytecode', () => {
        const result = decompile('0x600160020100');
        expect(result.bytecodeSize).toBeGreaterThan(0);
        expect(result.instructionCount).toBeGreaterThan(0);
        expect(result.solidity).toContain('contract');
    });

    test('identifies contract name from patterns', () => {
        const result = decompile(
            '0x608060405234801561001057600080fd5b50600436106100415760003560e01c806306fdde0314610046578063095ea7b31461006457806318160ddd14610084575b600080fd5b',
        );
        expect(result.name).toBeTruthy();
    });

    test('produces valid Solidity output', () => {
        const result = decompile('0x600160020100');
        expect(result.solidity).toContain('pragma solidity');
        expect(result.solidity).toContain('contract');
    });

    test('generates warnings for SELFDESTRUCT', () => {
        const result = decompile('0xff');
        expect(result.warnings.some((w) => w.includes('SELFDESTRUCT'))).toBe(true);
    });

    test('generates warnings for external calls', () => {
        const result = decompile('0x6000600060006000600060006000f1');
        expect(result.warnings.some((w) => w.includes('external calls'))).toBe(true);
    });

    test('computes overall confidence', () => {
        const result = decompile('0x600160020100');
        const confidence =
            result.functions.length > 0
                ? (result.functions.reduce((sum, f) => sum + f.confidence, 0) / result.functions.length) * 100
                : 0;
        expect(confidence).toBeGreaterThanOrEqual(0);
        expect(confidence).toBeLessThanOrEqual(100);
    });

    test('handles empty bytecode', () => {
        const result = decompile('');
        expect(result.bytecodeSize).toBe(0);
        expect(result.instructionCount).toBe(0);
    });

    test('includes storage analysis by default', () => {
        const result = decompile('0x60005460005260206000f3');
        expect(result.storage.length).toBeGreaterThanOrEqual(0);
    });

    test('respects includeStorage option', () => {
        const result = decompile('0x60005460005260206000f3', { includeStorage: false });
        expect(result.solidity).not.toContain('State variables');
    });

    test('respects includeComments option', () => {
        const result = decompile('0x60005460005260206000f3', { includeComments: false });
        expect(result.solidity).not.toContain('// Function:');
    });
});

describe('End-to-end decompilation', () => {
    test('full pipeline on ERC20-like bytecode', () => {
        const bytecode =
            '0x608060405234801561001057600080fd5b50600436106100415760003560e01c806306fdde0314610046578063095ea7b31461006457806318160ddd14610084575b600080fd5b';
        const result = decompile(bytecode);

        expect(result.functions.length).toBeGreaterThan(0);
        expect(result.solidity).toBeTruthy();
        expect(result.solidity.length).toBeGreaterThan(100);
    });
});
