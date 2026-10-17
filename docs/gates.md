# Kalite kapıları

Kapıların tek kaynağı `justfile`'dır; `just` global değilse
`pnpm exec just <tarif>` çalışır. Kapılar paketleri elle saymaz:
`scripts/quality/runActive.mjs` workspace'i `pnpm list` ile bulur ve
`workspace-lifecycle.json`da `active` olanlara süzer.

## Birleşik kapılar

| Kapı      | Ne zaman         | Bileşim                                                                                          |
| --------- | ---------------- | ------------------------------------------------------------------------------------------------ |
| `quick`   | pre-commit       | `node-pin` + `contract` + `format-check` + `typecheck` + `lint` + `lint-css`                     |
| `fast`    | yerel geliştirme | `quick` + `test`                                                                                 |
| `high`    | pre-push         | `quick` + `build` + `bundle` + `scaling` + `audio-test` + `rust` + `coverage` + `coverage-shape` |
| `signoff` | sürüm öncesi     | `high` + `e2e` + `coverage-audio` + `audio-verify` + `security-js` + `security-rust`             |

`e2e` pre-push kapısında değildir (2026-10-11 kararı): ilk başarısız
koşularda vitrin E2E 22,6 ve 26,3 dk sürdü; sonraki başarısız `signoff`
36,2 dk'da WebKit E2E hatasıyla düştü. Ardından **aynı performans değişikliği
öncesi çalışma ağacında üç tam `signoff` PASS** (48,4 / 47,0 / 48,1 dk),
ancak vitrin E2E yine 24–26 dk seviyesinde. Kapı bekçileri eklendikten sonraki taze koşu (`eb81a52c`): **18/18 PASS, 37,7 dk**, vitrin E2E 20,5 dk ([rapor §26](monorepo-audit.md)); tek koşudur. Kaynak sağlamlaştırma değişikliklerinin nihai taze koşusu da **18/18 PASS, 41,8 dk**; vitrin E2E 21,5 dk, tam audio kapsamı 9,0 dk sürdü ([rapor §27](monorepo-audit.md)).
Son VOL.TEST/CORE/network sağlamlaştırma turunun temiz `922a83dd` kaynağı da
**18/18 PASS, 63,6 dk** verdi: vitrin E2E 23,8 dk, ürün E2E 16,7 dk, tam ses
kapsamı 9,2 dk. E2E 1.170 PASS / 21 mevcut SKIP, sıfır FAIL/flaky;
başlangıç yükü %23 ve bütün aşamalar tazeydi ([rapor §28](monorepo-audit.md)).
Bedel: görsel, erişilebilirlik ve etkileşim gerilemeleri push'ta değil `signoff`ta yakalanır. Bir arayüz
değişikliğini push etmeden önce kanıtlamak için `pnpm exec just ui-check` (yüzey kaydı + build + iki motorlu e2e) koşar. **20–26 dk vitrin E2E maliyeti kabul edilemez**; yalnız push yolundan
çıkarılmıştır, henüz hızlandırılmamıştır: bkz. [F10.13](../TODO.md).

## Signoff onayı

`pnpm signoff` kullanıcının onayı olmadan koşulmaz; ajan da koşucu da bunu kendiliğinden başlatmaz.
Gerekçe: ~40 dk'lık tam koşu makineyi tutar (yük altında zamana duyarlı testleri de sarsar), e2e piksel
temellerini değiştirebilir ve `high` yeşilken zaten kanıtlanan aşamaları tekrar eder. Onay istenirken şu
dördü yazılır: hangi değişiklik hangi aşamayı kanıtsız bırakıyor, `high`in kanıtladığı kısım, tahmini süre,
düşerse çalışma ağacının durumu. Kullanıcı açıkça serbest bıraktıysa onayın kapsadığı koşu ya da oturum
boyunca yeniden sorulmaz; düşen koşunun düzeltme sonrası tekrarı onayda yazılı değilse yeniden sorulur.
Onay yoksa teslim `high` yeşiliyle yapılır ve `signoff` NOT-RUN raporlanır. Kuralın kaynağı
[AGENTS.md](../AGENTS.md)'dir.

## Kapı koşucusu

`pnpm quick`, `pnpm fast`, `pnpm high`, `pnpm signoff` ve git kancaları `scripts/quality/gate.mjs`yi çağırır.
Pre-commit `pnpm quick --index` kullanır: kapıdan önce ve sonra indeks ile sınanan
çalışma ağacı eşleşmelidir. Sahne dışı izlenen değişiklik veya yok sayılmayan yeni
dosya varsa commit reddedilir; ilgili içerik sahnelenir ya da ayrı çalışma alanına
taşınır. Kısmi sahnelemeyi ayrı bir indeks kopyasında sınamak yerine uyuşmazlık
açıkça reddedilir. Üretilmiş ve yok sayılmış çıktılar bu karşılaştırmaya girmez.
`justfile` yalnız bileşimi söyler; `just <kapı>` aynı aşamaları önbelleksiz ve art arda
koşan düz yoldur. Koşucu altı şey yapar:

1. **Sıra ve paralellik** ([`gatePlan.mjs`](../scripts/quality/gatePlan.mjs)). Aşamalar
   ucuzdan pahalıya dizilir; düşecek kapı dakikalar harcanmadan düşer. Birbirinin
   ölçümünü bozmayan statik aşamalar (`contract`, `format-check`, `typecheck`, `lint`,
   `lint-css`) birlikte koşar. Süre ölçen (`scaling`) ve tarayıcı süren (`e2e`) aşamalar
   tek başına koşar. Büyük aşamalar **birimlere** bölünür (aşağıda). `justfile`daki her
   aşamanın planda kaydı olmak zorundadır.
2. **Makbuz** ([`gateCache.mjs`](../scripts/quality/gateCache.mjs)). Girdisi bayt bayt
   aynı kalan aşama yeniden koşmaz. Anahtar git durumundan değil çalışma ağacının
   gerçek içeriğinden türer: commit, stage ya da dal fark etmez. Makbuz yalnız
   atlama içindir; sahte geçiş üretemez. Makbuz yoksa, anahtar uyuşmazsa ya da okunamazsa
   aşama koşar. Makbuzlar `node_modules` altındaki kapı önbelleğindedir (repoya girmez, `just clean` siler).
3. **Okunur çıktı.** Geçen aşama tek satırdır; koşan aşamanın NEDEN koştuğu yazılır
   (`girdi değişti`, `makbuz yok`, `önbelleksiz aşama`, `--fresh`). Düşen aşamanın sonu,
   sınıflandırması, tam günlüğün yolu ve tekrar komutu basılır. `--json` `just report` ile aynı şekli verir;
   ilk düşüşten sonra yürütülmeyen aşamaları ve bekleyen birimleri `status: notRun` olarak listeler.
   Playwright liste çıktısından test konumu ve neden ayrıştırılır; üçüncü gerçek `signoff`da
   `kind: test` ve `reason: expect(locator).toHaveClass(expected) failed` görüldü.
   Hata izleri yeni E2E çalıştırıcısında motor/şerit bazında sınırlı yerel arşive
   alınır; tarayıcısız sahte Playwright alt süreçleriyle otomatik hata arşivi
   regresyonu **5/5 PASS** (`e2eArchive.test.mjs`), yapılandırma testleri
   **3/3 PASS** (`e2eConfig.test.mjs`). Gerçek tam `signoff` hata
   zincirinin uçtan uca entegrasyon kanıtı hâlâ [F11.2](../TODO.md) işidir.
