#!/usr/bin/env bun

import chalk from 'chalk';
import { Command } from 'commander';
import * as commands from './commands';
import { BANNER } from './utils';

function loadCommands(program: Command) {
    Object.values(commands).forEach((register) => {
        if (typeof register === 'function') {
            register(program);
        }
    });
}

const program = new Command();
program
    .name('d_tuft')
    .description('Bidirectional EVM bytecode ↔ opcode transformer and analysis toolkit')
    .version('1.0.0')
    .helpOption('-h, --help', 'Show help for a command')
    .addHelpCommand('help [command]', 'Display help for a command');

loadCommands(program);

if (process.argv.length <= 2) {
    console.log(BANNER);
    program.outputHelp();
    process.exit(0);
}

program.on('command:*', (operands: string[]) => {
    console.error(chalk.red(`✗ Unknown command: "${operands[0]}"`));
    const available = program.commands.map((c) => c.name()).join(', ');
    console.error(chalk.gray(`  Available: ${available}`));
    console.error(chalk.cyan(`  ↳ Run 'd_tuft --help' for usage information`));
    process.exit(1);
});

program.parse();
