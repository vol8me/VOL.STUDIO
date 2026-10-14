import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  REGISTRY_PATH,
  STATE_AXES,
  STATE_MARKERS,
  analyzeTests,
  evidenceStatus,
  stateCoverage,
  stateEvidenceStatus,
  suggestEvidence,
  uiSurface,
  validateRepoUiRegistry,
  validateUiRegistry,
} from '../uiRegistry.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

const surface = {
  classes: [{ name: 'Foo', file: 'src/ui/x/Foo.ts' }],
  helpers: [{ name: 'fooHelper', file: 'src/ui/x/helper.ts' }],
};
const usage = { used: new Set(['Foo']), text: '' };
const everything = Object.fromEntries(STATE_AXES.map((state) => [state, 'gerekçe']));
const archetypes = {
  control: { applicable: [...STATE_AXES], na: {} },
  helper: {
    applicable: ['normal'],
    na: Object.fromEntries(
      STATE_AXES.filter((s) => s !== 'normal').map((s) => [s, 'görsel değil']),
    ),
  },
};
const GOOD_TEST =
  "import { Foo } from 'x';\nit('Foo davranışı', () => { expect(new Foo()).toBeTruthy(); });\n";

function entry(over = {}) {
  return {
    export: 'Foo',
    kind: 'class',
    tier: 1,
    phase: 'UI-03',
    anchor: 'A3',
    archetype: 'control',
    consumer: 'direct',
    showcase: ['a.ts'],
    tests: [{ file: 'core/tests/ui/foo.test.ts', title: 'Foo davranışı' }],
    ...over,
  };
}
function helperEntry(over = {}) {
  return entry({
    export: 'fooHelper',
    kind: 'helper',
    anchor: null,
    archetype: 'helper',
    consumer: 'catalog',
    showcase: [],
    shownVia: { via: null, reason: 'görsel değil' },
    tests: [{ file: 'core/tests/ui/foo.test.ts', title: 'fooHelper çalışır' }],
    ...over,
  });
}
const files = {
  'core/tests/ui/foo.test.ts':
    GOOD_TEST + "it('fooHelper çalışır', () => { expect(fooHelper()).toBe(1); });\n",
  'devtools/vol-showcase/src/a.ts': 'const x = new Foo();',
  'docs/ui/TODO.md': '- [ ] **UI-03.1 — Button.** metin\n',
};

function run({ entries, archetype = archetypes, extra = {}, tree = files, surf = surface } = {}) {
  return validateUiRegistry({
    registry: {
      schema: 'UiRegistryV1',
      archetypes: archetype,
      entries: entries ?? [entry(), helperEntry()],
    },
    surface: surf,
    usage,
    showcaseText: 'const y = new Foo();',
    read: (path) => tree[path] ?? null,
    ...extra,
  });
}

test('tam ve geçerli kayıt ihlal üretmez', () => {
  assert.deepEqual(run(), []);
});