4. **Yük ön kontrolü** ([`hostLoad.mjs`](../scripts/quality/hostLoad.mjs)). `quick` dışındaki kapılar başlamadan
   makinenin meşgul oranını bir saniye örnekler; %30'u aşıyorsa yiyen süreçleri PID, oran ve komut satırıyla yazar
   (bu depoya ait olanlar `[repo]` işaretlidir ve kapatma komutu önerilir). Yalnız uyarır: kapıyı düşürmez, süreç
   kapatmaz (açık bir geliştirme sunucusu başkasının işi olabilir). Gerekçe: süre ölçen sınamalar yük altında düşer ve
   düşen sınamanın yükten mi koddan mı olduğu koşudan anlaşılmaz. Son satır ön yükü `· ön yük %N` olarak yazar;
   `--json` özetinde `hostLoad` alanıdır. `VOL_GATE_ALLOW_BUSY=1` denetimi atlar.
5. **Son yeşil `signoff` kaydı** ([`signoffRecord.mjs`](../scripts/quality/signoffRecord.mjs)). Kancalar `high`i
   koşturur, `signoff` (e2e dahil) push'ta yoktur; bu yüzden `high` yeşilken `signoff` günlerce koşulmamış olabilir.
   Yeşil `signoff` ağaç karmasını, commit'i ve süresini kapı önbelleğine (`node_modules` altı, repoya girmez) yazar (ağaç
   koşu sırasında değiştiyse yazmaz); `high` sonunda yaşı ve ağacın değişip değişmediğini söyler, `--json`da
   `signoff.state` (`none`/`same`/`changed`), `ageMs` ve `commitsSince` alanlarıdır. Yalnız uyarıdır: kapıyı
   geçirmez ya da düşürmez, imzasızdır ve başka makinedeki bir koşuyu kanıtlamaz.
6. **Sayım ve atlama bütçesi** ([`counts.mjs`](../scripts/quality/counts.mjs)). Koşan ve makbuzdan gelen her öğenin
   geçen/atlanan/düşen/kararsız sayısı aşama çıktısından okunur; `--json`da aşamanın `counts` alanı, metin
   özetinde aşama satırının sonudur (`449 geçti, 16 atlandı`). Kaynak, Playwright raporlayıcısının
   ([`countsReporter.mjs`](../scripts/quality/countsReporter.mjs)) `##counts:` satırı ve `node --test` TAP özetidir.
   `quality.json` → `skipBudget` aşama → anahtar → en çok atlama der; aşan öğe düşer, bütçede olmayan anahtarın
   hakkı 0'dır, bütçesi olan anahtarın satırı gelmezse (çıktı biçimi değişti) sayım bilinmiyor diye düşer.
   Bütçeyi yükseltmek `ratchetExceptions` ister (aşağıda). Üçüncü parti özet biçimi değişirse yalnız sayım
   kaybolur; kapı kararı çıkış kodundan gelir, bütçeli aşamada kayıp sessiz yeşil olmaz.

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

| Kapsam    | Girdi                                                                                                                                         | Aşamalar                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `repo`    | ağaçtaki her dosya (belge dahil)                                                                                                              | `contract` (iki takım), `format-check`, `coverage-audio`, `audio-verify`   |
| `code`    | paket dizinleri + paket dışı kod/yapılandırma (kök belgeler hariç)                                                                            | `coverage`, `coverage-shape`, `lint-css`, `typecheck scripts`, `lint rest` |
| `closure` | paketin kendisi + `@volstudio/*` bağımlılık kapanışı + kök yapılandırma + paketin GERÇEKTEN başvurduğu betikler (aşağıda)                     | `typecheck`, `lint`, `test`, `e2e` (paket başına makbuz)                   |
| `crate`   | crate dizini + path bağımlılıkları (geçişli) + Tauri ön yüz dizini + `Cargo.lock`, `Cargo.toml`, araç zinciri ve cargo yapılandırma dosyaları | `rust` (crate başına makbuz; JS/TS düzenlemesi Rust makbuzunu bozmaz)      |

- **Birimler.** Tarifin işini bölüşen, ayrı makbuzlanan parçalardır; yalnız girdisi
  değişen birim koşar. Birimleri [`gateUnits.mjs`](../scripts/quality/gateUnits.mjs)
  üretir; `gatePlan.test.mjs` ve `gateUnits.test.mjs` birleşimlerinin `justfile`
  tarifinin işine eşit olduğunu sınar.

  | Aşama         | Birimler                                                                                     | Eşzamanlı | Neden                                                          |
  | ------------- | -------------------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------- |
  | `contract`    | `node-test` (bekçi testleri), `cli` (workspace sözleşmesi); komutlar `contractSuites.mjs`'te | 2         | bağımsızdırlar; süre ikisinin toplamı değil uzunu olur         |
  | `typecheck`   | her aktif paket + `scripts`                                                                  | 4         | statik; paket başına makbuz                                    |
  | `lint`        | her aktif paket + `rest` (paket dışı her şey: `eslint . --ignore-pattern <paketler>`)        | 4         | `eslint .`ın kapsadığı dosya kümesi tam bölünür                |
  | `rust`        | her aktif crate (`rust.mjs --manifest`)                                                      | 1         | cargo ortak hedef dizinini kilitler; eşzamanlılık kazandırmaz  |
  | `test`, `e2e` | her aktif paket                                                                              | 1         | süre ölçen testler yük altında kararsızlaşır (aşağıdaki ölçüm) |

  `eslint .` ile birimlerin lint'lediği dosya kümesi ölçüldü: 1447 dosya, eksik 0,
  fazla 0, çift 0.

- `@volstudio/core` (`code`) ve `@volstudio/audio-synth` (`repo`) **testleri** kapanıştan
  geniştir: core'un yönetişim testleri bütün repoyu tarar; audio-synth testleri repo
  kökünden oyunların ses varlıklarını, manifestleri ve belgeleri okur. Gerekçe
  `gatePlan.mjs` → `SCOPE_OVERRIDES`tedir; yalnız `test` aşamasına uygulanır (tip ve
  lint denetimi kapanışta kalır).
- **Betikler.** Paket, `scripts/` altından yalnız gerçekten başvurduğu dosyaları (ve onların
  göreli başvurularını) okur; `gateScope.mjs` → `deriveSharedInputs` bunları kaynaktan
  türetir (içe aktarma, `join(ROOT, 'scripts', …)`, şablon yolu). Yalnız yorumdan ibaret
  satırlar sayılmaz. Değişken parçalı yol dizinin tamamını kapsar: eksik değil fazla kapsar.
  Sonuç: `scripts/quality/` düzenlemesi paketlerin makbuzunu bozmaz.
