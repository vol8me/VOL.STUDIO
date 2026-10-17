import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SINGLE_INSTANCE_PACKAGES, validateSingleInstance } from '../singleInstance.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

function fixture(t, manifests) {
  const root = mkdtempSync(join(tmpdir(), 'vol-single-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [dir, manifest] of Object.entries(manifests)) {
    mkdirSync(dirname(join(root, dir, 'package.json')), { recursive: true });
    writeFileSync(join(root, dir, 'package.json'), JSON.stringify(manifest));
  }
  return root;
}

test('aynı sürüm belirteci tüm alanlarda ve paketlerde geçer', (t) => {
  const root = fixture(t, {
    network: { name: 'n', dependencies: { '@colyseus/core': '0.18.18' } },
    'games/a': { name: 'a', dependencies: { '@colyseus/core': '0.18.18' } },
    'games/b': { name: 'b', devDependencies: { '@colyseus/core': '0.18.18' } },
    'games/c': { name: 'c', dependencies: { left: '1.0.0' } },
  });
  assert.deepEqual(validateSingleInstance(root), []);
});

test('farklı sürüm belirteci iki kopya riskidir ve paketleri adıyla anılır', (t) => {
  const root = fixture(t, {
    network: { name: 'n', dependencies: { '@colyseus/core': '0.18.18' } },
    'games/a': { name: 'a', dependencies: { '@colyseus/core': '0.18.19' } },
  });
  const problems = validateSingleInstance(root);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /@colyseus\/core/);
  assert.match(problems[0], /"0\.18\.18" \(network\)/);
  assert.match(problems[0], /"0\.18\.19" \(games\/a\)/);
});

test('listede olmayan paket serbesttir; liste Colyseus ve Phaser kapsar', (t) => {
  const root = fixture(t, {
    network: { name: 'n', dependencies: { left: '1.0.0' } },
    'games/a': { name: 'a', dependencies: { left: '2.0.0' } },
  });
  assert.deepEqual(validateSingleInstance(root), []);
  assert.ok(SINGLE_INSTANCE_PACKAGES.includes('@colyseus/core'));
  assert.ok(SINGLE_INSTANCE_PACKAGES.includes('phaser'));
});

test('depo tek örnek kuralını sağlar', () => {
  assert.deepEqual(validateSingleInstance(ROOT), []);
});
