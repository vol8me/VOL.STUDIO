/**
 * Kapı koşucusunun planı: aşamaların SIRASI, hangilerinin birlikte koşabildiği
 * ve her aşamanın makbuz kapsamı. Hangi aşamanın hangi birleşik kapıya girdiği
 * `justfile`dadır; burası yalnız nasıl koşacağını söyler.
 *
 * Kural: `justfile`daki her aşamanın burada kaydı olmak zorundadır
 * (`scripts/quality/tests/gatePlan.test.mjs`); yeni aşama planlanmadan kapıya
 * giremez.
 */

/**
 * Dalgalar sırayla koşar; bir dalganın aşamaları birlikte koşar. Sıra ucuzdan
 * pahalıya: bir kapı düşecekse dakikalar harcanmadan düşer.
 *
 * Aynı dalgaya yalnız birbirinin ölçümünü bozmayan, statik aşamalar girer.
 * Süre ölçen (`scaling`) ve tarayıcı süren (`e2e`) aşamalar tek başına koşar;
 * `test`/`coverage`/`rust` kendi içinde çok çekirdek kullanır.
 */
export const WAVES = [
  ['node-pin'],
  ['contract', 'format-check', 'typecheck', 'lint', 'lint-css'],
  ['build'],
  ['bundle'],
  ['scaling'],
  ['audio-test'],
  ['rust'],
  ['test'],
  ['coverage'],
  ['coverage-shape'],
  ['e2e'],
  ['coverage-audio'],
  ['audio-verify'],
  ['security-js', 'security-rust'],
];

/** Aşama → önce bitmesi gereken aşamalar (yalnız sıralama sözleşmesi). */
export const REQUIRES = {
  bundle: ['build'],
  rust: ['build'],
  e2e: ['build'],
  'coverage-shape': ['coverage'],
};

/**
 * Makbuz kapsamı. `cache: false` aşama HER ZAMAN koşar:
 *  - `node-pin`: 1 sn, ortamı doğrular.
 *  - `build`, `bundle`: çıktısı (dist) sonraki aşamaların girdisidir; atlanırsa
 *    onlar eski ya da eksik çıktı görür. Toplamı 5 sn.
 *  - `scaling`: süre oranı ölçer, ölçüm tekrar edilmeden güvenilmez.
 *  - `security-*`: sonuç zamana bağlıdır (yeni advisory).
 *
 * `units`: aşama parça parça makbuzlanır; yalnız makbuzu olmayan parçalar koşar.
 * Parçaları `gateUnits.mjs` türetir (`packages`, `typecheck`, `lint`, `contract`,
 * `rust`); her parça `justfile`daki tarifin işinin bir dilimidir ve tarifle aynı
 * işi bölüşür (`gatePlan.test.mjs` bunu sınar).
 *  - `concurrency`: aynı aşamanın kaç parçası birlikte koşar (varsayılan 1). Yalnız
 *    birbirinin ölçümünü bozmayan ve ortak kilit paylaşmayan parçalar için.
 *  - `overrides`: paket parçaları `SCOPE_OVERRIDES`ı uygular (testleri repoyu okuyan
 *    paketler); statik denetimler kapanışta kalır.
 */
export const STAGE_PLAN = {
  'node-pin': { cache: false },
  contract: { units: 'contract', concurrency: 2 },
  'format-check': { scope: 'repo' },
  typecheck: { units: 'typecheck', script: 'typecheck', concurrency: 4 },
  lint: { units: 'lint', concurrency: 4 },
  'lint-css': { scope: 'code' },
  build: { cache: false },
  bundle: { cache: false },
  scaling: { cache: false },
  // Koşan alt küme git farkından türer; plan anahtara girer (bkz. gate.mjs → toolParts).
  'audio-test': { scope: 'repo' },
  rust: { units: 'rust' },
  test: { units: 'packages', script: 'test', overrides: true },
  coverage: { scope: 'code' },
  'coverage-shape': { scope: 'code' },
  e2e: { units: 'packages', script: 'test:e2e' },
  'coverage-audio': { scope: 'repo' },
  'audio-verify': { scope: 'repo' },
  'security-js': { cache: false },
  'security-rust': { cache: false },
};