- **Gizli bağımlılık bekçileri.** `gatePlan.test.mjs`: kapanıştaki bir paketin kaynağında
  kapanış dışına uzanan göreli yol sabiti varsa test düşer; çözüm ya paketi
  `SCOPE_OVERRIDES`a almak ya da okumayı gerekçeyle `REVIEWED_ESCAPES`a yazmaktır.
  Kaçışı kalmayan kayıt da düşer. `gateUnits.test.mjs`: bir crate'in `include_*!` ve
  `bundle.resources`/`icon` yolları crate kapsamının içinde olmak zorundadır.
- **Önbelleksiz aşamalar:** `node-pin` (1 sn, ortamı doğrular), `build` ve `bundle` (çıktıları
  sonraki aşamaların girdisi), `scaling` (süre oranı ölçer), `audio-test` (kapsamı git
  farkından türer), `security-js` ve `security-rust` (sonuç zamana bağlı).
- **`signoff` hiçbir makbuza güvenmez**; yine de geçen aşamalara makbuz yazar.
- Aşama koşarken ağaç değişirse (örn. düzenleme) o dalga ve kapı düşer, sonraki
  dalgalar NOT-RUN kalır; değişmiş girdiye geçiş makbuzu yazılmaz.
- Envanter Git'ten, her mevcut girdinin karması ham disk baytından gelir.
  Temiz indeks karması kullanılmaz: LF normalizasyonu, `assume-unchanged` ve
  `skip-worktree` diskteki farklı baytı gizleyemez.

## Tekil kapılar

