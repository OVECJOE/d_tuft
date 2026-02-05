export type OpcodeValue =
    | 0x00
    | 0x01
    | 0x02
    | 0x03
    | 0x04
    | 0x05
    | 0x06
    | 0x07
    | 0x08
    | 0x09
    | 0x0a
    | 0x0b
    | 0x10
    | 0x11
    | 0x12
    | 0x13
    | 0x14
    | 0x15
    | 0x16
    | 0x17
    | 0x18
    | 0x19
    | 0x1a
    | 0x1b
    | 0x1c
    | 0x1d
    | 0x1e
    | 0x20
    | 0x30
    | 0x31
    | 0x32
    | 0x33
    | 0x34
    | 0x35
    | 0x36
    | 0x37
    | 0x38
    | 0x39
    | 0x3a
    | 0x3b
    | 0x3c
    | 0x3d
    | 0x3e
    | 0x3f
    | 0x40
    | 0x41
    | 0x42
    | 0x43
    | 0x44
    | 0x45
    | 0x46
    | 0x47
    | 0x48
    | 0x49
    | 0x4a
    | 0x50
    | 0x51
    | 0x52
    | 0x53
    | 0x54
    | 0x55
    | 0x56
    | 0x57
    | 0x58
    | 0x59
    | 0x5a
    | 0x5b
    | 0x5c
    | 0x5d
    | 0x5e
    | 0x5f
    | 0x60
    | 0x61
    | 0x62
    | 0x63
    | 0x64
    | 0x65
    | 0x66
    | 0x67
    | 0x68
    | 0x69
    | 0x6a
    | 0x6b
    | 0x6c
    | 0x6d
    | 0x6e
    | 0x6f
    | 0x70
    | 0x71
    | 0x72
    | 0x73
    | 0x74
    | 0x75
    | 0x76
    | 0x77
    | 0x78
    | 0x79
    | 0x7a
    | 0x7b
    | 0x7c
    | 0x7d
    | 0x7e
    | 0x7f
    | 0x80
    | 0x81
    | 0x82
    | 0x83
    | 0x84
    | 0x85
    | 0x86
    | 0x87
    | 0x88
    | 0x89
    | 0x8a
    | 0x8b
    | 0x8c
    | 0x8d
    | 0x8e
    | 0x8f
    | 0x90
    | 0x91
    | 0x92
    | 0x93
    | 0x94
    | 0x95
    | 0x96
    | 0x97
    | 0x98
    | 0x99
    | 0x9a
    | 0x9b
    | 0x9c
    | 0x9d
    | 0x9e
    | 0x9f
    | 0xa0
    | 0xa1
    | 0xa2
    | 0xa3
    | 0xa4
    | 0xf0
    | 0xf1
    | 0xf2
    | 0xf3
    | 0xf4
    | 0xf5
    | 0xfa
    | 0xfd
    | 0xfe
    | 0xff;

export type Opcode = {
    value: OpcodeValue;
    mnemonic: string;
    inputs: number;
    outputs: number;
    gasBase: number;
    pushBytes?: number;
};

