# VOL.STUDIO — Denetim Kaydı

`dev` dalı. Bu dosya bir görev listesi değil, tamamlanmış turların **özet
kaydıdır**: ne yapıldı, hangi kapı koşuldu, geriye ne kaldı. Turun ayrıntısı
commit diff'inde ve git geçmişindedir; burada tekrarlanmaz.

## Son durum (2026-08-18)

Bulut CI yoktur; kapılar `justfile` ile localde koşar. Aşağıdaki sonuçlar bu
tarihte çalışma ağacında bizzat koşuldu.

| Kapı                     | Durum | Not                                                                   |
| ------------------------ | ----- | --------------------------------------------------------------------- |
| `pnpm signoff`           | ✓     | high + cargo check/fmt/clippy — zincirin tamamı, exit 0               |
| `pnpm high`              | ✓     | quick + lint:css + coverage + tüm build'ler                           |
| `pnpm -r typecheck`      | ✓     | 5 paket (core, vol-hell, vol-ui, design, tauri-v2)                    |
| `pnpm -r test:coverage`  | ✓     | 1334 test (core 829, vol-hell 428, vol-ui 27, tauri-v2 26, design 24) |
| `pnpm run contract`      | ✓     | 5 paket, kapı kapsamı tam                                             |
| `pnpm lint`              | ✓     | 0 hata, 0 uyarı                                                       |
| `pnpm format:check`      | ✓     |                                                                       |
| `pnpm lint:css`          | ✓     |                                                                       |
| `pnpm build:all`         | ✓     | build script'i olan her paket (`vol-hell`, `vol-ui`)                  |
| `cargo check/fmt/clippy` | ✓     | `tauri-v2/src-tauri`                                                  |
| `pnpm run doctor:env`    | ✓     | Node 22.23.1, pnpm 11.18.0, rustc 1.97.1, just 1.58.0, FFmpeg 8.1.2   |

Kapsam: core %86, vol-ui %84 (function %54), vol-hell %70, tauri-v2 %89,
design %98. Eşikler ölçülen kapsamın ~2 puan altına kilitli (ratchet), yani
bu oranlar artık taban — düşerlerse kapı kırılır.

## Açık borç ve riskler

Kapatılmamış, bilinçli olarak taşınan maddeler. Kapanan bir madde bu listeden
silinir; kronolojiye not düşülmez.

**Yapı**

- `GameScene.ts` **608 satır** — dört sorumluluk çıkarıldıktan sonra sınırın
  (~600) hâlâ 8 satır üstünde. Kalanı sahnenin kendi işi: sistem kurulumu
  (~130 satır) ve frame döngüsü. Daha fazla bölmek satırı taşır ama test
  edilebilirlik kazandırmaz; bu yüzden burada durduruldu. `core` tarafında
  `Kanban.ts` (812) ve `SlotGrid.ts` (675) hâlâ sınır üstünde ve bölünmedi.
- CORE capability yol haritasında ertelenenler: `Scheduler`, `StateMachine`,
  geometry/collision primitifleri, `ObjectPool<T>`, resource lifecycle. İkinci
  somut tüketici çıkmadan yazılmayacak.

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
- `vol-ui` function coverage **%54** — interaktif callback'ler (buton, form,
  scroll, touch, loading) test edilmeden %80'e çıkmaz.
- `vol-hell` statements **%70**. Geriye kalan en büyük test dışı yüzeyler:
  `GameScene` (608 satır, %0 — Phaser sahnesi, mock'suz sürülemiyor),
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
  gerekçesiyle yazılır; sessiz muafiyet yok.
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
