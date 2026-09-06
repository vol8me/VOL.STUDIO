# VOL.STUDIO — Açık borç kaydı

Bu dosya bir günlük değildir. **Yalnızca kapatılmamış, bilinçli olarak taşınan
maddeleri** tutar: her madde ne olduğunu, neden açık bırakıldığını ve kapanması
için neyin gerektiğini söyler. Bir madde kapandığında buradan **silinir** —
yerine not düşülmez, çünkü ne yapıldığının kaydı commit'in kendisidir.

Tamamlanmış turların dökümü `git log`dadır. Kalıcı kararlar bu dosyada değil,
ait oldukları belgede yaşar: [core/docs](core/docs),
[docs/gates.md](docs/gates.md), paketlerin `DESIGN.md` dosyaları.

## Yapı

- **God-object sınırının üstünde üç dosya.** `GameScene.ts` (618),
  `SlotGrid.ts` (687), `core/src/ui/data/Kanban.ts` (831) ~600 satır
  duraksama eşiğinin üstünde ve `scripts/quality/sourceSize.mjs` içinde
  gerekçeli muafiyet taşıyor. Kalan kod sahnenin/bileşenin kendi
  sorumluluğu; daha fazla bölmek satırı taşır, test edilebilirlik
  kazandırmaz. Kapanması için sorumluluğun gerçekten ikiye ayrıldığı bir
  kullanım gerekir, satır sayısı değil.

- **`SpatialIndex` iki yolda farklı çalışıyor.** Artımlı yol
  renderer-neutral `VolHellSimulation` içinde; Phaser `GameScene` aynı frame
  snapshot'ını ve separation sırasını korumak için hâlâ `rebuild()`
  kullanıyor. Kapanması için iki hareket fazının davranış eşitliğini kanıtlayan
  bir entegrasyon testi ve cihaz benchmark'ı gerekir.

- **CORE yüzeyi sayıyla korunuyor, listeyle değil.** 10 `export *` barrel'ı
  var; kilitli sayı `core/tests/governance/publicSurface.test.ts`te. Barrel'ları
  elle listeye çevirmenin bakım yükü, sayının verdiği korumadan büyük.

- **`PlayerController` → `MovableController` takma adı `@deprecated`.**
  Kaldırma bir sonraki büyük sürüme bırakıldı.

- **Bazı CORE primitiflerinin ikinci gerçek tüketicisi yok.** `EventBus`,
  `Deck`, `SlotContainer`, `FlowField` benchmark/workload'da tüketiliyor ama
  ikinci bir üründe değil. Mekanizma doğrulaması ayrı, entegrasyon borcu ayrı.

- **`TouchButton` adı semantiğini karşılamıyor** (girdi cihazından bağımsız
  press/hold). Yeniden adlandırma bedeli public API + showcase + i18n olduğu
  için ertelendi.

- **Bellek tahmini modeli 5–31 kat düşük ölçüyor.**
  `analyzeSpriteDoc().estimatedPeakWorkingBytes` kendini `conservative` diye
  etiketliyor ama 128² belgelerde gerçek yığın artışı tahminin ~5–31 katı
  çıktı (`devtools/visual-synth/tests/memoryEstimateAccuracy.test.ts`). Kök
  neden kanıtlanmadı; en olası açıklama tamponsuz düğümlerin de ara dizi
  ayırıyor olması. Formül, hangi tarafın yanlış olduğu kanıtlanmadan
  değiştirilmiyor — değiştirmek `RenderCache`/tile kararlarını sessizce
  bozardı. Test bugünkü tavanı kilitliyor, yani sapma büyürse görülür.

## Kalite kapıları

- **Bulut CI yok** (bilinçli). Kapılar yalnız yerel `just` ile koşar ve
  hook'lar `--no-verify` / `SKIP_SIMPLE_GIT_HOOKS=1` ile atlanabilir. Atlanan
  bir hook raporlanmalıdır.

- **Görsel doğrulama iki uçlu.** `devtools/vol-ui` piksel temelli kapıya
  sahip; `games/*` sahneleri hâlâ elle (`pnpm dev`) doğrulanıyor.

- **Phaser sahneleri düşük kapsamda.** `GameScene`/`MainMenuScene`/
  `SettingsScene` mock maliyeti yüksek olduğu için kabul edilmiş bir sınırda
  duruyor; eşikler `quality.json`da.

## Oynanış / UI

- **20 dalgalık manuel smoke testi hâlâ gerekli.** Ability ölçeklemesi ve kule
  dayanıklılık/tempo bağı regresyon testinde; hedefleme, alan kapsaması ve
  gerçek cihaz FPS'i matematiksel benchmark'ta temsil edilmiyor.

- **`ShopPicker` reroll'unda çıkış animasyonu yok** — yeni kartların aynı
  hücreye girişini engellememek için bilinçli "sert değişim" hissi.

- **iOS/WKWebView MP3 fallback'i manuel** (`pnpm convert:ios`). iOS bugün
  hedeflenmiyor; hedefler Windows ve Android.
