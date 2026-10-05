import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { spawn } from '../command.mjs';
import {
  runCommand as execFileSync,
  runCommandSync as spawnSync,
  writeNodeCommand,
} from './runCommand.mjs';

const ARGS = [
  'iki sözcük',
  'Türkçe Ω',
  'a&b',
  'tek"çift',
  '(parantez)',
  '%VAR%',
  '!literal!',
  '',
  'C:\\son\\',
];
const BODY =
  '#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()}));\n';

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'vol-command-'));
  const dir = join(root, 'boşluk & Ω');
  mkdirSync(dir);
  const echo = join(dir, 'echo.cjs');
  writeFileSync(echo, BODY);
  const command = writeNodeCommand(dir, 'echo-args', BODY);
  const cleanup = () => rmSync(root, { recursive: true, force: true });
  let result;
  try {
    result = run({ root, dir, echo, command });
  } catch (error) {
    cleanup();
    throw error;
  }
  if (result instanceof Promise) return result.finally(cleanup);
  cleanup();
  return result;
}

test('native süreç argv sınırlarını ve cwd değerini aynen korur', () => {
  fixture(({ dir, echo }) => {
    const executable =
      process.platform === 'win32' ? join(dir, 'native echo.exe') : process.execPath;
    if (process.platform === 'win32') copyFileSync(process.execPath, executable);
    const output = execFileSync(executable, [echo, ...ARGS], { cwd: dir, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(output), { args: ARGS, cwd: dir });
    const result = spawnSync(executable, [echo, ...ARGS], {
      cwd: dir,
      encoding: 'utf8',
      shell: false,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { args: ARGS, cwd: dir });
  });
});

test('gerçek komut shim’i spaces Unicode quotes & ve boş argümanı korur', () => {
  fixture(({ dir, command }) => {
    const output = execFileSync(command, ARGS, { cwd: dir, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(output), { args: ARGS, cwd: dir });
    const result = spawnSync(command, ARGS, { cwd: dir, encoding: 'utf8', shell: false });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { args: ARGS, cwd: dir });
  });
});

test('asenkron spawn argv ve çıktı sözleşmesini gerçek shim ile korur', async () => {
  await fixture(async ({ dir, command }) => {
    const child = spawn(command, ARGS, {
      cwd: dir,
      env: { ...process.env, VAR: 'expanded' },
      shell: false,
    });
    let output = '';
    let errorOutput = '';
    child.stdout.on('data', (data) => {
      output += data;
    });
    child.stderr.on('data', (data) => {
      errorOutput += data;
    });
    const status = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
    assert.equal(status, 0, errorOutput);
    assert.deepEqual(JSON.parse(output), { args: ARGS, cwd: dir });
  });
});

test(
  'Windows ortamındaki PATH farklı harf yazımıyla gerçek pnpm shim’ini seçer',
  { skip: process.platform !== 'win32' },
  () => {
    fixture(({ dir }) => {
      writeNodeCommand(dir, 'pnpm', BODY);
      const env = {
        ...process.env,
        PATH: dirname(process.execPath),
        path: dir + delimiter + dirname(process.execPath),
      };
      const output = execFileSync('pnpm', ['iki sözcük', 'a&b'], {
        cwd: dir,
        encoding: 'utf8',
        env,
      });
      assert.deepEqual(JSON.parse(output), { args: ['iki sözcük', 'a&b'], cwd: dir });
    });
  },
);

test('değiştirilmiş PATH ve göreli cwd komutu global kurulumdan bağımsız seçer', () => {
  fixture(({ dir }) => {
    const env = { ...process.env, PATH: dir + delimiter + dirname(process.execPath) };
    const output = execFileSync('echo-args', ARGS, { cwd: dir, env, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(output), { args: ARGS, cwd: dir });
    const relative = process.platform === 'win32' ? './echo-args.CMD' : './echo-args';
    assert.deepEqual(
      JSON.parse(execFileSync(relative, ARGS, { cwd: dir, env, encoding: 'utf8' })),
      { args: ARGS, cwd: dir },
    );
  });
});

test('execFileSync başarısız süreçte status stdout stderr ve spawn hatasını taşır', () => {
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        ['-e', 'process.stdout.write("out");process.stderr.write("err");process.exit(7)'],
        { encoding: 'utf8', stdio: 'pipe', shell: false },
      ),
    (error) => error.status === 7 && error.stdout === 'out' && error.stderr === 'err',
  );
  assert.throws(
    () => execFileSync('vol-nonexistent-command', [], { stdio: 'pipe', shell: false }),
    (error) => error.code === 'ENOENT',
  );
});

test('ikili çıktı, input ve timeout hata sözleşmesi korunur', () => {
  const output = execFileSync(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], {
    input: Buffer.from([0, 255, 42]),
    stdio: 'pipe',
  });
  assert.ok(Buffer.isBuffer(output));
  assert.deepEqual(output, Buffer.from([0, 255, 42]));
  assert.throws(
    () =>
      execFileSync(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
        timeout: 100,
        stdio: 'pipe',
      }),
    (error) => error.code === 'ETIMEDOUT' && error.status === null,
  );
});

test('aktif workspace gerçek pnpm shim’iyle keşfedilir ve kapı aynı argv ile çalışır', () => {
  fixture(({ dir }) => {
    const packagePath = join(dir, 'active');
    const calls = join(dir, 'calls.json');
    mkdirSync(packagePath);
    writeFileSync(
      join(packagePath, 'package.json'),
      JSON.stringify({ name: '@vol/fixture', scripts: { test: 'node test.cjs' } }),
    );
    writeFileSync(
      join(dir, 'workspace-lifecycle.json'),
      JSON.stringify({
        workspaces: [{ packageName: '@vol/fixture', path: 'active', status: 'active' }],
      }),
    );
    writeNodeCommand(
      dir,
      'pnpm',
      '#!/usr/bin/env node\n' +
        'const args=process.argv.slice(2);if(args[0]==="list")process.stdout.write(JSON.stringify([{name:"@vol/fixture",path:process.env.VOL_COMMAND_PACKAGE}]));else require("node:fs").writeFileSync(process.env.VOL_COMMAND_CALLS,JSON.stringify(args));\n',
    );
    const env = {
      ...process.env,
      PATH: dir + delimiter + dirname(process.execPath),
      VOL_COMMAND_PACKAGE: packagePath,
      VOL_COMMAND_CALLS: calls,
    };
    execFileSync(process.execPath, [resolve(import.meta.dirname, '../runActive.mjs'), 'test'], {
      cwd: dir,
      env,
      stdio: 'pipe',
    });
    assert.deepEqual(JSON.parse(readFileSync(calls, 'utf8')), [
      '-r',
      '--filter',
      '@vol/fixture',
      'run',
      'test',
    ]);
  });
});
