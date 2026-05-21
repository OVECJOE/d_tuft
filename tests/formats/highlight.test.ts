import { describe, test, expect } from 'vitest';
import { highlightSolidity, highlightSolidityLine } from '../../src/formats/highlight';

describe('Solidity Syntax Highlighter', () => {
    test('highlights keywords', () => {
        const result = highlightSolidityLine('function transfer() external returns (bool)');
        expect(result).toContain('function');
        expect(result).toContain('external');
        expect(result).toContain('returns');
    });

    test('highlights types', () => {
        const result = highlightSolidityLine('uint256 balance');
        expect(result).toContain('uint256');
    });

    test('highlights comments', () => {
        const result = highlightSolidityLine('// This is a comment');
        expect(result).toContain('// This is a comment');
    });

    test('highlights string literals', () => {
        const result = highlightSolidityLine('string memory name = "hello"');
        expect(result).toContain('"hello"');
    });

    test('highlights hex selectors', () => {
        const result = highlightSolidityLine('0xa9059cbb');
        expect(result).toContain('0xa9059cbb');
    });

    test('highlights numbers', () => {
        const result = highlightSolidityLine('uint256 amount = 100');
        expect(result).toContain('100');
    });

    test('highlights full contract', () => {
        const code = `pragma solidity ^0.8.0;

contract Token {
    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }
}`;
        const result = highlightSolidity(code);
        expect(result).toContain('pragma');
        expect(result).toContain('contract');
        expect(result).toContain('function');
        expect(result).toContain('uint256');
        expect(result).toContain('external');
        expect(result).toContain('view');
        expect(result).toContain('returns');
    });

    test('handles empty lines', () => {
        const result = highlightSolidity('');
        expect(result).toBe('');
    });

    test('handles multiline code', () => {
        const code = 'function foo()\n    external\n    returns (uint256)';
        const result = highlightSolidity(code);
        expect(result.split('\n').length).toBe(3);
    });
});