test('eklenen export kayıtsızsa kapı düşer ve aday komutunu söyler', () => {
  const problems = run({
    surf: { ...surface, classes: [...surface.classes, { name: 'Bar', file: 'src/ui/x/Bar.ts' }] },
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Bar \(class\) kayıtsız/);
  assert.match(problems[0], /ui-registry\.mjs --suggest Bar/);
});

test('yüzeyde olmayan kayıt ölü sayılır ve tür uyuşmazlığı yakalanır', () => {
  const problems = run({
    entries: [entry({ kind: 'helper' }), helperEntry(), entry({ export: 'Ghost' })],
  });
  assert.ok(problems.some((p) => /Ghost CORE UI yüzeyinde yok/.test(p)));
  assert.ok(problems.some((p) => /Foo: kind helper, yüzeyde class/.test(p)));
});

test('testin adını yalnız yorumda ya da metinde geçirmesi doğrulama sayılmaz', () => {
  const comment = "it('Foo davranışı', () => { // Foo burada\n expect(1).toBe(1); });";
  const text = "it('Foo davranışı', () => { expect('Foo').toBe('Foo'); });";
  for (const source of [comment, text]) {
    const problems = run({
      tree: {
        ...files,
        'core/tests/ui/foo.test.ts': `${source}\nit('fooHelper çalışır', () => { expect(fooHelper()).toBe(1); });`,
      },
    });
    assert.ok(
      problems.some((p) => /Foo: "Foo davranışı" testi adı tanımlayıcı olarak kullanmıyor/.test(p)),
      source,
    );
  }
});

test('expect çağırmayan ya da başlığı olmayan test kanıtı reddedilir', () => {
  const noAssert =
    "it('Foo davranışı', () => { new Foo(); });\nit('fooHelper çalışır', () => { expect(fooHelper()).toBe(1); });";
  assert.ok(
    run({ tree: { ...files, 'core/tests/ui/foo.test.ts': noAssert } }).some((p) =>
      /hiçbir expect çağrısı taşımıyor/.test(p),
    ),
  );
  const renamed = files['core/tests/ui/foo.test.ts'].replace('Foo davranışı', 'başka');
  assert.ok(
    run({ tree: { ...files, 'core/tests/ui/foo.test.ts': renamed } }).some((p) =>
      /"Foo davranışı" başlıklı test .* içinde yok/.test(p),
    ),
  );
  assert.ok(
    run({ tree: { ...files, 'core/tests/ui/foo.test.ts': undefined } }).some((p) =>
      /test dosyası yok/.test(p),
    ),
  );
});

test('sınıf yardımcı işlev üzerinden kullanılsa da bloğun kanıtı geçerlidir', () => {
  const viaHelper =
    "function mount() { return new Foo(); }\nit('Foo davranışı', () => { expect(mount()).toBeTruthy(); });\n" +
    "it('fooHelper çalışır', () => { expect(fooHelper()).toBe(1); });";
  assert.deepEqual(run({ tree: { ...files, 'core/tests/ui/foo.test.ts': viaHelper } }), []);
  const facts = analyzeTests('x.test.ts', viaHelper);
  assert.equal(evidenceStatus(facts, 'Foo davranışı', 'Foo'), 'ok');
  assert.equal(evidenceStatus(facts, 'Foo davranışı', 'Baz'), 'name');
});

test('it.each ve skip blokları başlık taşır', () => {
  const facts = analyzeTests(
    'x.test.ts',
    "it.each([1])('Foo %s', () => { expect(new Foo()).toBeTruthy(); });\nit.skip('atla', () => { expect(Foo).toBe(1); });",
  );
  assert.deepEqual(
    facts.map((f) => f.title),
    ['Foo %s', 'atla'],
  );
});

test('gap yalnız açık görevle ve kanıt yokken geçerlidir', () => {
  const noEvidence = entry({ tests: [], gap: { task: 'UI-03.1', reason: 'test yok' } });
  assert.deepEqual(run({ entries: [noEvidence, helperEntry()] }), []);
  assert.ok(
    run({ entries: [entry({ tests: [] }), helperEntry()] }).some((p) => /test kanıtı yok/.test(p)),
  );
  assert.ok(
    run({ entries: [entry({ gap: { task: 'UI-03.1', reason: 'x' } }), helperEntry()] }).some((p) =>
      /bayat gap/.test(p),
    ),
  );
  assert.ok(
    run({
      entries: [entry({ tests: [], gap: { task: 'UI-09.9', reason: 'x' } }), helperEntry()],
    }).some((p) => /gap.task açık bir UI görevi olmalı/.test(p)),
  );
});

test('tüketici, vitrin ve arketip alanları yüzeyle çelişemez', () => {
  const problems = run({
    entries: [
      entry({ consumer: 'catalog', showcase: [], tests: entry().tests }),
      helperEntry({ archetype: 'yok', consumer: 'direct' }),
    ],
  });
  assert.ok(problems.some((p) => /VOL\.TEST içe aktarıyor, consumer direct olmalı/.test(p)));
  assert.ok(problems.some((p) => /vitrin dosyası ya da gerekçeli shownVia gerekir/.test(p)));
  assert.ok(problems.some((p) => /bilinmeyen arketip "yok"/.test(p)));
  assert.ok(problems.some((p) => /fooHelper: consumer direct ama VOL\.TEST/.test(p)));
});

test('vitrin dosyası adı yalnız yorumda geçiriyorsa gösterim sayılmaz', () => {
  const problems = run({
    tree: { ...files, 'devtools/vol-showcase/src/a.ts': '// Foo ile ilgili\nconst s = "Foo";' },
  });
  assert.ok(problems.some((p) => /a\.ts adı tanımlayıcı olarak kullanmıyor/.test(p)));
});

test('arketip durum matrisi eksiksiz olmalı: her eksen uygulanabilir ya da gerekçeli N/A', () => {
  const broken = {
    ...archetypes,
    control: { applicable: STATE_AXES.filter((s) => s !== 'hover'), na: {} },
    helper: { applicable: ['normal'], na: { ...archetypes.helper.na, hover: '' } },
  };
  const problems = run({ archetype: broken });
  assert.ok(problems.some((p) => /control: "hover" ya uygulanabilir ya da gerekçeli N\/A/.test(p)));
  assert.ok(problems.some((p) => /helper: "hover" N\/A gerekçesi boş/.test(p)));
  assert.equal(Object.keys(everything).length, STATE_AXES.length);
});

test('gerçek CORE UI yüzeyi 98 sınıf ve 70 yardımcıdır', () => {
  const real = uiSurface(ROOT);
  assert.equal(real.classes.length, 98);
  assert.equal(real.helpers.length, 70);
  assert.ok(real.types > 100);
});

test('CATALOG.md başlık sayıları gerçek yüzey ve kayıtla birebirdir', () => {
  const catalog = readFileSync(resolve(ROOT, 'docs/ui/CATALOG.md'), 'utf8');
  const real = uiSurface(ROOT);
  const registry = JSON.parse(readFileSync(resolve(ROOT, REGISTRY_PATH), 'utf8'));
  const direct = registry.entries.filter(
    (entry) => entry.kind === 'class' && entry.consumer === 'direct',
  ).length;
  const stated = /(\d+) public sınıf, (\d+) runtime export, (\d+) type-only export/.exec(catalog);
  assert.ok(stated, 'CATALOG.md "N public sınıf, M runtime export, K type-only export" satırı yok');
  assert.deepEqual(
    stated.slice(1).map(Number),
    [real.classes.length, real.classes.length + real.helpers.length, real.types],
    'CATALOG.md kapsam sayıları bayat; gerçek yüzeye göre güncelle',
  );
  const statedDirect = /(\d+) sınıf VOL\.TEST'te doğrudan/.exec(catalog);
  assert.ok(statedDirect, `CATALOG.md "N sınıf VOL.TEST'te doğrudan" ifadesi yok`);
  assert.equal(Number(statedDirect[1]), direct, 'doğrudan tüketilen sınıf sayısı bayat');
});

const FOO_FILE = 'core/tests/ui/foo.test.ts';
const DISABLED_TITLE = 'Foo devre dışıyken tıklamaya yanıt vermez';
const DISABLED_TEST = [
  `it('${DISABLED_TITLE}', () => {`,
  '  const foo = new Foo({ disabled: true });',
  '  expect(foo.element.disabled).toBe(true);',
  '});',
  "it('Foo davranışı', () => { expect(new Foo()).toBeTruthy(); });",
  "it('fooHelper çalışır', () => { expect(fooHelper()).toBe(1); });",
].join('\n');
const at = (title) => ({ file: FOO_FILE, title });
const withStates = (states, source = DISABLED_TEST) =>
  run({
    entries: [entry({ states }), helperEntry()],
    tree: { ...files, [FOO_FILE]: source },
  });

test('durum bağı: işaret taşıyan, doğrulamalı test uygulanabilir duruma bağlanır', () => {
  assert.deepEqual(withStates({ disabled: [at(DISABLED_TITLE)] }), []);
});

test('durum bağı: işareti olmayan, başlıksız ya da doğrulamasız test reddedilir', () => {
  const noMarker = withStates({ hover: [at('Foo davranışı')] });
  assert.ok(
    noMarker.some((p) =>
      /states\.hover: "Foo davranışı" testinin kodunda hover durumunun işareti yok/.test(p),
    ),
  );
  assert.ok(
    withStates({ disabled: [at('yok')] }).some((p) =>
      /states\.disabled: "yok" başlıklı test/.test(p),
    ),
  );
  const bare = DISABLED_TEST.replace('expect(foo.element.disabled).toBe(true);', 'foo.element;');
  assert.ok(
    withStates({ disabled: [at(DISABLED_TITLE)] }, bare).some((p) =>
      /states\.disabled: .* hiçbir expect çağrısı taşımıyor/.test(p),
    ),
  );
});

test('durum bağı: işaret yalnız yorumda ya da başlıkta geçiyorsa sayılmaz', () => {
  const commentOnly = [
    "it('Foo disabled başlığı', () => {",
    '  // disabled burada yalnız yorum',
    '  expect(new Foo()).toBeTruthy();',
    '});',
    "it('Foo davranışı', () => { expect(new Foo()).toBeTruthy(); });",
    "it('fooHelper çalışır', () => { expect(fooHelper()).toBe(1); });",
  ].join('\n');
  const problems = withStates({ disabled: [at('Foo disabled başlığı')] }, commentOnly);
  assert.ok(problems.some((p) => /disabled durumunun işareti yok/.test(p)));
});

test('durum bağı: N/A, bilinmeyen ve boş durum reddedilir', () => {
  const helper = run({
    entries: [entry(), helperEntry({ states: { hover: [at('fooHelper çalışır')] } })],
  });
  assert.ok(helper.some((p) => /fooHelper: states\.hover uygulanabilir değil/.test(p)));
  assert.ok(
    withStates({ uçuş: [at('Foo davranışı')] }).some((p) => /bilinmeyen durum "uçuş"/.test(p)),
  );
  assert.ok(withStates({ normal: [] }).some((p) => /states\.normal boş/.test(p)));
});

test('normal durum işaretsizdir; her durum ekseninin işaret tanımı vardır', () => {
  const facts = analyzeTests('x.test.ts', DISABLED_TEST);
  assert.equal(stateEvidenceStatus(facts, 'Foo davranışı', 'Foo', 'normal'), 'ok');
  assert.equal(stateEvidenceStatus(facts, 'Foo davranışı', 'Foo', 'hover'), 'marker');
  assert.equal(stateEvidenceStatus(facts, DISABLED_TITLE, 'Foo', 'disabled'), 'ok');
  for (const state of STATE_AXES) {
    assert.ok(state in STATE_MARKERS, `${state}: işaret tanımı yok`);
    const marker = STATE_MARKERS[state];
    assert.ok(marker === null || marker instanceof RegExp, `${state}: RegExp ya da null olmalı`);
  }
});

test('stateCoverage bağlı, fixture ile sınanan ve açık durumları ayırır', () => {
  const registry = {
    archetypes: { control: { applicable: ['normal', 'hover', 'disabled'], na: {} } },
    entries: [
      {
        export: 'Foo',
        phase: 'UI-03',
        tier: 1,
        archetype: 'control',
        extraStates: ['loading'],
        states: { normal: [at('b')] },
      },
      { export: 'Bar', phase: 'UI-09', tier: 2, archetype: 'control' },
    ],
  };
  const fixtures = { fixtures: [{ export: 'Foo', states: ['hover'] }] };
  const rows = stateCoverage(registry, { phases: ['UI-03'], tier: 1, fixtures });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].bound, ['normal']);
  assert.deepEqual(rows[0].fixtured, ['hover']);
  assert.deepEqual(rows[0].open, ['disabled', 'loading']);
  assert.equal(rows[0].applicable, 4);
});

