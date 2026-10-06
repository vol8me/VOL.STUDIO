#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { bashShell } from './gitBash.mjs';

const shell = bashShell();
if (!shell.ok) {
  process.stderr.write(`${shell.problem}\n`);
  process.exit(1);
}

const child = spawnSync(shell.path, process.argv.slice(2), { stdio: 'inherit' });
if (child.error) {
  process.stderr.write(`bash: kabuk başlatılamadı (${shell.path}): ${child.error.message}\n`);
  process.exit(1);
}
process.exit(child.status ?? 1);
