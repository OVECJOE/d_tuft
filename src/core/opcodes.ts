import type { Opcode, OpcodeValue } from './types';

/**
 * Complete EVM opcode definitions
 * Based on: https://ethereum.org/en/developers/docs/evm/opcodes/
 */
export const OPCODES: Record<OpcodeValue, Opcode> = {
    // 0x00: Stop and Arithmetic Operations
    0: {
        value: 0x00,
        mnemonic: 'STOP',
        inputs: 0,
        outputs: 0,
        gas: 0,
        description: 'Halt execution',
        halts: true,
    },
    1: {
        value: 0x01,
        mnemonic: 'ADD',
        inputs: 2,
        outputs: 1,
        gas: 3,
        description: 'Addition operation',
    },
    2: {
        value: 0x02,
        mnemonic: 'MUL',
        inputs: 2,
        outputs: 1,
        gas: 5,
        description: 'Multiplication operation',
    },
    3: {
        value: 0x03,
        mnemonic: 'SUB',
        inputs: 2,
        outputs: 1,
        gas: 3,
        description: 'Subtraction operation',
    },
    4: {
        value: 0x04,
        mnemonic: 'DIV',
        inputs: 2,
        outputs: 1,
        gas: 5,
        description: 'Integer division operation',
    },
    5: {
        value: 0x05,
        mnemonic: 'SDIV',
        inputs: 2,
        outputs: 1,
        gas: 5,
        description: 'Signed integer division operation',
    },
    6: {
        value: 0x06,
        mnemonic: 'MOD',
        inputs: 2,
        outputs: 1,
        gas: 5,
        description: 'Modulo remainder operation',
    },
    7: {
        value: 0x07,
        mnemonic: 'SMOD',
        inputs: 2,
        outputs: 1,
        gas: 5,
        description: 'Signed modulo remainder operation',
    },
    8: {
        value: 0x08,
        mnemonic: 'ADDMOD',
        inputs: 3,
        outputs: 1,
        gas: 8,
        description: 'Modulo addition operation',
    },
    9: {
        value: 0x09,
        mnemonic: 'MULMOD',
        inputs: 3,
        outputs: 1,
        gas: 8,
        description: 'Modulo multiplication operation',
    },
    10: {
        value: 0x0a,
        mnemonic: 'EXP',
        inputs: 2,
        outputs: 1,
        gas: 10,
        description: 'Exponential operation',
    },
    11: {
        value: 0x0b,
        mnemonic: 'SIGNEXTEND',
        inputs: 2,
        outputs: 1,
        gas: 5,
        description: "Extend length of two's complement signed integer",
    },

    // 0x10: Comparison & Bitwise Logic Operations
    16: {
        value: 0x10,
        mnemonic: 'LT',
        inputs: 2,
        outputs: 1,
        gas: 3,
        description: 'Less-than comparison',
    },
    17: {
        value: 0x11,
        mnemonic: 'GT',
        inputs: 2,
        outputs: 1,
        gas: 3,
        description: 'Greater-than comparison',
    },
    18: {
        value: 0x12,
        mnemonic: 'SLT',
        inputs: 2,
        outputs: 1,
        gas: 3,
        description: 'Signed less-than comparison',
    },
    19: {
        value: 0x13,
        mnemonic: 'SGT',
        inputs: 2,
        outputs: 1,
        gas: 3,
        description: 'Signed greater-than comparison',
    },
    20: {
        value: 0x14,
        mnemonic: 'EQ',
        inputs: 2,
        outputs: 1,
        gas: 3,
        description: 'Equality comparison',
    },
    21: {
        value: 0x15,
        mnemonic: 'ISZERO',
        inputs: 1,
        outputs: 1,
        gas: 3,
        description: 'Simple not operator',
    },
    22: {
        value: 0x16,
        mnemonic: 'AND',
        inputs: 2,
        outputs: 1,
        gas: 3,
        description: 'Bitwise AND operation',
    },
    23: {
        value: 0x17,
        mnemonic: 'OR',
        inputs: 2,
        outputs: 1,
        gas: 3,
        description: 'Bitwise OR operation',
    },
    24: {
        value: 0x18,
        mnemonic: 'XOR',
        inputs: 2,
        outputs: 1,
        gas: 3,
        description: 'Bitwise XOR operation',
    },
    25: {
        value: 0x19,
        mnemonic: 'NOT',
        inputs: 1,
        outputs: 1,
        gas: 3,
        description: 'Bitwise NOT operation',
    },
    26: {
        value: 0x1a,
        mnemonic: 'BYTE',
        inputs: 2,
        outputs: 1,
        gas: 3,
        description: 'Retrieve single byte from word',
    },
    27: {
        value: 0x1b,
        mnemonic: 'SHL',
        inputs: 2,
        outputs: 1,
        gas: 3,
        description: 'Shift left operation',
    },
    28: {
        value: 0x1c,
        mnemonic: 'SHR',
        inputs: 2,
        outputs: 1,
        gas: 3,
        description: 'Logical shift right operation',
    },
    29: {
        value: 0x1d,
        mnemonic: 'SAR',
        inputs: 2,
        outputs: 1,
        gas: 3,
        description: 'Arithmetic shift right operation',
    },
    30: {
        value: 0x1e,
        mnemonic: 'CLZ',
        inputs: 1,
        outputs: 1,
        gas: 5,
        description: 'Count leading zero bits in a 256-bit word',
    },

    // 0x20: KECCAK256
    32: {
        value: 0x20,
        mnemonic: 'KECCAK256',
        inputs: 2,
        outputs: 1,
        gas: 30,
        description: 'Compute Keccak-256 hash',
    },

    // 0x30: Environmental Information
    48: {
        value: 0x30,
        mnemonic: 'ADDRESS',
        inputs: 0,
        outputs: 1,
        gas: 2,
        description: 'Get address of currently executing account',
    },
    49: {
        value: 0x31,
        mnemonic: 'BALANCE',
        inputs: 1,
        outputs: 1,
        gas: 100,
        description: 'Get balance of the given account',
    },
    50: {
        value: 0x32,
        mnemonic: 'ORIGIN',
        inputs: 0,
        outputs: 1,
        gas: 2,
        description: 'Get execution origination address',
    },
    51: {
        value: 0x33,
        mnemonic: 'CALLER',
        inputs: 0,
        outputs: 1,
        gas: 2,
        description: 'Get caller address',
    },
    52: {
        value: 0x34,
        mnemonic: 'CALLVALUE',
        inputs: 0,
        outputs: 1,
        gas: 2,
        description: 'Get deposited value by the instruction/transaction',
    },
    53: {
        value: 0x35,
        mnemonic: 'CALLDATALOAD',
        inputs: 1,
        outputs: 1,
        gas: 3,
        description: 'Get input data of current environment',
    },
    54: {
        value: 0x36,
        mnemonic: 'CALLDATASIZE',
        inputs: 0,
        outputs: 1,
        gas: 2,
        description: 'Get size of input data',
    },
    55: {
        value: 0x37,
        mnemonic: 'CALLDATACOPY',
        inputs: 3,
        outputs: 0,
        gas: 3,
        description: 'Copy input data to memory',
    },
    56: {
        value: 0x38,
        mnemonic: 'CODESIZE',
        inputs: 0,
        outputs: 1,
        gas: 2,
        description: 'Get size of code running in current environment',
    },
    57: {
        value: 0x39,
        mnemonic: 'CODECOPY',
        inputs: 3,
        outputs: 0,
        gas: 3,
        description: 'Copy code running in current environment to memory',
    },
    58: {
        value: 0x3a,
        mnemonic: 'GASPRICE',
        inputs: 0,
        outputs: 1,
        gas: 2,
        description: 'Get price of gas in current environment',
    },
    59: {
        value: 0x3b,
        mnemonic: 'EXTCODESIZE',
        inputs: 1,
        outputs: 1,
        gas: 100,
        description: "Get size of an account's code",
    },
    60: {
        value: 0x3c,
        mnemonic: 'EXTCODECOPY',
        inputs: 4,
        outputs: 0,
        gas: 100,
        description: "Copy an account's code to memory",
    },
    61: {
        value: 0x3d,
        mnemonic: 'RETURNDATASIZE',
        inputs: 0,
        outputs: 1,
        gas: 2,
        description: 'Get size of output data from previous call',
    },
    62: {
        value: 0x3e,
        mnemonic: 'RETURNDATACOPY',
        inputs: 3,
        outputs: 0,
        gas: 3,
        description: 'Copy output data from previous call to memory',
    },
    63: {
        value: 0x3f,
        mnemonic: 'EXTCODEHASH',
        inputs: 1,
        outputs: 1,
        gas: 100,
        description: "Get hash of an account's code",
    },

    // 0x40: Block Information
    64: {
        value: 0x40,
        mnemonic: 'BLOCKHASH',
        inputs: 1,
        outputs: 1,
        gas: 20,
        description: 'Get the hash of one of the 256 most recent complete blocks',
    },
    65: {
        value: 0x41,
        mnemonic: 'COINBASE',
        inputs: 0,
        outputs: 1,
        gas: 2,
        description: "Get the block's beneficiary address",
    },
    66: {
        value: 0x42,
        mnemonic: 'TIMESTAMP',
        inputs: 0,
        outputs: 1,
        gas: 2,
        description: "Get the block's timestamp",
    },
    67: {
        value: 0x43,
        mnemonic: 'NUMBER',
        inputs: 0,
        outputs: 1,
        gas: 2,
        description: "Get the block's number",
    },
    68: {
        value: 0x44,
        mnemonic: 'PREVRANDAO',
        inputs: 0,
        outputs: 1,
        gas: 2,
        description: "Get the block's difficulty (pre-merge) or PREVRANDAO (post-merge)",
    },
    69: {
        value: 0x45,
        mnemonic: 'GASLIMIT',
        inputs: 0,
        outputs: 1,
        gas: 2,
        description: "Get the block's gas limit",
    },
    70: {
        value: 0x46,
        mnemonic: 'CHAINID',
        inputs: 0,
        outputs: 1,
        gas: 2,
        description: 'Get the chain ID',
    },
    71: {
        value: 0x47,
        mnemonic: 'SELFBALANCE',
        inputs: 0,
        outputs: 1,
        gas: 5,
        description: 'Get balance of currently executing account',
    },
    72: {
        value: 0x48,
        mnemonic: 'BASEFEE',
        inputs: 0,
        outputs: 1,
        gas: 2,
        description: 'Get the base fee',
    },
    73: {
        value: 0x49,
        mnemonic: 'BLOBHASH',
        inputs: 1,
        outputs: 1,
        gas: 3,
        description: "Get transaction's blob versioned hash at index",
    },
    74: {
        value: 0x4a,
        mnemonic: 'BLOBBASEFEE',
        inputs: 0,
        outputs: 1,
        gas: 2,
        description: "Get current block's blob base fee",
    },

    // 0x50: Stack, Memory, Storage and Flow Operations
    80: {
        value: 0x50,
        mnemonic: 'POP',
        inputs: 1,
        outputs: 0,
        gas: 2,
        description: 'Remove item from stack',
    },
    81: {
        value: 0x51,
        mnemonic: 'MLOAD',
        inputs: 1,
        outputs: 1,
        gas: 3,
        description: 'Load word from memory',
    },
    82: {
        value: 0x52,
        mnemonic: 'MSTORE',
        inputs: 2,
        outputs: 0,
        gas: 3,
        description: 'Save word to memory',
    },
    83: {
        value: 0x53,
        mnemonic: 'MSTORE8',
        inputs: 2,
        outputs: 0,
        gas: 3,
        description: 'Save byte to memory',
    },
    84: {
        value: 0x54,
        mnemonic: 'SLOAD',
        inputs: 1,
        outputs: 1,
        gas: 100,
        description: 'Load word from storage',
    },
    85: {
        value: 0x55,
        mnemonic: 'SSTORE',
        inputs: 2,
        outputs: 0,
        gas: 100,
        description: 'Save word to storage',
    },
    86: {
        value: 0x56,
        mnemonic: 'JUMP',
        inputs: 1,
        outputs: 0,
        gas: 8,
        description: 'Alter the program counter',
    },
    87: {
        value: 0x57,
        mnemonic: 'JUMPI',
        inputs: 2,
        outputs: 0,
        gas: 10,
        description: 'Conditionally alter the program counter',
    },
    88: {
        value: 0x58,
        mnemonic: 'PC',
        inputs: 0,
        outputs: 1,
        gas: 2,
        description: 'Get the value of the program counter',
    },
    89: {
        value: 0x59,
        mnemonic: 'MSIZE',
        inputs: 0,
        outputs: 1,
        gas: 2,
        description: 'Get the size of active memory',
    },
    90: {
        value: 0x5a,
        mnemonic: 'GAS',
        inputs: 0,
        outputs: 1,
        gas: 2,
        description: 'Get the amount of available gas',
    },
    91: {
        value: 0x5b,
        mnemonic: 'JUMPDEST',
        inputs: 0,
        outputs: 0,
        gas: 1,
        description: 'Mark valid jump destination',
    },
    92: {
        value: 0x5c,
        mnemonic: 'TLOAD',
        inputs: 1,
        outputs: 1,
        gas: 100,
        description: 'Load word from transient storage',
    },
    93: {
        value: 0x5d,
        mnemonic: 'TSTORE',
        inputs: 2,
        outputs: 0,
        gas: 100,
        description: 'Save word to transient storage',
    },
    94: {
        value: 0x5e,
        mnemonic: 'MCOPY',
        inputs: 3,
        outputs: 0,
        gas: 3,
        description: 'Copy memory to memory',
    },
    // PUSH0 (EIP-3855) - Added explicitly before the loop for clarity
    95: {
        value: 0x5f,
        mnemonic: 'PUSH0',
        inputs: 0,
        outputs: 1,
        gas: 2,
        pushBytes: 0,
        description: 'Place 0 on stack',
    },
};