test('stateNa gerekçeli N/A durumu açık sayılmaz ve doğrulanır', () => {
  const registry = {
    archetypes: { control: { applicable: ['normal', 'hover', 'disabled'], na: {} } },
    entries: [
      {
        export: 'Foo',
        phase: 'UI-03',
        tier: 1,
        archetype: 'control',
        states: { normal: [at('b')] },
        stateNa: { hover: 'bu denetim işaretçi girişine tepki vermez; yalnız klavye tetikler' },
      },
    ],
  };
  const [row] = stateCoverage(registry, { phases: ['UI-03'], tier: 1 });
  assert.deepEqual(row.na, ['hover']);
  assert.deepEqual(row.open, ['disabled']);
});

test('stateNa: uygulanabilir olmayan, bağlı ve gerekçesiz durum ihlaldir', () => {
  const problems = run({
    entries: [
      entry({
        states: { hover: [{ file: 'core/tests/ui/foo.test.ts', title: 'Foo davranışı' }] },
        stateNa: {
          hover: 'durum hem bağlı hem N/A olmamalı, ikisi birden yazılırsa bozuk kayıttır',
          disabled: 'kısa',
          bogus: 'bilinmeyen durum için yeterince uzun bir gerekçe yazıldı burada',
        },
      }),
      helperEntry({
        stateNa: {
          hover: 'arketip bu durumu zaten gerekçeli olarak N/A saymıştır, kayıt gereksiz',
        },
      }),
    ],
  });
  assert.ok(problems.some((p) => /stateNa\.hover.*hem teste bağlı hem N\/A/.test(p)));
  assert.ok(problems.some((p) => /stateNa\.disabled.*en az 30 karakter/.test(p)));
  assert.ok(problems.some((p) => /bilinmeyen durum "bogus"/.test(p)));
  assert.ok(problems.some((p) => /fooHelper.*stateNa\.hover.*zaten uygulanabilir değil/.test(p)));
});

