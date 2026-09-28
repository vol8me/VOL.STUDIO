import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { validateTrackedImports } from '../trackedImports.mjs';
import { sourceImports } from '../sourceImports.mjs';

test('import keşfi yorumları atlar; export, require ve sabit template importunu kapsar', () => {
  assert.deepEqual(
    sourceImports(
      [
        '// import "./hayalet.ts";',
        'const text = "from \'./yanlis.ts\'";',
        'export { a } from "./a.js";',
        'import("./b.ts");',
        'import(`./c.ts`);',
        'require("./d.cjs");',
      ].join('\n'),
      'fixture.ts',
    ),
    ['./a.js', './b.ts', './c.ts', './d.cjs'],
  );
});

test('ignore edilen build yardımcısı temiz klonun girdisi sayılamaz', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'vol-inputs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', root]);
  const write = (file, source) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), source);
  };
  write('.gitignore', 'build/\n');
  write('vite.config.ts', 'import { helper } from "./scripts/build/helper.mjs";');
  write('scripts/build/helper.mjs', 'export const helper = 1;');
  assert.match(validateTrackedImports(root).join('\n'), /git dışında: scripts\/build\/helper.mjs/);
  write('vite.config.ts', 'import { helper } from "./scripts/vite/helper.mjs";');
  write('scripts/vite/helper.mjs', 'export const helper = 1;');
  assert.deepEqual(validateTrackedImports(root), []);
  rmSync(join(root, 'scripts/vite/helper.mjs'));
  assert.match(validateTrackedImports(root).join('\n'), /dosya yok/);
});

test('NodeNext .js importu kaynak .ts dosyasına çözülür', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'vol-nodenext-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', root]);
  writeFileSync(join(root, 'a.ts'), 'import "./b.js";');
  writeFileSync(join(root, 'b.ts'), 'export {};');
  assert.deepEqual(validateTrackedImports(root), []);
});

test('noktalı modül adı uzantısız import olarak çözülür', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'vol-dotted-module-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', root]);
  writeFileSync(join(root, 'a.ts'), 'import "./definitions.arcade";');
  writeFileSync(join(root, 'definitions.arcade.ts'), 'export {};');
  assert.deepEqual(validateTrackedImports(root), []);
});

test('sonda generated importu yalnız kaynak, generator ve build çağrısı tamken geçer', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'vol-generated-import-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', root]);
  const write = (file, source) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), source);
  };
  write('.gitignore', 'devtools/deck-probe/web/vendor/\n');
  write(
    'devtools/deck-probe/web/probe.js',
    "import { summarizeFrameIntervals } from './vendor/frame-summary.js';",
  );
  write('core/src/time/frameSummary.ts', 'export const summarizeFrameIntervals = () => null;');
  const generator = `
    import { readFileSync, writeFileSync } from 'node:fs';
    import { join } from 'node:path';
    import ts from 'typescript';
    export function syncProbeMetrics(root, webDir) {
      const source = readFileSync(join(root, 'core/src/time/frameSummary.ts'), 'utf8');
      const result = ts.transpileModule(source, {});
      const directory = join(webDir, 'vendor');
      writeFileSync(join(directory, 'frame-summary.js'), result.outputText);
    }
  `;
  const build = `
    import { syncProbeMetrics } from './probe-metrics.mjs';
    syncProbeMetrics(ROOT, join(ROOT, workspace, 'web'));
  `;
  write('scripts/probe-metrics.mjs', generator);
  write('scripts/build-linux-steamrt4.mjs', build);
  assert.deepEqual(validateTrackedImports(root), []);
  write('scripts/build-linux-steamrt4.mjs', build.replace('syncProbeMetrics(ROOT', 'missing(ROOT'));
  assert.match(validateTrackedImports(root).join('\n'), /frame-summary\.js/);
  write('scripts/build-linux-steamrt4.mjs', build);
  write('scripts/probe-metrics.mjs', generator.replace('ts.transpileModule', 'ts.unrelated'));
  assert.match(validateTrackedImports(root).join('\n'), /frame-summary\.js/);
  write('scripts/probe-metrics.mjs', generator);
  rmSync(join(root, 'core/src/time/frameSummary.ts'));
  assert.match(validateTrackedImports(root).join('\n'), /frame-summary\.js/);
  write('core/src/time/frameSummary.ts', 'export const summarizeFrameIntervals = () => null;');
  write(
    'devtools/deck-probe/web/probe.js',
    "import { missing } from './vendor/other-generated.js';",
  );
  assert.match(validateTrackedImports(root).join('\n'), /other-generated\.js/);
});
