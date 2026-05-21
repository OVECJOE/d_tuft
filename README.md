# d_tuft

## Overview

d_tuft is a bidirectional EVM bytecode ↔ opcode transformer, analysis toolkit, lightweight execution engine, and **one-click decompiler**. It provides a CLI for disassembling, assembling, comparing, auditing, executing, and decompiling Ethereum smart contract bytecode — including unverified contracts without an ABI.

### Features

- **Disassemble** EVM bytecode to readable opcodes
- **Assemble** opcodes back to bytecode
- **Compare** bytecode or assembly files for equivalence
- **Round-trip testing** for fidelity
- **Multiple output formats**: text, annotated, JSON
- **Function identification** with ABI name resolution
- **Gas analysis** — per-opcode, per-category, hotspot detection, per-function breakdown
- **Stack simulation** — depth tracking, underflow/overflow detection, per-instruction trace
- **Function-level diff** — compare two contract deployments to detect added, removed, and modified functions
- **Bytecode validation** — jumpdest verification, terminal checks, truncated PUSH detection
- **Lightweight EVM** — execute bytecode with full opcode dispatch, memory/storage tracking, gas metering, and execution traces
- **One-click decompilation** — decompile unverified contracts to Solidity-like code with automatic function inference, storage analysis, and known pattern matching (ERC20, ERC721, Ownable, Uniswap, etc.)

## Installation

```bash
# Clone and install
git clone https://github.com/OVECJOE/d_tuft.git
cd d_tuft
bun install
```

### System-wide install

```bash
wget -qO- https://raw.githubusercontent.com/OVECJOE/d_tuft/main/install.sh | bash
# or with curl:
curl -fsSL https://raw.githubusercontent.com/OVECJOE/d_tuft/main/install.sh | bash
```

## Usage

```bash
bun run src/cli/index.ts <command> [options]
# or after system install:
d_tuft <command> [options]
```

Run with no arguments to see a command overview.

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

### `diff`
Compare two contracts at function level to detect added, removed, and modified functions.

```bash
d_tuft diff <first> <second> [--format text|annotated|json]
```

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
| `--internal` | List internal/private JUMPDESTs |
| `--gas` | Show gas cost estimates per function |

### `gas` (alias: `g`)
Analyse gas costs with per-opcode and per-category breakdowns, hotspot detection, and optional per-function estimates.

```bash
d_tuft gas <input> [options]
```

| Option | Description |
|--------|-------------|
| `--functions` | Break down gas per identified function |
| `--top <n>` | Number of hotspots to show (default: 5) |
| `--window <n>` | Hotspot sliding window size (default: 10) |

### `stack` (alias: `s`)
Simulate EVM stack execution, visualise depth, and detect underflow/overflow.

```bash
d_tuft stack <input> [options]
```

| Option | Description |
|--------|-------------|
| `--trace` | Show per-instruction execution trace with depth bars |
| `--limit <n>` | Max trace lines to display (default: 50) |

### `test`
Test round-trip bytecode → opcodes → bytecode fidelity.

```bash
d_tuft test <input>
```

### `decompile` (alias: `dec`) ✨
Decompile bytecode to Solidity-like pseudocode with automatic function inference, storage analysis, and known pattern matching. Works on unverified contracts without an ABI.

```bash
d_tuft decompile <input> [options]
```

| Option | Description |
|--------|-------------|
| `-o, --output <file>` | Write decompiled output to file |
| `--format <format>` | `solidity` (default), `pseudocode` |
| `--no-storage` | Hide inferred storage variables |
| `--no-comments` | Hide decompiler comments |
| `--rpc <url>` | RPC endpoint to fetch bytecode from |

**Examples:**
```bash
# Decompile from a local file
d_tuft decompile contract.bin -o output.sol

# Decompile a deployed contract by address (fetches from chain)
d_tuft decompile 0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984

# Decompile from hex string
d_tuft decompile 0x6080604052...
```

## Library API

d_tuft can also be used as a library:

```typescript
import { core, evm, fi, decompiler, utils } from 'd_tuft';

// Disassemble
const result = core.disassemble('0x6001600201');

// Assemble
const bytecode = core.assemble({ lines: [{ mnemonic: 'PUSH1', operand: '0x01' }], warnings: [] });

// Execute with the lightweight EVM
const vm = new evm.Evm('0x600160020100');
const execResult = vm.run();
console.log(execResult.trace); // per-instruction trace
console.log(execResult.gasUsed); // total gas consumed

// Identify functions
const fi = new fi.FunctionIdentifier(bytecode);
const functions = fi.identify();

// Decompile an unverified contract (no ABI needed)
const decompiled = decompiler.decompile(bytecode);
console.log(decompiled.solidity); // Solidity-like output
console.log(decompiled.matchedPatterns); // ERC20, Ownable, etc.
console.log(decompiled.functions); // inferred function signatures

// Gas analysis
const gc = new utils.GasCalculator();
const report = gc.analyze(result.instructions);

// Stack validation
const sim = new utils.StackSimulator();
const simResult = sim.simulate(result.instructions);

// Bytecode validation
const validation = core.validate(result);
```

## Output Formats

| Format | Description |
|--------|-------------|
| `text` | Human-readable with optional PC, gas, hex annotations |
| `annotated` | Box-drawing table with gas costs and full details |
| `json` | Machine-readable JSON for programmatic processing |

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         CLI Layer                             │
│  disasm · asm · identify · diff · gas · stack · test · dec   │
├──────────────────────────────────────────────────────────────┤
│                      Analysis Libraries                        │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ Function ID  │  │ Decompiler   │  │  Lightweight EVM   │  │
│  │  & Diffing   │  │ (CFG, ABI,   │  │  Engine (memory,   │  │
│  │              │  │  Storage,    │  │  storage, context) │  │
│  │              │  │  Patterns)   │  │                    │  │
│  └──────────────┘  └──────────────┘  └────────────────────┘  │
├──────────────────────────────────────────────────────────────┤
│                        Core Domain                             │
│  Parser · Assembler · Opcodes · Validator · Types             │
├──────────────────────────────────────────────────────────────┤
│                        Utilities                               │
│  Gas Calculator · Stack Simulator · Hex · Bytes               │
└──────────────────────────────────────────────────────────────┘
```

## Development

```bash
# Run tests
bun run test

# Type check
bun run typecheck

# Lint
bunx biome check .

# Build standalone binary
bun run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed development guidelines.

## Man Page

```bash
man ./man/d_tuft.1
```

## License

MIT
