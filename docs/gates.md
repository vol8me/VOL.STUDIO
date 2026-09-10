# Kalite kapıları

Kapılar `just` ile **localde** koşar. GitHub yalnız source control, PR ve
release içindir; CI runner yoktur.

| Seviye       | Komut                        | Ne yapar                                                                                           |
| ------------ | ---------------------------- | -------------------------------------------------------------------------------------------------- |
| Pre-commit   | `pnpm quick`                 | sözleşme, format, typecheck, lint (~45 sn)                                                         |
| Push öncesi  | `pnpm high`                  | quick + Rust + CSS lint + coverage ve şekli (audio-synth hariç) + build + bundle + ölçekleme + E2E |
| Release      | `pnpm signoff`               | high + audio-synth coverage ve şekli + Chromium/Firefox E2E + ses tazeliği                         |
| Ortam        | `pnpm run doctor:env`        | Node, pnpm, Rust, just, FFmpeg, Tauri bağımlılıkları                                               |
| Cihaz ölçümü | `pnpm benchmark:device`      | Bağlı Android'de açılış/kare/bellek — **kapı DEĞİL**                                               |
| Rapor        | `pnpm exec just report high` | Kapıyı koşar, sonucu yapılandırılmış verir (`--json`)                                              |

Hook'lar `pnpm install` sırasında kurulur (`pre-commit` → `quick`,
`pre-push` → `high`); atlamak için `SKIP_SIMPLE_GIT_HOOKS=1`. Test yükü
bilerek push'a bırakıldı; testi de içeren hızlı kapı `pnpm fast`.

Tekil tarifler için `pnpm exec just --list`. `just` ikilisi `node_modules/.bin`
altındadır, global `PATH`e girmez — çıplak `just fast` değil `pnpm exec just fast`.

## Kapılar workspace'ten TÜRER

Yeni bir paket `typecheck`/`test`/`coverage`/`build`/`lint` kapılarına elle
eklenmez; `pnpm -r` ve repo geneli glob'lar onu kendiliğinden kapsar.
`scripts/workspace-contract.mjs` her commit'te bunu doğrular: bir paket
`test`/`test:coverage` script'i ya da coverage eşiği olmadan repoya giremez.

**Üç kapı bu türetmenin DIŞINDADIR ve listesini elle tutar.** Atlandıklarında
hata vermezler, sessizce ölçmezler:

| Kapı      | Elle tutulan yer           | Atlanırsa                    |
| --------- | -------------------------- | ---------------------------- |
| `bundle`  | `quality.json` → `bundles` | Paketin boyutu hiç ölçülmez  |
| `e2e`     | `justfile` → `e2e` tarifi  | Tarayıcı testleri hiç koşmaz |
| `scaling` | `quality.json` → `scaling` | Ölçekleme bütçelenemez       |

`e2e`nin bir yönü kapılıdır: `scripts/quality/tests/justfileWiring.test.mjs`
`test:e2e` tanımlayıp tarifte görünmeyen paketi reddeder. Ters yön — tarifte
olup script'i olmayan — ve diğer iki kapı için böyle bir bekçi yoktur.

`scaling` geneldir: bütçe yazan paket ölçüm tarifini de yazar
(`quality.json` → `scaling.<paket>.$measure`). Ölçülemeyen bütçe geçerli
sayılmaz.

**Modül döngüsü kapılıdır.** `scripts/quality/moduleCycles.mjs` her paketin
İÇİNDEKİ dosya grafiğini kurar ve döngüyü reddeder. `layers.mjs` de döngü arar
ama grafiğini PAKET adlarından kurar; bir paketin içindeki dosya döngüsü ona
görünmezdi ve ölçüldü — `vol-hell` içinde
`AudioSettings → settingsPersistence → services → AudioSettings` döngüsü repoya
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

**Rust push kapısındadır.** `scripts/quality/rust.mjs` Git'in gördüğü her
`Cargo.toml` için `check --locked`, `fmt --check` ve `clippy -D warnings` koşar.
Paylaşılan native runtime ve üç oyun kabuğu ürünün parçasıdır; dört crate sıcak
önbellekle ~12 sn sürer.

**Kapsamın şekli kapılıdır.** Paket ortalaması yükün nerede olduğunu söylemez:
`vol-hell` %84 raporlarken `GameScene.ts` %0'daydı. `coverage-shape`, 100
satırın üstünde ve %50'nin altında kalan dosyadan ya test ya da kanıtlı gerekçe
ister (`quality.json` → `coverageShape.acknowledged`). Kanıt bir test
dosyasıdır; bekçi var olduğunu ve modülü adıyla andığını doğrular. Serbest
metin gerekçelerin üçü bir dönem koda karşı yanlış çıkmıştı.

