# d_tuft

## Overview

d_tuft is a bidirectional EVM bytecode ↔ opcode transformer and analysis toolkit. It provides a CLI for disassembling, assembling, comparing, auditing, and testing Ethereum smart contract bytecode and opcodes.

### Features
- Disassemble EVM bytecode to readable opcodes
- Assemble opcodes back to bytecode
- Compare bytecode or assembly files for equivalence
- Round-trip testing for fidelity
- Multiple output formats: text, annotated, JSON
- Function identification with ABI name resolution
- Gas analysis per-opcode, per-category, hotspot detection, per-function breakdown
- Stack simulation depth tracking, underflow/overflow detection, per-instruction trace
- Function-level diff between two contract deployments

## Installation

> Assuming you cloned the repo and want to test it out

```bash
bun install
```

> Assuming you want to install as a Linux command

```bash
wget -qO- https://raw.githubusercontent.com/OVECJOE/d_tuft/main/install.sh | bash
# or with curl:
curl -fsSL https://raw.githubusercontent.com/OVECJOE/d_tuft/main/install.sh | bash
```

## Usage

```bash
bun run src/cli/index.ts <command> [options]
```

Run with no arguments to see a command overview:

```bash
bun run src/cli/index.ts
```

## Commands

### `disasm` (alias: `d`)
Disassemble bytecode to opcodes.

```bash
d_tuft disasm <input> [options]
```

| Option | Description |
|--------|-------------|
| `-o, --output <file>` | Write output to file (default: stdout) |
| `-f, --format <format>` | `text` (default), `annotated`, `json` |
| `--no-pc` | Omit program counter |
| `--gas` | Include gas cost per instruction |
| `--hex` | Include raw hex bytes per instruction |
| `--stack` | Run stack depth validation after disassembly |

### `asm` (alias: `a`)
Assemble opcodes to bytecode.

```bash
d_tuft asm <input.evm> [-o output.bin]
```

### `compare` (alias: `c`)
Compare two bytecode or assembly files for exact equivalence.

```bash
d_tuft compare <file1> <file2> [--format auto|bytecode|assembly]
```

Outputs a `MATCH` or `MISMATCH` summary box.

### `diff`
Compare two contracts at function level to detect added, removed, and modified functions.

```bash
d_tuft diff <first> <second> [--format text|annotated|json]
```

Uses PC-bounded body comparison with jump-target normalisation to eliminate false positives from code relocation and shared internal helpers.

### `identify` (alias: `id`)
Identify public functions, resolve names from ABI, and inspect contract structure.

```bash
d_tuft identify <input> [options]
```

| Option | Description |
|--------|-------------|
| `--format <format>` | `text` (default), `annotated`, `json` |
| `--abi <file>` | ABI JSON file for function name resolution |
| `-d, --diff <second>` | Compare functions between two inputs |
| `-o, --output <file>` | Write output to file |
| `--internal` | List internal/private JUMPDESTs |
| `--gas` | Show gas cost estimates per function |

### `gas` (alias: `g`) ✨ New
Analyse gas costs with per-opcode and per-category breakdowns, hotspot detection, and optional per-function estimates.

```bash
d_tuft gas <input> [options]
```

| Option | Description |
|--------|-------------|
| `--functions` | Break down gas per identified function (sorted by cost) |
| `--top <n>` | Number of hotspots to show (default: 5) |
| `--window <n>` | Hotspot sliding window size in instructions (default: 10) |

Example output:
```
── Gas by Category ──────────────────────────────────────────
  stack          ████████████████████  14044 (33.4%)
  logging        ██████████████░░░░░░  10125 (24.1%)
  control        ██████████░░░░░░░░░░   6875 (16.4%)
  storage        █████████░░░░░░░░░░░   6100 (14.5%)
```

### `stack` (alias: `s`) ✨ New
Simulate EVM stack execution, visualise depth, and detect underflow/overflow.

```bash
d_tuft stack <input> [options]
```

| Option | Description |
|--------|-------------|
| `--trace` | Show per-instruction execution trace with depth bars |
| `--limit <n>` | Max trace lines to display (default: 50) |

The `--trace` flag shows each instruction's PC, opcode, operand, current stack depth, delta, and a visual depth bar:

```
── Execution Trace ──────────────────────────────────────────
     PC Opcode         Operand              Depth  Delta Visual
      0 PUSH1          0x80                     0     +1 │
      2 PUSH1          0x40                     1     +1 ││
      4 MSTORE                                  2     -2 ·
      5 CALLVALUE                               0     +1 │
```

### `test`
Test round-trip bytecode → opcodes → bytecode fidelity.

```bash
d_tuft test <input>
```

Outputs a `PASS` or `FAIL` summary box.

## Output Formats

| Format | Description |
|--------|-------------|
| `text` | Human-readable with optional PC, gas, hex annotations |
| `annotated` | Box-drawing table with gas costs and full details |
| `json` | Machine-readable JSON for programmatic processing |

## Project Info

A man page is available for detailed CLI documentation:

```bash
# View directly
man ./d_tuft.1

# Install system-wide (Unix/macOS)
cp d_tuft.1 /usr/local/share/man/man1/d_tuft.1
man d_tuft
```

This project uses [Bun](https://bun.com) v1.3.8.
