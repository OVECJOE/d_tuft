/**
 * d_tuft Design System — centralized color / style tokens.
 *
 * Every color decision in the entire CLI should flow through here.
 * Import `T` and pick a token; never reach for `chalk` directly in commands.
 *
 * Token groups
 * ────────────
 *  T.chrome   — structural chrome: borders, separators, spinners
 *  T.text     — typography hierarchy
 *  T.status   — success / error / warn / info / hint
 *  T.val      — value types (pc, immediate, gas, hex, numbers …)
 *  T.op       — opcode semantic categories
 *  T.diff     — diff / compare coloring (added / removed / same)
 *  T.badge    — colored badges / labels
 *  T.code     — syntax highlighting for Solidity / code output
 */
import chalk from 'chalk';

export const T = {
    // ── Structural chrome ─────────────────────────────────────────────────────
    chrome: {
        border: chalk.dim.cyan, // ╔ ═ ╗ ╠ ╣ ╚ ╝ ║ ╪ ╤ ╧
        sep: chalk.dim, // ── thin separators
        bullet: chalk.dim.cyan, // │ ┆ vertical separators inside rows
        spinner: chalk.cyan, // ⠋ ⠙ … spinner frames
    },

    // ── Typography ────────────────────────────────────────────────────────────
    text: {
        heading: chalk.white.bold, // panel / section titles
        subheading: chalk.cyan, // secondary headings
        key: chalk.dim, // kv-pair labels
        body: chalk.white, // default body text
        muted: chalk.dim, // less important text
        accent: chalk.cyanBright, // highlighted values
    },

    // ── Status messages ───────────────────────────────────────────────────────
    status: {
        success: chalk.green,
        error: chalk.redBright,
        warn: chalk.yellow,
        info: chalk.blue,
        hint: chalk.cyan,
    },

    // ── Typed values ──────────────────────────────────────────────────────────
    val: {
        pc: chalk.dim, // [00042] program counters
        immediate: chalk.whiteBright.bold, // 0xdeadbeef PUSH immediates
        hex: chalk.dim, // raw hex byte annotations
        number: chalk.cyanBright, // plain numeric stats
        address: chalk.blueBright, // ethereum addresses
        selector: chalk.cyan, // 0xaabbccdd function selectors
        filename: chalk.cyan, // input/output file paths
        format: chalk.cyan, // "bytecode" | "assembly"
        /** Gas cost — color scales from dim to red as cost rises */
        gas: (cost: number): string => {
            if (cost === 0) return chalk.dim(`(0 gas)`);
            if (cost < 10) return chalk.dim(`(${cost} gas)`);
            if (cost < 100) return chalk.yellow.dim(`(${cost} gas)`);
            if (cost < 1000) return chalk.yellowBright(`(${cost} gas)`);
            return chalk.redBright(`(${cost} gas)`);
        },
        /** Stack net effect — colored by sign */
        stackNet: (net: number): string =>
            net > 0 ? chalk.greenBright.bold(`+${net}`) : net < 0 ? chalk.redBright.bold(String(net)) : chalk.dim('±0'),
    },

    // ── Opcode categories ─────────────────────────────────────────────────────
    op: {
        halt: chalk.redBright.bold, // STOP RETURN REVERT INVALID SELFDESTRUCT
        jump: chalk.yellowBright.bold, // JUMP JUMPI
        jumpdest: chalk.yellow, // JUMPDEST
        push: chalk.cyanBright.bold, // PUSH0..PUSH32
        dup: chalk.cyan, // DUP1..DUP16
        swap: chalk.cyan, // SWAP1..SWAP16
        arithmetic: chalk.green, // ADD SUB MUL DIV EXP …
        comparison: chalk.yellow, // LT GT EQ AND OR XOR …
        memory: chalk.cyan, // MLOAD MSTORE POP MSIZE …
        environment: chalk.blueBright, // ADDRESS CALLER BLOCKHASH …
        storage: chalk.magenta, // SLOAD TLOAD
        storageWrite: chalk.magentaBright.bold, // SSTORE TSTORE
        system: chalk.blueBright, // CALL STATICCALL DELEGATECALL
        create: chalk.blue.bold, // CREATE CREATE2
        crypto: chalk.magenta, // KECCAK256
        log: chalk.gray, // LOG0..LOG4
        deprecated: chalk.dim, // CALLCODE etc.
        unknown: chalk.white,
    },

    // ── Diff / compare ────────────────────────────────────────────────────────
    diff: {
        added: chalk.green,
        removed: chalk.red,
        modified: chalk.yellow,
        same: chalk.dim,
    },

    // ── Badges ────────────────────────────────────────────────────────────────
    badge: {
        pass: chalk.bgGreen.black.bold,
        fail: chalk.bgRed.white.bold,
        warn: chalk.bgYellow.black.bold,
        info: chalk.bgBlue.white.bold,
        neutral: chalk.bgGray.white,
    },

    // ── Syntax highlighting (Solidity / code) ─────────────────────────────────
    code: {
        keyword: chalk.magentaBright, // function, contract, return, if, else, etc.
        type: chalk.cyanBright, // uint256, address, bool, bytes, mapping
        builtin: chalk.yellowBright, // require, revert, emit, msg, block, tx
        number: chalk.greenBright, // numeric literals
        string: chalk.green, // string literals
        comment: chalk.dim.gray, // // and /* */ comments
        operator: chalk.white, // =, +, -, *, /, etc.
        punctuation: chalk.dim, // (, ), {, }, ;, ,
        identifier: chalk.white, // variable / function names
        selector: chalk.cyan, // 0x... function selectors
        decorator: chalk.yellow, // @override, @external, etc.
        visibility: chalk.blueBright, // public, private, external, internal
        mutability: chalk.blue, // view, pure, payable
    },
} as const;

export type Theme = typeof T;