/**
 * Erken tier-1 fazlarında teste bağlı durum sayısının tabanı (UI-08.4). Yalnız yukarı çıkar: bağ sildiysen ya da
 * testi yeniden adlandırdıysan kapı zaten düşer; bu taban, bağların sessizce gevşetilmesini engeller. Yeni bağ
 * ekleyince tabanı yükselt; kalan açık durumlar `node scripts/quality/cli/ui-registry.mjs --states` çıktısındadır
 * ve UI-13.1 kapanışında sıfır olmalıdır.
 */
const BOUND_STATE_FLOOR = {
  'UI-01': 28,
  'UI-02': 4,
  'UI-03': 15,
  'UI-04': 11,
  'UI-05': 21,
  'UI-07': 1,
  'UI-08': 8,
  'UI-09': 11,
  'UI-10': 4,
  'UI-11': 5,
  'UI-12': 2,
};

test('erken tier-1 fazlarında teste bağlı durum sayısı tabanın altına inmez', () => {
  const registry = JSON.parse(readFileSync(resolve(ROOT, REGISTRY_PATH), 'utf8'));
  const rows = stateCoverage(registry, { phases: Object.keys(BOUND_STATE_FLOOR), tier: 1 });
  for (const [phase, floor] of Object.entries(BOUND_STATE_FLOOR)) {
    const bound = rows
      .filter((row) => row.phase === phase)
      .reduce((total, row) => total + row.bound.length, 0);
    assert.ok(bound >= floor, `${phase}: ${bound} bağlı durum, taban ${floor}`);
  }
});

test('suggestEvidence gerçek doğrulama taşıyan testi bulur', () => {
  const found = suggestEvidence(ROOT, 'Button', 2);
  assert.ok(found.length > 0);
  assert.match(found[0].file, /^core\/tests\/ui\//);
});

test('depo UI registry kuralını sağlar', () => {
  assert.deepEqual(validateRepoUiRegistry(ROOT), []);
});
