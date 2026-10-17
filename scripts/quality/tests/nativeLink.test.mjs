import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { checkNativeLink } from '../nativeLink.mjs';

test('PATH linker banner yerine gerçek Rust link ve çalıştırma sonucu belirleyicidir', () => {
  const calls = [];
  const result = checkNativeLink((command, args, options) => {
    if (args[0] === '-vV') return { status: 0, stdout: 'host: x86_64-pc-windows-msvc' };
    calls.push({ command, args, options });
    return { status: 0, stdout: '', stderr: '' };
  });
  assert.equal(result.ok, true);
  assert.equal(calls[0].command, 'rustc');
  assert.equal(calls[0].options.input, 'fn main() {}');
  assert.equal(calls[1].command, calls[0].args.at(-1));
  assert.equal(existsSync(calls[0].options.cwd), false);
});

test('link hatası belirli tanı verir ve derlenmemiş exe çalıştırılmaz', () => {
  const calls = [];
  const result = checkNativeLink((command) => {
    calls.push(command);
    return { status: 1, stdout: '', stderr: 'linking with link.exe failed' };
  });
  assert.equal(result.ok, false);
  assert.match(result.output, /linking with link.exe failed/);
  assert.equal(calls.length, 1);
});

test('başlatma hatası ve başarılı link sonrası çalıştırma hatası geçmez', () => {
  assert.equal(checkNativeLink(() => ({ error: new Error('ENOENT'), status: null })).ok, false);
  let called = 0;
  const result = checkNativeLink((_command, args) =>
    args[0] === '-vV'
      ? { status: 0, stdout: 'host: x86_64-pc-windows-msvc' }
      : { status: called++ === 0 ? 0 : 1 },
  );
  assert.equal(result.ok, false);
  assert.match(result.output, /çalıştırılamadı/);
});

test('GNU Rust host MSVC geliştirme profili olarak kabul edilmez', () => {
  const result = checkNativeLink(
    () => ({ status: 0, stdout: 'host: x86_64-pc-windows-gnu' }),
    'win32',
  );
  assert.equal(result.ok, false);
  assert.match(result.output, /MSVC host/);
});