export const OPCODES: Record<OpcodeValue, Opcode> = {
    0x00: { value: 0x00, mnemonic: 'STOP', inputs: 0, outputs: 0, gasBase: 0 },
    0x01: { value: 0x01, mnemonic: 'ADD', inputs: 2, outputs: 1, gasBase: 3 },
    0x02: { value: 0x02, mnemonic: 'MUL', inputs: 2, outputs: 1, gasBase: 5 },
    0x03: { value: 0x03, mnemonic: 'SUB', inputs: 2, outputs: 1, gasBase: 3 },
    0x04: { value: 0x04, mnemonic: 'DIV', inputs: 2, outputs: 1, gasBase: 5 },
    0x05: { value: 0x05, mnemonic: 'SDIV', inputs: 2, outputs: 1, gasBase: 5 },
    0x06: { value: 0x06, mnemonic: 'MOD', inputs: 2, outputs: 1, gasBase: 5 },
    0x07: { value: 0x07, mnemonic: 'SMOD', inputs: 2, outputs: 1, gasBase: 5 },
    0x08: { value: 0x08, mnemonic: 'ADDMOD', inputs: 3, outputs: 1, gasBase: 8 },
    0x09: { value: 0x09, mnemonic: 'MULMOD', inputs: 3, outputs: 1, gasBase: 8 },
    0x0a: { value: 0x0a, mnemonic: 'EXP', inputs: 2, outputs: 1, gasBase: 10 },
    0x0b: { value: 0x0b, mnemonic: 'SIGNEXTEND', inputs: 2, outputs: 1, gasBase: 5 },
    0x10: { value: 0x10, mnemonic: 'LT', inputs: 2, outputs: 1, gasBase: 3 },
    0x11: { value: 0x11, mnemonic: 'GT', inputs: 2, outputs: 1, gasBase: 3 },
    0x12: { value: 0x12, mnemonic: 'SLT', inputs: 2, outputs: 1, gasBase: 3 },
    0x13: { value: 0x13, mnemonic: 'SGT', inputs: 2, outputs: 1, gasBase: 3 },
    0x14: { value: 0x14, mnemonic: 'EQ', inputs: 2, outputs: 1, gasBase: 3 },
    0x15: { value: 0x15, mnemonic: 'ISZERO', inputs: 1, outputs: 1, gasBase: 3 },
    0x16: { value: 0x16, mnemonic: 'AND', inputs: 2, outputs: 1, gasBase: 3 },
    0x17: { value: 0x17, mnemonic: 'OR', inputs: 2, outputs: 1, gasBase: 3 },
    0x18: { value: 0x18, mnemonic: 'XOR', inputs: 2, outputs: 1, gasBase: 3 },
    0x19: { value: 0x19, mnemonic: 'NOT', inputs: 1, outputs: 1, gasBase: 3 },
    0x1a: { value: 0x1a, mnemonic: 'BYTE', inputs: 2, outputs: 1, gasBase: 3 },
    0x1b: { value: 0x1b, mnemonic: 'SHL', inputs: 2, outputs: 1, gasBase: 3 },
    0x1c: { value: 0x1c, mnemonic: 'SHR', inputs: 2, outputs: 1, gasBase: 3 },
    0x1d: { value: 0x1d, mnemonic: 'SAR', inputs: 2, outputs: 1, gasBase: 3 },
    0x1e: { value: 0x1e, mnemonic: 'CLZ', inputs: 1, outputs: 1, gasBase: 5 },
    0x20: { value: 0x20, mnemonic: 'KECCAK256', inputs: 2, outputs: 1, gasBase: 30 },
    0x30: { value: 0x30, mnemonic: 'ADDRESS', inputs: 0, outputs: 1, gasBase: 2 },
    0x31: { value: 0x31, mnemonic: 'BALANCE', inputs: 1, outputs: 1, gasBase: 100 },
    0x32: { value: 0x32, mnemonic: 'ORIGIN', inputs: 0, outputs: 1, gasBase: 2 },
    0x33: { value: 0x33, mnemonic: 'CALLER', inputs: 0, outputs: 1, gasBase: 2 },
    0x34: { value: 0x34, mnemonic: 'CALLVALUE', inputs: 0, outputs: 1, gasBase: 2 },
    0x35: { value: 0x35, mnemonic: 'CALLDATALOAD', inputs: 1, outputs: 1, gasBase: 3 },
    0x36: { value: 0x36, mnemonic: 'CALLDATASIZE', inputs: 0, outputs: 1, gasBase: 2 },
    0x37: { value: 0x37, mnemonic: 'CALLDATACOPY', inputs: 3, outputs: 0, gasBase: 3 },
    0x38: { value: 0x38, mnemonic: 'CODESIZE', inputs: 0, outputs: 1, gasBase: 2 },
    0x39: { value: 0x39, mnemonic: 'CODECOPY', inputs: 3, outputs: 0, gasBase: 3 },
    0x3a: { value: 0x3a, mnemonic: 'GASPRICE', inputs: 0, outputs: 1, gasBase: 2 },
    0x3b: { value: 0x3b, mnemonic: 'EXTCODESIZE', inputs: 1, outputs: 1, gasBase: 100 },
    0x3c: { value: 0x3c, mnemonic: 'EXTCODECOPY', inputs: 4, outputs: 0, gasBase: 100 },
    0x3d: { value: 0x3d, mnemonic: 'RETURNDATASIZE', inputs: 0, outputs: 1, gasBase: 2 },
    0x3e: { value: 0x3e, mnemonic: 'RETURNDATACOPY', inputs: 3, outputs: 0, gasBase: 3 },
    0x3f: { value: 0x3f, mnemonic: 'EXTCODEHASH', inputs: 1, outputs: 1, gasBase: 100 },
    0x40: { value: 0x40, mnemonic: 'BLOCKHASH', inputs: 1, outputs: 1, gasBase: 20 },
    0x41: { value: 0x41, mnemonic: 'COINBASE', inputs: 0, outputs: 1, gasBase: 2 },
    0x42: { value: 0x42, mnemonic: 'TIMESTAMP', inputs: 0, outputs: 1, gasBase: 2 },
    0x43: { value: 0x43, mnemonic: 'NUMBER', inputs: 0, outputs: 1, gasBase: 2 },
    0x44: { value: 0x44, mnemonic: 'PREVRANDAO', inputs: 0, outputs: 1, gasBase: 2 },
    0x45: { value: 0x45, mnemonic: 'GASLIMIT', inputs: 0, outputs: 1, gasBase: 2 },
    0x46: { value: 0x46, mnemonic: 'CHAINID', inputs: 0, outputs: 1, gasBase: 2 },
    0x47: { value: 0x47, mnemonic: 'SELFBALANCE', inputs: 0, outputs: 1, gasBase: 5 },
    0x48: { value: 0x48, mnemonic: 'BASEFEE', inputs: 0, outputs: 1, gasBase: 2 },
    0x49: { value: 0x49, mnemonic: 'BLOBHASH', inputs: 1, outputs: 1, gasBase: 3 },
    0x4a: { value: 0x4a, mnemonic: 'BLOBBASEFEE', inputs: 0, outputs: 1, gasBase: 2 },
    0x50: { value: 0x50, mnemonic: 'POP', inputs: 1, outputs: 0, gasBase: 2 },
    0x51: { value: 0x51, mnemonic: 'MLOAD', inputs: 1, outputs: 1, gasBase: 3 },
    0x52: { value: 0x52, mnemonic: 'MSTORE', inputs: 2, outputs: 0, gasBase: 3 },
    0x53: { value: 0x53, mnemonic: 'MSTORE8', inputs: 2, outputs: 0, gasBase: 3 },
    0x54: { value: 0x54, mnemonic: 'SLOAD', inputs: 1, outputs: 1, gasBase: 100 },
    0x55: { value: 0x55, mnemonic: 'SSTORE', inputs: 2, outputs: 0, gasBase: 100 },
    0x56: { value: 0x56, mnemonic: 'JUMP', inputs: 1, outputs: 0, gasBase: 8 },
    0x57: { value: 0x57, mnemonic: 'JUMPI', inputs: 2, outputs: 0, gasBase: 10 },
    0x58: { value: 0x58, mnemonic: 'PC', inputs: 0, outputs: 1, gasBase: 2 },
    0x59: { value: 0x59, mnemonic: 'MSIZE', inputs: 0, outputs: 1, gasBase: 2 },
    0x5a: { value: 0x5a, mnemonic: 'GAS', inputs: 0, outputs: 1, gasBase: 2 },
    0x5b: { value: 0x5b, mnemonic: 'JUMPDEST', inputs: 0, outputs: 0, gasBase: 1 },
    0x5c: { value: 0x5c, mnemonic: 'TLOAD', inputs: 1, outputs: 1, gasBase: 100 },
    0x5d: { value: 0x5d, mnemonic: 'TSTORE', inputs: 2, outputs: 0, gasBase: 100 },
    0x5e: { value: 0x5e, mnemonic: 'MCOPY', inputs: 3, outputs: 0, gasBase: 3 },
    0x5f: { value: 0x5f, mnemonic: 'PUSH0', inputs: 0, outputs: 1, gasBase: 2 },
    0x60: { value: 0x60, mnemonic: 'PUSH1', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 1 },
    0x61: { value: 0x61, mnemonic: 'PUSH2', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 2 },
    0x62: { value: 0x62, mnemonic: 'PUSH3', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 3 },
    0x63: { value: 0x63, mnemonic: 'PUSH4', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 4 },
    0x64: { value: 0x64, mnemonic: 'PUSH5', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 5 },
    0x65: { value: 0x65, mnemonic: 'PUSH6', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 6 },
    0x66: { value: 0x66, mnemonic: 'PUSH7', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 7 },
    0x67: { value: 0x67, mnemonic: 'PUSH8', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 8 },
    0x68: { value: 0x68, mnemonic: 'PUSH9', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 9 },
    0x69: { value: 0x69, mnemonic: 'PUSH10', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 10 },
    0x6a: { value: 0x6a, mnemonic: 'PUSH11', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 11 },
    0x6b: { value: 0x6b, mnemonic: 'PUSH12', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 12 },
    0x6c: { value: 0x6c, mnemonic: 'PUSH13', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 13 },
    0x6d: { value: 0x6d, mnemonic: 'PUSH14', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 14 },
    0x6e: { value: 0x6e, mnemonic: 'PUSH15', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 15 },
    0x6f: { value: 0x6f, mnemonic: 'PUSH16', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 16 },
    0x70: { value: 0x70, mnemonic: 'PUSH17', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 17 },
    0x71: { value: 0x71, mnemonic: 'PUSH18', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 18 },
    0x72: { value: 0x72, mnemonic: 'PUSH19', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 19 },
    0x73: { value: 0x73, mnemonic: 'PUSH20', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 20 },
    0x74: { value: 0x74, mnemonic: 'PUSH21', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 21 },
    0x75: { value: 0x75, mnemonic: 'PUSH22', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 22 },
    0x76: { value: 0x76, mnemonic: 'PUSH23', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 23 },
    0x77: { value: 0x77, mnemonic: 'PUSH24', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 24 },
    0x78: { value: 0x78, mnemonic: 'PUSH25', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 25 },
    0x79: { value: 0x79, mnemonic: 'PUSH26', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 26 },
    0x7a: { value: 0x7a, mnemonic: 'PUSH27', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 27 },
    0x7b: { value: 0x7b, mnemonic: 'PUSH28', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 28 },
    0x7c: { value: 0x7c, mnemonic: 'PUSH29', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 29 },
    0x7d: { value: 0x7d, mnemonic: 'PUSH30', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 30 },
    0x7e: { value: 0x7e, mnemonic: 'PUSH31', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 31 },
    0x7f: { value: 0x7f, mnemonic: 'PUSH32', inputs: 0, outputs: 1, gasBase: 3, pushBytes: 32 },
    0x80: { value: 0x80, mnemonic: 'DUP1', inputs: 1, outputs: 2, gasBase: 3 },
    0x81: { value: 0x81, mnemonic: 'DUP2', inputs: 2, outputs: 3, gasBase: 3 },
    0x82: { value: 0x82, mnemonic: 'DUP3', inputs: 3, outputs: 4, gasBase: 3 },
    0x83: { value: 0x83, mnemonic: 'DUP4', inputs: 4, outputs: 5, gasBase: 3 },
    0x84: { value: 0x84, mnemonic: 'DUP5', inputs: 5, outputs: 6, gasBase: 3 },
    0x85: { value: 0x85, mnemonic: 'DUP6', inputs: 6, outputs: 7, gasBase: 3 },
    0x86: { value: 0x86, mnemonic: 'DUP7', inputs: 7, outputs: 8, gasBase: 3 },
    0x87: { value: 0x87, mnemonic: 'DUP8', inputs: 8, outputs: 9, gasBase: 3 },
    0x88: { value: 0x88, mnemonic: 'DUP9', inputs: 9, outputs: 10, gasBase: 3 },
    0x89: { value: 0x89, mnemonic: 'DUP10', inputs: 10, outputs: 11, gasBase: 3 },
    0x8a: { value: 0x8a, mnemonic: 'DUP11', inputs: 11, outputs: 12, gasBase: 3 },
    0x8b: { value: 0x8b, mnemonic: 'DUP12', inputs: 12, outputs: 13, gasBase: 3 },
    0x8c: { value: 0x8c, mnemonic: 'DUP13', inputs: 13, outputs: 14, gasBase: 3 },
    0x8d: { value: 0x8d, mnemonic: 'DUP14', inputs: 14, outputs: 15, gasBase: 3 },
    0x8e: { value: 0x8e, mnemonic: 'DUP15', inputs: 15, outputs: 16, gasBase: 3 },
    0x8f: { value: 0x8f, mnemonic: 'DUP16', inputs: 16, outputs: 17, gasBase: 3 },
    0x90: { value: 0x90, mnemonic: 'SWAP1', inputs: 2, outputs: 2, gasBase: 3 },
    0x91: { value: 0x91, mnemonic: 'SWAP2', inputs: 3, outputs: 3, gasBase: 3 },
    0x92: { value: 0x92, mnemonic: 'SWAP3', inputs: 4, outputs: 4, gasBase: 3 },
    0x93: { value: 0x93, mnemonic: 'SWAP4', inputs: 5, outputs: 5, gasBase: 3 },
    0x94: { value: 0x94, mnemonic: 'SWAP5', inputs: 6, outputs: 6, gasBase: 3 },
    0x95: { value: 0x95, mnemonic: 'SWAP6', inputs: 7, outputs: 7, gasBase: 3 },
    0x96: { value: 0x96, mnemonic: 'SWAP7', inputs: 8, outputs: 8, gasBase: 3 },
    0x97: { value: 0x97, mnemonic: 'SWAP8', inputs: 9, outputs: 9, gasBase: 3 },
    0x98: { value: 0x98, mnemonic: 'SWAP9', inputs: 10, outputs: 10, gasBase: 3 },
    0x99: { value: 0x99, mnemonic: 'SWAP10', inputs: 11, outputs: 11, gasBase: 3 },
    0x9a: { value: 0x9a, mnemonic: 'SWAP11', inputs: 12, outputs: 12, gasBase: 3 },
    0x9b: { value: 0x9b, mnemonic: 'SWAP12', inputs: 13, outputs: 13, gasBase: 3 },
    0x9c: { value: 0x9c, mnemonic: 'SWAP13', inputs: 14, outputs: 14, gasBase: 3 },
    0x9d: { value: 0x9d, mnemonic: 'SWAP14', inputs: 15, outputs: 15, gasBase: 3 },
    0x9e: { value: 0x9e, mnemonic: 'SWAP15', inputs: 16, outputs: 16, gasBase: 3 },
    0x9f: { value: 0x9f, mnemonic: 'SWAP16', inputs: 17, outputs: 17, gasBase: 3 },
    0xa0: { value: 0xa0, mnemonic: 'LOG0', inputs: 2, outputs: 0, gasBase: 375 },
    0xa1: { value: 0xa1, mnemonic: 'LOG1', inputs: 3, outputs: 0, gasBase: 750 },
    0xa2: { value: 0xa2, mnemonic: 'LOG2', inputs: 4, outputs: 0, gasBase: 1125 },
    0xa3: { value: 0xa3, mnemonic: 'LOG3', inputs: 5, outputs: 0, gasBase: 1500 },
    0xa4: { value: 0xa4, mnemonic: 'LOG4', inputs: 6, outputs: 0, gasBase: 1875 },
    0xf0: { value: 0xf0, mnemonic: 'CREATE', inputs: 3, outputs: 1, gasBase: 32000 },
    0xf1: { value: 0xf1, mnemonic: 'CALL', inputs: 7, outputs: 1, gasBase: 100 },
    0xf2: { value: 0xf2, mnemonic: 'CALLCODE', inputs: 7, outputs: 1, gasBase: 100 },
    0xf3: { value: 0xf3, mnemonic: 'RETURN', inputs: 2, outputs: 0, gasBase: 0 },
    0xf4: { value: 0xf4, mnemonic: 'DELEGATECALL', inputs: 6, outputs: 1, gasBase: 100 },
    0xf5: { value: 0xf5, mnemonic: 'CREATE2', inputs: 4, outputs: 1, gasBase: 32000 },
    0xfa: { value: 0xfa, mnemonic: 'STATICCALL', inputs: 6, outputs: 1, gasBase: 100 },
    0xfd: { value: 0xfd, mnemonic: 'REVERT', inputs: 2, outputs: 0, gasBase: 0 },
    0xfe: { value: 0xfe, mnemonic: 'INVALID', inputs: 0, outputs: 0, gasBase: 0 },
    0xff: { value: 0xff, mnemonic: 'SELFDESTRUCT', inputs: 1, outputs: 0, gasBase: 5000 },
};
