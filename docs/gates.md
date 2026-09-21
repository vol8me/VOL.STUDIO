# Kalite kapıları

Tüm monorepo `pnpm quick` (pre-commit), `pnpm high` (pre-push) ve `pnpm signoff`
(sürüm/milestone) olmak üzere üç kademeli kapıyla korunur. Kapılar `justfile`
içinde tanımlıdır; `just` yüklü değilse `pnpm exec just <tarif>` çalışır.

| Kapı      | Süre   | Ne zaman çalışır | Kapsamı                                                                      |
| --------- | ------ | ---------------- | ---------------------------------------------------------------------------- |
| `quick`   | ~45 sn | Pre-commit hook  | `contract` + `format-check` + `typecheck` + `lint`                           |
| `fast`    | ~1 dk  | Yerel geliştirme | `quick` + `test`                                                             |
| `high`    | ~2 dk  | Pre-push hook    | `quick` + `rust` + `lint-css` + `coverage` + `build` + `bundle` + `e2e`      |
| `signoff` | ~5 dk  | Sürüm öncesi     | `high` + `coverage-audio` + `audio-verify` + `security-js` + `security-rust` |

## Workspace yaşam döngüsü (Lifecycle Governance)

Monorepo'da paket varlığı ile rutin kalite kapısı hedefi birbirinden ayrılmıştır:

- **Aktif (`active`) Paketler:** Geliştirilmeye, rutin kalite kapılarına (`quick`,
  `high`, `signoff`), testlere, kapsam kontrollerine ve derleme süreçlerine
  dahil olan paketlerdir (`scripts/quality/runActive.mjs` üzerinden dinamik
  keşfedilir).
