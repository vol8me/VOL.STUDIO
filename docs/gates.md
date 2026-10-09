# Kalite kapıları

Kapıların tek kaynağı `justfile`'dır; `just` global değilse
`pnpm exec just <tarif>` çalışır. Kapılar paketleri elle saymaz:
`scripts/quality/runActive.mjs` workspace'i `pnpm list` ile bulur ve
`workspace-lifecycle.json`da `active` olanlara süzer.

## Birleşik kapılar

| Kapı      | Ne zaman         | Bileşim                                                                                                  |
| --------- | ---------------- | -------------------------------------------------------------------------------------------------------- |
| `quick`   | pre-commit       | `node-pin` + `contract` + `format-check` + `typecheck` + `lint` + `lint-css`                             |
| `fast`    | yerel geliştirme | `quick` + `test`                                                                                         |
| `high`    | pre-push         | `quick` + `build` + `bundle` + `scaling` + `audio-test` + `rust` + `coverage` + `coverage-shape` + `e2e` |
| `signoff` | sürüm öncesi     | `high` + `coverage-audio` + `audio-verify` + `security-js` + `security-rust`                             |

## Kapı koşucusu

`pnpm quick`, `pnpm fast`, `pnpm high`, `pnpm signoff` ve git kancaları `scripts/quality/gate.mjs`yi çağırır.
`justfile` yalnız bileşimi söyler; `just <kapı>` aynı aşamaları önbelleksiz ve art arda
koşan düz yoldur. Koşucu üç şey yapar:

1. **Sıra ve paralellik** ([`gatePlan.mjs`](../scripts/quality/gatePlan.mjs)). Aşamalar
   ucuzdan pahalıya dizilir; düşecek kapı dakikalar harcanmadan düşer. Birbirinin
   ölçümünü bozmayan statik aşamalar (`contract`, `format-check`, `typecheck`, `lint`,
   `lint-css`) birlikte koşar. Süre ölçen (`scaling`) ve tarayıcı süren (`e2e`) aşamalar
   tek başına koşar. `justfile`daki her aşamanın planda kaydı olmak zorundadır.
2. **Makbuz** ([`gateCache.mjs`](../scripts/quality/gateCache.mjs)). Girdisi bayt bayt
   aynı kalan aşama yeniden koşmaz. Anahtar git durumundan değil çalışma ağacının
   gerçek içeriğinden türer: commit, stage ya da dal fark etmez. Makbuz yalnız
   atlama içindir; sahte geçiş üretemez. Makbuz yoksa, anahtar uyuşmazsa ya da okunamazsa
   aşama koşar. Makbuzlar `node_modules` altındaki kapı önbelleğindedir (repoya girmez, `just clean` siler).
3. **Okunur çıktı.** Geçen aşama tek satırdır; koşan aşamanın NEDEN koştuğu yazılır
   (`girdi değişti`, `makbuz yok`, `önbelleksiz aşama`, `--fresh`). Düşen aşamanın sonu,
   sınıflandırması, tam günlüğün yolu ve tekrar komutu basılır. `--json` `just report` ile aynı şekli verir.

```
pnpm high                 # makbuzdan atlayarak
pnpm high --fresh         # makbuzu yok say (yine de yazar)
pnpm high --json          # makine-okunur özet (insan günlüğü stderr'e gider)
pnpm high --verbose       # aşama çıktısını canlı akıtır
```

### Makbuz kapsamı

Dar kapsam kapıyı hızlandırır, eksik kapsam sessizce yanlış atlar. İkincisi çok daha
pahalıdır; bu yüzden kapsam geniş tutulur ve gizli okumalar bekçilenir
([`gateScope.mjs`](../scripts/quality/gateScope.mjs)):

