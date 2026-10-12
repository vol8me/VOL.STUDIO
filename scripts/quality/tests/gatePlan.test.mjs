import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gateStages, parseJustRecipes } from '../justfile.mjs';
import {
  REQUIRES,
  REVIEWED_ESCAPES,
  REVIEWED_SCRIPT_MENTIONS,
  SCOPE_OVERRIDES,
  STAGE_PLAN,
  WAVES,
  wavesFor,
} from '../gatePlan.mjs';
import { snapshotFiles } from '../gateCache.mjs';
import {
  activePackagesWithScript,
  closureOf,
  deriveSharedInputs,
  findScopeEscapes,
  findUnrecognizedScriptMentions,
  readWorkspaceGraph,
  scopeInclude,
} from '../gateScope.mjs';
import { buildActiveScriptCommand } from '../runActive.mjs';
import { listWorkspacePackages, loadWorkspaceLifecycle } from '../workspaceLifecycle.mjs';

const root = resolve(import.meta.dirname, '../../..');
const recipes = parseJustRecipes(readFileSync(resolve(root, 'justfile'), 'utf8'));
const GATES = ['quick', 'fast', 'high', 'signoff'];

test('justfile’daki her kapı aşaması planlıdır ve planın tek bir dalgasındadır', () => {
  const stages = new Set(GATES.flatMap((gate) => gateStages(recipes, gate)));
  for (const stage of stages) assert.ok(stage in STAGE_PLAN, `${stage} gatePlan.STAGE_PLAN’da yok`);

  const waved = WAVES.flat();
  assert.equal(new Set(waved).size, waved.length, 'bir aşama iki dalgada olamaz');
  for (const stage of stages) assert.ok(waved.includes(stage), `${stage} hiçbir dalgada yok`);
  for (const stage of waved) assert.ok(stage in STAGE_PLAN, `${stage} dalgada ama planda yok`);
  for (const stage of Object.keys(STAGE_PLAN)) {
    assert.ok(stages.has(stage), `${stage} planda ama hiçbir kapıda yok (ölü kayıt)`);
  }
});

test('sıra sözleşmesi: önkoşul aşama her zaman önce koşar', () => {
  for (const gate of GATES) {
    const order = wavesFor(gateStages(recipes, gate)).flat();
    for (const [stage, needed] of Object.entries(REQUIRES)) {
      if (!order.includes(stage)) continue;
      for (const before of needed) {
        assert.ok(
          order.indexOf(before) !== -1 && order.indexOf(before) < order.indexOf(stage),
          `${gate}: ${before}, ${stage}’den önce koşmalı`,
        );
      }
    }
  }
});

test('aynı dalgadaki aşamalar birbirinin önkoşulu olamaz', () => {
  for (const wave of WAVES) {
    for (const stage of wave) {
      for (const needed of REQUIRES[stage] ?? []) {
        assert.ok(!wave.includes(needed), `${stage} ve ${needed} aynı dalgada`);
      }
    }
  }
});

test('ucuz aşama pahalıdan önce: e2e ve coverage-audio en sonlarda', () => {
  const order = wavesFor(gateStages(recipes, 'signoff')).flat();
  assert.ok(order.indexOf('lint') < order.indexOf('build'));
  assert.ok(order.indexOf('build') < order.indexOf('rust'));
  assert.ok(order.indexOf('rust') < order.indexOf('e2e'));
  assert.ok(order.indexOf('e2e') < order.indexOf('coverage-audio'));
});

test('planda olmayan aşama açık hatayla reddedilir', () => {
  assert.throws(() => wavesFor(['lint', 'yok-boyle-asama']), /yok-boyle-asama/);
});

test('önbelleksiz aşamalar ölçüm, çıktı-girdisi ve zamana bağlı olanlardır', () => {
  const uncached = Object.entries(STAGE_PLAN)
    .filter(([, plan]) => plan.cache === false)
    .map(([stage]) => stage)
    .sort();
  assert.deepEqual(uncached, [
    'build',
    'bundle',
    'node-pin',
    'scaling',
    'security-js',
    'security-rust',
  ]);
});

