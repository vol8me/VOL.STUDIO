import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGame } from '../../new-game.mjs';

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'vol-new-game-'));
  for (const file of ['workspace-lifecycle.json', 'quality.json']) {
    writeFileSync(join(root, file), readFileSync(new URL(`../../../${file}`, import.meta.url)));
  }
  const options = {
    name: 'new-demo',
    id: 'com.volstudio.newdemo',
    title: 'YENİ.OYUN',
    port: 5281,
    hmrPort: 1481,
    e2ePort: 5282,
  };
  try {
    run(root, options);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('yeni oyun gerçek dosya ağacını ve bütün kalite kayıtlarını üretir', () =>
  fixture((root, options) => {
    const result = createGame(root, options);
    assert.equal(result.packageName, '@volstudio/new-demo');
    const config = JSON.parse(readFileSync(join(root, 'games/new-demo/src-tauri/tauri.conf.json')));
    assert.equal(config.identifier, options.id);
    assert.equal(config.productName, options.title);
    assert.equal(config.mainBinaryName, options.title);
    assert.equal(config.app.windows[0].title, options.title);
    assert.equal(config.build.devUrl, `http://localhost:${options.port}`);
    for (const icon of config.bundle.icon)
      assert.ok(existsSync(join(root, 'games/new-demo/src-tauri', icon)));
    const quality = JSON.parse(readFileSync(join(root, 'quality.json')));
    assert.ok(quality.packages[result.packageName]);
    assert.ok(quality.bundles[result.path]);
    assert.ok(quality.scaling[result.path].$measure);
    const lifecycle = JSON.parse(readFileSync(join(root, 'workspace-lifecycle.json')));
    assert.ok(
      lifecycle.workspaces.some((entry) => entry.path === result.path && entry.status === 'active'),
    );
    const main = readFileSync(join(root, result.path, 'src/main.ts'), 'utf8');
    assert.ok(main.includes('createVolGame'));
    assert.ok(
      !readFileSync(join(root, result.path, 'playwright.config.ts'), 'utf8').includes('{{'),
    );
    assert.ok(!main.includes('{{'));
    assert.ok(
      readFileSync(join(root, result.path, 'vite.config.ts'), 'utf8').includes('coreAliases()'),
    );
    assert.throws(() => createGame(root, options), /mevcut/);
  }));

test('geçersiz ad, kimlik ve port hiçbir dosyayı değiştirmez', () =>
  fixture((root, options) => {
    const original = readFileSync(join(root, 'quality.json'), 'utf8');
    for (const invalid of [
      { name: '../escape' },
      { name: 'Upper' },
      { id: 'bad' },
      { id: 'com.volstudio.bad-id' },
      { port: 0 },
      { port: 65536 },
      { port: 5281.5 },
      { hmrPort: 5281 },
    ]) {
      assert.throws(() => createGame(root, { ...options, ...invalid }));
      assert.equal(readFileSync(join(root, 'quality.json'), 'utf8'), original);
      assert.ok(!existsSync(join(root, 'games/new-demo')));
    }
  }));

test('mevcut ürün kimliği ve port başka oyuna verilmez', () =>
  fixture((root, options) => {
    const app = join(root, 'games/vol-test/src-tauri');
    mkdirSync(app, { recursive: true });
    writeFileSync(join(app, 'tauri.conf.json'), JSON.stringify({ identifier: options.id }));
    assert.throws(() => createGame(root, options), /kimliği/);
    writeFileSync(join(app, 'tauri.conf.json'), '{}');
    writeFileSync(
      join(root, 'games/vol-test/vite.config.ts'),
      `export default {server:{port: ${options.port}}};`,
    );
    assert.throws(() => createGame(root, options), /Port/);
  }));

test('ürün ikonları kimlikten deterministik ve farklı üretilir', () =>
  fixture((root, options) => {
    createGame(root, options);
    createGame(root, {
      ...options,
      name: 'next-demo',
      id: 'com.volstudio.nextdemo',
      port: 5291,
      hmrPort: 1491,
      e2ePort: 5292,
    });
    assert.notDeepEqual(
      readFileSync(join(root, 'games/new-demo/src-tauri/icons/icon.png')),
      readFileSync(join(root, 'games/next-demo/src-tauri/icons/icon.png')),
    );
  }));

test('geçersiz kalite şeması yeni ağacı veya kayıtları değiştirmeden reddedilir', () =>
  fixture((root, options) => {
    const file = join(root, 'quality.json');
    const quality = JSON.parse(readFileSync(file, 'utf8'));
    delete quality.floor.lines;
    const invalid = JSON.stringify(quality);
    writeFileSync(file, invalid);
    const lifecycle = readFileSync(join(root, 'workspace-lifecycle.json'), 'utf8');
    assert.throws(() => createGame(root, options), /quality.json geçersiz/);
    assert.equal(readFileSync(file, 'utf8'), invalid);
    assert.equal(readFileSync(join(root, 'workspace-lifecycle.json'), 'utf8'), lifecycle);
    assert.ok(!existsSync(join(root, 'games/new-demo')));
  }));
