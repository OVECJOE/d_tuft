# Contributing to d_tuft

Thank you for your interest in contributing to d_tuft! This guide will help you get started.

## Development Setup

```bash
# Clone the repository
git clone https://github.com/OVECJOE/d_tuft.git
cd d_tuft

# Install dependencies
bun install

# Run the CLI
bun run start --help

# Run tests
bun run test

# Type check
bun run typecheck

# Build standalone binary
bun run build
```

## Project Structure

```
src/
├── cli/              # CLI commands and UI components
│   ├── commands/     # Individual CLI commands (disasm, asm, identify, etc.)
│   └── ui/           # Theme, tables, panels, ANSI utilities
├── core/             # Core domain layer
│   ├── parser.ts     # Bytecode → Instruction[] disassembler
│   ├── assembler.ts  # Assembly → bytecode assembler
│   ├── opcodes.ts    # Complete EVM opcode table
│   ├── validator.ts  # Bytecode validation (jumpdests, terminals, etc.)
│   └── types.ts      # TypeScript type definitions
├── formats/          # Output formatters (text, annotated, JSON, diff)
├── libraries/        # Higher-level analysis libraries
│   ├── evm/          # Lightweight EVM execution engine
│   │   ├── vm.ts     # Main EVM with full opcode dispatch
│   │   ├── memory.ts # EVM memory with expansion gas
│   │   ├── storage.ts# EVM storage with cold/warm tracking
│   │   ├── context.ts# Block, transaction, and call context
│   │   └── precompiles.ts # Precompile stubs (0x01–0x0a)
│   └── fi/           # Function identification and diffing
└── utils/            # Pure utility functions
    ├── gas-calculator.ts   # Static gas analysis
    ├── stack-simulator.ts  # Linear stack depth simulation
    ├── hex.ts              # Hex string utilities
    └── bytes.ts            # Byte array utilities
tests/
├── core/             # Parser, assembler, validator tests
├── evm/              # EVM execution tests
├── libraries/        # Function identifier tests
├── utils/            # Gas calculator, stack simulator tests
└── integration/      # Real contract bytecode tests
```

## Architecture Principles

1. **Layered design**: `core` (domain) → `libraries` (analysis) → `cli` (presentation)
2. **Immutable by default**: Analysis functions return new data, never mutate input
3. **Type-safe**: Strict TypeScript with `noUncheckedIndexedAccess`
4. **Test-driven**: Every new feature needs tests

## Adding a New CLI Command

1. Create `src/cli/commands/<name>.ts`
2. Export a default function that registers with Commander
3. Add the export to `src/cli/commands/index.ts`
4. Use the `T` theme system for all output — never use `chalk` directly

## Adding a New Opcode

1. Add the opcode definition to `src/core/opcodes.ts`
2. Add the dispatch case in `src/libraries/evm/vm.ts`
3. Add the category mapping in `src/utils/gas-calculator.ts`
4. Add tests in `tests/evm/vm.test.ts`

## Adding a New EVM Feature

1. Implement in `src/libraries/evm/` (memory, storage, context, or vm.ts)
2. Export from `src/libraries/evm/index.ts`
3. Add comprehensive tests in `tests/evm/vm.test.ts`
4. Update this CONTRIBUTING.md if architecture changes

## Code Style

- 4-space indentation
- Single quotes for strings
- Semicolons always
- 120 character line width
- Run `bunx biome check .` before committing

## Pull Request Process

1. Create a feature branch from `main`
2. Write tests for new functionality
3. Ensure all tests pass: `bun run test`
4. Ensure type checking passes: `bun run typecheck`
5. Run the linter: `bunx biome check .`
6. Open a PR with a clear description of changes

## Reporting Bugs

Include:
- d_tuft version
- Command that triggered the bug
- Input bytecode (or file)
- Expected vs actual output
- Stack trace if applicable

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
