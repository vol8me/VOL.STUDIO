import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { audioBankRuntime, runtimeBankView } from '../../vite/audioBankRuntime.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

const canonical = () => ({
  schema: 'SoundFamilyBankV1',
  lookupContract: 'sound-family-lookup-v1',
  choice: { method: 'fnv1a32-mod-v1' },
  engine: { registryHash: 'sha256:aa' },
  family: { familyId: 'f', hash: 'sha256:bb', path: 'x', seed: 1 },
  quality: { hash: 'sha256:cc', pass: true },
  roleAxes: { weight: ['heavy'] },
  variants: [
    {
      key: 'a',
      roles: { weight: 'heavy' },
      tags: ['t'],
      durationSeconds: 0.5,
      asset: { path: 'public/a.ogg', bytes: 10, encodedHash: 'sha256:dd' },
      manifest: { hash: 'sha256:ee', path: 'm.json' },
      programHash: 'sha256:ff',
      pcmHash: 'sha256:00',
      loudness: { integratedLufs: -20 },
      descriptors: { centroidHz: 1 },
      variantId: 'v-1',
    },
  ],
});

test('görünüm yalnız çalışma zamanının okuduğu alanları taşır', () => {
  assert.deepEqual(runtimeBankView(canonical()), {
    schema: 'SoundFamilyBankV1',
    lookupContract: 'sound-family-lookup-v1',
    choice: { method: 'fnv1a32-mod-v1' },
    family: { familyId: 'f' },
    variants: [
      {
        key: 'a',
        roles: { weight: 'heavy' },
        tags: ['t'],
        durationSeconds: 0.5,
        asset: { path: 'public/a.ogg' },
      },
    ],
  });
});

test('görünüm idempotenttir ve kanonik girdiyi değiştirmez', () => {
  const input = canonical();
  const before = JSON.stringify(input);
  const view = runtimeBankView(input);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(runtimeBankView(view), view);
});

test('beklenmeyen biçim sessizce düzeltilmez: parse kendi hatasıyla düşsün diye geçer', () => {
  assert.equal(runtimeBankView(null), null);
  assert.equal(runtimeBankView('x'), 'x');
  assert.deepEqual(runtimeBankView({ schema: 'S', variants: 3, choice: 7, family: 'f' }), {
    schema: 'S',
    choice: 7,
    family: 'f',
    variants: 3,
  });
  const view = runtimeBankView({ variants: [null, { key: 'k', asset: 'yol' }] });
  assert.deepEqual(view.variants, [null, { key: 'k', asset: 'yol' }]);
});

test('eklenti yalnız audio-banks JSON dosyalarını dönüştürür (Windows yolu ve sorgu dahil)', () => {
  const plugin = audioBankRuntime();
  assert.equal(plugin.enforce, 'pre');
  const text = JSON.stringify(canonical());
  const run = (id) => plugin.transform(text, id);
  for (const id of [
    '/r/games/vol-test/audio-banks/x.json',
    'C:\\r\\games\\vol-test\\audio-banks\\x.json',
    '/r/games/vol-test/audio-banks/x.json?import',
  ]) {
    const out = run(id);
    assert.ok(out, id);
    assert.deepEqual(JSON.parse(out.code), runtimeBankView(canonical()));
  }
  for (const id of [
    '/r/games/vol-test/package.json',
    '/r/games/vol-test/audio-banks/x.ts',
    '/r/games/vol-test/audio-banks/alt/x.json',
    '/r/games/vol-test/audio-manifests/x.json',
  ]) {
    assert.equal(run(id), null, id);
  }
});

test('gönderilen her kanonik bank için görünümde hash/manifest/ölçüm/kalite kaydı yoktur', () => {
  const banks = [];
  const games = join(ROOT, 'games');
  for (const game of readdirSync(games, { withFileTypes: true })) {
    if (!game.isDirectory()) continue;
    const directory = join(games, game.name, 'audio-banks');
    let files = [];
    try {
      files = readdirSync(directory).filter((file) => file.endsWith('.json'));
    } catch {
      continue;
    }
    for (const file of files) banks.push(join(directory, file));
  }
  assert.ok(banks.length > 0, 'hiç kanonik bank bulunamadı: test boş geçmesin');
  const forbidden = /hash|Hash|manifest|loudness|descriptors|quality|engine|variantId|bytes/;
  for (const file of banks) {
    const raw = readFileSync(file, 'utf8');
    assert.match(raw, /programHash/, `${file}: kanonik kayıt provenance taşımalı (test boş değil)`);
    const out = audioBankRuntime().transform(raw, file.replaceAll('\\', '/'));
    assert.ok(out, file);
    assert.doesNotMatch(out.code, forbidden, `${file}: çalışma zamanı görünümüne provenance sızdı`);
    assert.ok(out.code.length < raw.length / 2, `${file}: görünüm yarıdan fazla küçülmedi`);
  }
});
