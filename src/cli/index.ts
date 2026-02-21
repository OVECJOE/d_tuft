#!/usr/bin/env bun

import { Command } from 'commander';
import * as commands from './commands';

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
    .description('Bidirectional EVM bytecode ↔ opcode transformer')
    .version('1.0.0');

// Register commands
loadCommands(program);

program.parse();
