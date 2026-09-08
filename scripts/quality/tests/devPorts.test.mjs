import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { validateDevPorts } from '../devPorts.mjs';

/** Gerçek bir paket ağacı kurar; bekçi kaynaktan okur, çalışan sunucudan değil. */
function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'vol-ports-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [relative, content] of Object.entries(files)) {
    const path = join(root, relative);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
  }
  return root;
}

const manifest = '{"name":"x"}';

test('farklı paketler aynı portu bildirirse kapı düşer', (t) => {
  const root = fixture(t, {
    'games/a/package.json': manifest,
    'games/a/vite.config.ts': 'export default { preview: { port: 5181 } };',
    'devtools/b/package.json': manifest,
    'devtools/b/playwright.config.ts': 'const PORT = Number(process.env.VOL_B_E2E_PORT ?? 5181);',
  });

  const problems = validateDevPorts(root);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /5181/);
  assert.match(problems[0], /iki AYRI pakette/);
});

/*
 * Bir paketin preview portu ile KENDİ e2e portunun aynı olması meşrudur:
 * playwright o paketin `vite preview` sunucusunu başlatır, ikisi aynı sunucudur.
 * Bu ayrım olmadan bekçi her sağlıklı paketi ihlal sayardı.
 */
test('bir paketin kendi preview ve e2e portu AYNI olabilir', (t) => {
  const root = fixture(t, {
    'games/a/package.json': manifest,
    'games/a/vite.config.ts': 'export default { server: { port: 5178 }, preview: { port: 5179 } };',
    'games/a/playwright.config.ts': 'const PORT = Number(process.env.VOL_A_E2E_PORT ?? 5179);',
  });

  assert.deepEqual(validateDevPorts(root), []);
});

test('çakışma yoksa sorun bildirilmez', (t) => {
  const root = fixture(t, {
    'games/a/package.json': manifest,
    'games/a/vite.config.ts': 'export default { server: { port: 5173 } };',
    'games/b/package.json': manifest,
    'games/b/vite.config.ts': 'export default { server: { port: 5180 } };',
  });

  assert.deepEqual(validateDevPorts(root), []);
});

test('HMR portları da kapsanır', (t) => {
  const root = fixture(t, {
    'games/a/package.json': manifest,
    'games/a/vite.config.ts': 'export default { server: { hmr: { port: 1422 } } };',
    'games/b/package.json': manifest,
    'games/b/vite.config.ts': 'export default { server: { hmr: { port: 1422 } } };',
  });

  assert.match(validateDevPorts(root)[0], /1422/);
});

test('yapılandırması olmayan paket sessizce atlanır', (t) => {
  const root = fixture(t, { 'games/a/package.json': manifest });
  assert.deepEqual(validateDevPorts(root), []);
});