/**
 * Paketin TESTLERİNİN makbuz kapsamı kapanıştan GENİŞ olmak zorundaysa burada, gerekçesiyle;
 * yalnız `overrides` işaretli aşamaya (`test`) uygulanır, tip ve lint denetimi kapanışta kalır.
 * Bir paketin testi başka dosyaları okuyorsa ve burada yazılı değilse
 * `gatePlan.test.mjs` düşer (`findScopeEscapes`).
 */
export const SCOPE_OVERRIDES = {
  '@volstudio/core': {
    kind: 'code',
    reason:
      'yönetişim testleri bütün repoyu tarar (constantUnits, cssTokens, lifecycleIdiom) ve vitrin i18n dosyalarını okur (keyParity)',
  },
  '@volstudio/audio-synth': {
    kind: 'repo',
    reason:
      'testler repo kökünden oyunların ses varlıklarını, manifestleri ve belgeleri okur (REPO = ../../../..)',
  },
};

/**
 * Kapanıştaki bir paketin köke ya da dışarıya uzanan, ELLE gözden geçirilmiş
 * okumaları. Anahtar dosya yoludur; değer neden kapsamı genişletmediğidir.
 * Listede olmayan her kaçış bekçiyi düşürür; kaçışı kalmamış kayıt da düşürür.
 */
export const REVIEWED_ESCAPES = {
  'devtools/pen.dev/scripts/organize-pen-export.mjs': 'yalnız yorum metni; yol okunmaz',
  'devtools/pen.dev/tests/organizeExport.test.ts':
    'repo kökü yalnız node_modules/.cache altındaki çıktı ön dizini',
  'devtools/deck/scripts/deck.mjs':
    'kök yalnız lifecycle ve scripts/linux hedeflerini okur; ikisi de paket dışı koddur',
  'devtools/deck/tests/probeMetrics.test.mjs':
    'kökten yalnız CORE kaynağını okur; CORE kapanıştadır',
  'devtools/vol-showcase/scripts/e2e.mjs':
    'repo kökü yalnız git dışı node_modules/.cache/vol-quality altında izole E2E çıktı/hata arşivi oluşturmak için kullanılır; kaynak okunmaz',
  'devtools/vol-showcase/tests/e2e/support/policy.ts':
    'kökten yalnız core/src/ui okunur; CORE kapanıştadır',
  'devtools/vol-showcase/vite.config.ts': 'vite fs.allow kökü; dosya okumaz',
  'games/vol-forge/vite.config.ts': 'vite fs.allow kökü; dosya okumaz',
  'games/vol-test/vite.config.ts': 'vite fs.allow kökü; dosya okumaz',
};

/** Birleşik kapının aşamalarını plan sırasına dizer; planda olmayan aşama hatadır. */
export function wavesFor(stages) {
  const unknown = stages.filter((stage) => !(stage in STAGE_PLAN));
  if (unknown.length > 0) {
    throw new Error(`Kapı planında olmayan aşama: ${unknown.join(', ')} (gatePlan.mjs)`);
  }
  const wanted = new Set(stages);
  return WAVES.map((wave) => wave.filter((stage) => wanted.has(stage))).filter(
    (wave) => wave.length > 0,
  );
}

/**
 * Paket kaynağında `scripts` sözcüğü geçen ama kök betik ağacına başvuru OLMAYAN dosyalar
 * (`findUnrecognizedScriptMentions`). Anahtar dosya yoludur; değer neden başvuru sayılmadığıdır.
 * Listede olmayan tanınmayan biçim bekçiyi düşürür; anısı kalmayan kayıt da düşürür.
 */
export const REVIEWED_SCRIPT_MENTIONS = {
  'devtools/audio-synth/tests/governance/docReferences.test.ts':
    'belgedeki yol desenini ve package.json betik adlarını sınar; kök betik ağacını okumaz',
};