- **Dondurulmuş (`frozen`) Paketler:** Yaşam döngüsünü tamamlamış, bilinen-iyi
  (known-good) ve doğrulanmış nihai snapshot'ı alınmış paketlerdir (`vol-hell`,
  `vol-arachnid`). Bu paketler:
  - Rutin test, kapsam, derleme ve E2E koşularının yanı sıra format
    (`.prettierignore`), lint (`eslint.config.mjs`), stil (`.stylelintignore`)
    ve kaynak-kalitesi tarayıcılarının (satır, yorum, i18n, döngü, katman,
    port, ikon, kilit paritesi) seçiminden de çıkarılır — frozen ağaçtaki bir
    ihlal düzeltilemez, kapıyı kalıcı kilitlerdi.
  - Buna karşılık repo/bütünlük bekçileri (ağaç drift'i, tag↔commit,
    bağımlılık yönü, blob boyutu, tracked-import, git dosya temizliği) frozen
    ağacı görmeye devam eder — onların konusu ürün kalitesi değil,
    değişmezlik ve klon bütünlüğüdür.
  - Mevcut `HEAD` üzerinde kesinlikle **değiştirilemez (immutable)** kabul edilir.
  - `scripts/quality/workspaceLifecycle.mjs` bekçisi tarafından git düzeyinde
    denetlenir: Her frozen paket için `freezeTag` (annotated Git etiketi),
    `freezeCommit` (tam hex commit hash'i), `decisionDate` ve `reason` zorunludur.
  - Tag ile commit birebir örtüşmek zorundadır (`tag^{commit} === freezeCommit`).
  - Frozen paket ağacında freeze commit'inden sonra hiçbir izlenen dosya farkı
    (`diff`) ve izlenmeyen dosya (`untracked non-ignored`) bulunamaz.
  - **Bağımlılık Yönü Yasağı:** Aktif bir paket ASLA dondurulmuş bir pakete
    bağımlı olamaz (`dependencies`, `devDependencies`, `peerDependencies`).
  - **Tarihsel Doğrulama:** Dondurulmuş bir ürünün doğrulanması veya incelenmesi
    ihtiyacı, rutin kapıları şişirerek değil, ilgili `freezeTag`ine git
    checkout/worktree yapılarak karşılanır.
  - **Yeniden Aktifleştirme (Reactivation):** Dondurulmuş bir üründe yeni
    geliştirme yapılması gerekirse, `workspace-lifecycle.json` içinde statüsü
    bilinçli olarak `active` yapılır, freeze alanları kaldırılır, bağımlılık ve
    kalite eşikleri senkronize edilir; geliştirme tamamlandığında yeni bir
    annotated freeze tag ile süreç kapatılır.

## Otomatik olan ve OLMAYAN

Bu kapılar `justfile` içinde paketleri elle saymaz: `runActive.mjs`
workspace'i `pnpm list` ile bulur ve `workspace-lifecycle.json`'da `active`
olanlara filtreler — workspace üyeliği ≠ rutin kalite hedefidir.

| Kapı        | Nasıl bulur                     | Yeni paket için gereken                                |
| ----------- | ------------------------------- | ------------------------------------------------------ |
| `typecheck` | `scripts/quality/runActive.mjs` | `package.json` \u2192 `scripts.typecheck`              |
| `build`     | `scripts/quality/runActive.mjs` | `package.json` \u2192 `scripts.build` (`--if-present`) |
| `test`      | `scripts/quality/runActive.mjs` | `package.json` \u2192 `scripts.test` (`--if-present`)  |
| `e2e`       | `scripts/quality/runActive.mjs` | `package.json` \u2192 `scripts['test:e2e']`            |

Şunlar **otomatik DEĞİLDİR**, yeni paket eklenince kök yapılandırmaya elle
yazılır:

| Kapı      | Nereye yazılır                  | Yazılmazsa ne olur     |
| --------- | ------------------------------- | ---------------------- |
| `bundle`  | `quality.json` \u2192 `bundles` | Bundle boyutu ölçülmez |
| `scaling` | `quality.json` \u2192 `scaling` | Ölçekleme bütçelenemez |

`scaling` geneldir: bütçe yazan paket ölçüm tarifini de yazar
(`quality.json` \u2192 `scaling.<paket>.$measure`). Ölçülemeyen bütçe geçerli
sayılmaz.

**Modül döngüsü kapılıdır.** `scripts/quality/moduleCycles.mjs` her paketin
İÇİNDEKİ dosya grafiğini kurar ve döngüyü reddeder. `layers.mjs` de döngü arar
ama grafiğini PAKET adlarından kurar; bir paketin içindeki dosya döngüsü ona
görünmezdi ve ölçüldü — `vol-hell` içinde
`AudioSettings \u2192 settingsPersistence \u2192 services \u2192 AudioSettings` döngüsü repoya
girdi, yaşadı ve hiçbir kapı ses çıkarmadı.

Yalnız ÇALIŞMA ZAMANINDA kalan import'lar sayılır: `import type` ve tümü `type`
olan listeler derlemede silinir (repoda dört tane var, hiçbiri hata değil),
dinamik `import()` döngüyü zaten kırar. Paket içi `@/` alias'ları çözülür —
yalnız göreli yolları izleyen bir bekçi, yakalaması gereken döngüyü kaçırırdı.

**Geliştirme portlarının tekilliği kapılıdır.** `scripts/quality/devPorts.mjs`
`vite.config.ts` ve `playwright.config.ts` dosyalarından port bildirimlerini
okur ve İKİ AYRI paketin aynı portu istemesini reddeder. Bir paketin kendi
preview portu ile kendi e2e portunun aynı olması meşrudur — playwright o
sunucuyu kendisi başlatır.

**Rust push kapısındadır.** `scripts/quality/rust.mjs` Git'in gördüğü aktif
manifestler için `check --locked`, `fmt --check` ve `clippy -D warnings` koşar.
Paylaşılan native runtime ve aktif uygulama kabukları ürünün parçasıdır.

**Kapsamın şekli kapılıdır.** Paket ortalaması yükün nerede olduğunu söylemez:
`vol-hell` %84 raporlarken `GameScene.ts` %0'daydı. `coverage-shape`, 100
satırın üstünde ve %50'nin altında kalan dosyadan ya test ya da kanıtlı gerekçe
ister (`quality.json` \u2192 `coverageShape.acknowledged`). Kanıt bir test
dosyasıdır; bekçi var olduğunu ve modülü adıyla andığını doğrular. Serbest
metin gerekçelerin üçü bir dönem koda karşı yanlış çıkmıştı.

Şekil yalnız TAZE veriyi okur. `scripts/quality/coverageRun.mjs` ölçülecek
paketleri `quality.json` \u2192 `coverageRuns`tan alır ve neyi ne zaman ölçtüğünü
kaydeder; kapı kaydı olmayan, yarım kalan ya da koşudan eski bir lcov'u
değerlendirmez. `high` audio-synth'i ölçmediği için onun şekline de karar
vermez; o paket `coverage-audio` ile `signoff`ta değerlendirilir.

**Cihaz ölçümünün kapsamı kapılıdır.** Ölçülecek uygulamalar elle tutulan bir
listeden değil, `deviceApps.mjs` içindeki `deviceBenchmarkCandidates` keşfinden
türer: `active` workspace + `src-tauri/tauri.conf.json` = aday. Bekçi
benchmark betiğinin bu keşfi kullandığını ve keşfin gerçek ağaçla birebir
örtüştüğünü kilitler — frozen kabuklar aday olamaz; aktif kabuk yoksa ölçüm
doğrulanmış no-op'tur ve `adb`'ye hiç dokunulmaz.

## Sözleşme neyi kilitler

`workspace-contract.mjs` `quick`in ilk adımıdır ve üç şeyi doğrular:

1. **Her aktif paketin birim testi var mı?** `pnpm -r --if-present test`
   script'i olmayan paketi sessizce atlar. Bir geliştirici `core` altına yeni bir
   paket ekleyip test yazmayı unutursa, kapı düşmez; bu yüzden
   `workspace-contract.mjs` aktif paketlerin `package.json`ını doğrudan okur ve
   `REQUIRED_SCRIPTS` listesindeki script'lerin varlığını zorlar.
2. **Kapsam eşikleri bağlanmış mı?** `test:coverage` script'i olan her paketin
   `vitest.config.ts` dosyası bulunmak ve `quality.json`daki eşikleri
   kullanmak ZORUNDADIR. `scripts/quality/coverageBinding.mjs` vitest
   yapılandırmasını Vite ile gerçekten YÜKLER ve `test.coverage.thresholds`
   nesnesinin `quality.json` ile birebir aynı olduğunu doğrular (`===` değil,
   derin eşitlik).
3. **Eşikler tabanın üstünde mi?** `quality.json`daki `floor` bloğu (lines
   50, statements 50, branches 50, functions 40) mutlak tabandır; hiçbir paket
   bunun altında eşik tanımlayamaz. Eşiği düşürmek yerine kapsamı artırmak
   gerekir; meşru bir istisna varsa `quality.json`ın `exempt` alanına
   GEREKÇESİYLE yazılır ve `workspace-contract.mjs` gerekçesi boş muafiyeti
   reddeder.

**Katman sınırları kapılıdır.** `scripts/quality/layers.mjs` repo mimarisinin
bağımlılık yönünü zorlar:

```
games/*      ──\
                ──> core  <── tauri-v2
devtools/*   ──/
```

- `core` hiçbir pakete bağımlı olamaz (ne devtool'lara ne oyunlara).
- `games/*` devtool'lara bağımlı olamaz; oyunlar birbirine bağımlı olamaz.
- `devtools/*` oyunlara bağımlı olamaz.

Bekçi yalnız `package.json` bağımlılıklarını değil, kaynak kodun içindeki
`import` ve `export` ifadelerini de AST ile tarar (`sourceImports.mjs`). Tip-only
import'lar dahi bu sınırı delemez; `tsconfig.json` alias'ları çözülür.

**Kök kalite eşikleri tek kaynaktır.** `quality.json` dosyası kökte yaşar.
Vitest yapılandırmaları onu içe aktarır:

```ts
import quality from '../../quality.json';

export default defineConfig({
  test: {
    coverage: {
      thresholds: quality.packages['@volstudio/vol-ui'],
    },
  },
});
```

Ayrışma imkânsızdır: `workspace-contract.mjs` iki tarafın aynı nesneyi
gördüğünü her commit'te kanıtlar.

**Tracked dosya temizliği kapılıdır.** `scripts/quality/trackedImports.mjs`
`git ls-files` çıktısını tarar; `.gitignore` tarafından yok sayılan hiçbir dosya
kaynak kodda import edilemez (örneğin yerel bir debug yardımcısı).

**Blob boyutu kapılıdır.** `scripts/quality/blobSize.mjs` Git ağacındaki her
dosyanın boyutunu denetler; 2 MiB üstündeki ikili dosyalar depoya giremez.
İstisnalar `quality.json` \u2192 `blobSize.acknowledged` alanına yazılır.

**Cargo.lock paritesi kapılıdır.** Monorepo'da her uygulama kendi `src-tauri`
ağacına sahiptir; `tauri-v2` bağımsız bir native kütüphanedir ve her aktif
uygulama onu kendi `Cargo.lock`uyla derler. `scripts/quality/cargoLockParity.mjs`
`tauri*`, `wry` ve `tao` crate'lerinin aktif paketlerin kilitlerinde aynı
sürümde olduğunu doğrular; ölçüldü, iki eklenti runtime kilidinde bir yama
geride kalmıştı. Frozen kabukların kilitleri değiştirilemez olduğundan parite
kapısına girmezler — ağaçları freeze bekçisiyle kilitlidir.

**Ürün ikonu kapılıdır.** Her aktif oyun ikonunu kendi `src-tauri/icons` ve Android
`mipmap-*` ağacında taşır; kaynağı `src-tauri/app-icon*.svg` ve
`app-icon.json`dur (`pnpm exec tauri icon src-tauri/app-icon.json`).
`scripts/quality/productIcons.mjs` oyun dışına işaret eden, iki üründe aynı
olan ya da Tauri şablonuna geri dönen ikonu reddeder; yalnız aktif workspace
köklerini tarar.

Yeni paket eklerken izlenecek liste:
[games/docs/new-game.md](../games/docs/new-game.md).

Sözleşmenin doğruladığı diğer şeyler:

- **Kapsam eşikleri** kök `quality.json`dadır; paket `vitest.config.ts`
  dosyaları ve bekçi aynı dosyayı okur, ayrışamazlar. Bekçi yapılandırmayı
  gerçekten YÜKLER — kaldırılmış, başka paketten alınmış ya da sonradan
  ezilmiş bir eşik kapıyı kırar.
- **Kaynak import'ları** Git'in gördüğü dosyalara dayanmalıdır; ignore edilmiş
  bir yerel yardımcı temiz klonda bulunamaz.
- **Dosya boyutu**: hem index hem çalışma ağacında 2 MiB sınırı.
- **Kaynak dosya satırı** (`sourceSize.mjs`): 1000 satır SERT sınırdır ve
  muafiyet yoktur. Testler, betikler (`.mjs`, `.js`), stil (`.css`) ve native
  kaynak (`.rs`, `.kt`) dahildir. Belgeler (`.md`), yapılandırma/veri
  (`.json`, `.yaml`) ve asset'ler satır kapısına girmez; doğal boyutları kaynak
  kod karmaşıklığı değildir. Bu ayrım regresyon testiyle korunur. Eşik bir
  dönem 600'dü ve gerekçe listesiyle çalışıyordu; liste sürekli büyüdüğü için
  sınır gerçekten büyük dosyaların başladığı yere çekildi.
- **Çalışma ağacı**: satır, yorum ve i18n bekçileri yalnız indeksi değil
  çalışma ağacını okur; `git add` öncesi koşan `quick` yeni dosyayı da görür.
- **Yorum yoğunluğu** (`commentDensity.mjs`): dosya oranı %40'ı aşarsa
  gerekçe ister; **tek bir yorum bloğu 24 satırı aşarsa gerekçeyle
  susturulamaz** — o uzunluktaki metin bir belgedir ve `docs/` ya da
  `DESIGN.md` içinde yaşar.
- **Ölü i18n anahtarı** (`deadI18n.mjs`): kullanılmayan çeviri anahtarı
  reddedilir. Şablon değişmeziyle üretilen anahtarlar tam adla muaf tutulur ve
  muafiyet, üreten kod silinince düşer.

## Belge de kapılanır

Yanlış belge derlenmez, test edilmez, kimse fark etmez. CORE belge kapısı bunu
kırar:

| Kapı                                       | Bağladığı şey                                        |
| ------------------------------------------ | ---------------------------------------------------- |
| `core/tests/governance/docSymbols.test.ts` | `core/docs/*.md` sembolleri \u2192 CORE yüzeyi       |
| aynı dosya                                 | `music-engine.md` API tablosu \u2192 sınıf metotları |

Her birinin ters yönü de kapılıdır: ölü bir muafiyet ya da belgede olmayan bir
`kind` de kapıyı kırar.

## Piksel temeli TAM paneli çeker

Sekme paneli kendi kaydırıcısıdır (`.vol-tabs__panels` \u2192 `overflow: auto`) ve
Playwright iç içe bir kaydırıcının görünmeyen kısmını çekemez; kalanı siyah
dolgu yapar. Ölçüldü: temellerin içeriği her sekmede ~715. satırda bitiyordu,
`advanced` sekmesinin %79'u boştu ve `hud` sekmesinin on yedi kartından yalnız
ilk yedisi kapılıydı — karta eklenen bir bileşen temeli hiç değiştirmiyordu.

`visual.spec.ts` ekran görüntüsünden ÖNCE zinciri açar (`html`, `body`,
`.vol-showcase-root`, `.vol-tabs`, `.vol-tabs__panels`, `[role="tabpanel"]`).
Tek öğeyi açmak yetmez: ölçüldü, panel 900 px'te kalıyordu çünkü üstündeki üç
kap da 900 px + `overflow: hidden` taşıyor. Açıldıktan sonra boş oran her
sekmede %0'dır.

Kaydırma yalnız görüntü için açılır; `layout.spec.ts` gerçek kaydırıcıyı
ölçmeye devam eder, yani taşma ve dokunma hedefi iddiaları ürünün gerçek
yerleşiminden gelir.

## Vitest ve kapsam motoru

Vitest ile `@vitest/coverage-v8` aynı exact `4.1.11` sürümündedir. Vitest 3
dönemindeki worker RPC zaman aşımı yaması kaldırılmıştır; paket kaynaklarına
yerel yama uygulanmaz. Audio-synth tek worker'lı `forks` havuzunu Vitest 4'ün
`maxWorkers` sözleşmesiyle kurar.

Vitest 4'ün V8 kapsamı AST tabanlı (`ast-v8-to-istanbul`) yeniden eşleme kullanır.
Bu motor değişimi, özellikle TypeScript/JSX AST'sindeki örtük else dallarını
(implicit else), varsayılan parametre dallarını ve mantıksal kısa devreleri
Istanbul paydasına açıkça dahil eder; dolayısıyla dal paydası doğal olarak büyür
ve ölçüm semantiği değişir. Bu tür büyük motor güncellemelerinde geçiş, kapıyı
geçirmek için keyfi eşik düşürme olarak değil, **ölçülen LCOV pay ve paydalarıyla
belgelenmiş resmi bir kapsam taban çizgisi geçişi (baseline migration)** olarak
yönetilir (`quality.json` üzerindeki tarihli kayıt ve gerekçeler tek doğruluk
kaynağıdır). Yeni taban çizgisinden sonra ratchet disiplini aynen devam eder: test
eklenmeden veya ölçüm gerekçesi kanıtlanmadan hiçbir eşik düşürülemez. Ağır
audio-synth kapsam koşusu signoff'ta ayrı kalır ve RPC kanalının yamasız
tamamlanması release kanıtının parçasıdır.

## Benchmark neyi ölçer, neyi ölçmez

Benchmark'lar makineye özel SÜRE eşiği koymaz — bir kapının koşulu masadaki
donanım olamaz. Ölçtükleri, CORE mekanizmalarının ve simülasyonun render'dan
ayrılmış medyan/p95 adım maliyetidir.

Kapılanan tek performans ölçüsü ORANDIR: `pnpm exec just scaling`, girdi dört
katına çıktığında sürenin kaç katına çıktığını sınar. Bu makineden bağımsızdır
ve yakaladığı şey hız değil KARMAŞIKLIKTIR.

## Adlandırma tuzağı

`doctor:env` adındaki ek tesadüfi değildir: `pnpm doctor` pnpm'in KENDİ
tanılama komutudur ve aynı adlı bir script'i sessizce gölgeler — script hiç
çalışmaz. Yerleşik bir komutla çakışan script adları bir kapı testiyle
engellenir.
