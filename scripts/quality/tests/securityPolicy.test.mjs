import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { loadSecurityPolicy, validateSecurityPolicy } from '../securityPolicy.mjs';

const ROOT = resolve(import.meta.dirname, '../../..');

const jsEntry = (overrides = {}) => ({
  advisory: 'GHSA-vfj7-8cjw-p6xm',
  package: 'braces',
  version: '3.0.3',
  patch: 'patches/braces@3.0.3.patch',
  reason: 'r',
  exposure: 'e',
  owner: 'o',
  removeWhen: 'w',
  reviewed: '2026-10-10',
  ...overrides,
});

const rustEntry = (overrides = {}) => ({
  advisory: 'RUSTSEC-2024-0429',
  crate: 'glib',
  version: '0.18.5',
  kind: 'unsound',
  via: 'gtk',
  platforms: ['linux'],
  reason: 'r',
  exposure: 'e',
  owner: 'o',
  removeWhen: 'w',
  reviewed: '2026-10-10',
  ...overrides,
});

test('gerçek politika geçerlidir ve her kayıt kaldırma koşulu taşır', () => {
  const policy = loadSecurityPolicy(ROOT);
  assert.ok(policy.js.length >= 1 && policy.rust.length >= 1);
  assert.deepEqual(validateSecurityPolicy(policy), []);
});

test('boş liste geçerli politikadır; kök nesne olmak zorundadır', () => {
  assert.deepEqual(validateSecurityPolicy({ js: [], rust: [] }), []);
  assert.match(validateSecurityPolicy([])[0], /JSON nesnesi/);
  assert.match(validateSecurityPolicy({ rust: [] }).join('\n'), /js: dizi olmalı/);
});

test('gerekçe, sahip, kaldırma koşulu ya da etki alanı eksik kayıt reddedilir', () => {
  for (const field of ['reason', 'exposure', 'owner', 'removeWhen', 'reviewed', 'patch']) {
    const problems = validateSecurityPolicy({ js: [jsEntry({ [field]: '  ' })], rust: [] });
    assert.match(
      problems.join('\n'),
      new RegExp(`js\\[0\\].*\\.${field}: boş olmayan metin`),
      field,
    );
  }
  for (const field of ['via', 'kind', 'reason']) {
    const problems = validateSecurityPolicy({ js: [], rust: [rustEntry({ [field]: '' })] });
    assert.match(
      problems.join('\n'),
      new RegExp(`rust\\[0\\].*\\.${field}: boş olmayan metin`),
      field,
    );
  }
  const noPlatform = validateSecurityPolicy({ js: [], rust: [rustEntry({ platforms: [] })] });
  assert.match(noPlatform.join('\n'), /platforms: boş olmayan metin dizisi/);
});

test('zafiyet ve yanked istisna türü olamaz; yalnız bakımsız ve sağlam olmayan olur', () => {
  for (const kind of ['yanked', 'vulnerability', 'notice']) {
    const problems = validateSecurityPolicy({ js: [], rust: [rustEntry({ kind })] });
    assert.match(problems.join('\n'), /istisna alamaz/, kind);
  }
  for (const kind of ['unmaintained', 'unsound']) {
    assert.deepEqual(validateSecurityPolicy({ js: [], rust: [rustEntry({ kind })] }), [], kind);
  }
});

test('advisory biçimi ve yinelenen kayıt yakalanır', () => {
  const badId = validateSecurityPolicy({ js: [jsEntry({ advisory: 'CVE-2026-1' })], rust: [] });
  assert.match(badId.join('\n'), /GHSA-xxxx-xxxx-xxxx biçiminde/);
  const badRust = validateSecurityPolicy({ js: [], rust: [rustEntry({ advisory: 'GHSA-x' })] });
  assert.match(badRust.join('\n'), /RUSTSEC-YYYY-NNNN biçiminde/);
  const twice = validateSecurityPolicy({ js: [jsEntry(), jsEntry()], rust: [] });
  assert.match(twice.join('\n'), /iki kez yazılmış/);
});
