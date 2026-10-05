import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { sharedPublic } from '../../vite/sharedPublic.mjs';

test('ortak public Unicode kaynak ve hedefte byte kimliğiyle build çıktısına birleşir', () => {
  const root = mkdtempSync(join(tmpdir(), 'vol-public-Ω-'));
  try {
    const source = join(root, 'kaynak Türkçe & Ω');
    const target = join(root, 'oyun Türkçe & Ω');
    mkdirSync(join(source, 'fonts', 'alt'), { recursive: true });
    mkdirSync(join(target, 'dist', 'assets'), { recursive: true });
    const bytes = Buffer.from([0, 255, 42, 128]);
    writeFileSync(join(source, 'fonts', 'alt', 'test.woff2'), bytes);
    writeFileSync(join(source, 'glyph.svg'), '<svg>Türkçe Ω</svg>');
    writeFileSync(join(target, 'dist', 'assets', 'app.js'), 'ürün');
    // Native cpSync çökerse ana test süreci yaşar; gerçek build hook'u çocukta çalışır.
    const script = `import {sharedPublic} from ${JSON.stringify(new URL('../../vite/sharedPublic.mjs', import.meta.url).href)};
      const plugin=sharedPublic(process.argv[1]);
      plugin.configResolved({root:process.argv[2],build:{outDir:'dist'}});
      await plugin.writeBundle();`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, source, target], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr || `child status ${result.status}`);
    assert.deepEqual(readFileSync(join(target, 'dist', 'fonts', 'alt', 'test.woff2')), bytes);
    assert.equal(readFileSync(join(target, 'dist', 'glyph.svg'), 'utf8'), '<svg>Türkçe Ω</svg>');
    assert.equal(readFileSync(join(target, 'dist', 'assets', 'app.js'), 'utf8'), 'ürün');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ortak public kopyalama hatası build hook’undan reddedilir', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vol-public-failure-'));
  try {
    const source = join(root, 'source');
    mkdirSync(source);
    writeFileSync(join(source, 'glyph.svg'), '<svg/>');
    writeFileSync(join(root, 'blocked'), 'dosya');
    const plugin = sharedPublic(source);
    plugin.configResolved({ root, build: { outDir: 'blocked/dist' } });
    await assert.rejects(Promise.resolve().then(() => plugin.writeBundle()), /ENOENT|ENOTDIR|EEXIST/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
