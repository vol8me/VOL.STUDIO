import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  STATE_AXES,
  analyzeTests,
  evidenceStatus,
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

test('gerçek CORE UI yüzeyi 94 sınıf ve 54 yardımcıdır', () => {
  const real = uiSurface(ROOT);
  assert.equal(real.classes.length, 94);
  assert.equal(real.helpers.length, 54);
  assert.ok(real.types > 100);
});

test('suggestEvidence gerçek doğrulama taşıyan testi bulur', () => {
  const found = suggestEvidence(ROOT, 'Button', 2);
  assert.ok(found.length > 0);
  assert.match(found[0].file, /^core\/tests\/ui\//);
});

test('depo UI registry kuralını sağlar', () => {
  assert.deepEqual(validateRepoUiRegistry(ROOT), []);
});