test('paket birimleri runActive ile aynı paketleri seçer', () => {
  const graph = readWorkspaceGraph(root);
  const lifecycle = loadWorkspaceLifecycle(resolve(root, 'workspace-lifecycle.json'));
  const packages = listWorkspacePackages(root);
  for (const stage of ['test', 'e2e', 'typecheck']) {
    const script = STAGE_PLAN[stage].script;
    const expected = buildActiveScriptCommand(lifecycle, packages, script, {
      ifPresent: true,
    }).packages;
    assert.deepEqual(activePackagesWithScript(graph, script), [...expected].sort(), stage);
  }
});

test('eşzamanlılık yalnız birimli aşamalarda ve yalnız ortak kilit paylaşmayanlarda açıktır', () => {
  for (const [stage, plan] of Object.entries(STAGE_PLAN)) {
    if (plan.concurrency === undefined) continue;
    assert.ok(plan.units, `${stage}: eşzamanlılık yalnız birimli aşamada anlamlı`);
    assert.ok(Number.isInteger(plan.concurrency) && plan.concurrency >= 2, stage);
  }
  // cargo tek hedef dizini kilitler: crate’leri birlikte koşturmak hiçbir şey kazandırmaz.
  assert.equal(STAGE_PLAN.rust.concurrency, undefined);
  // Süre ölçen aşamalar kendi içinde de art arda koşar.
  assert.equal(STAGE_PLAN.scaling.concurrency, undefined);
});

test('kapsam geçersiz kılmaları yalnız testleri repoyu okuyan aşamalara uygulanır', () => {
  const overridden = Object.entries(STAGE_PLAN)
    .filter(([, plan]) => plan.overrides)
    .map(([stage]) => stage);
  assert.deepEqual(overridden, ['test']);
});

test('kapsam geçersiz kılmaları aktif paketlere işaret eder ve gerekçelidir', () => {
  const graph = readWorkspaceGraph(root);
  for (const [name, override] of Object.entries(SCOPE_OVERRIDES)) {
    assert.ok(graph.packages.get(name)?.active, `${name} aktif paket değil`);
    assert.ok(['code', 'repo'].includes(override.kind), name);
    assert.ok(override.reason.length > 20, `${name}: gerekçe yok`);
  }
});

test('kapanış: vol-test CORE, network ve kabuğu; vitrin CORE ve kabuğu görür', () => {
  const graph = readWorkspaceGraph(root);
  assert.deepEqual(closureOf(graph, '@volstudio/vol-test'), [
    '@volstudio/core',
    '@volstudio/network',
    '@volstudio/tauri-v2',
    '@volstudio/vol-test',
  ]);
  assert.deepEqual(closureOf(graph, '@volstudio/vol-showcase'), [
    '@volstudio/core',
    '@volstudio/tauri-v2',
    '@volstudio/vol-showcase',
  ]);
});

test('kapanış kapsamı: betik düzenlemesi yalnız onu gerçekten kullanan paketlerin makbuzunu bozar', () => {
  const graph = readWorkspaceGraph(root);
  const files = [...snapshotFiles(root).keys()];
  const shared = deriveSharedInputs(root, graph, files);
  const scopeOf = (name) => scopeInclude(graph, { kind: 'closure', package: name }, shared);

  const voltest = scopeOf('@volstudio/vol-test');
  assert.equal(
    voltest('scripts/vite/audioBankRuntime.mjs'),
    true,
    'vol-test vite eklentisini kullanır',
  );
  assert.equal(
    voltest('scripts/quality/gate.mjs'),
    false,
    'kapı koşucusu paket sonucunu etkilemez',
  );
  assert.equal(voltest('workspace-lifecycle.json'), true, 'kök yapılandırma her pakette');

  const showcase = scopeOf('@volstudio/vol-showcase');
  assert.equal(
    showcase('scripts/vite/audioBankRuntime.mjs'),
    false,
    'vitrin ses eklentisini görmez',
  );
  assert.equal(showcase('scripts/vite/browserBoundary.mjs'), true);

  assert.equal(scopeOf('@volstudio/deck')('scripts/linux/targets.mjs'), true);
});

