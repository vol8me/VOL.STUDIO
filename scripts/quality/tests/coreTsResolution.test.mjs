import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '../../..');
const consumers = [
  'core',
  'tauri-v2',
  'devtools/audio-synth',
  'devtools/vol-ui',
  'devtools/pen.dev',
  'games/vol-test',
];

for (const consumer of consumers) {
  test(`${consumer}: CORE yalnız exports yüzeyinden TypeScript ile çözülür`, () => {
    const configFile = ts.readConfigFile(resolve(root, consumer, 'tsconfig.json'), ts.sys.readFile);
    const config = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      resolve(root, consumer),
    );
    const from = resolve(root, consumer, 'src/probe.ts');
    const resolved = (name) =>
      ts.resolveModuleName(name, from, config.options, ts.sys).resolvedModule;
    assert.ok(resolved('@volstudio/core'));
    assert.ok(resolved('@volstudio/core/ui'));
    assert.equal(resolved('@volstudio/core/platform/haptics'), undefined);
    assert.equal(config.options.baseUrl, undefined);
    assert.equal(config.options.ignoreDeprecations, undefined);
    for (const values of Object.values(config.options.paths ?? {})) {
      assert.ok(values.every((value) => value.startsWith('./') || value.startsWith('../')));
    }
  });
}

test('Node sürümü manifest ve sürüm dosyasında aynı deterministik çalışma zamanıdır', () => {
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  assert.equal(manifest.engines.node, '22.23.1');
});

test('pen.dev sıkı indeks denetimini korur', () => {
  const config = JSON.parse(readFileSync(resolve(root, 'devtools/pen.dev/tsconfig.json'), 'utf8'));
  assert.equal(config.compilerOptions.noUncheckedIndexedAccess, true);
});
