# VOL.STUDIO — Denetim Kaydı

`dev` dalı. Bu dosya bir görev listesi değil, tamamlanmış turların **özet
kaydıdır**: ne yapıldı, hangi kapı koşuldu, geriye ne kaldı. Turun ayrıntısı
commit diff'inde ve git geçmişindedir; burada tekrarlanmaz.

## 2026-08-20 — Profesyonel kod avı bulgularının çözümü

Derin bir av raporu (6 paralel subagent + doğrulama) ~63 bulgu çıkardı.
Bulguların ~47'sine çözüm getirildi; god object'ler ve AGENTS.md ile ilgili
bulgular kullanıcı talimatıyla hariç tutuldu; 3 şüpheli bulgu yanlış pozitif
doğrulanıp atlandı (findPath heuristic admissible, SaveManager `??` doğru,
design'da @types yok).

**Kritik (5):**

- K-02/K-03: Tauri bundle `targets` tanımlandı — Windows `["nsis","msi"]`,
  Android `["apk"]` (AGENTS.md hedefi).
- K-04: Carousel pointerenter/pointerleave listener leak — DisposableScope'a
  bağlandı.
- K-05: Reverb `tailSeconds` 44100 hard-coded → `sampleRate` kullanıldı.
- K-06: StateMachine transition hatada `current` geri alınıyor.

**Yüksek (10):**

- Y-08: bootstrap fatal error i18n + tarayıcı dili düşüşü.
- Y-09: RunEconomy `startLevel` ve WaveManager `maxStepsPerFrame` config'e.
- Y-10: vol-ui showcase inline arrow listener'lar named + disposables'a.
- Y-11: Cargo.toml bağımlılıklar `major.minor` pin'lendi.
- Y-12: i18next versioning tutarsızlığı giderildi (core `^` → tam).
- Y-16/Y-17/Y-18: sidechain assertion eklendi, FM test düzeltildi,
  music.test afterEach context temizliyor.

**Orta (15) + Düşük (8):** FlowField MinHeap, ObjectPool Set, EventBus emit
hata sayacı döner, Deck.draw referans takası, Carousel/RoundCounter listener,
expLerp/Sidechain/envelope/filter düzeltmeleri, magic numbers const, hard-coded
metin i18n, design previews tipi, .nvmrc, tsconfig lib senkron, vs.

**Atlanan (kasıtlı):** D-02/D-03 (LoadingScreen kısa ömürlü, % evrensel),
O-20 (design path injection testi script refactor gerektirir), D-14 (Prettier
printWidth stil tercihi, tüm dosyaları reformat eder).

| Kapı                    | Durum | Not                                    |
| ----------------------- | ----- | -------------------------------------- |
| `pnpm high`             | ✓     | quick + css + coverage + build, exit 0 |
| `pnpm -r test:coverage` | ✓     | 1165+447+27+54+26 test geçti           |
| `pnpm run contract`     | ✓     | 5 paket                                |

## Son durum (2026-08-18)

Bulut CI yoktur; kapılar `justfile` ile localde koşar. Aşağıdaki sonuçlar bu
tarihte çalışma ağacında bizzat koşuldu.

| Kapı                     | Durum | Not                                                                    |
| ------------------------ | ----- | ---------------------------------------------------------------------- |
| `pnpm signoff`           | ✓     | high + cargo check/fmt/clippy — zincirin tamamı, exit 0                |
| `pnpm high`              | ✓     | quick + lint:css + coverage + tüm build'ler                            |
| `pnpm -r typecheck`      | ✓     | 5 paket (core, vol-hell, vol-ui, design, tauri-v2)                     |
| `pnpm -r test:coverage`  | ✓     | 1804 test (core 1215, vol-hell 461, vol-ui 48, design 54, tauri-v2 26) |
| `pnpm run contract`      | ✓     | 5 paket, kapı kapsamı tam                                              |
| `pnpm lint`              | ✓     | 0 hata, 0 uyarı                                                        |
| `pnpm format:check`      | ✓     |                                                                        |
| `pnpm lint:css`          | ✓     |                                                                        |
| `pnpm build:all`         | ✓     | build script'i olan her paket (`vol-hell`, `vol-ui`)                   |
| `cargo check/fmt/clippy` | ✓     | `tauri-v2/src-tauri`                                                   |
| `pnpm run doctor:env`    | ✓     | Node 22.23.1, pnpm 11.18.0, rustc 1.97.1, just 1.58.0, FFmpeg 8.1.2    |

Kapsam: core %87.34, vol-ui %83.57 (function %53.65), vol-hell %70.17,
tauri-v2 %89.07, design %98.86. Eşikler ölçülen kapsamın ~2 puan altına kilitli
(ratchet), yani bu oranlar artık taban — düşerlerse kapı kırılır. Eşiklerin
tamamı kök `quality.json`da; `vitest.config.ts` dosyaları ve
`workspace-contract.mjs` aynı dosyayı okur.

## Açık borç ve riskler

Kapatılmamış, bilinçli olarak taşınan maddeler. Kapanan bir madde bu listeden
silinir; kronolojiye not düşülmez.

**Yapı**

- `GameScene.ts` **618 satır** — dört sorumluluk çıkarıldıktan sonra sınırın
  (~600) hâlâ üstünde. Kalanı sahnenin kendi işi: sistem kurulumu ve frame
  döngüsü. Daha fazla bölmek satırı taşır ama test edilebilirlik kazandırmaz;
  bu yüzden burada durduruldu. `core` tarafında `Kanban.ts` (831) ve
  `SlotGrid.ts` (687) hâlâ sınır üstünde ve bölünmedi — ikisi de bu turda
  DisposableScope'a geçerken okundu, bölme ayrı bir tur.
- `SpatialIndex`in artımlı yolunun (`insert`/`remove`/`update`) ÜRETİMDE
  çağıranı yok; `vol-hell` iki kez `rebuild()` diyor, artımlı yolu yalnızca
  testler koşuyor. Bilinçli ve bir bekçiyle işaretli, ama gerçek oynanışta hiç
  yürümeyen kod olduğu unutulmamalı. (Mekanizma CORE'a taşındı;
  `vol-hell/SpatialGrid` artık ince bir adaptör.)
- CORE public API yüzeyi 171 export ve dokuz `export *` barrel'ıyla büyüyor.
  Yüzey sayısı kilitli (kapı kırılır) ama barrel'lar hâlâ otomatik; daraltma
  ayrı bir tur.
- `PlayerController` takma adı `@deprecated` olarak duruyor; kaldırma bir
  sonraki büyük sürümde.
- **`AGENTS.md` ve `games/design/AGENTS.md` gitignore'da** (`.gitignore:2-3`) ve
  hiç commit edilmemiş. Bilinçli bir tercih (agent talimatları yerelde kalıyor)
  ama sonucu şu: bu dosyalara yapılan güncellemeler HİÇBİR commit'e girmez ve
  yeni bir klonda yoktur. Bir kural `AGENTS.md`ye yazıldığında repoda kalıcı
  olduğu VARSAYILMAMALI; kalıcı olması gerekiyorsa `README.md` ya da bu dosyaya
  da işlenmeli.
- CORE capability yol haritasının ertelenen maddeleri 2026-08-19'da YAZILDI
  (`Scheduler`, `StateMachine`, `ObjectPool`, `ResourcePool`, `SpatialIndex`,
  geometri) — tetikleyici "ikinci somut tüketici" kuralıydı ve karşılandı.
  Kalan risk: bu 14 primitifin API'si henüz tek gerçek tüketiciyle
  (`vol-hell`, o da yalnızca `SpatialIndex`) sınandı. `Grid`, `findPath`,
  `FlowField`, `EventBus`, `Deck`, `SlotContainer` üretimde hiç yürümedi.
- Tuşlar artık yeniden atanabilir (`PCActionBinding` veri hâlinde) ama bunu
  oyuncuya açan bir ayar ekranı YOK. Altyapı hazır, UI bilinçli olarak
  yapılmadı — ayrı bir tur.
- `TouchButton` adı taşıdığı semantiği (press/hold, girdi cihazından bağımsız)
  yanlış tanımlıyor. Yeniden adlandırılmadı: public API + showcase + README +
  i18n anahtarları ada bağlı, kazanç estetik. Gerekçe sınıf dokümanında.

**Kalite kapıları**

- **Bulut CI yok.** Kapıların koşulduğunu PR'da doğrulayan otomatik merci de
  yok; hook'lar `--no-verify` veya `SKIP_SIMPLE_GIT_HOOKS=1` ile atlanabilir.
  Local-first tercihin doğrudan bedeli — disiplin araca değil kişiye bağlı.
  Atlanan bir hook raporlanmalıdır.
- `just` global PATH'te değil (ikili `just-install` ile `node_modules/.bin`
  altına gelir). Çıplak `just <tarif>` çalışmaz; `pnpm fast` / `pnpm exec just`
  kullanılır. `just-install` kurulumda ağdan ikili indirir.
- Hook'lar tüm repoyu koşar, yalnızca staged dosyaları değil. Bilinçli:
  monorepo'da bir pakete dokunmak başka paketin tipini kırar. Ölçüm: pre-commit
  `pnpm quick` ~45 sn (lint 22, typecheck 15, format 8.5), pre-push `pnpm high`
  2+ dk. Test yükü commit'ten push'a alındı; commit 97 sn'den 44 sn'ye indi.
  Daha da kısaltmak `lint-staged`'e daraltmayı gerektirir — ayrı bir tur.
