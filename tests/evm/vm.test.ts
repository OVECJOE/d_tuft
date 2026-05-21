import { describe, expect, test } from 'vitest';
import { EvmMemory } from '../../src/libraries/evm/memory';
import { EvmStorage } from '../../src/libraries/evm/storage';
import { Evm } from '../../src/libraries/evm/vm';

describe('EvmMemory', () => {
    test('starts empty with zero active size', () => {
        const mem = new EvmMemory();
        expect(mem.activeSize).toBe(0);
    });

    test('stores and loads 32-byte words', () => {
        const mem = new EvmMemory();
        mem.store(0, 0xdeadbeefn);
        expect(mem.load(0)).toBe(0xdeadbeefn);
    });

    test('expands memory on store', () => {
        const mem = new EvmMemory();
        mem.store(64, 1n);
        expect(mem.activeSize).toBe(96);
    });

    test('does not shrink on smaller writes', () => {
        const mem = new EvmMemory();
        mem.store(96, 1n);
        mem.store(0, 2n);
        expect(mem.activeSize).toBe(128);
    });

    test('loadBytes returns correct bytes', () => {
        const mem = new EvmMemory();
        mem.store(0, 0x01020304n);
        const bytes = mem.loadBytes(28, 4);
        expect(bytes).toEqual(new Uint8Array([1, 2, 3, 4]));
    });

    test('memory expansion gas cost increases quadratically', () => {
        const mem = new EvmMemory();
        mem.expand(32);
        const cost1 = mem.expand(32 * 32);
        const cost2 = mem.expand(32 * 64);
        expect(cost2).toBeGreaterThan(cost1);
    });
});

describe('EvmStorage', () => {
    test('returns zero for unset slots', () => {
        const storage = new EvmStorage();
        const { value, cold } = storage.get(1n);
        expect(value).toBe(0n);
        expect(cold).toBe(true);
    });

    test('stores and retrieves values', () => {
        const storage = new EvmStorage();
        storage.set(1n, 42n);
        const { value } = storage.get(1n);
        expect(value).toBe(42n);
    });

    test('first access is cold, subsequent is warm', () => {
        const storage = new EvmStorage();
        const first = storage.get(1n);
        expect(first.cold).toBe(true);
        const second = storage.get(1n);
        expect(second.cold).toBe(false);
    });

    test('warmSlot marks slot as warm', () => {
        const storage = new EvmStorage();
        storage.warmSlot(1n);
        const { cold } = storage.get(1n);
        expect(cold).toBe(false);
    });

    test('dump returns all stored values', () => {
        const storage = new EvmStorage();
        storage.set(1n, 100n);
        storage.set(2n, 200n);
        const dump = storage.dump();
        expect(dump.size).toBe(2);
    });

    test('clear resets all state', () => {
        const storage = new EvmStorage();
        storage.set(1n, 100n);
        storage.clear();
        const { value } = storage.get(1n);
        expect(value).toBe(0n);
    });
});