// Generate PUSH opcodes (PUSH1 - PUSH32: 0x60 - 0x7f)
// Note: PUSH0 (0x5f) is defined explicitly above
for (let i = 1; i <= 32; i++) {
    const value = (0x5f + i) as OpcodeValue;
    OPCODES[value] = {
        value,
        mnemonic: `PUSH${i}`,
        inputs: 0,
        outputs: 1,
        gas: 3,
        pushBytes: i,
        description: `Place ${i}-byte item on stack`,
    };
}

// Generate DUP opcodes (0x80 - 0x8f)
// DUP operations duplicate stack items without consuming them
// DUPn requires n items on stack, produces n+1 items (original n + 1 duplicate)
for (let i = 1; i <= 16; i++) {
    const value = (0x7f + i) as OpcodeValue;
    OPCODES[value] = {
        value,
        mnemonic: `DUP${i}`,
        inputs: i,
        outputs: i + 1,
        gas: 3,
        description: `Duplicate ${i}${i === 1 ? 'st' : i === 2 ? 'nd' : i === 3 ? 'rd' : 'th'} stack item`,
    };
}

// Generate SWAP opcodes (0x90 - 0x9f)
// SWAP operations exchange stack items without consuming or producing net items
// SWAPn exchanges positions but maintains stack depth
for (let i = 1; i <= 16; i++) {
    const value = (0x8f + i) as OpcodeValue;
    OPCODES[value] = {
        value,
        mnemonic: `SWAP${i}`,
        inputs: i + 1,
        outputs: i + 1,
        gas: 3,
        description: `Exchange 1st and ${i + 1}${i + 1 === 2 ? 'nd' : i + 1 === 3 ? 'rd' : 'th'} stack items`,
    };
}

