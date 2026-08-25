# VOL.STUDIO — Denetim Kaydı

`dev` dalı. Bu dosya bir görev listesi değil, tamamlanmış turların **özet
kaydıdır**: ne değişti, hangi karar verildi, geriye ne kaldı. Bug-bug analizi,
tam test sayıları ve dosya listeleri commit diff'inde ve git geçmişindedir;
burada tekrarlanmaz. Güncel kapsam eşikleri `quality.json`da tek kaynaktır.

## 2026-08-25 — VisualSynth P0/P1/P2 ve güvenli inceleme yüzeyi

- `VISUAL_SYNTH_CAPABILITIES` manifesti şemadan türetiliyor; determinism,
  palette lock, headless sınırı ve bilinçli 2B/3B/AI kapsamı CLI üzerinden
  okunabiliyor (`capabilities --json`).
- `benchmark` komutu ısınma sonrası render/QA sürelerini, piksel sayısını ve
  süreç RSS değerlerini ve render aşama sürelerini raporluyor; henüz makine
  bağımsız performans eşiği uydurmuyor.
- `inspect` komutu render etmeden alan düğümü, tampon ihtiyacı, scatter talebi
  ve yaklaşık tepe çalışma belleğini raporluyor; cache/tile kararı artık
  graph ölçümüne dayanabilir.
- QA sonlu kanal değerlerini, anlamsal kanal aralıklarını ve scatter'ın kabul/
  minimum mesafe tutarlılığını kapıdan geçiriyor; renderer opt-in aşama
  profiliyle bu metriklerin maliyeti ayrıca görülebiliyor.
- `sdf.path` sabit maliyetli capsule zinciri olarak eklendi; açık/kapalı path,
  endpoint ve birleşim regresyonları var.
- `sdf.smoothUnion`, `sdf.smoothSub` ve `sdf.smoothIntersection` eklendi;
  `k=0` sert boolean davranışına iner.
- `scatter` varsayılan grid davranışını koruyor; opt-in deterministik Poisson
  dağılımı `distribution` ve `minDistance` ile geliyor. Tileable kenar mesafesi
  uzamsal kovada denetleniyor.
- Capability, path, smooth SDF, Poisson ve benchmark için regresyon testleri
  eklendi.

- `inspect` graph ölçümü artık gerçek bir region/halo sözleşmesine bağlı:
  komşuluk/tampon/ışık/post isteyen belgeler güvenli olmayan tile isteğini
  reddeder; halo'suz belgeler global koordinatlarla doğrudan bölge render'ı
  yapar ve tam kare crop'u ile bit düzeyinde eşleşir.
- `RenderCache`, çağıranın verdiği byte ve giriş sayısı bütçeleriyle bounded
  LRU olarak eklendi. Cache global değildir, profil ölçümünü atlamaz ve typed
  array/graph mutasyonunu girdiye geri sızdırmaz.
- Asset Studio Quick Look'a salt-okunur VisualSynth inspector eklendi:
  kaynak graph, kanal önizlemesi, QA, gerçek render aşama profili, tampon
  maliyeti ve region/halo engelleri görünür; JSON varlık yazılmaz.
- `brushedMetal`, `warmWood`, `coarseStone`, `organicFlesh` ve
  `emissiveGlow` şekilden bağımsız malzeme tarifleri ile doğrulanabilir test
  kartları eklendi. P2 ışık diliminde emission ve palette-safe glow var;
  glow'un kısmi alfası QA sözleşmesine açıkça dahil edildi.

Kalan: sonlu halo hesabını buffered/normal/AO/post zincirlerine genişletmek;
benchmark çıktısını tüketen Web Worker eşiğini gerçek hedef makinelerde
ölçerek seçmek; atlas/variant, normal-map dışa aktarımı ve daha fazla malzeme
tarifi için gerçek tüketici eklemek. 3B kamera, depth/shadow mapping,
specular/Fresnel/IBL/PBR ve üretken AI core kapsamına alınmadı.

