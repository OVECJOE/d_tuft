# d_tuft

## Overview

d_tuft is a bidirectional EVM bytecode ↔ opcode transformer and analysis toolkit. It provides a CLI for disassembling, assembling, comparing, and testing Ethereum smart contract bytecode and opcodes.

### Features
- Disassemble EVM bytecode to readable opcodes
- Assemble opcodes back to bytecode
- Compare bytecode or assembly files for equivalence
- Round-trip testing for fidelity
- Multiple output formats: text, annotated, JSON
- Gas cost and hex byte analysis

## Installation

```bash
bun install
```

## Usage

Run the CLI with:

```bash
bun run src/cli/index.ts <command> [options]
```

### Subcommands

- `disasm <input>`: Disassemble bytecode to opcodes
    - Options: `-o <file>`, `-f <format>`, `--no-pc`, `--gas`, `--hex`
- `asm <input>`: Assemble opcodes to bytecode
    - Options: `-o <file>`
- `compare <file1> <file2>`: Compare two files for equivalence
    - Options: `--format <format>`
- `test <input>`: Test round-trip bytecode → opcodes → bytecode

Example:

```bash
bun run src/cli/index.ts disasm examples/2bottles-diamond.bin -o 2bottles.evm
```

## Project Info

This project was created using `bun init` in bun v1.3.8. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