- `vol-hell` statements **%70**. Geriye kalan en büyük test dışı yüzeyler:
  `GameScene` (618 satır, %0 — Phaser sahnesi, mock'suz sürülemiyor),
  `MainMenuScene`/`SettingsScene`, `GameHud`/`WaveBanner`, `app/music.ts` ve
  `app/GameAudio.ts`. Overlay ekranları artık test ediliyor; sahneler için
  `vol-ui`'deki Phaser mock deseni uygulanabilir.
- Kapsam eşiği tabanı 50/40. `vol-hell` (64) ve `vol-ui` function (52) tabana
  yakın; bu paketlerde kapsam artırmadan yeni kod eklemek kapıyı kırar.
- Görsel doğrulama hâlâ elle yapılıyor (`pnpm dev`); ortamda tarayıcı
  otomasyonu yok.

**Oynanış / UI**

- Reroll'da eski kartlar çıkış animasyonu almadan yok ediliyor (yeni kartların
  aynı hücreye girmesini engellememek için); "sert değişim" hissi kalıyor.
- iOS/WKWebView MP3 fallback'i otomatik üretilmiyor (`convert:ios` manuel);
  iOS şu an hedeflenmiyor.

## Kronoloji

`~` işaretli tarihler özgün kayıtta yazılmadığı için konumdan çıkarıldı.

| Tarih      | Tur                                                         | Sonuç                      |
| ---------- | ----------------------------------------------------------- | -------------------------- |
| ~08-11     | Genel denetim                                               | 74/74 bulgu çözüldü        |
| ~08-11     | Ses/müzik motoru denetimi                                   | 38/38 bulgu çözüldü        |
| 2026-08-12 | OGG/MP3 migration                                           | tek format hattına geçiş   |
| 2026-08-13 | ADIM 4 — kompozisyon primitifleri ve refaktör               | kapılar yeşil              |
| 2026-08-13 | Ses asset pipeline'ı — tek format                           | kapılar yeşil              |
| ~08-13     | Son kontrol — UI/Audio runtime hataları                     | kapılar yeşil              |
| 2026-08-13 | Aşama 1/3 — taktiksel arena dönüşümü, temel altyapı         | kapılar yeşil              |
| 2026-08-13 | Aşama 1 devamı — katmanlama, Flux düşüşü, ekonomi HUD'u     | kapılar yeşil              |
| 2026-08-13 | Aşama 1 kapanış — hata avı ve sağlamlaştırma                | kapılar yeşil              |
| 2026-08-14 | Aşama 2/3 — ability, kart, level-up/dükkân UI               | kapılar yeşil              |
| 2026-08-14 | Aşama 2 revizyonu — denge, akış, dükkân UI, ability görseli | kapılar yeşil              |
| ~08-15     | Aşama 3/3 — Elite/Boss, telegraph, cila, bitiş ekranı       | genre dönüşümü tamam       |
| 2026-08-15 | Aşama 3 sonrası — defansif bug avı (yalnız tarama)          | rapor                      |
| 2026-08-15 | Kritik/yüksek/orta/düşük bulgu düzeltmeleri                 | regresyon testleriyle      |
| 2026-08-15 | CORE capability yol haritası — Faz 0                        | taslak doğrulandı          |
| 2026-08-15 | CORE Faz 1 — `DisposableScope`, adaptive hit-target         | kapılar yeşil              |
| 2026-08-15 | vol-ui KARTLAR sekmesi + ShopPicker reroll/kilit            | CORE'a opsiyonel eklendi   |
| 2026-08-15 | Repo çapında bug avı — zoom/z-index/kart animasyonları      | kapılar yeşil              |
| 2026-08-18 | Kart animasyon sağlamlaştırma                               | kapılar yeşil              |
| 2026-08-18 | Local-first `just` kalite kapısı geçişi                     | CI kaldırıldı              |
| 2026-08-18 | vol-ui test altyapısı ve kapsamı                            | 5→27 test, eşikler açıldı  |
| 2026-08-18 | Hata avcılığı ve çalışma ağacı sertleştirme                 | NaN/abort/sızıntı fixleri  |
| 2026-08-18 | `just` geçişinin denetimi ve sertleştirilmesi               | aşağıya bak                |
| 2026-08-18 | Kapıların ölçeklenebilirliği                                | sözleşme bekçisi + ratchet |
| 2026-08-18 | `GameScene` bölünmesi ve vol-hell kapsamı                   | 680→608, %66→%70           |
| 2026-08-18 | CORE domain saflığı — stat + eylem sözlükleri               | sözlük oyuna taşındı       |
| 2026-08-18 | Evrensel etkileşim sözleşmesi                               | hedef politikası + klavye  |
| 2026-08-18 | Diagnostics — transport + singleton kaldırma                | CORE global dayatmıyor     |
| 2026-08-18 | Kart işlem sınırı, metadata şeması, quality.json            | tek kalite kaynağı         |
| 2026-08-18 | Lifecycle idiomu, artımlı spatial indeks, kapı raporu       | framework tutarlılığı      |
| 2026-08-19 | Dış denetimin kalan 8 bulgusu                               | 3'ü denetimde değişti      |
| 2026-08-19 | CORE katmanlaması + 8 headless primitif                     | yeni oyun zemini           |
| 2026-08-19 | Tür sızıntısı temizliği (doküman)                           | kod nötrdü, repo değildi   |
| 2026-08-19 | Katman 1 genişletmesi (+6 primitif)                         | 14 parça                   |
| 2026-08-20 | Primitif sertleştirme (denetim + 7 madde)                   | sessiz bozulma → hata      |
| 2026-08-20 | Kapsam borcu: showcase etkileşimi + HUD                     | func %53→%83               |

## 2026-08-18 — `just` geçişinin denetimi

Geçiş bittikten sonra iş profesyonel biçimde kapanmış mı diye denetlendi.
Belge ile çalışma ağacı arasındaki tutarsızlıklar düzeltildi; `pnpm signoff`
temiz durumdan yeniden koşuldu (exit 0).

**Belge gerçeğin gerisindeydi.** `AGENTS.md` hâlâ silinmiş
`.github/workflows/ci.yml`'yi işaret ediyordu (Bozulamaz Kural #8 + tüm "Kalite
Kapıları" bölümü) — her yeni agent oturumu var olmayan bir dosyaya
yönlendiriliyordu. `README.en.md` hiç güncellenmemişti. `TODO.md` `AGENTS.md`
için bir yerde "güncellendi", iki yerde "güncellenemedi" diyordu; gerekçe
olarak yazılan "`.gitignore`'da olduğu için yazma hakkı yok" iddiası da
yanlıştı. Hepsi gerçeğe göre düzeltildi.

**Çalışmayan komutlar.** `pnpm doctor` pnpm'in built-in komutu olduğu için
`"doctor": "just doctor"` script'ini gölgeliyordu — "`just doctor` ✓" raporu
aslında başka bir komutun çıktısıydı; gölgelenmeyen `doctor:env` eklendi.
Gölgelenen `"doctor"` script'i sonradan tamamen silindi: ikisi aynı
tarifi çağırıyor görünse de `pnpm doctor` ona HİÇ ulaşmıyordu.
`just` global PATH'te olmadığı hâlde README birincil komut olarak çıplak
`just fast` gösteriyordu. `just clean` no-op'tu (kök seviyesinde artefakt yok);
şimdi 7 dizini de siliyor, pahalı Rust `target` ayrı `clean-all`'a alındı.
`doctor` tarifi `npx just` çağırıyor ve Fedora'da Debian paket adı öneriyordu.

**justfile.** `["bash","-cu"]` → `["bash","-euo","pipefail","-c"]`. Agent'ların
tek kapıyı hedefleyebilmesi için tekil tarifler eklendi (`typecheck`, `lint`,
`lint-css`, `format-check`, `test`, `test-pkg <paket>`, `coverage`, `rust`,
`build-ui`, `gen-theme`); birleşik kapılar artık bunlardan kuruluyor. `high`
testleri iki kez koşuyordu — beş paketin de `test:coverage`'ı olduğu
doğrulanıp düz `test` çıkarıldı. `postinstall` git deposu olmayan ortamda
kurulumu kırıyordu; artık uyarıyla atlanıyor.

**Test kalitesi.** `sections.test.ts`'te
`expect(children.length).toBeGreaterThanOrEqual(0)` bir totolojiydi — hiç
düşmez ama `destroy()` temizliğini doğruluyormuş gibi duruyordu. Gerçek
iddiayla değiştirildi ve boş olmadığı ölçüldü (`panels` 4, `cards` 2,
`advanced` 2 düğüm asıyor, hepsi geri toplanıyor). "Sahne anahtarını ayarlar"
testi anahtarı hiç doğrulamıyordu. Reroll testi listenin boşalmasını
yakalamıyordu. İngilizce test adları Türkçeleştirildi, DOM sızıntısı için
`afterEach` eklendi.

**Kalıntı temizliği.** Kod yorumlarındaki oyun adı referansları (Brotato ×4) ve
silinmiş planlama belgesine dangling atıflar (`B1`, `B1b`, `B2`, `B3`, `C3`,
`C5`) kaldırıldı. Tamamlanmış işi gelecek zamanda anlatan 14 "Aşama N" yorumu
mevcut gerçeğe göre yeniden yazıldı (Elite/Boss ve kart sistemi çalıştığı
doğrulanarak). `vol-hell` README'lerindeki "CI bunu koşar" notu düzeltildi.

Tasarım tarafında `entities.pen` içindeki `categorySubtitle` metni Pencil
üzerinden temizlendi: "MINDUSTRY REFERANSLI FORM" → "CONVEYOR-DERIVED FORM".
Dosyanın tamamı 9451 düğüm üzerinden tarandı, kelime sınırıyla başka oyun adı
çıkmadı ("FAULT SPIRE" bir boss adı, "cannon" içindeki eşleşmeler yanlış
pozitif).

## 2026-08-18 — Kapıların ölçeklenebilirliği

Soru şuydu: repo büyüyüp testler arttığında, bir agent kapılara elle ekleme
yapmazsa işleyiş güvende mi? Ölçüldü, üç delik çıktı, üçü de kapatıldı.

**Ölçülen delikler**