Şekil yalnız TAZE veriyi okur. `scripts/quality/coverageRun.mjs` ölçülecek
paketleri `quality.json` → `coverageRuns`tan alır ve neyi ne zaman ölçtüğünü
kaydeder; kapı kaydı olmayan, yarım kalan ya da koşudan eski bir lcov'u
değerlendirmez. `high` audio-synth'i ölçmediği için onun şekline de karar
vermez; o paket `coverage-audio` ile `signoff`ta değerlendirilir.

**Cihaz ölçümünün kapsamı kapılıdır.** `scripts/quality/deviceApps.mjs`
`scripts/device-benchmark.mjs` içindeki elle tutulan `APPS` listesini her
oyunun `tauri.conf.json` kimliğiyle karşılaştırır: kabuğu olup listede olmayan
oyun cihaz ölçümünden sessizce düşerdi.

**Tauri sürüm eşitliği kapılıdır.** Paylaşılan runtime bir `rlib`tir ve her
oyun onu kendi `Cargo.lock`uyla derler. `scripts/quality/cargoLockParity.mjs`
`tauri*`, `wry` ve `tao` crate'lerinin bütün kilitlerde aynı sürümde olduğunu
doğrular; ölçüldü, iki eklenti runtime kilidinde bir yama geride kalmıştı.

**Ürün ikonu kapılıdır.** Her oyun ikonunu kendi `src-tauri/icons` ve Android
`mipmap-*` ağacında taşır; kaynağı `src-tauri/app-icon*.svg` ve
`app-icon.json`dur (`pnpm exec tauri icon src-tauri/app-icon.json`).
`scripts/quality/productIcons.mjs` oyun dışına işaret eden, iki oyunda aynı
olan ya da Tauri şablonuna geri dönen ikonu reddeder.

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
  kaynak (`.rs`, `.kt`) dahildir. Eşik bir dönem 600'dü ve gerekçe listesiyle
  çalışıyordu; liste sürekli büyüdüğü için sınır gerçekten büyük dosyaların
  başladığı yere çekildi.
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

Yanlış belge derlenmez, test edilmez, kimse fark etmez. Üç kapı bunu kırar:

| Kapı                                                | Bağladığı şey                                   |
| --------------------------------------------------- | ----------------------------------------------- |
| `core/tests/governance/docSymbols.test.ts`          | `core/docs/*.md` sembolleri → CORE yüzeyi       |
| aynı dosya                                          | `music-engine.md` API tablosu → sınıf metotları |
| `devtools/visual-synth/.../designInventory.test.ts` | `DESIGN.md` §4 envanteri → şema kaydı           |

Her birinin ters yönü de kapılıdır: ölü bir muafiyet ya da belgede olmayan bir
`kind` de kapıyı kırar.

## Piksel temeli TAM paneli çeker

Sekme paneli kendi kaydırıcısıdır (`.vol-tabs__panels` → `overflow: auto`) ve
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

## Yamalı bağımlılık

`vitest@3.2.6` YAMALIDIR (`patches/vitest@3.2.6.patch`,
`pnpm-workspace.yaml` → `patchedDependencies`). Yama tek satırdır: worker
tarafındaki birpc zaman aşımını 300 sn'ye çıkarır. Ağır v8 coverage altında
`onTaskUpdate` çağrısı varsayılan süreye takılıp koşuyu düşürüyordu; testlerin
KENDİ `testTimeout`u 5 sn'de bırakıldı, yani yama bir testin son tarihini
gevşetmez, yalnız ölçüm kanalının kopmasını engeller.

Vitest yükseltildiğinde yama sürüm eşleşmediği için uygulanmaz ve `pnpm
install` düşer. Bu bilinçlidir: sessizce düşen bir yama, geri gelen bir
zaman aşımından iyidir. Yükseltirken önce yamanın hâlâ gerekli olup olmadığı
ölçülür.

## Benchmark neyi ölçer, neyi ölçmez

Benchmark'lar makineye özel SÜRE eşiği koymaz — bir kapının koşulu masadaki
donanım olamaz. Ölçtükleri, CORE mekanizmalarının ve VOL.HELL'in render'dan
ayrılmış simülasyonunun medyan/p95 adım maliyetidir.

Kapılanan tek performans ölçüsü ORANDIR: `pnpm exec just scaling`, girdi dört
katına çıktığında sürenin kaç katına çıktığını sınar. Bu makineden bağımsızdır
ve yakaladığı şey hız değil KARMAŞIKLIKTIR.

## Adlandırma tuzağı

`doctor:env` adındaki ek tesadüfi değildir: `pnpm doctor` pnpm'in KENDİ
tanılama komutudur ve aynı adlı bir script'i sessizce gölgeler — script hiç
çalışmaz. Yerleşik bir komutla çakışan script adları bir kapı testiyle
engellenir.
