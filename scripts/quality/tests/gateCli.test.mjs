import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { execFileSync, spawnSync } from '../command.mjs';
import { writeNodeCommand } from './runCommand.mjs';

for (const flags of [['--json', '--verbose'], ['--json'], ['--verbose']]) {
  test(`kapı CLI çıktı akışlarını ayırır: ${flags.join(' ')}`, (t) => {
    const root = mkdtempSync(join(tmpdir(), 'vol-gate-cli-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => !key.startsWith('GIT_') && key !== 'NODE_TEST_CONTEXT',
      ),
    );
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
    env[pathKey] = `${root}${delimiter}${env[pathKey]}`;
    writeFileSync(join(root, 'package.json'), '{"name":"fixture","private":true}');
    writeFileSync(join(root, 'workspace-lifecycle.json'), '{"schemaVersion":1,"workspaces":[]}');
    writeFileSync(join(root, '.gitignore'), 'node_modules/\n');
    writeFileSync(join(root, 'justfile'), 'node-pin:\nquick: node-pin\n');
    writeFileSync(
      join(root, 'quality.json'),
      readFileSync(resolve(import.meta.dirname, '../../../quality.json')),
    );
    writeNodeCommand(root, 'pnpm', "console.log('çocuk stdout'); console.error('çocuk stderr');");
    execFileSync('git', ['init', '-q'], { cwd: root, env });
    const result = spawnSync(
      process.execPath,
      [resolve(import.meta.dirname, '../gate.mjs'), 'quick', ...flags],
      { cwd: root, env, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    if (flags.includes('--json')) {
      const report = JSON.parse(result.stdout);
      assert.equal(report.gate, 'quick');
      assert.equal(report.status, 'passed');
      for (const text of ['çocuk stdout', 'çocuk stderr']) {
        assert.equal(result.stderr.includes(text), flags.includes('--verbose'));
      }
    } else {
      assert.ok(result.stdout.includes('çocuk stdout'));
      assert.ok(result.stdout.includes('çocuk stderr'));
      assert.ok(result.stdout.includes('[kapı] quick: geçti'));
    }
  });
}