| Kapsam    | Girdi                                                                 | Aşamalar                                                              |
| --------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `repo`    | ağaçtaki her dosya (belge dahil)                                      | `contract`, `format-check`, `coverage-audio`, `audio-verify`          |
| `code`    | paket dizinleri + paket dışı kod/yapılandırma (kök belgeler hariç)    | `typecheck`, `lint`, `lint-css`, `rust`, `coverage`, `coverage-shape` |
| `closure` | paketin kendisi + `@volstudio/*` bağımlılık kapanışı + paket dışı kod | `test` ve `e2e` (paket başına makbuz)                                 |

- `test` ve `e2e` **paket paket** makbuzlanır: yalnız girdisi değişen paket koşar.
  Sonuç: VOL.TEST'e dokunulmadıysa VOL.TEST'in testi de e2e'si de koşmaz.
- `@volstudio/core` (`code`) ve `@volstudio/audio-synth` (`repo`) kapanıştan geniştir:
  core'un yönetişim testleri bütün repoyu tarar; audio-synth testleri repo kökünden
  oyunların ses varlıklarını, manifestleri ve belgeleri okur. Gerekçe
  `gatePlan.mjs` → `SCOPE_OVERRIDES`tedir.
- **Gizli bağımlılık bekçisi** (`gatePlan.test.mjs`): kapanıştaki bir paketin kaynağında
  kapanış dışına uzanan göreli yol sabiti varsa test düşer. Çözüm ya paketi
  `SCOPE_OVERRIDES`a almak ya da okumayı gerekçeyle `REVIEWED_ESCAPES`a yazmaktır.
  Kaçışı kalmayan kayıt da düşer.
- **Önbelleksiz aşamalar:** `node-pin` (1 sn, ortamı doğrular), `build` ve `bundle` (çıktıları
  sonraki aşamaların girdisi), `scaling` (süre oranı ölçer), `audio-test` (kapsamı git
  farkından türer), `security-js` ve `security-rust` (sonuç zamana bağlı).
- **`signoff` hiçbir makbuza güvenmez**; yine de geçen aşamalara makbuz yazar.
- Aşama koşarken ağaç değişirse (örn. düzenleme) o dalganın makbuzu yazılmaz.

## Tekil kapılar

