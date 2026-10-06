# Kalite kapıları

Kapıların tek kaynağı `justfile`'dır; `just` global değilse
`pnpm exec just <tarif>` çalışır. Kapılar paketleri elle saymaz:
`scripts/quality/runActive.mjs` workspace'i `pnpm list` ile bulur ve
`workspace-lifecycle.json`da `active` olanlara süzer.

## Birleşik kapılar

| Kapı      | Ne zaman         | Bileşim                                                                                                               |
| --------- | ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| `quick`   | pre-commit       | `contract` + `format-check` + `typecheck` + `lint`                                                                    |
| `fast`    | yerel geliştirme | `quick` + `test`                                                                                                      |
| `high`    | pre-push         | `quick` + `build` + `rust` + `lint-css` + `coverage` + `coverage-shape` + `audio-test` + `bundle` + `scaling` + `e2e` |
| `signoff` | sürüm öncesi     | `high` + `coverage-audio` + `audio-verify` + `security-js` + `security-rust`                                          |

## Tekil kapılar

| Tarif            | Sınadığı                                                                                                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contract`       | `scripts/quality/tests`, `scripts/linux/tests`, `scripts/android/tests`, `devtools/deck/tests` (bekçi ve betik testleri) ve `scripts/quality/cli/workspace-contract.mjs` (aşağıda)                                   |
| `format-check`   | Prettier, `**/*.{ts,css,json,md}`                                                                                                                                                                                    |
| `typecheck`      | Aktif paketlerin `typecheck` betiği (`tsc --noEmit`, `noImplicitOverride` dahil) ve kök betiklerin JSDoc denetimi (`scripts/tsconfig.json`)                                                                          |
| `lint`           | ESLint: TS kaynak, betik ve testler tip bilgisiyle (`no-floating-promises` hata); `.js`/`.mjs` betikler `@eslint/js` ile; deterministik kodda `localeCompare` yasak; frozen ağaçlar lifecycle'dan yok sayılır        |
| `lint-css`       | Stylelint, `**/*.css`                                                                                                                                                                                                |
| `test`           | Aktif paketlerin `test` betiği; kapsam eşiği uygulamaz                                                                                                                                                               |
| `coverage`       | `quality.json` → `coverageRuns` paketlerini eşikleriyle koşar ve koşu kaydı yazar; eşikten muaf paketin testini düz koşar (`scripts/quality/coverageRun.mjs`)                                                        |
| `coverage-shape` | 100 satırın üstünde ve %50 kapsamın altındaki dosya test ister; yalnız aynı koşunun taze lcov'unu okur                                                                                                               |
| `audio-test`     | Sabit temel takım ve değişen kaynakla ilişkili testler; silinen/belirsiz değişimde tam takım                                                                                                                         |
| `build`          | Aktif paketlerin `build` betiği                                                                                                                                                                                      |
| `bundle`         | `dist` altındaki gzip'li `app`/`vendor`/`css` baytı, `quality.json` → `bundles` bütçesine karşı (bugün vol-showcase ve VOL.TEST)                                                                                     |
| `scaling`        | Girdi dört katına çıkınca sürenin kaç katına çıktığı, `quality.json` → `scaling` bütçesine karşı (bugün CORE uzamsal indeksi ve VOL.TEST mermi modeli); ölçülen oranı yazar                                          |
| `e2e`            | Aktif paketlerin `test:e2e` betiği, üretim build'i; vol-showcase motor kapsamı asimetrik, genişlemesi UI-00                                                                                                          |
| `rust`           | Kök workspace'in aktif üye manifestleri: `fmt --check`, `clippy --all-targets -D warnings` (feature taşıyan crate'te `--all-features` ile de), `test --all-targets`; crate'ler kökteki ortak hedef dizinini paylaşır |
| `coverage-audio` | audio-synth'in tam kapsamı ve şekli                                                                                                                                                                                  |
| `audio-verify`   | Yayınlanmış her sesi manifestinden yeniden render edip PCM kimliğini karşılaştırır                                                                                                                                   |
| `security-js`    | `pnpm audit --audit-level moderate`                                                                                                                                                                                  |
| `security-rust`  | Kökteki tek `Cargo.lock` üzerinde cargo-audit                                                                                                                                                                        |

`pnpm exec just report <kapı> --json` kapıyı koşup sonucu makine-okunur
verir; aşamalar `justfile`dan türer. `pnpm run doctor:env` araçları ve
Playwright WebKit'in paylaşımlı kütüphanelerini denetler.

Kapı adı aynı olsa da host desteği ve kanıt kapsamı farklıdır. Windows
JS/TS, audio ve MSVC Rust işleri ile Linux builder/native ABI işleri
ayrı profillerdir. Shell/argv/araç hazırlığı [Windows](windows.md)
sahibindedir; Linux'a özgü atlanan test başarı sayılmaz.

## Workspace sözleşmesi

`scripts/quality/cli/workspace-contract.mjs` bütün ihlalleri birlikte raporlar:

| Bekçi                                    | Kural                                                                                                                                                                                                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REQUIRED_SCRIPTS`                       | Her aktif paket `typecheck`, `test`, `test:coverage` taşır; yoksa `--if-present` onu sessizce atlardı                                                                                                                                                |
| `scripts/quality/coverageBinding.mjs`    | Paketin `vitest.config.ts`'i yüklenir; eşikleri `quality.json` ile derin eşittir, `coverage.include` `src/**/*.ts`dir                                                                                                                                |
| `scripts/quality/config.mjs`             | `quality.json` şeması; eşik `floor`un altına inemez; muafiyet gerekçe ister; aktif paket kümesiyle eşleşir                                                                                                                                           |
| `scripts/quality/workspaceLifecycle.mjs` | Lifecycle kayıtları; frozen ağaçlar etiketlerine eşittir; aktif paket frozen pakete bağımlı olamaz                                                                                                                                                   |
| `scripts/quality/layers.mjs`             | Paket ve kaynak import yönü (aşağıda); başka pakete yalnız `exports` haritasındaki yoldan girilir                                                                                                                                                    |
| `scripts/quality/moduleCycles.mjs`       | Paket içi çalışma zamanı import döngüsü; `import type` sayılmaz, `@/` alias'ı çözülür                                                                                                                                                                |
| `scripts/quality/sourceSize.mjs`         | Kod, test, betik, stil ve native kaynak en çok 1000 satır; belge, veri ve asset sayılmaz                                                                                                                                                             |
| `scripts/quality/commentDensity.mjs`     | TS, JS, Rust, CSS ve Kotlin kaynağında yorum oranı en çok %40 (aşım gerekçe listesiyle), tek yorum bloğu en çok 24 satır                                                                                                                             |
| `scripts/quality/deadI18n.mjs`           | Kullanılmayan çeviri anahtarı; şablonla üretilen anahtarlar tam adla muaftır, üreten kod silinince muafiyet düşer                                                                                                                                    |
| `scripts/quality/blobSize.mjs`           | İndeks ve çalışma ağacında 2 MiB üstü dosya                                                                                                                                                                                                          |
| `scripts/quality/trackedImports.mjs`     | `.gitignore`'un yok saydığı dosya kaynak koddan import edilemez                                                                                                                                                                                      |
| `scripts/quality/devPorts.mjs`           | İki ayrı paket aynı geliştirme portunu bildiremez                                                                                                                                                                                                    |
| `scripts/quality/deviceApps.mjs`         | Cihaz ölçümü adayları `active` + `<paket>/src-tauri/tauri.conf.json` keşfinden türer                                                                                                                                                                 |
| `scripts/quality/cargoWorkspace.mjs`     | Aktif her crate kök Cargo workspace'inin üyesidir; tek kilit kökteki `Cargo.lock`tur; profil yalnız kökte                                                                                                                                            |
| `scripts/quality/productIcons.mjs`       | Bugün games altındaki aktif uygulamaların ikonunu sınar; native devtool kapsamı UI-06 görevidir; şablon/başka ürün ikonu reddedilir                                                                                                                  |
| `scripts/quality/phaserBoundary.mjs`     | `core` Phaser'ı yalnız kayıtlı köprü dosyalarında import eder                                                                                                                                                                                        |
| `scripts/quality/publicTypeSurface.mjs`  | CORE'un public tip yüzeyi `coreTypeSurface.snapshot.json` ile eşittir                                                                                                                                                                                |
| `scripts/quality/appIdentity.mjs`        | Her aktif Tauri uygulamasının kimliği ürüne özgüdür (paket adını taşır), jenerik değildir ve çakışmaz; veri dizini ve Cloud kökü ondan türer                                                                                                         |
| `scripts/quality/tauriPlugins.mjs`       | JS `@tauri-apps/plugin-*` → Rust kaydı; Cargo eklenti bağımlılığı → kaynakta kayıt ya da izin; kayıtlı eklenti → izin ya da JS tüketicisi; yetenek izni → kurulu eklenti                                                                             |
| `scripts/quality/catalog.mjs`            | CORE kökünden açılan her UI bileşeni vol-showcase vitrininde gösterilir ve CORE testinde adıyla geçer; parça ve görsel olmayan katman gerekçeli istisnadır                                                                                           |
| `scripts/quality/uiRegistry.mjs`         | CORE UI alt yolunun her sınıf ve yardımcısı `devtools/vol-showcase/src/catalog/registry.json` içinde tekil kayıtlıdır; tier/faz/anchor/arketip, tüketici (AST), vitrin kullanımı ve gerçek `it` + `expect` kanıtı ya da sahip görevli gap doğrulanır |
| `scripts/quality/rootEntries.mjs`        | Kökteki her girdi gerekçesiyle kayıtlıdır; gerekçesiz yeni girdi ya da karşılıksız kayıt reddedilir                                                                                                                                                  |
| `scripts/quality/contextComments.mjs`    | Kaynak yorumları tarihçe ("bir dönem", "eskiden"), ölçüm günlüğü ("ölçüldü:"), tarih ve plan/faz kimliği taşımaz                                                                                                                                     |