test('kapsam: kök belge kod kapsamına girmez, paket belgesi ve kök yapılandırma girer', () => {
  const graph = readWorkspaceGraph(root);
  const code = scopeInclude(graph, { kind: 'code' });
  assert.equal(code('TODO.md'), false);
  assert.equal(code('docs/gates.md'), false);
  assert.equal(code('justfile'), true);
  assert.equal(code('pnpm-lock.yaml'), true);
  assert.equal(code('scripts/quality/gate.mjs'), true);
  assert.equal(code('core/docs/music-engine.md'), true, 'paket içi belge testlerce okunur');

  const showcase = scopeInclude(graph, { kind: 'closure', package: '@volstudio/vol-showcase' });
  assert.equal(showcase('devtools/vol-showcase/src/x.ts'), true);
  assert.equal(showcase('core/src/x.ts'), true, 'bağımlılık kapanışı');
  assert.equal(showcase('games/vol-test/src/x.ts'), false, 'ilgisiz paket');
  assert.equal(showcase('docs/ui/TODO.md'), false);
  assert.equal(showcase('quality.json'), true);

  const everything = scopeInclude(graph, { kind: 'repo' });
  assert.equal(everything('docs/gates.md'), true);
});

test('dar kapsamlı paketler kapsam dışına uzanan dosya okumaz (gizli bağımlılık bekçisi)', () => {
  /*
   * Bir paketin testi kapanışının dışındaki bir dosyayı okuyorsa, o dosya
   * değişince paketin makbuzu sessizce eski kalırdı. Bu bekçi tam olarak bunu
   * yakalar: yeni bir köke/dışarıya uzanan okuma ya SCOPE_OVERRIDES’a (kapsamı
   * genişletir) ya da gerekçeyle REVIEWED_ESCAPES’a girmek zorundadır.
   */
  const graph = readWorkspaceGraph(root);
  const files = [...snapshotFiles(root).keys()];
  const seen = new Set();
  for (const [name, pkg] of graph.packages) {
    if (!pkg.active || name in SCOPE_OVERRIDES) continue;
    for (const escape of findScopeEscapes(root, graph, name, files)) {
      seen.add(escape.file);
      assert.ok(
        escape.file in REVIEWED_ESCAPES,
        `${escape.file}: "${escape.literal}" → ${escape.target} kapsam dışı. ` +
          `Paketi gatePlan.SCOPE_OVERRIDES’a alın ya da REVIEWED_ESCAPES’a gerekçeyle yazın.`,
      );
    }
  }
  for (const file of Object.keys(REVIEWED_ESCAPES)) {
    assert.ok(seen.has(file), `${file}: REVIEWED_ESCAPES’ta ama artık kaçış yok (bayat kayıt)`);
  }
});

test('paket kaynağındaki her betik başvurusu biçimi türetmece tanınır (gizli bağımlılık bekçisi)', () => {
  /*
   * `deriveSharedInputs` yalnız tanıdığı yazım biçimlerini izler. Tanımadığı bir biçim
   * (`'scripts' + sep + ad` gibi) bir betiğin paket kapsamına girmesini sessizce engeller;
   * bu bekçi o biçimi yazıldığı gün yakalar. Çözüm: biçimi tanıtmak ya da dosyayı
   * REVIEWED_SCRIPT_MENTIONS’a gerekçeyle yazmak.
   */
  const graph = readWorkspaceGraph(root);
  const files = [...snapshotFiles(root).keys()];
  const seen = new Set();
  for (const mention of findUnrecognizedScriptMentions(root, graph, files)) {
    seen.add(mention.file);
    assert.ok(
      mention.file in REVIEWED_SCRIPT_MENTIONS,
      `${mention.file}:${mention.line}: tanınmayan "scripts" başvurusu → ${mention.text}`,
    );
  }
  for (const file of Object.keys(REVIEWED_SCRIPT_MENTIONS)) {
    assert.ok(
      seen.has(file),
      `${file}: REVIEWED_SCRIPT_MENTIONS’ta ama artık anısı yok (bayat kayıt)`,
    );
  }
});