- `pnpm -r --if-present`, script'i olmayan paketi **hata vermeden atlar**.
  Kanıtlandı: `games/` altına test script'i olmayan sahte bir paket eklendiğinde
  `pnpm -r typecheck`, `test` ve `test:coverage` **üçü de exit 0** verdi. Yani
  testsiz bir paket kapılardan görünmez geçerdi.
- `vol-ui` prod build'i hiçbir kapıda değildi; `build-ui` tarifi vardı ama
  `high`/`signoff` yalnızca `build-game` koşuyordu.
- Kapsam eşikleri gerçeğin çok altındaydı: `design` **0/0/0/0** (gerçek %98),
  `vol-hell` lines/statements **25** (gerçek %66). 40 puanlık bir gerileme
  sessizce geçerdi.

**Çözüm: kapılar artık workspace'ten türer**

- `build` → `pnpm -r --if-present build`; build script'i olan her paketi kapsar.
- `lint:css` → repo geneli `**/*.css` + `.stylelintignore`; sabit paket yolları
  kaldırıldı, yeni paketin CSS'i kendiliğinden linlenir.
- `scripts/workspace-contract.mjs` bekçisi `quick` içinde (pre-commit, ~2 sn):
  her paketin `typecheck`/`test`/`test:coverage` script'i ve tabanın üstünde
  coverage eşiği olmasını zorunlu kılar. Muafiyet `THRESHOLD_EXEMPT`'e
  gerekçesiyle yazılır; sessiz muafiyet yok. (Eşikler ve muafiyet daha sonra
  kök `quality.json`a taşındı — bkz. "Kart işlem sınırı, metadata doğrulama,
  tek kalite kaynağı" turu.)
- Eşikler ölçülen gerçek kapsamın ~2 puan altına ratchet'lendi:
  core 85/79/86, vol-hell 64/78/84, vol-ui 82/85/52, design 96/92/100,
  tauri-v2 88/77/100. Artık kapsam düşüşü kapıyı kırar.

**Kalan tasarım gerçeği:** bekçi _paketin ölçüldüğünü_ garanti eder, _testin
iyi olduğunu_ değil. Bir agent tek satırlık sahte test yazıp eşiği geçemez —
çünkü eşik gerçek kapsama kilitli — ama anlamsız assertion'a karşı koruma
kod incelemesidir, kapı değil.

### Kalite kapıları

| Kapı            | Durum | Not                                              |
| --------------- | ----- | ------------------------------------------------ |
| `pnpm signoff`  | ✓     | exit 0, yeni eşiklerle                           |
| `pnpm quick`    | ✓     | 39 sn (sözleşme 2 sn dahil)                      |
| `test:coverage` | ✓     | 1286 test, 5 paket de yeni eşiklerin üstünde     |
| Bekçi negatif   | ✓     | sahte testsiz paket eklendi, kapı düştü (exit 1) |

## 2026-08-18 — `GameScene` bölünmesi ve vol-hell kapsamı

`GameScene` 680 satırdı ve god-object sınırının üstündeydi; `vol-hell` kapsamı
%66 ile monorepo'nun en düşüğüydü. İkisi tek işti: sahneden çıkan parçalar
Phaser'sız test edilebilir hâle geliyor.

**Çıkarılan sorumluluklar** — hepsi saf mantık, bağımlılıklar enjekte edilir:

- `PauseController` — duraklatmanın üç tetikleyicisi (ESC, kart ekranı, koşu
  sonu) ve birbirini ezmeme kuralları. Sahnenin içinde dağınık `if`'lerdi.
- `RunScoreboard` — skor/öldürme/süre sayaçları + istatistik gönderimi.
  Uç değer korumaları (NaN/Infinity) ve depolama hatasında geri düşme yolu
  artık test altında.
- `RunFinisher` — koşu sonu akışı. İki incelik buradaydı: aynı frame'de zafer
  ve yenilgi tetiklenirse yalnızca ilkinin geçmesi, ve `await` sırasında sahne
  kapanırsa özetin ölü sahneye yazılmaması. İkisi de artık testli.
- `sceneTelemetry` — diagnostic sayaç listesi; her yeni sistemde büyüyordu.

**Sonuç**

| Ölçü                           | Önce | Sonra |
| ------------------------------ | ---- | ----- |
| `GameScene.ts` satır           | 680  | 608   |
| `vol-hell` test                | 380  | 428   |
| `vol-hell` statements          | %66  | %70   |
| `runtime/scene` klasör kapsamı | %13  | %33   |

Ek olarak `DeathScreen` (%99) ve `PauseScreen` test edildi — ikisi de saf DOM
overlay olduğu için Phaser mock'u gerekmedi. Eşikler yeni seviyeye
ratchet'lendi (st/ln 68, br 79, fn 85).

**Dürüst not:** `GameScene` 608 satırla sınırın 8 satır üstünde kaldı. Kalanı
sistem kurulumu (~130 satır) ve frame döngüsü — sahnenin kendi işi. Daha fazla
bölmek satırı başka dosyaya taşır ama test edilebilirlik kazandırmaz, o yüzden
burada durduruldu. Kapsam artışı da mütevazı (+4 puan): asıl ağırlık hâlâ
`GameScene`'in kendisi (%0), `MainMenuScene`, `SettingsScene`, `GameHud`,
`app/music.ts` ve `app/GameAudio.ts`.

### Kalite kapıları

| Kapı           | Durum | Not                                                           |
| -------------- | ----- | ------------------------------------------------------------- |
| `pnpm signoff` | ✓     | exit 0                                                        |
| test           | ✓     | 1334 test (vol-hell 380 → 428)                                |
| `pnpm lint`    | ✓     | ilk denemede 5 `no-unsafe-return` hatası yakaladı, düzeltildi |

## 2026-08-18 — Yaşam döngüsü idiomu, artımlı spatial indeks, kapı raporu

### DisposableScope norm hâline geldi

Primitif yazılmış ve testlenmişti ama benimsenmemişti: 3 dosya kullanıyor,
11 dosya kendi `(() => void)[]` dizisini elle yönetiyordu. Bu yalnızca stil
sorunu değildi — düz `for (const cleanup of this.cleanups) cleanup();` BİR
cleanup fırlatınca duruyor ve kalan her şeyi sızdırıyordu.

Dönüştürülenler: `PinchZoomController`, `Carousel`, `SwipeableCardStack`,
`SlotGrid`, `SkillTree`, `ActionBar`, `Kanban`, `DataTable`, `Tree`,
`ContextMenu` (core) ve `AbilityLoadout` (vol-hell).

İki tanesi düz dönüşümden fazlasıydı:

- `Kanban` sütun başına dizi tutuyordu → sütun başına `DisposableScope`.
  Yeniden çizimde scope kapatılıp yenisi açılır (dispose edilmiş bir scope
  yeniden kullanılamaz — geç eklenen kaynak anında kapatılır).
- `ContextMenu` handler referanslarını `boundClicks`/`boundKeydowns` PARALEL
  dizilerinde tutup `itemButtons` ile aynı İNDEKSTE eşleştiriyordu. Üç dizinin
  sırası ayrışırsa yanlış listener kaldırılır ve hata görünmez olurdu.

**Bekçi:** `lifecycleIdiom.test.ts` — elle yönetilen temizlik dizisi kalıbı
bulunursa kapı kırılır. Kapsam CORE ile sınırlı değil: `DisposableScope` public
API'de ve oyunlar da onu tüketiyor, kural yalnızca CORE'da uygulansaydı aynı
sızıntı oyun tarafında serbest kalırdı. Bekçi ilk taramada üç dosya
(`DataTable`, `Tree`, `ContextMenu`), kapsam genişletilince bir dosya daha
(`AbilityLoadout`) buldu — elle sayarken hepsi atlanmıştı.

### SpatialGrid: rebuild ile artımlı ayrımı

`insert`/`remove`/`update`/`has` eklendi; `rebuild()` bir KOLAYLIK metodu
olarak tanımlandı (`clear`+`insertAll`+`trim` üçlüsünü toplar — çağıranın
`trim`i unutmasına açıktı). Entity→hücre haritası (`cellOf`) yalnızca artımlı
yol için tutulur.

VOL.HELL bilinçli olarak `rebuild()` kullanmaya DEVAM ediyor: birkaç yüz
düşmanda maliyeti ölçülemez ve kod basit kalır. Artımlı yol, sınıf CORE'a
taşınırsa jenerik API'nin merkezinde durması gerektiği için yazıldı ve test
edildi — "her frame her şeyi yeniden indeksle" varsayımını framework'e gömmek
binlerce entity taşıyan ikinci bir tüketiciyi baştan cezalandırır. Sınıf hâlâ
CORE'da DEĞİL; taşıma kararı ikinci somut tüketiciye bağlı.

**Eşdeğerlik testi** turun asıl sözleşmesi: deterministik rastgele bir hareket
dizisi üzerinde iki grid 30 kare boyunca yan yana sürülür ve her sorgunun
KİMLİK KÜMESİ karşılaştırılır (sıra sözleşmenin parçası değil). `update`ten
eski hücreden çıkarma adımı silinerek testin klasik "iz bırakma" hatasını
yakaladığı doğrulandı.

### Makine-okunur kapı raporu

`scripts/quality/report.mjs` + `just report <kapı> [--json]`. Kapıları YENİDEN
TANIMLAMAZ, `just <aşama>` çağırır; düşen aşamayı `{gate, status, stage, kind,
package, reason}` olarak raporlar ve ham çıktıyı da basar (rapor bir özettir,
teşhisin yerine geçmez).

Aşama haritasının `justfile` ile ayrışmasını da doğrular: `high`ten `build`
çıkarılarak denendi, betik kapıyı koşmadan exit 2 ile durdu.

### Kalite kapıları

| Kapı           | Durum | Not                                                      |
| -------------- | ----- | -------------------------------------------------------- |
| `pnpm signoff` | ✓     | 8 aşama, exit 0 (~99 sn)                                 |
| test           | ✓     | tüm paketler yeşil (nihai toplam için bkz. Son durum)    |
| Regresyon      | ✓     | spatial eşdeğerlik + lifecycle bekçisi enjeksiyonla test |

## 2026-08-20 — Kapsam borcu ve FlowField kararı

### Showcase interaktif yüzeyi

`vol-ui` function kapsamı %53 iken statement kapsamı %83'tü: builder'lar
koşuluyor ama ürettikleri handler'lar hiç çağrılmıyordu. `sections.test.ts`
sekmelerin KURULDUĞUNU doğruluyordu; eksik olan KULLANILDIKLARINI doğrulamaktı.
Bir demo callback'i fırlattığında sekme sessizce yarım kalır ve kurulum testi
bunu göremez — hata ancak tıklandığında oluşur.

`interaction.test.ts` her sekmedeki her butona tıklar, her girdiye olay
gönderir, jest alanlarını pointer diziyle sürer ve hiçbirinin fırlatmamasını
bekler. Yaklaşım bilinçli olarak kaba: tek tek senaryo yazmak yüzlerce testlik
bakım yükü olurdu ve asıl riski ("bir handler patlıyor") daha iyi yakalamazdı.

**Test kendi hatasını buldu.** İlk hâli `panels` sekmesinde iki modal sızıntısı
raporladı. İnceleyince sızıntı değil, testin gerçekçi olmadığı çıktı:
`showConfirm()` bir karar bekliyor ve söz ancak yanıtlanınca çözülüyor;
yanıtlamadan yok etmek diyaloğu DOM'da bırakır — bu doğru davranış.
`dismissOpenDialogs` eklendi, hem gerçekçi oldu hem yanıt yolundaki
callback'leri de kapsadı.

Sonuç: statement %83.16 → **%94.37**, function %53.25 → **%83.47**.

### HUD katmanı

`GameHud` (162) ve `WaveBanner` (108) kapsam raporunda %0'dı ve "Phaser sahnesi
test edilemiyor" başlığı altında sayılıyordu. Yanlış sınıflandırma: ikisi de
Phaser'a değil DOM'a bağlı, yalnızca bir `HTMLElement` ve dört okuyucu
(`getHealth`, `getFlux`…) istiyor. Engel teknik değildi, test hiç yazılmamıştı.

Sahte nesnelerle testlendi: GameHud %0 → **%99.13**, WaveBanner %0 → **%98.59**,
`src/runtime/ui` bütünü **%92.37**. vol-hell statement %69.76 → **%72.87**.

Eşikler ratchet'lendi: vol-ui 82/85/52 → 92/87/81, vol-hell 68 → 70.

### Hâlâ %0 olanlar — dürüst gerekçe

`GameScene` (618), `MainMenuScene` (139), `SettingsScene` (192). Bunlar gerçekten
Phaser'a gömülü: `create()` on beş sistemi kuruyor ve her biri
`scene.add.circle`, kamera, girdi eklentisi istiyor. Mock maliyeti yüksek,
kusur bulma değeri düşük — sistemlerin kendi testleri zaten var ve
`runSimulation.test.ts` boru hattını headless sürüyor. Gerçek boşluk
`GameScene`in kendine özgü sorumluluğu olan FRAME SIRASI değişmezi; onu test
edilebilir kılmanın doğru yolu mock yığmak değil, orkestrasyonu saf bir
parçaya çıkarmak — ayrı bir tur.

### FlowField kısmi yeniden hesap — YAPILMADI, ölçümle

Ölçüm: 200×200 engelsiz alanda **13.72 ms/çağrı**. Gevşek-silme atlaması
eklendikten SONRA da aynı (öncesi 13.7) — darboğaz yeniden genişletme değil,
40.000 hücrelik tam taramanın kendisi.

(İlk benchmark 0.06 ms göstermişti; hedef hücresi engel kümesine düşmüş ve
`compute` geçilemez hedefi atladığı için hiç tarama yapmamıştı. Geçersiz ölçüm,
kaydediliyor.)

Artımlı onarım (D\* Lite "raise & lower") bu sayıyı yalnızca "hedef sabit,
engeller yerel değişiyor" senaryosunda düşürür; hedef değişince alan zaten
tamamen geçersizdir. O senaryonun tüketicisi yok. Karar `FlowField` sınıf
dokümanına yazıldı; gerçek bir oyun deseni getirdiğinde `markDirty` + `repair`
olarak eklenecek.

| Kapı      | Durum | Not                                   |
| --------- | ----- | ------------------------------------- |
| `signoff` | ✓     | 8 aşama, exit 0                       |
| test      | ✓     | 1769 → 1833 test (+64)                |
| coverage  | ✓     | vol-ui func %53→%83, vol-hell %70→%73 |

## 2026-08-20 — Primitif sertleştirme: sessiz bozulmayı gürültülü yapmak

Dış denetimin yedi maddesi doğrulandı; biri yanlış çıktı, ikisinin şiddeti
yükseldi. Denetim **okuyarak değil çalıştırarak** yapıldı — her iddia bir probe
testiyle ölçüldü.

### Denetim sonuçları

- **"`SlotContainer.get()` out-of-range → undefined" YANLIŞ.** `get(99)`,
  `get(-1)`, `get(1.5)` üçü de `null` döndürüyor; üçlü operatör `undefined`'ı
  zaten çeviriyor. Ama komşusunda gerçek bug vardı (aşağıda).
- **"`SpatialIndex` scratch buffer" P2 değil P0.** Ölçüldü: 5 sonuç
  saklandığında birinci sonuç beşincinin verisine dönüşüyor ve hiçbir hata
  çıkmıyor.
- **"`ObjectPool` ownership" belirtilenden ağır.** Yabancı nesne havuza
  giriyor, `activeCount`ı sahibi olmadığı hâlde düşürüyor ve bir sonraki
  `acquire()` ile başka bir çağırana dağıtılıyordu.
- **"`Scheduler` reentrancy" ölçüldü:** tek `update(10)` callback'i ÜÇ kez
  çalıştırıyordu.
- **"`FlowField` recompute" ölçüldü:** 200×200 alanda recompute başına
  ~13.7 ms — tek yeniden hesap bir karenin tamamını yiyor.

### Bulunan ek sorunlar

- **NaN sızıntısı sistemik.** Yalnızca `ResourcePool` değil:
  `Cooldown.update(NaN)` beklemeyi kalıcı `NaN` yapıp sonsuza dek bitmemesine
  yol açıyor, `Clock`/`RoundLoop` aynı sınıf. `spend({x: NaN})` `true` dönüp
  hiçbir şey düşmüyordu — sessiz bedava alışveriş.
- **`Grid` kesirli indeks görünmez veri yazıyor.** `set(1.5, 1, 'x')` → `true`,
  `get(1.5,1)` → `'x'`, ama `filledCount` 0. Değer dizide `"1.5"` adlı normal
  bir özellik olarak yaşıyor; `forEach`/`clear` hiç görmüyor.
- **`Deck.reset()` büyük destede `RangeError` + VERİ KAYBI.** 200k kartta
  `push(...spread)` limiti aşıyor; `splice` önce çalıştığı için iskarta
  boşalmış oluyor ve tüm deste kayboluyordu.
- **`MinHeap` iki kopya** (`findPath` + `FlowField`).
- **`FlowField` eskimiş yığın girişlerini atlamıyordu** — sonuç doğru ama
  düğümler tekrar tekrar genişletiliyordu.

### Yapılanlar

**Sonlu sayı sözleşmesi** (`math/numeric.ts`): yapılandırma değeri REDDEDİLİR,
akış değeri (`deltaMs`) YOKSAYILIR. Altı primitife uygulandı, governance
testiyle kapıya bağlandı.

**Sonuç tamponu sözleşmesi:** `queryInto`/`queryRadiusInto` çağıranın dizisine
yazar; `queryStamp()` + `assertQueryValid()` halka devrini gürültülü yapar.
Mevcut `query()` imzası korundu, hiçbir çağrı yeri kırılmadı.

**Tam sayı sözleşmesi:** `Grid.inBounds` ve `SlotContainer.inRange` artık
`Number.isInteger` kontrol ediyor.

**Sahiplik:** `ObjectPool` `activeSet` tutuyor; alınmamış nesnenin iadesi hata.

**Yeniden giriş:** `Scheduler.update()` artık `boolean` dönüyor; iç çağrı
reddedilip `onReentrantUpdate` ile bildiriliyor.

**Tahsis:** `Grid.forEach`/`forEachNeighbour` koordinatı NESNE değil SAYI
veriyor. İlk denemede yeniden kullanılan tek nesneyi geçirdim — bu yeni bir
sessiz aliasing yaratıyordu ve testler yakaladı; sayılar ikilemi tamamen
ortadan kaldırıyor.

**`MinHeap` tekilleştirildi** (`collections/MinHeap.ts`), `FlowField` eskimiş
girişleri atlıyor.

**`StateMachine` hata sözleşmesi belgelendi:** geri alma TAM DEĞİL ve olamaz —
`onEnter` fırlarsa `onExit(from)` zaten çalışmıştır. Yırtık durum kaçınılmaz;
`onTransitionError` kancası tüketiciye bilinçli kurtarma imkânı veriyor.

| Kapı      | Durum | Not                     |
| --------- | ----- | ----------------------- |
| `signoff` | ✓     | 8 aşama, exit 0         |
| test      | ✓     | 1637 → 1769 test (+132) |
| coverage  | ✓     | core %86.97 → %87.34    |
| yüzey     | ✓     | 166 → 171 export        |

## 2026-08-19 — Katman 1 genişletmesi

Altı primitif daha; amaç CORE'u şişirmek değil, her oyunun yeniden yazmak
zorunda kaldığı mekanizmaları hazır bulundurmak.

- **`EventBus<TEvents>`** — tipli yayın/abone. Yayın sırasında yapılan
  abonelik değişiklikleri yayını bozmaz (kopya üzerinde yürünür); bir
  dinleyicinin hatası kalanları durdurmaz. Kısıt `Record<string, unknown>`
  değil `object`: TS'te `interface` örtük indeks imzası taşımaz ve tüketicinin
  doğal yazımını reddeden bir kısıt tip güvenliği kazandırmadan kullanımı
  zorlaştırırdı (bunu `tsc` yakaladı, vitest esbuild kullandığı için görmedi).
- **`Grid<T>`** — ayrık 2B ızgara. `SpatialIndex`ten farkı ölçek değil model:
  biri sürekli uzayda "yakınımda ne var", diğeri ayrık hücrede "burada ne var".
  Sınır dışı okuma `undefined` döner (kenar taraması çok yaygın), sınır dışı
  YAZMA `false` döner — sessiz taşma en sinsi hata biçimi.
- **`findPath` (A\*)** — ikili yığınla. Sezgisel komşuluğa göre seçilir
  (Manhattan / Chebyshev); admissible olmayan sezgisel en kısa yol garantisini
  bozar. Çapraz adım √2 sayılır, yoksa yol çaprazlara çarpılır.
- **`WeightedPicker<T>`** — kümülatif ağırlık + ikili arama, O(log n).
  Deterministik `Random` ile çalışır. Sıfır/negatif ağırlık havuza girmez.
- **`Clock`** — duraklatılabilir, ölçeklenebilir geçen-zaman. Negatif ölçek
  0'a kelepçelenir: geriye akan zaman süreye dayanan her hesabı tanımsız yapar.
- **İnterpolasyon** — `clamp`/`lerp`/`inverseLerp`/`remap`/`approach`/`damp`/
  `wrap`. `damp` kare hızından BAĞIMSIZDIR; naif `lerp(cur, target, 0.1)` her
  karede aynı oranı uyguladığı için 30 ve 144 FPS'te farklı yumuşatır ve his
  donanıma göre değişir. `approach` hedefe gerçekten ULAŞIR, `lerp` varmaz.

Katman 1 artık 14 parça. Bir A\* testinde beklentiyi yanlış yazdım (9 hücre
dedim, doğrusu 7); algoritma haklıydı, test düzeltildi.

| Kapı      | Durum | Not                    |
| --------- | ----- | ---------------------- |
| `signoff` | ✓     | 8 aşama, exit 0        |
| test      | ✓     | 1563 → 1637 test (+74) |
| coverage  | ✓     | core %86.68 → %86.97   |
| yüzey     | ✓     | 144 → 159 export       |

## 2026-08-19 — Tür sızıntısı: kod nötrdü, repo değildi

Primitifler koddan oyun kelimelerinden arındırıldı ama JSDoc'lara,
`core/docs/primitives.md`'ye ve README'lere **tower defense** çivilenmişti:
"tam bir tower-defense iskeleti", "Tower defense'te dalga molası", "yani tam
olarak bir tower defense". Bir kart, otomasyon ya da blok inşa oyunu yazacak
kişi repoyu açtığında CORE'u bir TD framework'ü sanacaktı.

Hata örneğin FRAMING'e dönüşmesiydi: bir tür örnek olarak verilmişti, ben onu
belgenin omurgası yaptım.

**İlk düzeltme yanlıştı.** Tek türü dört türle değiştirdim (kart, otomasyon,
blok inşa, araç) — aynı hatanın daha genişi. Tür SEÇMEK de editoryal bir
karardır ve CORE onu vermez. Doğrusu **hiç tür örneği vermemek**: bir primitif
yaptığı işle anlatılır, nerede kullanılacağı tüketicinin kararıdır. Altı
primitif dosyasının JSDoc'u, `primitives.md` ve `StateMachine` testi bu ilkeye
göre yeniden yazıldı.

**README'den çıkarıldı.** Root README'ye bir "CORE ile yeni oyun" bölümü
eklemiştim; README'nin işi repoyu tanıtmaktır, CORE dersi vermek değil. Bölüm
silindi, mevcut doküman yüzeyi satırına `core/docs` işareti eklendi.

`StateMachine` testi bilinçli olarak OYUN DIŞI bir sözlüğe geçti (belge iş
akışı: draft/review/published/archived) — `StatBlock` testinin kendi yabancı
stat sözlüğüyle aynı gerekçe.

**Bekçi.** `primitiveNeutrality.test.ts`: katman 1 kaynaklarını ve
`primitives.md`'yi tür adları için tarar, ayrıca belgede en az üç farklı tür
örneği bulunmasını zorunlu kılar. `publicApi.test.ts` export ADLARINI tarıyordu;
bu bekçi PROSA'yı tarar — iki farklı sızıntı biçimi.

Bekçi yazılırken kendi yanlış pozitifini üretti: `dalgayla` (sinüs dalgası)
`dalga` ile eşleşti. Kelime sınırına çevrildi — bir bekçinin yanlış pozitifi,
koruduğu şeyden daha hızlı devre dışı bırakılır. Aynı hatayı `publicSurface`
bekçisinde de yapmıştım (`S-wip-eableCardStack`).

| Kapı      | Durum | Not             |
| --------- | ----- | --------------- |
| `signoff` | ✓     | 8 aşama, exit 0 |
| test      | ✓     | 1566 test       |

## 2026-08-19 — CORE katmanlaması ve yeni oyun zemini

Yön değişti: CORE'u yalnızca saflaştırmak değil, **yeni bir oyuna hızlı
başlamayı** sağlamak. İkisi çelişmiyor; sorun kodun saflığı değil katmanın
yanlış olmasıydı.

### Teşhis

vol-hell yapılırken CORE'da bulunamayıp sıfırdan yazılanlar: `SpatialGrid`,
`EffectManager`, `CollisionResolver`, `DifficultyCalculator`, `WaveManager`,
`RunEconomy`, `TelegraphManager`, `RunDirector`. Hiçbiri "cehennem temalı
arena" değil — hepsi jenerik. Yani zorluğun kaynağı bileşen eksikliği DEĞİLDİ
(CORE'da 60+ UI bileşeni var); katman 1 (headless primitif) ve katman 3
(tarif) zayıf, katman 2 (sunum) şişmandı.

### Üç katmanlı sözleşme

1. **Mekanizma** — oyun kelimesi bilmez, sunumdan bağımsız.
2. **Sunum** — durumu çizer, niyet bildirir; kural taşımaz.
3. **Tarif** — yaygın kuralı hazır verir ama OPT-IN'dir.

Kural silinmedi, TAŞINDI: en yaygın davranış hazır durur ve tek satırda
çağrılır, ama hiçbir bileşen onu arkanda varsaymaz.

### Sunum katmanından çıkarılan kurallar

| Neydi                                             | Nereye gitti                    | Kanıt                                                       |
| ------------------------------------------------- | ------------------------------- | ----------------------------------------------------------- |
| `XPBar.addXP()` zincirleme seviye + kendi defteri | `applyXpGain()` tarifi          | `SparkBar` bunu hiç kullanmadı, tek çalıştıranı showcase'ti |
| `WaveCounter.startAutoLoop()` tur orkestrasyonu   | `RoundLoop` primitifi           | vol-hell bileşeni hiç kullanmadı                            |
| `SkillTree.unlock()` + `unlockedIds` defteri      | `resolveSkillStates()` tarifi   | bileşen kendi kilit defterini tutuyordu                     |
| `Bar` kapalı `'health'\|'stamina'\|'cooldown'`    | `variant: string` + `fillColor` | "kalkan"/"ısı" barı ifade EDİLEMİYORDU                      |

`ShopPicker` dokunulmadı — zaten doğru modeldi (`costLabel`/`canAfford`
dışarıdan gelir, `onReroll` niyet bildirir) ve diğerleri ona benzetildi.

Ek olarak `Bar`ın `aria-label`ı `t('core:bar.ariaLabel', { variant })` ile ham
varyantı enterpole ediyordu; Türkçe arayüzde "health bar" okunuyordu. Varyant
oyunun kelimesi, çevirisi de oyunun sorumluluğu: `ariaLabel` seçeneği eklendi.

### Katman 1 — sekiz primitif

`Scheduler` (delta-time, deterministik, kare düşmesinde tetiklenme yemez) ·
`Cooldown` (tryTrigger tek çağrıda, süre değişince devam eden bekleme kısalır) ·
`RoundLoop` (tur/dalga, ilk tur hemen başlar, skipBreak) · `StateMachine`
(geçersiz durum temsil edilemez, terminal durum, yeniden giriş koruması) ·
`ResourcePool<TResource>` (ya hepsi ya hiçbiri harcama, üst sınır) ·
`ObjectPool` (çift iade hatası, maxIdle) · `SpatialIndex<T>` (rebuild +
artımlı, iki model eşdeğerliği testli) · geometri (daire/dikdörtgen/ışın,
köşe teması, arkadaki hedef elenir).

`TODO.md`'de "ikinci somut tüketici çıkmadan yazılmayacak" diye ertelenen
maddelerdi; tetikleyici karşılandı.

### Dogfooding

vol-hell'in `SpatialGrid`i CORE'un `SpatialIndex<Enemy>`i üzerine ince bir
adaptöre indi. Göç sırasında `update()`in dönüş anlamını sessizce
değiştirmiştim (eski: "indeks değişti mi", yeni: "kayıtlı mı"); vol-hell
testleri yakaladı ve ESKİ sözleşme geri alındı — daha tutarlıydı, üyelik
sorgusu için zaten `has()` var. Primitifi gerçek tüketiciyle doğrulamanın
karşılığı bu oldu.

### Belge

`core/docs/primitives.md` yazıldı: üç katmanın sözleşmesi, her primitifin
kullanımı ve aynı parçaların dört farklı türde kurulumu. `AGENTS.md`e
katman kuralı, README'lere giriş bölümü eklendi.

### Kalite kapıları

| Kapı      | Durum | Not                                               |
| --------- | ----- | ------------------------------------------------- |
| `signoff` | ✓     | 8 aşama, exit 0                                   |
| test      | ✓     | 1471 → 1563 test (+92)                            |
| coverage  | ✓     | core %86.42 → %86.68                              |
| yüzey     | ✓     | 127 → 144 export, bilinçli karar (bekçi yakaladı) |

**Kalan risk:** `vol-ui` function coverage hâlâ %53.65 ve yeni primitiflerin
showcase karşılığı yok (headless oldukları için showcase kuralı kapsamıyor).
Bir sonraki oyunun bunları gerçekten kullanması, API'nin doğruluğunun asıl
sınavı olacak.

## 2026-08-19 — Dış denetimin kalan bulguları

Düşük yetenekli bir agent'ın çıkardığı sekiz maddelik liste kod üzerinden
denetlendi ve tamamı kapatıldı. Denetimin kendisi listeyi değiştirdi: bir madde
YANLIŞtı, ikisinin önceliği hatalıydı, biri de düzeltilmeye kalkılınca ters
çıktı.

### Denetim sonuçları

- **"SpatialGrid artımlı destek yok" YANLIŞ.** Bir önceki turda eklenmişti
  (`insert`/`remove`/`update`/`has`/`rebuild`). Agent eskimiş bir durum okumuş.
  Ama yerine GERÇEK bir bulgu çıktı: artımlı yolun **üretimde çağıranı yok**,
  yalnızca testler çağırıyor. Bu bilinçli (oyun döngüsüne bağlamak bugünkü
  ölçekte kanıtsız karmaşıklık olurdu) ama saklanmamalı: sınıf dokümanına açık
  uyarı yazıldı ve iddia bir bekçiye bağlandı — biri artımlı API'yi üretimde
  kullanmaya başlarsa test düşer ve dokümanı güncellemeye zorlar.
- **"`PlayerController` domain adı" doğru ama P1 değil.** Sınıfta tek satır
  oyuncu semantiği yok; yalnızca `velocity` + kelepçeli `move()`. Kuplaj değil,
  yanlış ad. `MovableController` oldu, eski ad `@deprecated` takma ad olarak
  duruyor.
- **"`doctor`/`doctor:env` duplikasyonu" — düzeltmesi ters çıktı.** `doctor:env`
  silinip tek isme inildi, sonra `pnpm doctor` koşulduğunda çıktının pnpm'in
  KENDİ tanılama komutundan geldiği görüldü: `"doctor"` script'i baştan beri
  gölgeleniyordu ve `doctor:env` tam olarak bunun çözümüydü. Duplikasyon
  sanılan şey bir çözümdü. Karar tersine çevrildi: gölgelenen `"doctor"` silindi,
  çalışan `doctor:env` kaldı, `AGENTS.md`'ye adlandırma kuralı ve bir bekçi eklendi.
- **"StatBlock O(M)" ölçüldü.** 40 modifier × 124.7 ns/okuma → VOL.HELL'de frame
  bütçesinin **%0.0022**'si; spekülatif VOLDUSTRY ölçeğinde (2000 entity × 2
  okuma × 10 modifier) **0.25 ms/frame = %1.5**. Gerçek ama düşük. Profil
  olmadan cache/bucket eklemek kanıtsız karmaşıklık olurdu — YAPILMADI.

### Kapatılanlar

**Diagnostics sağlayıcı kümesi açıldı.** `activeProvider` `'pc' | 'touch' |
'none'` kapalı union'ıydı ve ham durum `pc`/`touch` ADLI ALANLARDA taşınıyordu.
`InputProvider` ise açık bir arayüz: gamepad sağlayıcısı yazılabiliyor ama
raporlanamıyordu. Bu, bir önceki turda temizlenen `fire`/`dash` sızıntısıyla
aynı sınıftı — yarım kalmış bir uygulama. Artık sağlayıcı kendi kimliğini
taşıyor (`InputProvider.id`) ve snapshot `providers: Record<string, …>`. Bekçi:
CORE'da hiç geçmeyen bir `'gamepad'` kimliğiyle kurulan sahte sağlayıcının
raporlanabildiğini doğrulayan test.

**`quality.json` şema doğrulaması.** Tek doğruluk kaynağı doğrulanmıyordu:
`floor` → `flor` yazım hatası `TypeError: Cannot convert undefined or null to
object` veriyordu. Kapı kırılıyordu (sessiz geçiş yok) ama nereye bakılacağı
belli değildi. `scripts/quality/config.mjs` tek okuyucu oldu; eksik/yanlış
tipte/tanınmayan metrik, gerekçesiz muafiyet ve "hem muaf hem eşikli" çelişkisi
toplu olarak raporlanıyor. `games/design` metadata doğrulayıcısıyla aynı desen
— kendi kuralımı bir yerde uygulayıp diğerinde uygulamamışım.

**Public API yüzeyi sayıldı.** Dokuz `export *` barrel'ı yüzeyi KARAR NOKTASI
OLMADAN büyütüyordu. Barrel'ları elle listeye çevirmek 120+ satır kalıcı bakım
demekti; onun yerine yüzey kilitlendi (127 export). Değiştiğinde kapı kırılır ve
biri kararı bilinçle verir. Ek olarak `_`/`internal`/`wip` gibi segment taşıyan
sızıntı isimleri taranıyor — bu tarama ilk hâlinde `SwipeableCardStack`'i
yakalıyordu ("S-**wip**-eable"); camelCase segmentine çevrildi.

**Rig eklemlenmesi (articulation).** `parentPartId` metadata'ya, export
script'ine, doğrulayıcıya ve montaja eklendi. Metadata'daki konum/dönüş rig
KÖKÜ uzayında kalır (mevcut dosyaların anlamı değişmez); montaj ebeveynin
dönüşünü telafi ederek yerel uzaya çevirir — telafi olmadan dönük bir ebeveynin
altındaki parça yazarın çizdiği yerden kayardı. Ebeveyn listede parçadan ÖNCE
gelmek zorunda: sıra aynı zamanda ağacın kuruluş sırası, ileri referans ve
döngü aynı kontrole takılır. Eklem taşımayan rig eskisiyle birebir aynı çıktıyı
verir. RENDER eklemi; fizik kısıtı taşımaz.

**Rapor sınıflandırması sağlamlaştırıldı.** Kendi betiklerimiz artık
`##quality:{…}` yapılandırılmış işareti basıyor (kendi çıktımızı serbest
metinden okumak ev yapımı bir kırılganlıktı). Üçüncü parti kalıpları gerçek
araç çıktılarıyla test edildi; `stylelint` ile `eslint` aynı `✖ N problems`
biçimini kullandığı için aşama adıyla ayrıldı — ayrılmasa CSS hatası `lint`
diye raporlanırdı. Sınıflandırma tutmazsa artık `unknown` deyip susmuyor,
çıktının son satırlarını rapora koyuyor.

### Kalite kapıları

| Kapı      | Durum | Not                                             |
| --------- | ----- | ----------------------------------------------- |
| `signoff` | ✓     | 8 aşama, exit 0                                 |
| test      | ✓     | 1471 test                                       |
| coverage  | ✓     | design %98.62 → %98.86 (eklem dalları kapsandı) |

**Dürüst not:** `design` kapsamı eklem kodu eklenince eşiğin altına düştü ve
kapı kırıldı. Eşik düşürülmedi; `buildRig`in dört hata dalı ve `assembleRig`in
ağaç kurulumu için test yazıldı.

## 2026-08-18 — Kart işlem sınırı, metadata doğrulama, tek kalite kaynağı

### `purchase()` artık yarım commit bırakmıyor

Akış `spendFlux → owned.push → applyCard` idi: uygulama ortasında bir hata
olursa kart envanterde GÖRÜNÜYOR, etkileri yarım kalıyor ve satın almada Flux
da gitmiş oluyordu. "Planla → commit et" ayrımına geçildi: etkiler önce
hesaplanır (`planCardEffect`, hiçbir durumu değiştirmez), sonra tek noktada
uygulanır; kart ve `instanceCounter` ancak commit başarılıysa ilerler.
`purchase()` hata hâlinde Flux'u geri verir.

Bugünkü kartlarda fırlatma yolu yok; üç regresyon testi o yolu YAPAY olarak
açıyor (stat motoru fırlatacak şekilde sabote ediliyor). Üçü de eski
sıralamada düştü.

### Design metadata: çalışma zamanı şeması

`RigMetadata` yalnızca bir TypeScript arayüzüydü; dosyadan okunan JSON hakkında
hiçbir garanti vermiyordu. `parts` eksikse `.map` çağrısı "Cannot read
properties of undefined" ile düşüyor, sorunun nerede olduğunu söylemiyordu.
`schemaVersion: 1` tipte vardı ama çalışma zamanında hiç kontrol edilmiyordu.

`validateRigMetadata()` eklendi (`buildRigDefinition` çağırıyor). `zod`
EKLENMEDİ: tek tüketici için yeni bir çalışma zamanı bağımlılığı taşımaya
değmiyor. Hatalar toplanır — bozuk bir dosyada eksiklerin tamamı bir kerede
görülür, tek tek düzeltip yeniden koşmak gerekmez. `positionPx`/`rootSizePx`
null olabilirliği (izole parça export'u) bilinçli olarak korunuyor.

### Kapsam eşikleri tek dosyada

`workspace-contract.mjs` eşikleri `vitest.config.ts`ten REGEX ile okuyordu:
`/thresholds\s*:\s*\{([\s\S]*?)\}/` ilk `}`de kestiği için bloğa iç içe bir
nesne eklemek bekçiyi sessizce yanlış bloğu okumaya iterdi.

Kök `quality.json` eklendi (`floor`, `exempt`, `packages`). Beş `vitest.config.ts`
onu okur, bekçi de aynı dosyayı okur — ayrışamazlar. Regex silindi. Bekçi
ayrıca config'in eşiği SATIR İÇİ yazmadığını da doğrular; enjekte edilen
satır içi eşikle kırıldığı test edildi.

`import ... with { type: 'json' }` kullanılmadı: Prettier 3.0 import attribute
sözdizimini parse edemiyor ve `format-check` kapısı düşüyor. `readFileSync` +
`JSON.parse` tercih edildi.

### Kalite kapıları

| Kapı        | Durum | Not                                                       |
| ----------- | ----- | --------------------------------------------------------- |
| `pnpm high` | ✓     | exit 0                                                    |
| test        | ✓     | tüm paketler yeşil                                        |
| Kapsam      | ✓     | design %98.62 (yeni doğrulayıcı için 4 test daha yazıldı) |
| Regresyon   | ✓     | kart işlem sınırı 3 test, eski sıralamada düştü           |
| Bekçi       | ✓     | satır içi eşik enjekte edilince kırıldı                   |

## 2026-08-18 — Diagnostics: taşıma ayrımı, uçuş koruması, singleton kaldırma

### Taşıma (transport) yakalamadan ayrıldı

`Diagnostics` hem ölçüm topluyor hem `http://127.0.0.1:9876/debug` adresine
`fetch` atıyordu: CORE'un normal çalışma zamanı, geliştiricinin makinesindeki
bir sunucunun adresini biliyordu. `DiagnosticsTransport` arayüzü eklendi;
`NoopTransport` (varsayılan), `ConsoleTransport`, `LocalServerTransport`.
Adres artık `vol-hell/app/services.ts`'te. **CORE'un varsayılanı hiçbir ağ
isteği açmamak** — testle kilitlendi.

### Uçuşta istek koruması

Endpoint yavaşlarsa her `sampleEvery` frame'de yeni bir `fetch` açılıyor ve
uzun oturumlarda bekleyen istekler birikiyordu. `LocalServerTransport` bir
istek uçuştayken gelen snapshot'ı atlar (`skipWhileInFlight`, kapatılabilir).

### Singleton tamamen kaldırıldı

`static instance` / `getInstance()` / `reset()` **silindi**. Gerekçe teorik
değil: tek process'te ikinci bir çalışma zamanı (core doğrulaması + oyun +
showcase) imkânsızdı ve ölçüm bağımlılığı imzalarda görünmüyordu.

- `createDiagnostics()` fabrikası eklendi.
- `createVolGame` artık Diagnostics OLUŞTURMAZ; `diagnostics` alır ve yalnızca
  ömrüne bağlar. `gameId`/`debug` alanları kaldırıldı (ölü config bırakılmadı).
- 24 çağrı noktası, 13 dosyada döndü: `Diagnostics.getInstance()?.x` →
  `diagnostics?.x`.
- Tek örnek tercihi artık OYUNUN kararı ve `vol-hell/app/services.ts`'te,
  diğer uygulama servislerinin yanında. Bu global'i taşımak değil: CORE artık
  dayatmıyor, tüketici seçiyor.

Yeni test: iki Diagnostics örneği yan yana yaşar ve birbirinin olaylarını
görmez — eski kodda ikinci `new` fırlatıyordu.

### Sözlük temizliği

`debug/types.ts` JSDoc'undaki `'dash'`, `'enemyHit'`, `input/player/fire/
collision`, `bullets/enemies/particles` örnekleri kaldırıldı; tipler zaten
`string` idi, yanlış olan CORE'un zihinsel modelini tek bir oyuna bağlamasıydı.

### Bekçi

`publicApi.test.ts`'e ikinci bir bekçi: `core/src` içinde
`static getInstance`/`static instance` bulunursa kapı kırılır. İki bekçinin
ortak "yorum satırlarını atla" mantığı tek yardımcıya toplandı — ilk hâlinde
`Diagnostics`in "singleton DEĞİLDİR" diyen JSDoc'u kendi kuralını ihlal etmiş
sayılıyordu. Enjekte edilen sızıntıyla kırıldığı doğrulandı.

### Kalite kapıları

| Kapı        | Durum | Not                                         |
| ----------- | ----- | ------------------------------------------- |
| `pnpm high` | ✓     | exit 0                                      |
| test        | ✓     | tüm paketler yeşil                          |
| Kapsam      | ✓     | core %86.35, vol-hell %69.91, vol-ui %83.57 |
| Regresyon   | ✓     | uçuş koruması kaldırılınca test düştü       |

## 2026-08-18 — Evrensel etkileşim sözleşmesi

Denetim raporunun ikinci kırmızı maddesi: bileşenler aynı adaptive interaction
politikasını paylaşmıyordu. Beş eksende kapatıldı.

### Dokunmatik hedef: durum kilidi yerine POLİTİKA

`--vol-hit-target-min` token'ını yalnızca ÜÇ seçici tüketiyordu
(`.vol-button`, `.vol-checkbox`, `.vol-tabs__tab`) ve test tam olarak o üçünü
doğruluyordu — yani politikayı değil o günkü durumu kilitliyordu. Sonuç:
`.vol-icon-button` 40px, `.vol-stepper__button` 40px, `.vol-dialogue__control`
34px, `.vol-carousel__dot` **8px** ile politikanın dışında kalmıştı.

`hitTargetSync.test.ts` tersine çevrildi: CSS taranır, `cursor: pointer` taşıyan
HER kural ya token tüketir ya da GEREKÇESİ YAZILI bir muafiyet taşır. 41
interaktif seçicinin tamamı tek tek değerlendirildi; 22'si politikaya alındı,
16'sı gerekçeli muaf (joystick/touch-button gibi zaten 52–72px olanlar, hedefi
başka kutuda olanlar, tablo satırı). Muafiyetin ölü kalmasını da test engelliyor:
seçici CSS'ten silinirse muafiyet de silinmek zorunda.

`.vol-carousel__dot` özel çözüldü: görsel nokta `::before`e taşındı, buton
kutusu dokunmatikte gerçekten 44px oluyor. Bu, `.vol-button`da reddedilen
"görünmez overlay" tekniğinin tersi — sözde-eleman İÇERİDE kalıyor, komşularla
örtüşme riski yok.

### TouchButton: klavye ve mandallı durum

`<button>` ve `aria-label` vardı ama olaylar yalnızca pointer'dan geliyordu:
Space/Enter hiçbir şey yapmıyordu. keydown/keyup eklendi (auto-repeat filtreli,
native click bastırılmış, basım kaynağı izleniyor ki klavyeyle basılıyken gelen
`pointerleave` basımı iptal etmesin).

Ayrıca **basılıyken `destroy()` `onRelease` çağırmıyordu**: oyuncu ateş tuşunu
tutarken sahne kapanınca çağıranın "basılı" durumu mandallı kalıyordu.

Bileşenin adı korundu — press/hold semantiği dokunmatiğe özel değil ama
yeniden adlandırmanın bedeli public API + showcase + README + i18n; gerekçe
sınıf dokümanına yazıldı.

### Pointer capture lifecycle

`MultiTouchZone.destroy()` aktif parmakları bırakmıyor ve `onTouchEnd`
üretmiyordu — çağıranın parmak-başına durumu asılı kalıyordu.
`SwipeGestureZone.destroy()` sürükleme ortasında aynı hatayı taşıyordu.

### Flick hızı: ortalama değil BIRAKMA anı

`SwipeGestureEvent.velocity` "bırakma anındaki hız" diyordu ama
`toplam mesafe / toplam süre` hesaplıyordu. Gerekli veri (`lastX/lastTime`)
zaten toplanıyordu, sadece kullanılmıyordu. Son iki örneğe geçildi; iki yönlü
regresyon testi yazıldı (yavaş sürükle + savur = flick; hızlı başla + dur =
flick değil). Eski formülde ikisi de düşüyor.

### Button / IconButton: tek sözleşme

İkisi aynı adı taşıyıp farklı garanti veriyordu. Ortak `runButtonClick`
çıkarıldı; IconButton asenkron handler, yeniden giriş engeli ve hata yakalama
kazandı, ikisi de `aria-busy` yazıyor.

`Button` thenable'ı kaçırıyordu (`result instanceof Promise` yalnızca native
söz tanır). Düzeltmenin İLK hâli `await Promise.resolve(...)` idi ve mevcut bir
test bunu yakaladı: senkron handler bile bir microtask gecikiyordu, art arda
iki tıklamada ikincisi "loading" sanılıp düşüyordu. `isThenable` kontrolüne
geçildi — senkron handler senkron kalır.

### Test altyapısında bulunan sessiz körlük

`tests/setup.ts`'te `hasPointerCapture` KOŞULSUZ `false` dönüyordu. Yani
`if (el.hasPointerCapture(id)) el.releasePointerCapture(id)` yazan üretim kodu
testte hiçbir zaman release etmiyordu — gerçek tarayıcıda çalışan bir akış
testte sessizce ölüydü. Üç stub artık ortak bir küme üzerinden tutarlı.

`memory.test.ts` `removeEventListener` çağrısını SAYIYORDU (`4 kez`); klavye
listener'ları eklenince sızıntı olmadığı hâlde kırıldı. Sayı yerine KÜME
karşılaştırmasına geçildi — bağlanan her tür kaldırılmak zorunda.

### Doğrulama

Beş regresyon testinin tamamı, eski davranış geri konarak koşuldu ve düştükleri
tek tek görüldü (flick × 2, thenable, TouchButton destroy, MultiTouchZone
destroy).

### Kalite kapıları

| Kapı        | Durum | Not                                                   |
| ----------- | ----- | ----------------------------------------------------- |
| `pnpm high` | ✓     | exit 0                                                |
| test        | ✓     | tüm paketler yeşil                                    |
| Kapsam      | ✓     | core %86.34, vol-ui %83.57, vol-hell %69.94           |
| Regresyon   | ✓     | 5 test eski kodda düştü, doğrulandı                   |
| Showcase    | ✓     | TouchButton klavye ipucu + asenkron IconButton demosu |

## 2026-08-18 — CORE domain saflığı: stat ve eylem sözlükleri oyuna taşındı

Dış denetim raporunun en ağır bulgusu doğrulandı: mekanizma CORE'daydı ama
SÖZLÜK de CORE'daydı ve VOL.HELL onu oradan tüketiyordu — Bozulamaz Kural #3'ün
kanıtlı ihlali. İki eksende kapatıldı.

### Stat sözlüğü

`StatBlock<TStat>` jeneriği zaten vardı; sorun varsayılanıydı. `StatKey`,
`STAT_KEYS`, `StatBaseValues` CORE'dan **silindi**, `StatBlock`/`StatModifier`
varsayılansız hâle geldi. Sözlük `games/vol-hell/src/config/stats.ts`'e taşındı
(`HellStat`, `HELL_STAT_KEYS`, `HellBaseStats`, `HellStatBlock`); `fireRate`in
ters-cooldown semantiği de oraya gitti. 13 runtime + 4 test dosyası döndü.

### Eylem sözlüğü (raporun kaçırdığı, daha ağır ihlal)

`InputState.fire`/`dash` alanları CORE'un tipindeydi ve StatBlock'un aksine
hiçbir kaçış yolu yoktu; üstelik `PCController` WASD ve SPACE'i sabit kodluyordu.
`InputState<TAction>` + `actions: Record<TAction, boolean>` modeline geçildi;
eylem→tuş eşlemesi `PCActionBinding` olarak VERİ hâline geldi
(`games/vol-hell/src/config/input.ts`). Yan kazanç: tuşlar artık yeniden
atanabilir — kullanıcıya açan UI bilinçli olarak yapılmadı, altyapı hazır.

`TouchStickState` de "sağ stick ateş eder" varsayımından kurtuldu:
`aimStickAction` verilmezse stick yalnızca nişan üretir.

### Bekçi

Export ADI taraması bu sınıf hatayı yakalayamaz (`StatKey` adında yasaklı terim
yok). `publicApi.test.ts`'e değer seviyesinde bir tarama eklendi: `core/src`
içinde `'damage'`/`'fireRate'`/`'dash'` string literali bulunursa kapı kırılır.
Yorum satırları atlanır; ses preset kütüphanesi (`audio/synth/presets/`)
gerekçesi yazılı bir muafiyet taşır — oradaki adlar oyun fiili değil akustik
arketiptir. Bekçinin gerçekten kırıldığı, kasıtlı bir sızıntı enjekte edilip
doğrulandı.

### Bekçinin bulduğu üçüncü sızıntı

`FloatingTextVariant = 'default' | 'damage' | 'heal' | 'critical'` — bir dövüş
oyununun sözlüğü CORE UI'ında. Görsel tona çevrildi:
`'default' | 'negative' | 'positive' | 'emphasis'`. CSS sınıfları, core testi ve
`vol-ui` showcase'i birlikte güncellendi. VOL.HELL bu bileşeni kullanmıyordu.

### Yolda çıkan iki gizli kusur

- `InputUtils.normalizeDirection/normalizeAnalog`'un `deadZone` parametresi
  `INPUT.DEAD_ZONE_RATIO` (`as const`) varsayılanından `0.15` LİTERAL tipini
  miras alıyordu: "ayarlanabilir" deadzone 0.15 dışında hiçbir değeri kabul
  etmiyordu. Açık `: number` anotasyonuyla kapatıldı.
- `DEFAULT_MOVE_KEYS` modül seviyesinde `Phaser.Input.Keyboard.KeyCodes`
  okuyordu; Phaser'ı mock'layan `vol-ui` showcase testi import anında çöktü
  (module-level `i18next.t()` yasağıyla aynı sınıf hata). Ham `keyCode`
  sayılarına geçildi — eşleme zaten saf veri olmalı. Sessiz sapmaya karşı
  sayıların Phaser tablosuyla aynı olduğunu doğrulayan test eklendi.

### Testler kendi sözlüklerini kullanıyor

`statBlock.test.ts`, `touchStickState.test.ts`, `pcInputState.test.ts` ve
`inputManager.test.ts` artık VOL.HELL'in değil kendi kümelerini kullanıyor
(`attack/agility/vitality/recovery`, `engage/boost`). Motoru oyunun sözlüğüyle
test etmek bağımsızlığı kanıtlamaz, gizli bir kuplajı gizleyebilir.
`wasTouch` regresyonu (`resolvePCActions`) korundu, kaybolmadı.

### Kalite kapıları

| Kapı        | Durum | Not                                                     |
| ----------- | ----- | ------------------------------------------------------- |
| `pnpm high` | ✓     | exit 0                                                  |
| test        | ✓     | 1375 test (turun sonunda ölçüldü; öncesi 1334)          |
| Kapsam      | ✓     | core %86.18, vol-hell %69.94, vol-ui %83.52, design %98 |
| Bekçi       | ✓     | enjekte edilen sızıntıda kırıldığı doğrulandı           |

## 2026-08-18 — Menü müzik listesi, dükkân sözleşmesi ve teklif hatası

### Menü müziği: hep aynı parça çalıyordu

Kullanıcı bildirimi: menüde ikinci parça hiç duyulmuyor, döngü ilerlemiyor.
Sebep asset ya da rastgelelik değildi — menü parçaları `loop: true` idi, yani
parça hiç bitmiyordu ve sıraya gelecek bir "sonraki" kavramı yoktu. Motorda
"parça bitti" bildirimi de yoktu; `onended` yalnızca temizlik yapıyordu.

- `MusicEngine.onTrackEnd()` eklendi. Motorun kendi durdurduğu stem (stop /
  crossfade) bitiş SAYMAZ — `ActiveStem.stoppedByEngine` ile ayrıştırılır,
  aksi halde her `stop()` listeyi yanlışlıkla ilerletirdi.
- `core`'a `MusicPlaylist` eklendi: Fisher-Yates karıştırma, parçalar arası
  boşluk, liste tükenince yeniden karıştırma, yeni turun önceki turun son
  parçasıyla başlamaması, çalınamayan parçayı atlama. Oyun bilgisi taşımaz.
- Menü parçaları `loop: false` yapıldı; `musicConfig.menu.gapMs = 3000`.
- `games/vol-hell/src/app/menuMusic.ts` listeyi sahnenin DIŞINDA tutar:
  Ayarlar'a gidip dönünce müzik baştan sarmaz.

### Dükkân: geçiş niyeti artık tahmin edilmiyor

`ShopPicker` "bazı teklifler gitti VE bazıları geldi" sezgisine bakıp reroll
olduğuna karar veriyordu. Bu sezgi satın alma sonrası teklif listesi
değiştiğinde de doğru çıkıyor, reroll olmadığı hâlde kilitsiz tüm kartları
yıkıp yeniden kuruyor ve ızgarayı titretiyordu.

- `ShopPickerState.transition` eklendi (`'reroll' | 'refresh'`); çağıran
  niyetini bildirir. `vol-hell` ve `vol-ui` güncellendi.
- Teklif durumu tek kayıtta toplandı (`offerTiles` + `offerPurchased` →
  `offers: Map<string, OfferEntry>`); iki Map'in elle senkron tutulması
  gerekmiyor.
- Kart görsel durumu tek yerden uygulanıyor (`applyOfferState`); önceden aynı
  üç çağrı iki ayrı dalda tekrarlanıyordu.
- Çıplak `240` sabitleri adlandırıldı (`REROLL_FLASH_MS`, `PURCHASE_FLASH_MS`)
  ve CSS senkron testine bağlandı; önceden bu süreler testin kapsamı
  dışındaydı ve CSS değişince sessizce ayrışırdı.

### Bug avı: teklif listesinde tekrar eden/asılı kalan kart

Havuz istenen sayıyı karşılayamadığında boş slot "o slottaki eski kartla"
dolduruluyordu. Sonuç: aynı kart iki slota girebiliyor (`B, C, D, D`) ve
`ShopPicker` teklifleri id'ye göre tuttuğu için iki slot tek karta çöküyordu;
ayrıca oyuncu reroll için ödeme yaptığı hâlde önceki teklif vitrinde
kalabiliyordu. `vol-ui`'de son çare `'cardTurret'` satın alınmış olsa bile
vitrine girebiliyordu.

İki tüketicide de düzeltildi: slot doldurulamıyorsa BOŞ bırakılır. Regresyon
testleri önce eski kod üzerinde koşturulup gerçekten düştükleri doğrulandı
(ilk yazdığım senaryo ayırt etmiyordu, değiştirildi).

### Taranıp temiz çıkanlar

`document`/`window` dinleyicilerinin tamamının `removeEventListener` karşılığı
var; temizliksiz görünen zamanlayıcılar yalnızca yorumda geçiyor; `Map` üzerinde
iterasyon sırasında silme JS'te güvenli; incelenen bölme işlemlerinde payda
zaten korunmuş (`Math.max(1, …)`, sabit `6`).

**Not:** `noUncheckedIndexedAccess` kapalı — dizi indeksi erişimleri tipçe
`T | undefined` değil. Açmak repo çapında geniş bir tur gerektirir.

### Kalite kapıları

| Kapı           | Durum | Not                                     |
| -------------- | ----- | --------------------------------------- |
| `pnpm signoff` | ✓     | exit 0                                  |
| test           | ✓     | 1381 test                               |
| Regresyon      | ✓     | teklif hatası testleri eski kodda düştü |
