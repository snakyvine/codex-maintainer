#!/usr/bin/env node
import { Command } from 'commander';
export declare function createProgram(env?: NodeJS.ProcessEnv, cwd?: string): Command;
export declare function main(argv?: string[]): Promise<void>;
