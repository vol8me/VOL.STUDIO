#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { bashShell } from './gitBash.mjs';

const shell = bashShell();
if (!shell.ok) {
  process.stderr.write(`${shell.problem}\n`);
  process.exit(1);
}

const started = performance.now();
const child = spawnSync(shell.path, process.argv.slice(2), { stdio: 'inherit' });
// `just` her tarif satırını ayrı kabukta koşar; süreyi burada yazmak, kapı yavaşladığında
// hangi adımın uzadığını ayrıca ölçüm koşusu beklemeden `high` çıktısından okutur.
const seconds = (performance.now() - started) / 1000;
if (seconds >= 5) {
  const line = (process.argv.at(-1) ?? '').trim().replace(/\s+/g, ' ');
  process.stderr.write(
    `[süre] ${seconds.toFixed(1)} sn  ${line.length > 90 ? `${line.slice(0, 87)}...` : line}\n`,
  );
}
if (child.error) {
  process.stderr.write(`bash: kabuk başlatılamadı (${shell.path}): ${child.error.message}\n`);
  process.exit(1);
}
process.exit(child.status ?? 1);