// LOG opcodes (0xa0 - 0xa4)
for (let i = 0; i <= 4; i++) {
    const value = (0xa0 + i) as OpcodeValue;
    OPCODES[value] = {
        value,
        mnemonic: `LOG${i}`,
        inputs: 2 + i,
        outputs: 0,
        gas: 375,
        description: `Append log record with ${i} topics`,
    };
}

// System operations (0xf0 - 0xff)
const SYSTEM_OPCODES: Record<number, Opcode> = {
    240: {
        value: 0xf0,
        mnemonic: 'CREATE',
        inputs: 3,
        outputs: 1,
        gas: 32000,
        description: 'Create a new account with associated code',
    },
    241: {
        value: 0xf1,
        mnemonic: 'CALL',
        inputs: 7,
        outputs: 1,
        gas: 100,
        description: 'Message-call into an account',
    },
    242: {
        value: 0xf2,
        mnemonic: 'CALLCODE',
        inputs: 7,
        outputs: 1,
        gas: 100,
        description: "Message-call into this account with alternative account's code",
        deprecated: true,
    },
    243: {
        value: 0xf3,
        mnemonic: 'RETURN',
        inputs: 2,
        outputs: 0,
        gas: 0,
        description: 'Halt execution returning output data',
        halts: true,
    },
    244: {
        value: 0xf4,
        mnemonic: 'DELEGATECALL',
        inputs: 6,
        outputs: 1,
        gas: 100,
        description: "Message-call into this account with an alternative account's code",
    },
    245: {
        value: 0xf5,
        mnemonic: 'CREATE2',
        inputs: 4,
        outputs: 1,
        gas: 32000,
        description: 'Create a new account with associated code at a deterministic address',
    },
    250: {
        value: 0xfa,
        mnemonic: 'STATICCALL',
        inputs: 6,
        outputs: 1,
        gas: 100,
        description: 'Static message-call into an account',
    },
    253: {
        value: 0xfd,
        mnemonic: 'REVERT',
        inputs: 2,
        outputs: 0,
        gas: 0,
        description: 'Halt execution reverting state changes',
        halts: true,
    },
    254: {
        value: 0xfe,
        mnemonic: 'INVALID',
        inputs: 0,
        outputs: 0,
        gas: 0,
        description: 'Designated invalid instruction',
        halts: true,
    },
    255: {
        value: 0xff,
        mnemonic: 'SELFDESTRUCT',
        inputs: 1,
        outputs: 0,
        gas: 5000,
        description: 'Halt execution and register account for later deletion',
        halts: true,
    },
};

Object.assign(OPCODES, SYSTEM_OPCODES);

/**
 * Reverse mapping: mnemonic → opcode
 */
export const MNEMONIC_TO_OPCODE: Record<string, Opcode> = Object.values(OPCODES).reduce(
    (acc, opcode) => {
        acc[opcode.mnemonic] = opcode;
        return acc;
    },
    {} as Record<string, Opcode>,
);

/**
 * Special opcode for invalid/unknown bytes
 */
export const INVALID_OPCODE = OPCODES[0xfe] as Opcode;
