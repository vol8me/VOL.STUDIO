import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  commandRefs,
  documentedPaths,
  gateRows,
  inlineSpans,
  parseJustRecipes,
  resolvesInTree,
} from '../agentDocs.mjs';
import { workingTreeFiles } from '../gitFiles.mjs';
import { excludingFrozenPaths, loadRepoLifecycle } from '../workspaceLifecycle.mjs';

const ROOT = resolve(import.meta.dirname, '../../..');
const AGENT_DOCS = ['AGENTS.md', 'CLAUDE.md', 'devtools/pen.dev/AGENTS.md', 'docs/gates.md'];
const COMPOSITE_GATES = ['quick', 'fast', 'high', 'signoff'];
const GATE_TABLE_DOCS = ['AGENTS.md', 'docs/gates.md'];

// Belgede adı geçen ama temiz bir klonda bulunmayan yollar ve nedenleri.
// Aşağıdaki ters testler listenin bayatlamasına izin vermez.
const LOCAL_ONLY = new Map([
  ['graphify-out/', 'graphify çıktısı yereldir ve yok sayılır'],
  ['.claude/', 'Claude Code yerel çalışma dizinidir ve yok sayılır'],
]);
const ABSENT_BY_RULE = new Map([
  ['.github/workflows/', 'bulut CI yasağının konusudur; yokluğu kuralın kendisidir'],
]);

const read = (file) => readFileSync(join(ROOT, file), 'utf8');

function workspaceScripts() {
  const scripts = new Map();
  const dirs = ['core', 'tauri-v2'];
  for (const group of ['devtools', 'games']) {
    if (!existsSync(join(ROOT, group))) continue;
    for (const entry of readdirSync(join(ROOT, group), { withFileTypes: true })) {
      if (entry.isDirectory()) dirs.push(`${group}/${entry.name}`);
    }
  }
  for (const dir of dirs) {
    const manifest = join(ROOT, dir, 'package.json');
    if (!existsSync(manifest)) continue;
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
    scripts.set(pkg.name, new Set(Object.keys(pkg.scripts ?? {})));
  }
  return scripts;
}

function isIgnored(path) {
  try {
    execFileSync('git', ['check-ignore', '-q', '--no-index', '--', path], { cwd: ROOT });
    return true;
  } catch {
    return false;
  }
}

test('just tarifleri ön koşullarıyla ayrışır; atama ve parametre başlıkları karışmaz', () => {
  const recipes = parseJustRecipes(
    [
      'set shell := ["bash", "-c"]',
      '# yorum: değil',
      'quick: contract lint',
      'test-pkg pkg:',
      "report gate='high' *flags:",
      '    node x.mjs',
    ].join('\n'),
  );
  assert.deepEqual([...recipes.keys()], ['quick', 'test-pkg', 'report']);
  assert.deepEqual(recipes.get('quick'), ['contract', 'lint']);
});

test('komut başvuruları tarif, kök betik ve paket betiği olarak ayrışır', () => {
  const refs = commandRefs(
    [
      '`pnpm exec just coverage` ve `pnpm run doctor:env`',
      '`pnpm --filter @volstudio/core download-fonts`, `pnpm quick`, `just lint`',
      '`pnpm list` yerleşiktir, `pnpm exec just <tarif>` yer tutucudur',
      '```bash',
      'pnpm exec just --list',
      'pnpm signoff',
      '```',
    ].join('\n'),
  );
  assert.deepEqual(refs, [
    { kind: 'recipe', name: 'coverage' },
    { kind: 'root', name: 'doctor:env' },
    { kind: 'package', pkg: '@volstudio/core', name: 'download-fonts' },
    { kind: 'root', name: 'quick' },
    { kind: 'recipe', name: 'lint' },
    { kind: 'root', name: 'signoff' },
  ]);
});

test('yol tanıma yer tutucuyu, paket belirtecini ve oran ifadesini dışarıda bırakır', () => {
  const paths = documentedPaths(
    [
      '`docs/android.md`, `core/src/ui/`, `tauri-v2/src-tauri`, `games/<oyun>/src/config/`',
      '`@volstudio/core/rig`, `1/exportScale`, `feat(audio): x`',
      '```',
      'scripts/kod-blogu.mjs',
      '```',
    ].join('\n'),
  );
  assert.deepEqual(paths, ['core/src/ui/', 'docs/android.md', 'tauri-v2/src-tauri']);
});