| Tarif            | Sınadığı                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node-pin`       | Çalışan Node, `.node-version` ve `package.json` `engines.node` ile aynı kesin sürüm; değilse ilk adımda açık mesajla durur (`doctor` aynı denetimi kullanır)                                                                                                                                                                                                                                                  |
| `contract`       | `scripts/quality/tests`, `scripts/linux/tests`, `scripts/android/tests`, `devtools/deck/tests` (bekçi ve betik testleri) ve `scripts/quality/cli/workspace-contract.mjs` (aşağıda); takımlar `contractSuites.mjs`te (`node --test` Node'un yerleşik kapsamıyla koşar; `scripts/**` eşiği `quality.json` → `scriptCoverage` ile sınanır)                                                                       |
| `format-check`   | Prettier, `**/*.{ts,mts,cts,js,mjs,cjs,css,json,md,yaml,yml,html}`                                                                                                                                                                                                                                                                                                                                            |
| `typecheck`      | Aktif paketlerin `typecheck` betiği (`tsc --noEmit`, `noImplicitOverride` dahil) ve kök betiklerin JSDoc denetimi (`scripts/tsconfig.json`)                                                                                                                                                                                                                                                                   |
| `lint`           | ESLint: TS kaynak, betik ve testler tip bilgisiyle (`no-floating-promises` hata); `.js`/`.mjs` betikler `@eslint/js` ile; deterministik kodda `localeCompare` yasak; frozen ağaçlar lifecycle'dan yok sayılır                                                                                                                                                                                                 |
| `lint-css`       | Stylelint, `**/*.css`                                                                                                                                                                                                                                                                                                                                                                                         |
| `test`           | Aktif paketlerin `test` betiği; kapsam eşiği uygulamaz                                                                                                                                                                                                                                                                                                                                                        |
| `coverage`       | `quality.json` → `coverageRuns` paketlerini eşikleriyle koşar ve koşu kaydı yazar; eşikten muaf paketin testini düz koşar (`scripts/quality/coverageRun.mjs`)                                                                                                                                                                                                                                                 |
| `coverage-shape` | 100 satırın üstünde ve %50 kapsamın altındaki dosya test ister; yalnız aynı koşunun taze lcov'unu okur                                                                                                                                                                                                                                                                                                        |
| `audio-test`     | Sabit temel takım ve değişen kaynakla ilişkili testler; silinen/belirsiz değişimde tam takım                                                                                                                                                                                                                                                                                                                  |
| `build`          | Aktif paketlerin `build` betiği                                                                                                                                                                                                                                                                                                                                                                               |
| `bundle`         | `dist` altındaki gzip'li `app`/`vendor`/`css` baytı, `quality.json` → `bundles` bütçesine karşı (bugün vol-showcase ve VOL.TEST)                                                                                                                                                                                                                                                                              |
| `scaling`        | Girdi dört katına çıkınca sürenin kaç katına çıktığı, `quality.json` → `scaling` bütçesine karşı (bugün CORE uzamsal indeksi ve VOL.TEST mermi modeli); ölçülen oranı yazar                                                                                                                                                                                                                                   |
| `e2e`            | Aktif paketlerin `test:e2e` betiği, üretim build'i; vol-showcase her spec'i iki motorda koşar: ana şeritte motorlar eşzamanlı, ayrı süreç ve ayrı portta çalışır, motor başına işçi çekirdeğin dörtte biridir, en çok 2; zamanı sınırlayan spec'ler (`QUIET_SPECS`) sessiz şeritte motor motor, tek işçiyle koşar (`devtools/vol-showcase/scripts/e2e.mjs`; piksel temeli yalnız Chromium; bekçi `e2eConfig`) |
| `rust`           | Kök workspace'in aktif üye manifestleri: `fmt --check`, `clippy --all-targets -D warnings` (feature taşıyan crate'te `--all-features` ile de), `test --all-targets`; crate'ler kökteki ortak hedef dizinini paylaşır; `--manifest <yol>` tek crate koşar                                                                                                                                                      |
| `coverage-audio` | audio-synth'in tam kapsamı ve şekli                                                                                                                                                                                                                                                                                                                                                                           |
| `audio-verify`   | Yayınlanmış her sesi manifestinden yeniden render edip PCM kimliğini karşılaştırır                                                                                                                                                                                                                                                                                                                            |
| `security-js`    | `pnpm audit --audit-level moderate`; yalnız `securityPolicy.json`da kanıtlı kayıt geçer (`scripts/quality/jsAudit.mjs`, aşağıda)                                                                                                                                                                                                                                                                              |
| `security-rust`  | Kökteki tek `Cargo.lock` üzerinde cargo-audit; zafiyet ve yanked hiç, bakımsız/sağlam olmayan uyarı yalnız kayıtlıysa geçer (`scripts/quality/rustAudit.mjs`, aşağıda)                                                                                                                                                                                                                                        |

`pnpm exec just report <kapı> --json` kapıyı koşup sonucu makine-okunur
verir; aşamalar `justfile`dan türer. `pnpm run doctor:env` araçları ve
Playwright WebKit'in paylaşımlı kütüphanelerini denetler.

Kapı adı aynı olsa da host desteği ve kanıt kapsamı farklıdır. Windows
JS/TS, audio ve MSVC Rust işleri ile Linux builder/native ABI işleri
ayrı profillerdir. Shell/argv/araç hazırlığı [Windows](windows.md)
sahibindedir; Linux'a özgü atlanan test başarı sayılmaz.

## Workspace sözleşmesi

`scripts/quality/cli/workspace-contract.mjs` bütün ihlalleri birlikte raporlar:

| Bekçi                                    | Kural                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REQUIRED_SCRIPTS`                       | Her aktif paket `typecheck`, `test`, `test:coverage` taşır; yoksa `--if-present` onu sessizce atlardı                                                                                                                                                                                                                     |
| `scripts/quality/coverageBinding.mjs`    | Paketin `vitest.config.ts`'i yüklenir; eşikleri `quality.json` ile derin eşittir, `coverage.include` `src/**/*.ts`dir (çok oyunculu oyunda `server/**/*.ts` de ölçülür)                                                                                                                                                   |
| `scripts/quality/config.mjs`             | `quality.json` şeması; eşik `floor`un altına inemez; muafiyet gerekçe ister; aktif paket kümesiyle eşleşir                                                                                                                                                                                                                |
| `scripts/quality/workspaceLifecycle.mjs` | Lifecycle kayıtları; frozen ağaçlar etiketlerine eşittir; aktif paket frozen pakete bağımlı olamaz                                                                                                                                                                                                                        |
| `scripts/quality/layers.mjs`             | Paket ve kaynak import yönü (aşağıda); başka pakete yalnız `exports` haritasındaki yoldan girilir                                                                                                                                                                                                                         |
| `scripts/quality/moduleCycles.mjs`       | Paket içi çalışma zamanı import döngüsü; `import type` sayılmaz, `@/` alias'ı çözülür                                                                                                                                                                                                                                     |
| `scripts/quality/indexModules.mjs`       | `src/**/index.ts` yalnız yeniden dışa aktarım ve tip içerir; kapsam ölçümü bu dosyaları dışladığı için içlerindeki mantık sınanmazdı                                                                                                                                                                                      |
| `scripts/quality/thresholdRatchet.mjs`   | Kapsam eşikleri, `floor`, muafiyetler ve şekil sınırı taban dala (`origin/dev`, yoksa `dev`/`main`; merge-base) göre gevşeyemez; gevşetme `quality.json` → `ratchetExceptions` içinde anahtar, değer ve gerekçeyle kayıtlıdır. Taban ref yoksa NOT-RUN notu basılır. Taban dosya kimliği `contract` makbuz anahtarındadır |
| `scripts/quality/counts.mjs`             | Aşama çıktısından geçen/atlanan sayımı okur ve `quality.json` → `skipBudget` ile karşılaştırır; bütçe aşımı, bütçesiz anahtar ve okunamayan sayım düşer                                                                                                                                                                   |
| `scripts/quality/scriptCoverage.mjs`     | Kapı kodunun (`scripts/**`) kendi kapsamı: `contract` node-test koşusunun LCOV'u toplam eşikle, yüklenmeyen betik `acknowledged` gerekçesiyle ve betik başına taban ile karşılaştırılır (F11.6)                                                                                                                           |
| `scripts/quality/snapshotPlatforms.mjs`  | Piksel temeli platform kümeleri birbirine eşit olmalı; eksik platform kümesi (bayat Linux temeli gibi) düşer (F11.8)                                                                                                                                                                                                      |
| `scripts/quality/fixedWaits.mjs`         | Test dosyası başına `waitForTimeout` bütçesi (`quality.json` → `fixedWaitBudget`): artış ve unutulmuş bütçe düşer; ölçülen 56 çağrı / 21 dosya koşula çevrildikçe bütçe düşürülür (F11.9)                                                                                                                                 |
| `scripts/quality/countsReporter.mjs`     | Playwright raporlayıcısı: proje (ve vitrinde şerit) başına `##counts:` satırı; iki paketin `playwright.config.ts`inde tanımlıdır                                                                                                                                                                                          |
| `scripts/quality/sourceSize.mjs`         | Kod, test, betik, stil ve native kaynak en çok 1000 satır; belge, veri ve asset sayılmaz                                                                                                                                                                                                                                  |
| `scripts/quality/commentDensity.mjs`     | TS, JS, Rust, CSS ve Kotlin kaynağında yorum oranı en çok %40 (aşım gerekçe listesiyle), tek yorum bloğu en çok 24 satır                                                                                                                                                                                                  |
| `scripts/quality/i18nSurface.mjs`        | AST taraması: TR/EN parite, camelCase adlandırma, kullanılmayan anahtar (test kanıt değildir), gerekçeli ve üreticisi doğrulanan dinamik aileler, eksik `ad:anahtar` sabiti, modül düzeyi çeviri çağrısı, kodlanmış görünen metin (gerekçeli `TEXT_ALLOW`, bayat istisna reddedilir)                                      |
| `scripts/quality/blobSize.mjs`           | İndeks ve çalışma ağacında 2 MiB üstü dosya                                                                                                                                                                                                                                                                               |
| `scripts/quality/trackedImports.mjs`     | `.gitignore`'un yok saydığı dosya kaynak koddan import edilemez                                                                                                                                                                                                                                                           |
| `scripts/quality/devPorts.mjs`           | İki ayrı paket aynı geliştirme portunu bildiremez                                                                                                                                                                                                                                                                         |
| `scripts/quality/deviceApps.mjs`         | Cihaz ölçümü adayları `active` + `<paket>/src-tauri/tauri.conf.json` keşfinden türer                                                                                                                                                                                                                                      |
| `scripts/quality/cargoWorkspace.mjs`     | Aktif her crate kök Cargo workspace'inin üyesidir; tek kilit kökteki `Cargo.lock`tur; profil yalnız kökte                                                                                                                                                                                                                 |
| `scripts/quality/productIcons.mjs`       | Bugün games altındaki aktif uygulamaların ikonunu sınar; native devtool kapsamı UI-06 görevidir; şablon/başka ürün ikonu reddedilir                                                                                                                                                                                       |
| `scripts/quality/phaserBoundary.mjs`     | `core` Phaser'ı yalnız kayıtlı köprü dosyalarında import eder                                                                                                                                                                                                                                                             |
| `scripts/quality/publicTypeSurface.mjs`  | CORE'un public tip yüzeyi `coreTypeSurface.snapshot.json` ile eşittir                                                                                                                                                                                                                                                     |
| `scripts/quality/appIdentity.mjs`        | Her aktif Tauri uygulamasının kimliği ürüne özgüdür (paket adını taşır), jenerik değildir ve çakışmaz; veri dizini ve Cloud kökü ondan türer                                                                                                                                                                              |
| `scripts/quality/tauriPlugins.mjs`       | JS `@tauri-apps/plugin-*` → Rust kaydı; Cargo eklenti bağımlılığı → kaynakta kayıt ya da izin; kayıtlı eklenti → izin ya da JS tüketicisi; yetenek izni → kurulu eklenti; `TauriWindowAdapter`ın çağırdığı her pencere komutu → pencereyi süren uygulamanın masaüstü yeteneğinde izin                                     |
| `scripts/quality/catalog.mjs`            | CORE kökünden açılan her UI bileşeni vol-showcase vitrininde gösterilir ve CORE testinde adıyla geçer; parça ve görsel olmayan katman gerekçeli istisnadır                                                                                                                                                                |
| `scripts/quality/uiRegistry.mjs`         | CORE UI alt yolunun her sınıf ve yardımcısı `devtools/vol-showcase/src/catalog/registry.json` içinde tekil kayıtlıdır; tier/faz/anchor/arketip, tüketici (AST), vitrin kullanımı ve gerçek `it` + `expect` kanıtı ya da sahip görevli gap doğrulanır                                                                      |
| `scripts/quality/uiEvidence.mjs`         | Vitrinin axe ve geometri/glif istisna kayıtları ile durum fixture verisi: her kayıt açık bir UI görevine bağlı, gerekçeli ve yinelenmez; fixture registry'de uygulanabilir bir durumu sınar                                                                                                                               |
| `scripts/quality/uiTheme.mjs`            | UI tema kapısı: `theme.css` üretilen bölgeleri kaynaktan sapmamış; metin/ikon/odak/kenarlık kontrastı SON renk üzerinden (kusurlar sahip UI görevli kayıtlı, bayat/kayıtsız düşer); UI CSS'inde ham (var dışı) hareket süresi dosya başına artamaz (ratchet)                                                              |
| `scripts/quality/rootEntries.mjs`        | Kökteki her girdi gerekçesiyle kayıtlıdır; gerekçesiz yeni girdi ya da karşılıksız kayıt reddedilir                                                                                                                                                                                                                       |
| `scripts/quality/contextComments.mjs`    | Kaynak yorumları tarihçe ("bir dönem", "eskiden"), ölçüm günlüğü ("ölçüldü:"), tarih ve plan/faz kimliği taşımaz                                                                                                                                                                                                          |

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

Windows 11, 8 mantıksal çekirdek. İki sütun ayrı yöntemdir ve karıştırılmaz: **tek başına** önceki ölçümdür
(boş makine, ısınmış önbellek, aşama tek koşar); **taze tur** 2026-10-11'de kapı koşucusunun `--fresh` koşusudur
(makbuzsuz, ön yük ≤%11; statik aşamalar birlikte koştuğundan her biri tek başınadan uzundur, toplam duvar süresi
yine kısadır). Yük altında süreler uzar.

| Aşama              | Tek başına | Taze tur               | Not                                                                                                               |
| ------------------ | ---------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `node-pin`         | 1 sn       | 1 sn                   |                                                                                                                   |
| `contract`         | 40 sn      | 86 sn                  | `node-test` 86, `cli` 71 sn; statik dalgada                                                                       |
| `format-check`     | 5 sn       | 83 sn                  | tek başına sıcak içerik önbelleğiyle; dalgada işlemciyi paylaşır                                                  |
| `typecheck`        | 27 sn      | 59 sn                  | en yavaş birim CORE ve vitrin ~35 sn                                                                              |
| `lint`             | 54 sn      | 81 sn                  | CORE 80, audio-synth 82, vitrin 54, VOL.TEST 48 sn (tip bilgili ESLint)                                           |
| `lint-css`         | 4 sn       | 51–61 sn               | tek başına sıcak içerik önbelleğiyle                                                                              |
| `build` / `bundle` | 4 / 1 sn   | 4 / 1 sn               |                                                                                                                   |
| `scaling`          | 4 sn       | 3,5 sn                 |                                                                                                                   |
| `audio-test`       | 12–144 sn  | 6 sn                   | alt küme; yapılandırma/silme değişiminde tam takım (144 sn bu turda ölçülmedi)                                    |
| `rust`             | 35 sn      | 29–37 sn               | sıcak hedef dizini; soğuk derleme (kilit/araç zinciri değişimi) 4,4 dk, ölçülmedi                                 |
| `test`             | 238 sn     | 272 sn                 | audio-synth 149, core 67, vol-test 29, vitrin 19, tauri-v2 4, pen.dev 3, deck 1 sn                                |
| `coverage`         | 113 sn     | 163 sn                 | audio-synth hariç; paket başına 4 Vitest işçisi (çekirdek/2), üç koşu yeşil                                       |
| `e2e` vitrin       | 343 sn     | **1.355 / 1.577 sn**   | 22,6 / 26,3 dk (ilk iki başarısız koşu); sonraki üç tam PASS'te ~24–26 dk; 343 sn bayat bütçe                     |
| `e2e` vol-test     | 86 sn      | ilk iki koşuda NOT-RUN | ilk başarısız dizide vitrin düştüğü için koşmadı; **sonraki üç tam PASS'te koştu ve geçti** (ayrı süre kaydı yok) |
| `coverage-audio`   | 545 sn     | 547 sn                 | kapsam ölçümü sentezi yavaşlatır                                                                                  |
| `audio-verify`     | 100 sn     | 101 sn                 |                                                                                                                   |
| `security-js`      | 3 sn       | 3 sn                   | audit + yama sınaması + kayıt defteri sorgusu                                                                     |
| `security-rust`    | 4 sn       | 4 sn                   |                                                                                                                   |

Birleşik kapılar, ilk taze tur (makbuzsuz): `quick` 87,8 sn; `fast` 6,0 dk; `high` **4,7 dk**; `signoff` iki koşuda da
(27,1 ve 30,6 dk) vitrin `e2e`inde düştü ve orada durdu, bu yüzden dört son aşama ayrı koşuldu (hepsi geçti; toplam
~11 dk). Önceki
belge `high` için "yaklaşık 13,4 dk" diyordu: o sayı `e2e` pre-push kapısındayken ve eski süre bütçesiyle
toplanmıştı; `e2e` `signoff`a taşındığından geçersizdir. Girdisi hiç değişmemiş ağaçta `quick` 2 sn, `high`
yaklaşık 13 sn sürer (önceki ölçüm, bu turda yeniden ölçülmedi).

**Sonraki `signoff` (2026-10-11):** 36,2 dk sonunda yeniden **FAIL** (toplam 0/3
yeşil). Vitrin E2E ana WebKit şeridi 447 PASS / 16 SKIP / 1 FAIL:
`hudStates.spec.ts:248:3` XPBar çoklu seviye testinde 15 sn boyunca beklenen
`vol-xp-bar--level-up` sınıfı görülmedi (`expect(locator).toHaveClass(expected) failed`).
Chromium ana şeridi ve iki motorun sessiz şeridi geçti; VOL.TEST E2E birimi
çalışmadı. Dört sonraki aşama (`coverage-audio`, `audio-verify`, `security-js`,
`security-rust`) JSON'da `notRun` oldu; önceki ayrı PASS kanıtları bu turu
yeşil yapmaz. Playwright düşüşü `kind: test` olarak sınıflandırıldı;
`last-failure.log` ve bu turun trace'i o an geçiciydi. `fast`/`high` PASS, F11.1/F11.2
açık ([tarihsel denetim §23](monorepo-audit.md)); sonraki yeşil seri [§25](monorepo-audit.md)'tedir.

**Üçüncü koşu sonrası hedefli doğrulama, tam kapı değil (2026-10-11):**
`hudStates.spec.ts`, 600 ms'lik XPBar vurgu sınıfını `click()` tamamlandıktan
sonra yakalamaya çalışmak yerine tıklamadan **önce** `MutationObserver`
kurar; sınıf geçişini ve animasyon/gölge kanıtını olay anında toplar.
Hedefli WebKit **6/6**, Chromium **6/6** PASS. Bu test düzeneği iyileştirmesi
önceki iki ayrı WebKit hatasının kök nedenini tek başına çözmez. **Sonrasında
üç art arda başarılı tam `signoff` elde edildi**, fakat F11.1'in
gerçek pointer/actionability regresyonu ve (a)/(b) kök neden ölçütleri
**açık**; eski Playwright tıklamalarını sayfa içi `element.click()` ile
değiştirmek gerçek hit-testing testinin yerine geçmez.

**Hata arşivi, hedefli hata-yolu doğrulaması (F11.2 KISMİ):**
`devtools/vol-showcase/scripts/e2e.mjs` her motor/şerit için ayrı
Playwright `outputDir` ve JSON raporu yapılandırır. Başarısız şeridin
`error-context.json` ve varsa `trace.zip` / `report.json` kanıtı
git dışı `node_modules` kalite önbelleğine arşivlenir. Worker-2'nin
iki motoru da zorla düşürdüğü sınamada arşiv dosyaları oluştu;
ardından başarılı çalıştırma eski hata kanıtını silmedi. **Yeni otomatik
RED→GREEN arşiv regresyonu** `scripts/quality/tests/e2eArchive.test.mjs`
**5/5 PASS**; `e2eConfig.test.mjs` **3/3 PASS**. Gerçek Node alt süreçli
sahte Playwright testi iki motorun trace/JSON arşivini, JSON ek yollarının
taşınınca güncellenmesini, ana/sessiz şerit ayrımını, rapor bulunmayan hata
durumunu, sonraki PASS'in eski arşivi korumasını ve yaş/sayı budamasını
doğrular; tarayıcı/Vite açmaz. **10→11 hata regresyonu düzeltildi:**
çalıştırıcı hem başlangıçta hem **koşu sonunda** 14 gün/10 hata koşusu
sınırını uygular, scratch dosyalarını 2 güne kadar tutar. Başarılı geçici
çıktı temizlenir; genel `last-failure.log` kalıcı değildir. Arşiv
yereldir, merkezi/değişmez kayıt değildir; bu kayıt özelliği bir PASS
iddiası sayılmaz. Önceki üç tam yeşil `signoff` yeni arşiv değişikliği
**öncesine** aittir ve gerçek tam başarısızlık yolunu sınamaz.
**F11.2 açık kalan:** güncel kodda gerçek tam `signoff` hatasının
kapı raporu/`notRun` ile arşivlenmiş Playwright izine bağlanmasının
uçtan uca doğrulanması ve son kod değişikliklerinden sonra taze tam
`signoff` kanıtı;
[tarihsel §24 ve güncel §25](monorepo-audit.md).

**Üç ardışık tam PASS — performans değişiklikleri öncesi çalışma ağacı
(2026-10-11, denetim §25):**

| Tam koşu      | Duvar süresi | Sonuç          | Kanıt sınırı                                                                                                    |
| ------------- | ------------ | -------------- | --------------------------------------------------------------------------------------------------------------- |
| Yeşil seri #1 | 48,4 dk      | PASS           | Tam kapı; vitrin + VOL.TEST E2E ve E2E sonrası aşamalar geçti                                                   |
| Yeşil seri #2 | 47,0 dk      | PASS           | Aynı değişiklik öncesi çalışma ağacı, tam kapı                                                                  |
| Yeşil seri #3 | 48,1 dk      | **18/18 PASS** | Üçüncü tam kapı; `coverage-audio`, `audio-verify`, `security-js`, `security-rust` E2E'den sonra gerçekten koştu |

**Sonuç:** Önceki üç WebKit FAIL koşusu tarihsel olarak geçerlidir; onların
ardından **3/3 tam PASS** doğrulandı. Bu doğruluk kanıtı F11.1/F11.2'nin
açık regresyon/kök neden işlerini kapatmaz, Android/Deck/insan kabulü değildir.
Vitrin E2E'nin **24–26 dk** olması 10 dk tetik eşiğini ağır biçimde aşıyor;
F10.13'te ölçüme dayalı performans müdahalesi ve müdahale **sonrası**
yeni tam kapı kanıtı gerekir. Bu kayıt bir performans düzeltmesi
**sonrasında koşulmuş `signoff`** olarak yorumlanamaz.

Makbuzlu `quick`, tek dosya düzenlemesinden sonra yalnız etkilenen birimi koşar (önceki ölçüm: yaprak paket
kaynağı ~45 sn, betik ~38 sn, belge ~35 sn; taban `contract` 28–35 sn tek başına). Birden çok birim
geçersizleşirse aynı dalgada koşarlar ve birbirini yavaşlatır: negatif kontrol turunda tek bir CORE dosyası
düzenlemesi 84–89 sn, `contract`ı tetikleyen düzenlemeler 82–122 sn sürdü.

Süre ölçen testler yük altında kararsızlaşır; bu yüzden `scaling` ve `e2e` tek başına
koşar, audio-synth işçi sayısı sınırlıdır (`devtools/audio-synth/vitest.config.ts`) ve
vitrin motorları yalnız birbirleriyle eşzamanlıdır. **Taze turda vitrin `e2e` bu düzende bile iki koşunun
ikisinde de bir WebKit testinde zaman aşımına uğradı** (`dialogPatterns.spec.ts:116` ana şerit; `motionMeasure.spec.ts:124`
sessiz şerit, tek işçi, ön yük %4; ilki izole tekrarda 50/50 geçti; TODO F11.1): düzen kararsızlığı tamamen önlemez.

**Sessiz şerit.** Zamanı ÖLÇEN ve süre sınırı koyan beş vitrin spec'i (`QUIET_SPECS` →
`busyFeedback`, `latency`, `motionMeasure`, `performance`, `probe`) iki motor ve dört işçi
eşzamanlıyken kararsızdı (WebKit'te meşgul durumun tabana eklediği süre ve flaş sınırının
devreye girmesi düştü); tek başına, tek işçiyle koşunca geçtiler. `devtools/vol-showcase/scripts/e2e.mjs` tam koşuyu
ikiye böler: ana şeritte geri kalan her şey motorlar eşzamanlı, ardından bu spec'ler motor motor
ve tek işçiyle. Şeritler yalnız tam koşuyu böler: `e2eConfig` bekçisi her spec dosyasının HER
PROJEDE tam bir şeritte koştuğunu ve listenin gerçek dosyaları adlandırdığını sınar (proje düzeyindeki
`testIgnore` üst düzeydekini ezer; WebKit'te bu yüzden sessiz spec'ler bir koşu boyunca ana şeritte de
koştu ve yükte düştü); dosya adı ya da `--grep`
verilen ad hoc koşu tek şeritte koşar. Yeni bir sınama süreyi SINIRLIYORSA listeye girer.

**Bu bütçe yalnız boş makinede geçerlidir.** 2026-10-11'de vitrin `e2e`i bu bütçenin çok üstüne
çıktı ve zamanlama sınamaları düştü; iki ayrı yük etkeni ölçüldü: (1) önceki turlardan kalan beş
`vite` geliştirme sunucusu makinenin yaklaşık %70'ini yedi (kapatılınca yük %8'e indi); (2) açık
bir geliştirme oturumunun iki `vite` sunucusu, istemcisiz ve dosya değişimsiz hâlde bile ikişer
çekirdeğe yakın işlemci yiyordu. İkincinin sebebi KANITLANMADI: taze bir sunucu boşta ve bir
`build` yazım fırtınasından sonra da %99 boşta kalır; yalnız uzun ömürlü olanlar dönüyor. Kapı artık
bunu başlamadan söyler (yük ön kontrolü). Düşen bir zamanlama sınamasını yorumlamadan önce son
satırdaki `· ön yük` değerine bakın: %30'un üstündeyse o koşu yük taşır.

### Ölçülüp benimsenmeyenler

Eşzamanlılık kararı sezgiyle değil ölçümle verilir; benimsemek için en az üç art arda
yeşil koşu gerekir. Aşağıdakiler bu ölçütü karşılamadığı için YOKTUR; aynı denemeyi
körlemesine tekrarlamayın.

| Deneme                                              | Ölçüm (8 çekirdek)                                                                           | Karar                                               |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| vitrin e2e, motor başına 2 işçi                     | 456 → 341 / 339 / 351 sn, üç koşu yeşil                                                      | **benimsendi** (çekirdek/4, en çok 2)               |
| vitrin e2e, motor başına 3 işçi                     | 317 / 319 / 325 sn; üç koşunun ikisinde zamanlama sınaması (`probe` flaky, `latency` düştü)  | reddedildi: ~25 sn için ölçüm sınamaları bozulur    |
| vol-test e2e, 2 işçi                                | 85 → 77–79 sn (34 sınama; süreyi birkaç uzun sınama belirler)                                | reddedildi: 7 sn için ayar değişmez                 |
| `coverage`, `pnpm -r --no-sort`                     | 111–112 → 101–109 sn ama her koşuda farklı sınamalar 5 sn zaman aşımına düştü                | reddedildi: kazanç yok, kararsız                    |
| `coverage`, paket başına işçi sınırsız (varsayılan) | ~148 sn ama beş koşunun ikisinde vitrin `main.test.ts` 20 sn aşımına düştü (tek başına 3 sn) | reddedildi: dört paket birlikte çekirdeği aşar      |
| `coverage`, paket başına 2 işçi (çekirdek/4)        | 237 / 236 / 241 sn, üç koşu yeşil                                                            | reddedildi: +%45 süre, en ağır paketin yolu uzar    |
| `coverage`, paket başına 4 işçi (çekirdek/2)        | 163 / 163 / 163 sn, üç koşu yeşil                                                            | **benimsendi** (`workersPerPackage`)                |
| `test`, 2 birim eşzamanlı                           | 245 → 219 sn; audio-synth 141 → 219 sn, core 55 → 88 sn uzadı                                | reddedildi: %11 kazanç, çekişme kritik yolu uzatır  |
| `audio-test`, yapılandırma değişiminde de alt küme  | tam takım yalnız yapılandırma/silme değişiminde koşar (144 sn); tipik alt küme 12 sn         | reddedildi: yapılandırma her sınamayı etkileyebilir |
| `coverage` paket başına makbuz                      | `coverage-shape` koşunun bütün lcov'unu okur                                                 | reddedildi: tazelik sözleşmesini bozar              |

## Kapı sağlığı: ne yakalar, ne yakalamaz

| Kapı                                            | Yakaladığı                                                                     | Bilinen sınır                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `contract`                                      | katman, döngü, i18n, port, ikon, kilit, belge-gerçek uyumu, bekçilerin kendisi | repo geneline bakar; yalnız yazılmış bekçiyi zorlar; betik kapsamı satır/dal/işlev eşiklidir ama yüklenmeyen CLI'lar gerekçeli listelidir (`scriptCoverage.acknowledged`)                                                                                                                                                                        |
| `typecheck`, `lint`, `lint-css`, `format-check` | tip, kural ve biçim ihlalleri                                                  | çalışma zamanı davranışını sınamaz                                                                                                                                                                                                                                                                                                               |
| `test`, `coverage`                              | birim ve yönetişim testleri; kapsam eşikleri ve şekil denetimi                 | `test` eşik uygulamaz (yeşil görünüp `high`'ı kırabilir); eşik düşürmeyi önceki tabana göre reddeden ratchet eksik (F11.4)                                                                                                                                                                                                                       |
| `audio-test`                                    | audio-synth'in sabit alt kümesi + değişenle ilişkili testler                   | alt küme tam takımın yerini tutmaz; tam kanıt `test` ve `coverage-audio`'dadır                                                                                                                                                                                                                                                                   |
| `rust`                                          | `fmt`, `clippy -D warnings`, `test`                                            | yalnız host hedefi; Linux/Android native kanıtı ayrı                                                                                                                                                                                                                                                                                             |
| `e2e`                                           | iki motorda axe, yerleşim, durum matrisi, sahte dil, piksel                    | piksel temeli yalnız Chromium ve işletim sistemi başına: kayıtlı küme yalnız `win32`dir, Linux temeli yoktur (o makinede tam yenilenmedikçe NOT-RUN) ve eksik platform kümesi `contract`ta düşer; atlamalar sayılır ve `skipBudget`la sınırlıdır (aşağıdaki motor boşlukları tablosu); yük altında aralıklı zaman aşımı görülebilir (TODO F11.1) |
| `scaling`, `bundle`                             | algoritmik ölçekleme oranı, gzip bütçesi                                       | süre eşiği yoktur; cihaz performansı kapı değildir                                                                                                                                                                                                                                                                                               |
| `coverage-audio`, `audio-verify`                | tam audio kapsamı; yayınlanmış her sesin yeniden render kimliği                | dinleme kanıtı değildir (insan beyanı gerekir)                                                                                                                                                                                                                                                                                                   |
| `security-js`, `security-rust`                  | bilinen advisory; kayıtsız yeni risk, bayat kayıt, yayımlanmış düzeltme        | kayıtlı riskler gerçek olarak durur (aşağıdaki politika); zamana bağlıdır, yeni advisory kapıyı sonradan kırabilir                                                                                                                                                                                                                               |

**Negatif kontrol (2026-10-11, `quick`):** bilerek eklenen kusurlardan tip hatası, `no-floating-promises`, biçim,
CSS sınıf adı, 1001 satırlık izlenen ve izlenmeyen dosya, katman ihlali, kodlanmış görünen metin, kırık belge
bağlantısı ve tarihçe yorumu beklenen aşamada yakalandı. Yakalanmayan: kısmi sahneleme (kapı çalışma ağacını sınar, commit'e girecek indeksi değil). Kapsam eşiğini
düşürmek ilk turda geçmişti (CORE satır 90→60); `thresholdRatchet.mjs` sonrası `contract` onu taban dala göre
reddeder (gerçek ağaçta eşik 94→60 yapılınca düştü). Ayrıntı ve yöntem: [denetim raporu §22](monorepo-audit.md).

### e2e motor boşlukları ve atlama bütçesi

Atlama bütçesi (`quality.json` → `skipBudget`, 2026-10-11 Windows ölçümü) motor başına şunu söyler; bütçeyi
aşan ya da yeni bir atlama getiren değişiklik kapıda düşer. Bir motorda atlanan şey o motorda **kanıtlanmamıştır**:

| Anahtar                       | Atlama | Nedeni (kaynaktaki atlama iletisi)                                                                                       |
| ----------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| `vol-showcase/webkit/main`    | 16     | Toplayıcı (`UI_BASELINE_OUT` yok) + Chromium'a özgü kanıt: gerçek dokunma (CDP, SplitPane), pano izni, axe, layout-shift |
| `vol-showcase/webkit/quiet`   | 2      | Chromium'a özgü iz (`motionMeasure`, `probe`)                                                                            |
| `vol-showcase/chromium/main`  | 1      | Toplayıcı (`UI_BASELINE_OUT` verilmediği için rutin koşuda atlanır)                                                      |
| `vol-showcase/chromium/quiet` | 1      | WebKit'e özgü iz testi (`probe.spec.ts`)                                                                                 |
| `vol-test/webkit`             | 1      | Web Audio yok: bu motorda ses ölçümüne uygun değil (`audio.spec.ts`)                                                     |
| `vol-test/chromium`           | 0      | —                                                                                                                        |
| `contract` → `node-test`      | 2      | `appimageMedia` araç yokluğu, deck SIGTERM `/proc` taraması (Linux sözleşmesi)                                           |

Atlama başına test adı bu tabloda değil, bütçe aşıldığında düşen aşamanın günlüğündedir; neden metinleri
kaynaktaki `test.skip(...)` iletileridir. Linux ya da başka makinede sayı farklı olabilir; ölçülmemiş ortamın bütçesi yazılmaz.

Cihaz kabulü, insan beğenisi ve fiziksel ölçüm hiçbir kapının konusu değildir.

## Güvenlik riski politikası

`security-js` ve `security-rust` ham advisory listesini değil, advisory'lerin
[`securityPolicy.json`](../scripts/quality/securityPolicy.json) ile eşlenmiş sonucunu
denetler. Seviye düşürülmez; toptan yok sayma yoktur. Her kayıt advisory, paket ve
sürümle eşleşir; gerekçe, etki alanı, sahip, kaldırma koşulu ve gözden geçirme
tarihi taşır, aksi hâlde politika dosyası geçersizdir.

| Bulgu                                       | Kapı                                                                                      |
| ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| JS advisory (moderate ve üstü)              | Yalnız politikada kayıtlıysa **ve** kanıtı sağlanıyorsa geçer                             |
| Rust zafiyeti                               | Her zaman düşer                                                                           |
| Rust yanked crate                           | Her zaman düşer; `cargo update -p <crate>` ile yükseltilir                                |
| Rust `unmaintained` ya da `unsound` uyarısı | Yalnız politikada (advisory + crate + sürüm + tür) kayıtlıysa geçer; yeni olan düşer      |
| Kayıtlı ama artık bulunmayan kayıt          | Düşer; kayıt silinir ya da yeni sürüm için yeniden gözden geçirilir (politika bayatlamaz) |

**JS kanıtı** (`jsAudit.mjs`): yama dosyası vardır ve `pnpm-workspace.yaml`
`patchedDependencies` ile bağlıdır; bağımlıların gerçekten çözdüğü kurulu kopya
gerçek bir Node sürecinde paketin davranış sınamasından geçer; kayıt defterinde
daha yeni sürüm yayımlanmamıştır (yayımlanmışsa yükseltme gözden geçirilir ve yama
silinir). Davranış sınaması olmayan pakete istisna verilemez.

Güncel kayıtlar:

- **braces 3.0.3** (GHSA-vfj7-8cjw-p6xm, yüksek). Upstream düzeltme yayımlamadı ve stylelint'in
  micromatch/fast-glob zinciri başka sürüme geçemez (stylelint 17 dahil aynı zinciri taşır).
  [`patches/braces@3.0.3.patch`](../patches/braces@3.0.3.patch) iç içe küme ve parantez
  derinliğini 100 ile sınırlar; aşan desen yığın taşması yerine denetimli `SyntaxError` verir,
  olağan desenlerin çıktısı değişmez. Yalnız geliştirme aracıdır: stylelint desenleri kendi
  yapılandırmasından alır, dışarıdan desen gelmez.
- **Rust, 8 kayıt.** `glib 0.18.5` (`unsound`, yalnız Linux): etkilenen `VariantStrIter`
  API'sini bağımlılık kapanışında çağıran yoktur. `proc-macro-error` ve `paste`
  derleme zamanı makrolarıdır. Beş `unic-*` crate'i `tauri-utils 2.9.3` → `urlpattern 0.3`
  zincirindedir. Sahip hepsinde Tauri, gtk-rs ya da steamworks-rs'tir; her kaydın
  zinciri, platformu ve kaldırma koşulu dosyadadır.

Kayıt eklemek: önce düzeltme ya da yükseltme denenir; olmuyorsa etki alanı
(çağıran var mı, hangi platform, çalışma zamanı mı derleme zamanı mı) doğrulanıp
`securityPolicy.json`a yazılır. Kaldırma: koşul gerçekleşince yükseltme yapılır, kayıt
(ve varsa yama) silinir; bayat kayıt kapıyı zaten düşürür.

## Ölçüm notları

UI durum matrisi, tema geometrisi, axe ve gerçek UI maliyeti için
[doğrulama planı](ui/VERIFICATION.md) mevcut kapıyla gelecekteki genişlemeyi
ayırır. Yüzey kaydı, axe (5 WCAG etiketi) ve katman durum fixture'ları kapıdadır
(`contract` + vitrin E2E); tema geometrisi, gerçek UI maliyeti ve tam durum
matrisi UI görevlerinde eklenir.

- **Kapsam motoru:** Vitest ve `@vitest/coverage-v8` aynı exact sürümdedir;
  V8 kapsamı AST tabanlı yeniden eşleme kullanır. Motor değişiminde eşik
  geçişi ölçülen LCOV pay/paydalarıyla yapılır; önceki eşiklere göre düşüşü
  reddeden ratchet `scripts/quality/thresholdRatchet.mjs`tir (`contract`).
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
| `ui-check`                    | UI yüzey kaydı + vitrin build'i + iki motorlu tam E2E; `high` içermez, UI değişikliği için push öncesi ayrı çalıştırılır                                     |
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