| Tarif            | Sınadığı                                                                                                                                                                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node-pin`       | Çalışan Node, `.node-version` ve `package.json` `engines.node` ile aynı kesin sürüm; değilse ilk adımda açık mesajla durur (`doctor` aynı denetimi kullanır)                                                                                       |
| `contract`       | `scripts/quality/tests`, `scripts/linux/tests`, `scripts/android/tests`, `devtools/deck/tests` (bekçi ve betik testleri) ve `scripts/quality/cli/workspace-contract.mjs` (aşağıda)                                                                 |
| `format-check`   | Prettier, `**/*.{ts,mts,cts,js,mjs,cjs,css,json,md,yaml,yml,html}`                                                                                                                                                                                 |
| `typecheck`      | Aktif paketlerin `typecheck` betiği (`tsc --noEmit`, `noImplicitOverride` dahil) ve kök betiklerin JSDoc denetimi (`scripts/tsconfig.json`)                                                                                                        |
| `lint`           | ESLint: TS kaynak, betik ve testler tip bilgisiyle (`no-floating-promises` hata); `.js`/`.mjs` betikler `@eslint/js` ile; deterministik kodda `localeCompare` yasak; frozen ağaçlar lifecycle'dan yok sayılır                                      |
| `lint-css`       | Stylelint, `**/*.css`                                                                                                                                                                                                                              |
| `test`           | Aktif paketlerin `test` betiği; kapsam eşiği uygulamaz                                                                                                                                                                                             |
| `coverage`       | `quality.json` → `coverageRuns` paketlerini eşikleriyle koşar ve koşu kaydı yazar; eşikten muaf paketin testini düz koşar (`scripts/quality/coverageRun.mjs`)                                                                                      |
| `coverage-shape` | 100 satırın üstünde ve %50 kapsamın altındaki dosya test ister; yalnız aynı koşunun taze lcov'unu okur                                                                                                                                             |
| `audio-test`     | Sabit temel takım ve değişen kaynakla ilişkili testler; silinen/belirsiz değişimde tam takım                                                                                                                                                       |
| `build`          | Aktif paketlerin `build` betiği                                                                                                                                                                                                                    |
| `bundle`         | `dist` altındaki gzip'li `app`/`vendor`/`css` baytı, `quality.json` → `bundles` bütçesine karşı (bugün vol-showcase ve VOL.TEST)                                                                                                                   |
| `scaling`        | Girdi dört katına çıkınca sürenin kaç katına çıktığı, `quality.json` → `scaling` bütçesine karşı (bugün CORE uzamsal indeksi ve VOL.TEST mermi modeli); ölçülen oranı yazar                                                                        |
| `e2e`            | Aktif paketlerin `test:e2e` betiği, üretim build'i; vol-showcase her spec'i iki motorda koşar ve motorlar eşzamanlı, ayrı süreç ve ayrı portta çalışır (`devtools/vol-showcase/scripts/e2e.mjs`; piksel temeli yalnız Chromium; bekçi `e2eConfig`) |
| `rust`           | Kök workspace'in aktif üye manifestleri: `fmt --check`, `clippy --all-targets -D warnings` (feature taşıyan crate'te `--all-features` ile de), `test --all-targets`; crate'ler kökteki ortak hedef dizinini paylaşır                               |
| `coverage-audio` | audio-synth'in tam kapsamı ve şekli                                                                                                                                                                                                                |
| `audio-verify`   | Yayınlanmış her sesi manifestinden yeniden render edip PCM kimliğini karşılaştırır                                                                                                                                                                 |
| `security-js`    | `pnpm audit --audit-level moderate`                                                                                                                                                                                                                |
| `security-rust`  | Kökteki tek `Cargo.lock` üzerinde cargo-audit                                                                                                                                                                                                      |

`pnpm exec just report <kapı> --json` kapıyı koşup sonucu makine-okunur
verir; aşamalar `justfile`dan türer. `pnpm run doctor:env` araçları ve
Playwright WebKit'in paylaşımlı kütüphanelerini denetler.

Kapı adı aynı olsa da host desteği ve kanıt kapsamı farklıdır. Windows
JS/TS, audio ve MSVC Rust işleri ile Linux builder/native ABI işleri
ayrı profillerdir. Shell/argv/araç hazırlığı [Windows](windows.md)
sahibindedir; Linux'a özgü atlanan test başarı sayılmaz.

## Workspace sözleşmesi

`scripts/quality/cli/workspace-contract.mjs` bütün ihlalleri birlikte raporlar:

| Bekçi                                    | Kural                                                                                                                                                                                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `REQUIRED_SCRIPTS`                       | Her aktif paket `typecheck`, `test`, `test:coverage` taşır; yoksa `--if-present` onu sessizce atlardı                                                                                                                                                                                |
| `scripts/quality/coverageBinding.mjs`    | Paketin `vitest.config.ts`'i yüklenir; eşikleri `quality.json` ile derin eşittir, `coverage.include` `src/**/*.ts`dir                                                                                                                                                                |
| `scripts/quality/config.mjs`             | `quality.json` şeması; eşik `floor`un altına inemez; muafiyet gerekçe ister; aktif paket kümesiyle eşleşir                                                                                                                                                                           |
| `scripts/quality/workspaceLifecycle.mjs` | Lifecycle kayıtları; frozen ağaçlar etiketlerine eşittir; aktif paket frozen pakete bağımlı olamaz                                                                                                                                                                                   |
| `scripts/quality/layers.mjs`             | Paket ve kaynak import yönü (aşağıda); başka pakete yalnız `exports` haritasındaki yoldan girilir                                                                                                                                                                                    |
| `scripts/quality/moduleCycles.mjs`       | Paket içi çalışma zamanı import döngüsü; `import type` sayılmaz, `@/` alias'ı çözülür                                                                                                                                                                                                |
| `scripts/quality/sourceSize.mjs`         | Kod, test, betik, stil ve native kaynak en çok 1000 satır; belge, veri ve asset sayılmaz                                                                                                                                                                                             |
| `scripts/quality/commentDensity.mjs`     | TS, JS, Rust, CSS ve Kotlin kaynağında yorum oranı en çok %40 (aşım gerekçe listesiyle), tek yorum bloğu en çok 24 satır                                                                                                                                                             |
| `scripts/quality/i18nSurface.mjs`        | AST taraması: TR/EN parite, camelCase adlandırma, kullanılmayan anahtar (test kanıt değildir), gerekçeli ve üreticisi doğrulanan dinamik aileler, eksik `ad:anahtar` sabiti, modül düzeyi çeviri çağrısı, kodlanmış görünen metin (gerekçeli `TEXT_ALLOW`, bayat istisna reddedilir) |
| `scripts/quality/blobSize.mjs`           | İndeks ve çalışma ağacında 2 MiB üstü dosya                                                                                                                                                                                                                                          |
| `scripts/quality/trackedImports.mjs`     | `.gitignore`'un yok saydığı dosya kaynak koddan import edilemez                                                                                                                                                                                                                      |
| `scripts/quality/devPorts.mjs`           | İki ayrı paket aynı geliştirme portunu bildiremez                                                                                                                                                                                                                                    |
| `scripts/quality/deviceApps.mjs`         | Cihaz ölçümü adayları `active` + `<paket>/src-tauri/tauri.conf.json` keşfinden türer                                                                                                                                                                                                 |
| `scripts/quality/cargoWorkspace.mjs`     | Aktif her crate kök Cargo workspace'inin üyesidir; tek kilit kökteki `Cargo.lock`tur; profil yalnız kökte                                                                                                                                                                            |
| `scripts/quality/productIcons.mjs`       | Bugün games altındaki aktif uygulamaların ikonunu sınar; native devtool kapsamı UI-06 görevidir; şablon/başka ürün ikonu reddedilir                                                                                                                                                  |
| `scripts/quality/phaserBoundary.mjs`     | `core` Phaser'ı yalnız kayıtlı köprü dosyalarında import eder                                                                                                                                                                                                                        |
| `scripts/quality/publicTypeSurface.mjs`  | CORE'un public tip yüzeyi `coreTypeSurface.snapshot.json` ile eşittir                                                                                                                                                                                                                |
| `scripts/quality/appIdentity.mjs`        | Her aktif Tauri uygulamasının kimliği ürüne özgüdür (paket adını taşır), jenerik değildir ve çakışmaz; veri dizini ve Cloud kökü ondan türer                                                                                                                                         |
| `scripts/quality/tauriPlugins.mjs`       | JS `@tauri-apps/plugin-*` → Rust kaydı; Cargo eklenti bağımlılığı → kaynakta kayıt ya da izin; kayıtlı eklenti → izin ya da JS tüketicisi; yetenek izni → kurulu eklenti                                                                                                             |
| `scripts/quality/catalog.mjs`            | CORE kökünden açılan her UI bileşeni vol-showcase vitrininde gösterilir ve CORE testinde adıyla geçer; parça ve görsel olmayan katman gerekçeli istisnadır                                                                                                                           |
| `scripts/quality/uiRegistry.mjs`         | CORE UI alt yolunun her sınıf ve yardımcısı `devtools/vol-showcase/src/catalog/registry.json` içinde tekil kayıtlıdır; tier/faz/anchor/arketip, tüketici (AST), vitrin kullanımı ve gerçek `it` + `expect` kanıtı ya da sahip görevli gap doğrulanır                                 |
| `scripts/quality/uiEvidence.mjs`         | Vitrinin axe ve geometri/glif istisna kayıtları ile durum fixture verisi: her kayıt açık bir UI görevine bağlı, gerekçeli ve yinelenmez; fixture registry'de uygulanabilir bir durumu sınar                                                                                          |
| `scripts/quality/uiTheme.mjs`            | UI tema kapısı: `theme.css` üretilen bölgeleri kaynaktan sapmamış; metin/ikon/odak/kenarlık kontrastı SON renk üzerinden (kusurlar sahip UI görevli kayıtlı, bayat/kayıtsız düşer); UI CSS'inde ham (var dışı) hareket süresi dosya başına artamaz (ratchet)                         |
| `scripts/quality/rootEntries.mjs`        | Kökteki her girdi gerekçesiyle kayıtlıdır; gerekçesiz yeni girdi ya da karşılıksız kayıt reddedilir                                                                                                                                                                                  |
| `scripts/quality/contextComments.mjs`    | Kaynak yorumları tarihçe ("bir dönem", "eskiden"), ölçüm günlüğü ("ölçüldü:"), tarih ve plan/faz kimliği taşımaz                                                                                                                                                                     |

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

## Süre bütçesi

Windows 11, 8 mantıksal çekirdek, boş makine, ısınmış araç önbellekleri; her aşama
tek başına ölçülmüştür. Yük altında süreler uzar (statik aşamalar birlikte koşunca
her biri belirgin yavaşlar, toplam duvar süresi yine kısalır).

| Aşama                   | Süre        | Not                                                                    |
| ----------------------- | ----------- | ---------------------------------------------------------------------- |
| `node-pin`              | 1 sn        |                                                                        |
| `contract`              | 46 sn       | bekçi testleri ve workspace sözleşmesi                                 |
| `format-check`          | 21 sn       |                                                                        |
| `typecheck`             | 26 sn       |                                                                        |
| `lint`                  | 51 sn       | tip bilgili ESLint                                                     |
| `lint-css`              | 5 sn        |                                                                        |
| `build` / `bundle`      | 4 / 1 sn    |                                                                        |
| `scaling`               | 4 sn        |                                                                        |
| `audio-test`            | 12–144 sn   | alt küme 12 sn; yapılandırma/silme değişiminde tam takım 144 sn        |
| `rust`                  | 34 sn       | sıcak hedef dizini; soğuk derleme (kilit/araç zinciri değişimi) 4,4 dk |
| `test`                  | 245 sn      | audio-synth 141, core 55, vol-test 29, vitrin 12, diğerleri 4 sn altı  |
| `coverage`              | 113 sn      | audio-synth hariç                                                      |
| `e2e` vitrin / vol-test | 447 / 85 sn | vitrinde iki motor eşzamanlı; seri koşu 719 sn                         |
| `coverage-audio`        | 532 sn      | kapsam ölçümü sentezi yavaşlatır                                       |
| `audio-verify`          | 98 sn       |                                                                        |
| `security-js`           | 2 sn        |                                                                        |
| `security-rust`         | 4 sn        |                                                                        |

Birleşik kapılar makbuzsuz (soğuk) koşuda: `quick` yaklaşık 1,5 dk, `fast` 5,6 dk,
`high` 15 dk; `signoff`, `high` ile `coverage-audio`, `audio-verify` ve güvenlik
aşamalarının toplamı olarak yaklaşık 26 dk'dır (tek koşu olarak ölçülmemiştir).
Girdisi hiç değişmemiş ağaçta `high` yaklaşık 13 sn sürer (yalnız önbelleksiz aşamalar).

Süre ölçen testler yük altında kararsızlaşır; bu yüzden `scaling` ve `e2e` tek başına
koşar, audio-synth işçi sayısı sınırlıdır (`devtools/audio-synth/vitest.config.ts`) ve
vitrin motorları yalnız birbirleriyle eşzamanlıdır.

## Kapı sağlığı: ne yakalar, ne yakalamaz

| Kapı                                            | Yakaladığı                                                                     | Bilinen sınır                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `contract`                                      | katman, döngü, i18n, port, ikon, kilit, belge-gerçek uyumu, bekçilerin kendisi | repo geneline bakar; yalnız yazılmış bekçiyi zorlar                                                                             |
| `typecheck`, `lint`, `lint-css`, `format-check` | tip, kural ve biçim ihlalleri                                                  | çalışma zamanı davranışını sınamaz                                                                                              |
| `test`, `coverage`                              | birim ve yönetişim testleri; kapsam eşiği ve şekli ratchet'tir                 | `test` eşik uygulamaz (yeşil görünüp `high`'ı kırabilir)                                                                        |
| `audio-test`                                    | audio-synth'in sabit alt kümesi + değişenle ilişkili testler                   | alt küme tam takımın yerini tutmaz; tam kanıt `test` ve `coverage-audio`'dadır                                                  |
| `rust`                                          | `fmt`, `clippy -D warnings`, `test`                                            | yalnız host hedefi; Linux/Android native kanıtı ayrı                                                                            |
| `e2e`                                           | iki motorda axe, yerleşim, durum matrisi, sahte dil, piksel                    | piksel temeli yalnız Chromium ve işletim sistemi başına; WebKit'te Web Audio olmayan derlemede iki ses testi atlanır (2 atlama) |
| `scaling`, `bundle`                             | algoritmik ölçekleme oranı, gzip bütçesi                                       | süre eşiği yoktur; cihaz performansı kapı değildir                                                                              |
| `coverage-audio`, `audio-verify`                | tam audio kapsamı; yayınlanmış her sesin yeniden render kimliği                | dinleme kanıtı değildir (insan beyanı gerekir)                                                                                  |
| `security-js`, `security-rust`                  | bilinen advisory                                                               | `braces` için yama yayımlanmadığından `security-js` kırmızıdır (`TODO.md` F10.1); `signoff` bu çözülene kadar yeşil olamaz      |

Cihaz kabulü, insan beğenisi ve fiziksel ölçüm hiçbir kapının konusu değildir.

## Ölçüm notları

UI durum matrisi, tema geometrisi, axe ve gerçek UI maliyeti için
[doğrulama planı](ui/VERIFICATION.md) mevcut kapıyla gelecekteki genişlemeyi
ayırır. Yüzey kaydı, axe (5 WCAG etiketi) ve katman durum fixture'ları kapıdadır
(`contract` + vitrin E2E); tema geometrisi, gerçek UI maliyeti ve tam durum
matrisi UI görevlerinde eklenir.

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

| Tarif                         | İşlev                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `default`                     | Tarif listesini gösterir                                                                                                                                     |
| `test-pkg <pkg>`              | Tek paketin düz testini çalıştırır                                                                                                                           |
| `build-ui`                    | Mevcut vitrin build kolaylığı                                                                                                                                |
| `ui-baseline <etiket>`        | UI ilk referans kaydı (git dışı): sayımlar, ekran özetleri, hareket, gönderilen bayt, cihaz NOT-RUN hücreleri; `ui-baseline.mjs compare` ile karşılaştırılır |
| `ui-check`                    | UI yüzey kaydı + vitrinin iki motorlu tam E2E'si; `high` içinde zaten var, tek komut kısa yolu                                                               |
| `report <kapı> --json`        | Kapıyı çalıştırıp aşama/exit/süre raporu verir                                                                                                               |
| `dev`, `dev-ui`               | Geliştirme uygulamasını açar                                                                                                                                 |
| `fix`                         | Format ve lint düzeltmesi yapar                                                                                                                              |
| `gen-theme`, `download-fonts` | Sahip üreticiyi çalıştırır                                                                                                                                   |
| `benchmark-core`              | Tanımlı CORE ölçümünü alır                                                                                                                                   |
| `doctor`                      | Ortam hazırlığını denetler                                                                                                                                   |
| `clean`, `clean-all`          | Yerel çıktıları temizler; kaynak ve ölçüm kabulü değildir                                                                                                    |

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