Ürün kalitesi bekçileri (satır, yorum, i18n, döngü, katman, port, ikon, kilit
paritesi) frozen ağaçları taramaz; bütünlük bekçileri (lifecycle, blob,
tracked import, Phaser sınırı, tip yüzeyi) ağacın tamamını görür.

## Katman sınırları

```
games/*      ──\
                ──> core  <── tauri-v2
devtools/*   ──/
```

- `core` hiçbir pakete bağımlı olamaz.
- Oyunlar devtool'lara ve birbirlerine bağımlı olamaz; devtool bir oyuna
  yalnız `devDependency` olarak girer.
- `devtools/*` oyunlara bağımlı olamaz.

`scripts/quality/layers.mjs` yalnız `package.json`ı değil, kaynak koddaki
`import`/`export` ifadelerini de AST ile tarar
(`scripts/quality/sourceImports.mjs`); `import type` da sınırı delemez.

## Workspace yaşam döngüsü

- `active` paket rutin kapılara girer.
- `frozen` paket için `freezeTag` (annotated etiket), `freezeCommit`,
  `decisionDate` ve `reason` zorunludur; `tag^{commit} === freezeCommit`
  olmalıdır ve ağaçta freeze commit'inden sonra izlenen fark ya da izlenmeyen
  dosya bulunamaz. Frozen yol `.prettierignore`a ve `package.json` → `stylelint.ignoreFiles`a yazılır;
  `scripts/quality/tests/frozenToolSelection.test.mjs` üç aracın aynı kümeyi
  gördüğünü kilitler.