describe('EVM execution', () => {
    test('PUSH1 PUSH1 ADD', () => {
        const evm = new Evm('0x6001600201');
        const result = evm.run();
        expect(result.success).toBe(true);
        expect(result.trace.length).toBe(3);
    });

    test('PUSH0 pushes zero', () => {
        const evm = new Evm('0x5f');
        const result = evm.run();
        expect(result.success).toBe(true);
        expect(result.trace[0]?.stackAfter).toEqual([0n]);
    });

    test('STOP halts successfully', () => {
        const evm = new Evm('0x600160020100');
        const result = evm.run();
        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
    });

    test('MSTORE and MLOAD round-trip', () => {
        const evm = new Evm('0x6042600052600051');
        const result = evm.run();
        expect(result.success).toBe(true);
        expect(result.trace[result.trace.length - 1]?.stackAfter).toEqual([0x42n]);
    });

    test('KECCAK256 computes hash', () => {
        const evm = new Evm('0x6020600020');
        const result = evm.run();
        expect(result.success).toBe(true);
        expect(result.trace[result.trace.length - 1]?.stackAfter.length).toBe(1);
    });

    test('SSTORE and SLOAD round-trip', () => {
        const evm = new Evm('0x6042600055600054');
        const result = evm.run();
        expect(result.success).toBe(true);
        expect(result.trace[result.trace.length - 1]?.stackAfter).toEqual([0x42n]);
    });

    test('JUMP to valid JUMPDEST', () => {
        const evm = new Evm('0x600456005b6001');
        const result = evm.run();
        expect(result.success).toBe(true);
    });

    test('JUMPI taken when condition is non-zero', () => {
        const evm = new Evm('0x60016006576002005b6003');
        const result = evm.run();
        expect(result.success).toBe(true);
    });

    test('JUMPI not taken when condition is zero', () => {
        const evm = new Evm('0x60006006576002005b6003');
        const result = evm.run();
        expect(result.success).toBe(true);
    });

    test('DUP1 duplicates top of stack', () => {
        const evm = new Evm('0x604280');
        const result = evm.run();
        expect(result.success).toBe(true);
        const last = result.trace[result.trace.length - 1];
        expect(last?.stackAfter).toEqual([0x42n, 0x42n]);
    });

    test('SWAP1 exchanges top two stack items', () => {
        const evm = new Evm('0x6001600290');
        const result = evm.run();
        expect(result.success).toBe(true);
        const last = result.trace[result.trace.length - 1];
        expect(last?.stackAfter).toEqual([0x02n, 0x01n]);
    });

    test('POP removes top of stack', () => {
        const evm = new Evm('0x6001600250');
        const result = evm.run();
        expect(result.success).toBe(true);
        const last = result.trace[result.trace.length - 1];
        expect(last?.stackAfter).toEqual([0x01n]);
    });

    test('CALLER returns caller address', () => {
        const evm = new Evm('0x33');
        const result = evm.run();
        expect(result.success).toBe(true);
        expect(result.trace[0]?.stackAfter.length).toBe(1);
    });

    test('CALLDATASIZE returns calldata length', () => {
        const evm = new Evm('0x36', {
            call: { calldata: new Uint8Array([0x01, 0x02, 0x03]) },
        });
        const result = evm.run();
        expect(result.success).toBe(true);
        expect(result.trace[0]?.stackAfter).toEqual([3n]);
    });

    test('CODESIZE returns code length', () => {
        const bytecode = new Uint8Array([0x38, 0x00]);
        const evm = new Evm(bytecode);
        const result = evm.run();
        expect(result.success).toBe(true);
        expect(result.trace[0]?.stackAfter).toEqual([2n]);
    });

    test('LOG0 creates a log entry', () => {
        const evm = new Evm('0x600160005260016000a0');
        const result = evm.run();
        expect(result.success).toBe(true);
        expect(result.logs.length).toBe(1);
        expect(result.logs[0]?.topics).toEqual([]);
    });

    test('REVERT sets error and return data', () => {
        const evm = new Evm('0x60016000fd');
        const result = evm.run();
        expect(result.success).toBe(false);
        expect(result.error).toBe('REVERT');
        expect(result.returnValue.length).toBe(1);
    });

    test('INVALID halts with error', () => {
        const evm = new Evm('0xfe');
        const result = evm.run();
        expect(result.success).toBe(false);
        expect(result.error).toBe('INVALID');
    });

    test('arithmetic: SUB', () => {
        const evm = new Evm('0x6005600303');
        const result = evm.run();
        expect(result.success).toBe(true);
        const last = result.trace[result.trace.length - 1];
        expect(last?.stackAfter).toEqual([2n]);
    });

    test('arithmetic: MUL', () => {
        const evm = new Evm('0x6006600702');
        const result = evm.run();
        expect(result.success).toBe(true);
        const last = result.trace[result.trace.length - 1];
        expect(last?.stackAfter).toEqual([42n]);
    });

    test('comparison: LT', () => {
        const evm = new Evm('0x6005600310');
        const result = evm.run();
        expect(result.success).toBe(true);
        const last = result.trace[result.trace.length - 1];
        expect(last?.stackAfter).toEqual([0n]);
    });

    test('comparison: GT', () => {
        const evm = new Evm('0x6005600311');
        const result = evm.run();
        expect(result.success).toBe(true);
        const last = result.trace[result.trace.length - 1];
        expect(last?.stackAfter).toEqual([1n]);
    });

    test('bitwise: AND', () => {
        const evm = new Evm('0x60ff60f016');
        const result = evm.run();
        expect(result.success).toBe(true);
        const last = result.trace[result.trace.length - 1];
        expect(last?.stackAfter).toEqual([0xf0n]);
    });

    test('bitwise: XOR', () => {
        const evm = new Evm('0x60ff60f018');
        const result = evm.run();
        expect(result.success).toBe(true);
        const last = result.trace[result.trace.length - 1];
        expect(last?.stackAfter).toEqual([0x0fn]);
    });

    test('ISZERO', () => {
        const evm = new Evm('0x600015');
        const result = evm.run();
        expect(result.success).toBe(true);
        const last = result.trace[result.trace.length - 1];
        expect(last?.stackAfter).toEqual([1n]);
    });

    test('block info: TIMESTAMP', () => {
        const evm = new Evm('0x42');
        const result = evm.run();
        expect(result.success).toBe(true);
        expect(result.trace[0]?.stackAfter.length).toBe(1);
    });

    test('block info: NUMBER', () => {
        const evm = new Evm('0x43');
        const result = evm.run();
        expect(result.success).toBe(true);
        expect(result.trace[0]?.stackAfter).toEqual([1n]);
    });

    test('block info: CHAINID', () => {
        const evm = new Evm('0x46');
        const result = evm.run();
        expect(result.success).toBe(true);
        expect(result.trace[0]?.stackAfter).toEqual([1n]);
    });

    test('PUSH32 handles full 32 bytes', () => {
        const imm = 'ff'.repeat(32);
        const evm = new Evm(`0x7f${imm}`);
        const result = evm.run();
        expect(result.success).toBe(true);
        expect(result.trace[0]?.stackAfter.length).toBe(1);
    });

    test('gas tracking decreases', () => {
        const evm = new Evm('0x6001600201');
        const result = evm.run();
        expect(result.gasUsed).toBeGreaterThan(0n);
        expect(result.gasRemaining).toBeLessThan(30_000_000n);
    });

    test('trace records per-instruction state', () => {
        const evm = new Evm('0x6001600201');
        const result = evm.run();
        expect(result.trace.length).toBe(3);
        expect(result.trace[0]?.opcode).toBe('PUSH1');
        expect(result.trace[1]?.opcode).toBe('PUSH1');
        expect(result.trace[2]?.opcode).toBe('ADD');
    });

    test('step() executes one instruction at a time', () => {
        const evm = new Evm('0x6001600201');
        expect(evm.step()).toBe(true);
        expect(evm.step()).toBe(true);
        expect(evm.step()).toBe(true);
        expect(evm.step()).toBe(false);
    });

    test('storage state is accessible after execution', () => {
        const evm = new Evm('0x6042600055');
        evm.run();
        const state = evm.storageState;
        expect(state.size).toBe(1);
    });

    test('memory dump returns hex string', () => {
        const evm = new Evm('0x6042600052');
        evm.run();
        const dump = evm.memoryDump;
        expect(dump).toMatch(/^0x[0-9a-f]+$/);
    });
});

describe('EVM edge cases', () => {
    test('empty bytecode halts immediately', () => {
        const evm = new Evm('');
        const result = evm.run();
        expect(result.success).toBe(true);
        expect(result.trace).toHaveLength(0);
    });

    test('PC out of range halts cleanly', () => {
        const evm = new Evm('0x600556');
        const result = evm.run();
        expect(result.success).toBe(true);
    });

    test('256-bit overflow wraps', () => {
        const maxUint256 = (1n << 256n) - 1n;
        const evm = new Evm('0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff600101');
        const result = evm.run();
        expect(result.success).toBe(true);
        const last = result.trace[result.trace.length - 1];
        expect(last?.stackAfter).toEqual([0n]);
    });
});