test('yol çözümü belge dizinine ya da köke göre, dosya ya da dizin olarak yapılır', () => {
  const files = new Set(['devtools/pen.dev/src/rigExport.ts', 'docs/android.md']);
  assert.equal(resolvesInTree('src/rigExport.ts', 'devtools/pen.dev', files), true);
  assert.equal(resolvesInTree('devtools/pen.dev/', '.', files), true);
  assert.equal(resolvesInTree('docs/yok.md', '.', files), false);
});

test('eksik ya da fazla tarif yazan kapı satırı yakalanır', () => {
  const recipes = parseJustRecipes('a:\nb:\nc:\nhigh: a b c\n');
  const rows = gateRows('| `high` | `a` + `b` |\n| `pnpm x` | `a` |\n', recipes, ['high']);
  assert.deepEqual(rows.get('high'), ['a', 'b']);
  assert.notDeepEqual(rows.get('high'), [...recipes.get('high')].sort());
});

test('agent belgelerindeki her yol gerçek ağaçta vardır', () => {
  const files = new Set(workingTreeFiles(ROOT, []));
  const missing = [];
  for (const doc of AGENT_DOCS) {
    for (const path of documentedPaths(read(doc))) {
      if (LOCAL_ONLY.has(path) || ABSENT_BY_RULE.has(path)) continue;
      if (!resolvesInTree(path, dirname(doc), files)) missing.push(`${doc}: ${path}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('agent belgelerindeki her komut gerçekten vardır', () => {
  const recipes = parseJustRecipes(read('justfile'));
  const rootScripts = new Set(Object.keys(JSON.parse(read('package.json')).scripts));
  const packages = workspaceScripts();
  const missing = [];
  for (const doc of AGENT_DOCS) {
    for (const ref of commandRefs(read(doc))) {
      const known =
        ref.kind === 'recipe'
          ? recipes.has(ref.name)
          : ref.kind === 'root'
          ? rootScripts.has(ref.name)
          : packages.get(ref.pkg)?.has(ref.name) === true;
      if (!known) missing.push(`${doc}: ${ref.kind} ${ref.pkg ?? ''} ${ref.name}`.trim());
    }
  }
  assert.deepEqual(missing, []);
});

test('belgelerdeki birleşik kapı bileşimi justfile ile birebir aynıdır', () => {
  const recipes = parseJustRecipes(read('justfile'));
  for (const doc of GATE_TABLE_DOCS) {
    const rows = gateRows(read(doc), recipes, COMPOSITE_GATES);
    for (const gate of COMPOSITE_GATES) {
      assert.ok(rows.has(gate), `${doc}: ${gate} satırı yok`);
      assert.deepEqual(rows.get(gate), [...recipes.get(gate)].sort(), `${doc}: ${gate} bileşimi`);
    }
  }
});

test('yerel ve kurala bağlı istisnalar gerçekten öyledir ve belgede geçer', () => {
  const mentioned = new Set(AGENT_DOCS.flatMap((doc) => inlineSpans(read(doc))));
  for (const [path, reason] of LOCAL_ONLY) {
    assert.ok(mentioned.has(path), `${path} artık anılmıyor; istisna gereksiz`);
    assert.equal(isIgnored(`${path}x`), true, `${path}: ${reason}`);
  }
  for (const [path, reason] of ABSENT_BY_RULE) {
    assert.ok(mentioned.has(path), `${path} artık anılmıyor; istisna gereksiz`);
    assert.equal(existsSync(join(ROOT, path)), false, `${path}: ${reason}`);
  }
});

test('aktif belgelerde düz metin olarak kalmış Unicode kaçışı yoktur', () => {
  const docs = excludingFrozenPaths(workingTreeFiles(ROOT, ['*.md']), loadRepoLifecycle(ROOT));
  const escaped = docs.filter((doc) => /\\u[0-9a-fA-F]{4}/.test(read(doc)));
  assert.deepEqual(escaped, []);
});