- Frozen ürünün incelemesi etiketinin worktree'sinde yapılır; dondurma,
  emeklilik ve yeniden açma [new-game.md](new-game.md)dedir.

## Belge kapıları

| Kapı                                                          | Bağladığı şey                                                                                                                                                  |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/tests/governance/docSymbols.test.ts`                    | `core/docs/*.md` sembolleri ve `music-engine.md` API tablosu → CORE yüzeyi                                                                                     |
| `devtools/audio-synth/tests/governance/docReferences.test.ts` | audio-synth README, DESIGN ve TODO'daki yollar ve betik adları → gerçek ağaç                                                                                   |
| `scripts/quality/tests/agentDocs.test.mjs`                    | Bütün `.md` belgelerindeki yollar ve komutlar (audio-synth hariç); agent belgelerinde kapı bileşimleri; `AGENTS.md` repo haritası ↔ `workspace-lifecycle.json` |
| `devtools/audio-synth/tests/governance/dirLayers.test.ts`     | audio-synth kaynak dizinleri arasında karşılıklı import; bilinen çiftler yalnız azalır                                                                         |

Ters yön de kapılıdır: ölü muafiyet ya da belgede olmayan istisna kapıyı
kırar.

## Ölçüm notları

UI durum matrisi, tema geometrisi, axe ve gerçek UI maliyeti için
[doğrulama planı](ui/VERIFICATION.md) mevcut kapıyla gelecekteki genişlemeyi
ayırır. Bu yeni kontroller henüz kapı bileşimine eklenmiş değildir.

- **Kapsam motoru:** Vitest ve `@vitest/coverage-v8` aynı exact sürümdedir;
  V8 kapsamı AST tabanlı yeniden eşleme kullanır. Motor değişiminde eşik
  geçişi ölçülen LCOV pay/paydalarıyla yapılır; sonrasında ratchet sürer.
- **Piksel temeli tam paneli çeker:** vol-showcase sekme paneli kendi
  kaydırıcısıdır ve Playwright iç içe kaydırıcının görünmeyen kısmını çekemez;
  `visual.spec.ts` ekran görüntüsünden önce kap zincirinin taşmasını açar.
  `layout.spec.ts` gerçek kaydırıcıyı ölçmeye devam eder.
- **Benchmark:** süre eşiği yoktur; kapılanan tek performans ölçüsü
  makineden bağımsız ölçekleme oranıdır.
- **Adlandırma:** pnpm'in yerleşik komutuyla çakışan betik hiç çalışmaz
  (`pnpm doctor` → `pnpm run doctor:env`).

## Diğer tarifler

Bütün tarifler kalite kapısı değildir. Mutasyon ve geliştirme tariflerinin
başarısı ürün kabulü olarak raporlanmaz.

| Tarif                         | İşlev                                                     |
| ----------------------------- | --------------------------------------------------------- |
| `default`                     | Tarif listesini gösterir                                  |
| `test-pkg <pkg>`              | Tek paketin düz testini çalıştırır                        |
| `build-ui`                    | Mevcut vitrin build kolaylığı                             |
| `report <kapı> --json`        | Kapıyı çalıştırıp aşama/exit/süre raporu verir            |
| `dev`, `dev-ui`               | Geliştirme uygulamasını açar                              |
| `fix`                         | Format ve lint düzeltmesi yapar                           |
| `gen-theme`, `download-fonts` | Sahip üreticiyi çalıştırır                                |
| `benchmark-core`              | Tanımlı CORE ölçümünü alır                                |
| `doctor`                      | Ortam hazırlığını denetler                                |
| `clean`, `clean-all`          | Yerel çıktıları temizler; kaynak ve ölçüm kabulü değildir |

## Ortam ve temizlik

`.node-version` ve `package.json` aynı kesin Node sürümünü taşır; `doctor`
çalışan sürümün buna uyduğunu denetler. Deterministik ses çıktısı için Node
çalışma zamanı değiştirilmez.

`pnpm exec just clean`, `scripts/quality/cleanWorkspace.mjs` ile aktif
workspace'lerin `dist`, `coverage`, `test-results` ve `playwright-report`
dizinlerini, TypeScript derleme önbelleğini ve kalite kapısı önbelleğini kaldırır.
Deck'in yeniden kopyalanabilen `web/vendor` çıktısı da temizlenir. Frozen
paketler, gönderilen asset'ler, export kaynakları ve `node_modules` korunur.
`pnpm exec just clean-all` aynı temizliğe kökteki Rust `target` dizinini ekler.
