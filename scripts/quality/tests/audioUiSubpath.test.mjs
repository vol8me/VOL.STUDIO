import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { coreAliases } from '../../vite/coreAliases.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** `@volstudio/core/audio/ui` alt yolunun gerçek paketlenmiş izi. */
async function bundle() {
  const requireFromGame = createRequire(join(ROOT, 'games/vol-test/package.json'));
  const { build } = await import(pathToFileURL(requireFromGame.resolve('vite')).href);
  const directory = mkdtempSync(join(tmpdir(), 'vol-audio-ui-'));
  try {
    writeFileSync(join(directory, 'entry.ts'), "export * from '@volstudio/core/audio/ui';\n");
    const result = await build({
      configFile: false,
      root: directory,
      logLevel: 'silent',
      resolve: { alias: coreAliases() },
      build: {
        write: false,
        minify: false,
        lib: { entry: join(directory, 'entry.ts'), formats: ['es'], fileName: 'out' },
      },
    });
    const outputs = (Array.isArray(result) ? result : [result]).flatMap((entry) => entry.output);
    return outputs.filter((chunk) => chunk.type === 'chunk');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('@volstudio/core/audio/ui yayınlanmış alt yoldur ve Phaser çekmeden paketlenir', async () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'core/package.json'), 'utf8'));
  assert.deepEqual(manifest.exports['./audio/ui'], {
    import: './src/audio/ui/index.ts',
    types: './src/audio/ui/index.ts',
  });
  assert.ok(
    coreAliases().some((alias) => alias.find === '@volstudio/core/audio/ui'),
    'alias haritası alt yolu içermeli',
  );

  const chunks = await bundle();
  const code = chunks.map((chunk) => chunk.code).join('\n');
  assert.match(code, /UiSoundKit = class|class UiSoundKit/);
  assert.match(code, /SoundBank = class|class SoundBank/);
  // Phaser'a hiçbir bağ yok: ne içe aktarma ne de çalışma zamanı referansı.
  assert.doesNotMatch(code, /phaser/i);
  assert.ok(chunks.every((chunk) => !chunk.imports.some((name) => /phaser/i.test(name))));
  // Kök barrel'ın (oyun runtime'ı) hiçbir parçası sızmaz.
  assert.doesNotMatch(code, /class Diagnostics|class MusicEngine|BaseSprite/);
  // Küçük kalır: yalnız ses katmanı ve UI niyet türleri (gzip öncesi 60 KB altı).
  assert.ok(code.length < 60_000, `paket ${code.length} bayt`);
});

test('vitrin ve oyun yapılandırmaları aynı alias kaynağını kullanır (aynı alt yolu görürler)', () => {
  for (const path of ['devtools/vol-showcase/vite.config.ts', 'games/vol-test/vite.config.ts']) {
    const text = readFileSync(join(ROOT, path), 'utf8');
    assert.match(text, /coreAliases\(\)/, `${path} coreAliases kullanmalı`);
  }
});