## 2026-08-25 — vol-ui ikinci denetim: yaşam döngüsü, erişilebilirlik ve dar ekran

- `Popup.destroy()` açık durumu kapatmıyor ve yok edilmiş popup yeniden açılabiliyordu; yok etme artık idempotent, kapalı ve yeniden açılamaz. Regresyon testi eklendi.
- `ColorPicker.setLabel()` görünür etiketi değiştirirken swatch/hex/popover erişilebilir adlarını eski bırakıyordu; tüm ilişkili yüzeyler birlikte güncelleniyor ve hazır renk düğmeleri ad taşıyor.
- Showcase grid'inde dar ekranda `span:2` kartlar örtük sütunla taşabiliyor; tek sütun medya kuralı eklendi. Kart picker satırında kısa kartın uzun karta zorla gerilmesi kaldırıldı.
- Joystick eksen okuması ve kritik floating text artık i18n kaynaklarından geliyor.

## 2026-08-25 — vol-ui görsel hata avı: kök neden `box-sizing` eksikliği

Ekran görüntüleriyle bildirilen sekiz ayrı belirti tek bir kök nedene indi:
`devtools/vol-asset-studio` kendi `* { box-sizing: border-box }` sıfırlamasını
taşıyordu, oyun `UIRoot`'un `.vol-ui-root *` kuralından aynı sıfırlamayı
alıyordu — **vol-ui showcase hiçbirini almıyordu.** Sonuç: `width:100%` +
padding taşıyan her primitif (TextArea, Input, Checkbox track'i) content-box'ta
gerçek boyutun üstüne padding/border ekleyip taşıyordu.

- `devtools/vol-ui/src/styles.css`'e evrensel `* { box-sizing: border-box }`
  eklendi (Asset Studio'nun deseniyle aynı). Bu tek satır TextArea'nın sağa
  taşmasını, PropertyField içindeki Input'un taşmasını ve Checkbox thumb'ının
  track'in sağına tam yaslanmamasını (kalan `translate(20px)` → `18px`
  düzeltmesiyle birlikte) çözdü.
- `.vol-showcase-card-grid` sabit `repeat(4, minmax(0,1fr))`den
  `repeat(auto-fit, minmax(260px,1fr))`e döndü — bir dönem responsive iken
  sabit 4 sütuna değiştirilmiş, kod yorumunda eski davranış hâlâ yazılıydı.
  Pencere daralınca artık sütun sayısı azalır (4→1), kart genişliği hiç
  260px'in altına düşmez.
- **Kritik:** `ColorPicker`'ın kutucuğu `<input type="color">` idi ve
  tıklanınca TARAYICININ kendi diyaloğunu açıyordu (Firefox'ta ayrı bir "Bir
  renk seçin" penceresi — VOL temasız, fontsuz, i18n'siz). Kutucuk artık sade
  bir düğme: mevcut rengi gösterir, `swatches` verildiyse VOL'un kendi
  `Popover`'ında hazır renk ızgarasını açar. Kesin/keyfi değer her zaman
  hex alanından girilir. `.vol-card-shop__reroll-row` mekanizması dokunulmadı.
- HUD sekmesinde Minimap ↔ FloatingText yer değiştirdi; FloatingText artık
  BuildMenu'nün altında tam satır (`spanAll`).
- Workbench sekmesinde: gereksiz Toolbar+Popover demo kartı (FORMLAR'daki ikon
  buton galerisiyle örtüşüyordu) kaldırıldı; PropertyField kartı boşalan
  satırı tam kaplıyor; İkon Kaydı `width:100%` eksikliğinden sağda boş kalan
  alanı artık `auto-fill` ızgarasıyla dolduruyor; SplitPane'in görüntüleyici
  çubuğunda `.vol-button`'ın taban `width:100%`ü Sığdır/%100 düğmelerini
  `flex-basis`e çevirip ipucu metnini tek sözcüklük bir sütuna sıkıştırıyordu
  (`panel-demo__controls`daki gibi `flex:none; width:auto` eklendi).
- `ShopPicker`'ın `vol-card__action--secondary` sınıfı JS'te atanıyor ama hiç
  CSS kuralı yoktu — kilit/sat/tak butonu satın al ile birebir aynı görünüyordu.
  Ghost stil eklendi; birincil aksiyon artık görsel olarak öne çıkıyor.

Doğrulama: `pnpm high`, core/vol-ui/vol-asset-studio/vol-hell testlerinin
tamamı, dört paketin production build'i, her değişiklik canlı Playwright
ekran görüntüsüyle doğrulandı.

## 2026-08-25 — `core/visual` → `core/visualSynth` yeniden adlandırıldı

`core/visual` yalnızca prosedürel raster **sentez** motoruydu ama adı bunu
söylemiyordu — `audio/synth`'in görsel karşılığı olduğu hâlde `Synth`
isimlendirme desenini taşımıyordu (bkz. `audio/music` gibi senteze
GİRMEYEN bir kardeşi olmadığı için "visual" domain adı yanıltıcı kalıyordu;
`audio`'da bu risk yok çünkü sentez zaten kendi `synth/` alt yolunda ayrı).

Değişenler: `core/src/visual` → `core/src/visualSynth`; kök export
`Visual` → `VisualSynth`; `core/package.json`'daki `./visual*` subpath'leri
→ `./visualSynth*`; CLI script'leri `visual-asset.ts`/`visual-qa.ts` →
`visual-synth-asset.ts`/`visual-synth-qa.ts`; `core/tests/visual` →
`core/tests/visualSynth`; `visualHeadless.test.ts` →
`visualSynthHeadless.test.ts`; `primitiveNeutrality` `PRIMITIVE_ROOTS` ve
`publicSurface` `EXPECTED_VISUAL_EXPORT_COUNT` güncellendi.
`core/docs/visual-synthesis.md` içindeki tüm kod yolları eşlendi; **doküman
dosyasının kendi adı bilinçli olarak değişmedi** (doktrin adı hâlâ "görsel
sentez"). Tek dış tüketici `devtools/vol-asset-studio/src/editor/Palette.ts`
güncellendi. Fonksiyon/tip adları (`createVisualPreset`, `createVisualArtifact`
vb.) kapsam dışı bırakıldı — kullanıcı onayı yalnızca klasör/export/CLI script
adlarını kapsıyordu.

Doğrulama: `pnpm high`.

## 2026-08-25 — VOL Cursor ailesi kaldırıldı

`core/src/input/cursor/*` (20 vektörel cursor, DOM/Phaser renderer, context
entegrasyonları) ve bağımlı her yüzey — vol-ui INPUT sekmesi, Asset Studio ve
vol-hell cursor context'leri — tamamen söküldü. `publicSurface.test.ts` export
sayacı güncellendi. Doğrulama: `pnpm high` + vol-ui showcase manuel kontrolü.

## 2026-08-24 — P0/P1 ve Asset Studio lease/save düzeltmeleri

Asset Studio yazma lease'i mutation uçlarında (`audio/render`,
`save-transactions`, `delete`, `restore`) `EditorLeaseManager.assertEditor`
ile denetleniyor; `AssetStudioClient` acquire/renew/ensureLease taşıyor.
`SaveTargetRequest` gereksiz alanlarını kaybetti, boş payload ve
`transactionId` türü doğrulanıyor. Doğrulama: `pnpm high` tam geçti.

## 2026-08-24 — Asset Studio UI/UX ve ses önizleme

VOL.UI font yükleme sorunu çözüldü (`publicDir` → `core/public`). Kart
animasyon/tooltip sağlamlaştırması; sol ray butonları ortak `Tooltip`'e
taşındı. Ses editörüne 7 işlem (gain/trim/fade/normalize/reverse/clear) için
önizleme uç noktası ve istemci desteği eklendi. `MusicEngine.dispose()` durum
sıfırlama kazandı; `core/docs/music-engine.md` gerçek API'ye göre temizlendi.
Doğrulama: `pnpm high` tam geçti.

**Kalan risk:** önizleme testi sahte `URL`/blob kullanıyor; gerçek tarayıcı
performansı ayrı doğrulanmalı.

## 2026-08-23 — Asset Studio Aşama 0–9: repo-varlık aracı ayağa kalktı

`devtools/vol-asset-studio` sıfırdan kuruldu: repo hostu (LAN token, SSE
watcher, edit lease), Phaser'sız DOM editör kabuğu, tam piksel düzenleme
(katman/blend/seçim/transform, unpremultiplied RGBA), palet sistemi (CORE
renk matematiği üzerine), sprite sheet + `.volsprite.json`, türetilmiş varlık
modeli (`.volpost.json` piksel deltası — generator yeniden ürettiğinde
kullanıcının işi korunur), ses işleme (frame-doğru tarif derleyicisi, kanal
başına min/max peak piramidi), repo zekâsı (geri alınamaz `unlink` yerine
çöp alanına taşıma, referans taraması, onaysız uygulanmayan rename önizleme)
ve sertleştirme (responsive, e2e Chromium+Firefox matrisi).

Yol boyunca eski `games/vol-forge` tamamen emekliye ayrıldı (motor ve CLI
korunarak, yalnız web arayüzü söküldü — asıl çalışan yol zaten agent'ın
`SpriteDoc`u doğrudan yazıp CLI ile render/QA etmesiydi); `createForgeArtifact`
→ `createVisualArtifact`, `core/scripts/forge.ts` → `visual-synth-asset.ts`.

Kalıcı kararlardan ikisi: `[hidden] { display: none !important }` merkezi CSS
kuralı + governance testi (dağınık `[hidden]` istisnaları tekrar tekrar aynı
gizleme hatasını üretiyordu); tanımsız `--vol-*`/`--studio-*` custom property
taraması (stylelint sözdizimi geçerli olduğu için yakalamıyordu).

Doğrulama: her aşama sonunda `pnpm high` tam geçti.

## 2026-08-22/23 — Görsel sentez motoru: Tur 1–5 ve `vol-forge` editörü

`core/docs/visual-synthesis.md` §12'nin beş turu uygulandı: çekirdek iskelet
(üreteç/birleştirici/domain/filtre cebiri, D2 birim uzay, D7 tampon havuzu) →
cebiri tamamlama (döşeme, `scatter`, filtre-düğüm birleşimi, dikiş metriği) →
biçim ve stil (gölgeleme, dış çizgi, dither, palet sentezi, ölçüm metrikleri)
→ `vol-forge` editörü (Phaser'sız DOM, şemadan üretilen kontroller) → tek
ekran üretim ürünü (niyet → katalog tarifi → canlı sonuç → kaydetme; ileri
düzenleme modu ve teknik yüzey tamamen kaldırıldı).

Tur 5 denetimi, Tur 1–4'ün üç iddiasının (`domain` zinciri düzenleyicisi,
veri paleti rampa editörü, çıktı geri yükleme yüzeyi) editör tarafında hiç
uygulanmadığını doğruladı — çekirdek ve sunucu destekliyor, ileri arayüz ayrı
iş olarak kaydedildi. `vol-forge` daha sonra (Asset Studio Aşama 4) tamamen
kaldırıldı; motor ve CLI (`core/scripts/visual-synth-asset.ts`) korundu. Kalan açık
uçlar `core/docs/visual-synthesis.md` §13'te güncel tutulur.

Doğrulama: her tur `pnpm high` ile kapandı.

## 2026-08-20 — Profesyonel kod avı: ~47/63 bulgu çözüldü

6 paralel subagent + doğrulamayla derin bir bulgu taraması yapıldı. Kritik
bulgular kapatıldı: Tauri bundle `targets` eksikti (Windows nsis/msi, Android
apk eklendi), Carousel pointer listener sızıntısı, reverb `tailSeconds`
sample-rate'e bağlanmamıştı, `StateMachine` hata durumunda `current` geri
alınmıyordu. Orta/düşük öncelikli ~30 bulgu (magic number, i18n eksikleri,
listener temizliği) kapatıldı. God-object ve AGENTS.md bulguları kullanıcı
talimatıyla kapsam dışı bırakıldı; 3 bulgu yanlış pozitif doğrulanıp atlandı.

## 2026-08-18/20 — CORE'un katmanlanması, domain saflığı ve sertleştirilmesi

CORE, VOL.HELL geliştirilirken bulunamayıp sıfırdan yazılan jenerik
mekanizmaları (`SpatialGrid`, `EffectManager`, `CollisionResolver`,
`WaveManager`, vb.) üç katmanlı bir sözleşmeye oturttu: **mekanizma** (oyun
kelimesi bilmez) → **sunum** (durum çizer, kural taşımaz) → **tarif** (opt-in
kısayol — bkz. `AGENTS.md` CORE Katmanları). On dört yeni headless primitif
eklendi (`Scheduler`, `Grid`, `findPath`/`PathFinder`, `FlowField`,
`EventBus`, `SpatialIndex`, interpolasyon fonksiyonları, vb.), her biri gerçek
bir tüketiciyle (ikinci somut tüketici kuralı) doğrulandı.

Paralel olarak domain sızıntısı temizlendi: stat sözlüğü (`StatKey`) ve eylem
sözlüğü (`fire`/`dash`) CORE'dan `games/vol-hell/src/config/`e taşındı;
`InputState<TAction>` jenerik hâle geldi, tuşlar veri olarak yeniden
atanabilir oldu. Primitiflerin JSDoc'undaki "tower defense" gibi tür örnekleri
de temizlendi — bir primitif yaptığı işle anlatılır, örnek gerekiyorsa
mekanizmanın kendi terimleriyle verilir (`primitiveNeutrality` bekçisi).

Sistemik sağlamlaştırma: sonlu-sayı sözleşmesi (`math/numeric.ts`, yapılandırma
NaN/Infinity'yi reddeder, akış yoksayar), sonuç-tamponu sözleşmesi
(`queryInto` + query-stamp — `SpatialIndex.query()`'nin döngüsel tamponu
saklanan eski sonuçları sessizce bozuyordu), `ObjectPool` sahiplik takibi,
`Scheduler` yeniden-giriş koruması, `DisposableScope`'un norm hâline
getirilmesi (elle yönetilen cleanup dizileri bir bekçiyle yasaklandı),
Diagnostics'ten singleton'ın tamamen kaldırılması (taşıma katmanı ayrıldı,
CORE artık hiçbir ağ isteği açmaz), ve evrensel dokunmatik-hedef/etkileşim
politikası (`hitTargetSync.test.ts` — CSS'teki her `cursor: pointer` kuralı
token tüketir ya da gerekçeli muaf olur).

Ayrıca: menü müziği sıradan ilerlemiyordu (`MusicPlaylist` eklendi — Fisher-
Yates karıştırma, tükenince yeniden karıştırma); `ShopPicker` reroll/refresh
niyetini sezgiyle tahmin ediyordu (`ShopPickerState.transition` eklendi).
Kalite kapıları `just` ile local-first'e geçti (bulut CI yok);
`workspace-contract.mjs` ve `quality.json` paket/eşik paritesini tek kaynaktan
zorunlu kılıyor; `scripts/quality/report.mjs` kapıları makine-okunur raporlar.

Doğrulama: her alt-tur `pnpm signoff`/`pnpm high` ile kapandı; CORE public API
yüzeyi ve kapsam eşikleri kilitlendi (bkz. `core/tests/governance/
publicSurface.test.ts`, `quality.json`).

## Açık borç ve riskler

Kapatılmamış, bilinçli olarak taşınan maddeler. Kapanan bir madde bu listeden
silinir; kronolojiye not düşülmez.

**Yapı**

- `GameScene.ts` (618 satır), `SlotGrid.ts` (687 satır) ve `Kanban.ts`
  (831 satır, `core/src/ui/data/`) god-object sınırının (~600) üstünde. Kalan
  kod zaten sahnenin/bileşenin kendi sorumluluğu; daha fazla bölmek satırı
  taşır ama test edilebilirlik kazandırmaz — bilinçli olarak durduruldu.
- `SpatialIndex`in artımlı yolunun (`insert`/`remove`/`update`) üretimde
  çağıranı yok — `vol-hell` hâlâ `rebuild()` kullanıyor (birkaç yüz düşmanda
  maliyeti ölçülemez). Artımlı yol yalnızca testlerle canlı tutuluyor.
- CORE public API yüzeyi kilitli bir sayıyla büyüyor (güncel sayı
  `core/tests/governance/publicSurface.test.ts`te), 13 `export *`
  barrel'ıyla. Barrel'ları elle listeye çevirmek büyük bakım yükü getirir;
  yüzey şimdilik SAYIYLA korunuyor.
- `PlayerController` → `MovableController` takma adı hâlâ `@deprecated`
  duruyor; kaldırma bir sonraki büyük sürüme bırakıldı.
- `AGENTS.md` ve `devtools/pen.dev/AGENTS.md` `.gitignore`da — bilinçli
  tercih (agent talimatları yerelde kalır) ama bu dosyalara yapılan
  güncellemeler hiçbir commit'e girmez. Kalıcı olması gereken bir kural
  mutlaka `README.md`ye de işlenmeli.
- 14 headless primitifin çoğu (`Grid`, `findPath`, `FlowField`, `EventBus`,
  `Deck`, `SlotContainer`) üretimde henüz hiç yürümedi — yalnızca
  `SpatialIndex` `vol-hell` tarafından tüketiliyor.
- Tuşlar yeniden atanabilir durumda (`PCActionBinding` veri hâlinde) ama
  bunu oyuncuya açan bir ayar ekranı yok.
- `TouchButton` adı taşıdığı semantiği (girdi cihazından bağımsız press/hold)
  tam karşılamıyor; yeniden adlandırma bedeli (public API + showcase + i18n)
  gerekçesiyle ertelendi.

**Kalite kapıları**

- Bulut CI yok; kapılar yalnızca local `just` ile koşar, hook'lar
  `--no-verify`/`SKIP_SIMPLE_GIT_HOOKS=1` ile atlanabilir. Atlanan bir hook
  raporlanmalıdır.
- Görsel doğrulama büyük ölçüde elle yapılıyor (`pnpm dev`); tarayıcı
  otomasyonu yalnızca Asset Studio e2e'de var.
- `vol-hell`in `GameScene`/`MainMenuScene`/`SettingsScene` gibi Phaser'a
  gömülü sahneleri mock maliyeti yüksek olduğu için düşük kapsamda kalmaya
  devam ediyor — kabul edilen bir sınır (bkz. `quality.json` eşikleri).

**Oynanış / UI**

- `ShopPicker` reroll'unda eski kartlar çıkış animasyonu almadan yok
  ediliyor (yeni kartların aynı hücreye girişini engellememek için) —
  bilinçli "sert değişim" hissi.
- iOS/WKWebView MP3 fallback'i (`pnpm convert:ios`) manuel kalıyor; iOS şu
  an hedeflenmiyor (bkz. `AGENTS.md` Kimlik — Windows/Android hedefleri).
