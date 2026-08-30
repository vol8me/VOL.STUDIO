# VOL-HELL

Dalga tabanlı taktiksel arena-survival oyunu. Bir koşu 20 dalga sürer; her dalga arasında kart seçimi ve dükkân açılır, 10. dalgada elit, 20. dalgada boss karşınıza çıkar.

[English](README.en.md)

## Yığın

Phaser 4 · TypeScript · Vite · `@volstudio/core` (paylaşılan sistemler + UI kiti)

Bu paket monorepo'nun oyun paketidir, Vite kökü de buradadır (`index.html`, `public/`). Monorepo geneli için [kök README](../../README.md)'ye bakın.

## Çalıştırma

```bash
pnpm install
pnpm --filter @volstudio/vol-hell dev
```

## Sistemler

| Alan       | İçerik                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| Koşu akışı | 20 dalga × 40 sn, dalga sonu dükkân, elit (10) ve boss (20) dalgaları                                       |
| Savaş      | Düşman kataloğu (rusher / swarmer / special), telegraph, elit ve boss davranışları                          |
| İlerleme   | Spark/Flux ekonomisi, seviye atlama, kart kataloğu (ability / buff / takas), dükkan reroll/kilitleme        |
| Ability    | Zincir şimşek, ateş alanı, çoklu atış, kule — Q/E slotlarına takılır; oyuncu hasarı/ateş temposuyla ilerler |
| Ses        | `@volstudio/core` müzik motoru üzerinden adaptif müzik + SFX yönetimi                                       |
| Mobil      | Dokunmatik ekran kontrolleri, Android geri tuşu, arka plana geçince otomatik duraklatma, titreşim           |

Oyuncu istatistikleri HUD'a eklenmez: yalnızca dalga arası shop/intermission
açıldığında görünen `StatsPanel` butonundan sağa açılan modal çekmecede gösterilir.
Çekmece küçük ekranlarda güvenli alanı gözetir, içeriği kaydırır ve oyuncu
canı/hasarı/hızı/atış temposu ile takılı yeteneklerin gerçek ölçeklenmiş
değerlerini ikonlu Q/E kategorileriyle listeler. Satın alma, satış, reroll ve
slot değişiklikleri açık çekmeceye anında yansır. Panelin scrim'i kart/dükkan
ekranlarıyla aynıdır, ekstra blur kullanmaz.

Oynanış sayıları `src/config/` altında veri olarak durur; denge değişikliği kod değil config işidir.

### Ability ilerleme dengesi

Sabit parametre taşıyan ability hasarları oyuncunun güncel `damage` stat'ını
izler; böylece zincir şimşek ve ateş alanı geç oyunda temel mermi hasarından
kopmaz. Çoklu atış zaten mermi başına oyuncu hasarını kullanır. Kule bunun
yanında oyuncu maksimum canına göre ölçeklenen bir can tavanına ve oyuncu
`fireRate`'ini izleyen iç atış temposuna sahiptir; kule canı, can takasıyla
minimum oranının altına inmez. Ability aktivasyon cooldown'ları da aynı
`fireRate` kuralıyla çalışır. Bu ortak ölçekleme `src/runtime/ability/`
altında, ayarları `src/config/abilities.ts` içinde tutulur ve regresyonlarla
kilitlidir.

### Simülasyon / render sınırı

`src/runtime/simulation/VolHellSimulation.ts` Phaser bilmeyen dalga, düşman,
ekonomi ve pickup modelidir. `VolHellSimulationDriver`, her adımda yalnızca
kopyalanmış ve salt-okunur bir render snapshot'ı porta verir; benchmark ve
uzun koşu testleri bu yüzeyi renderer kurmadan kullanır. Bu sınır üretim
Phaser yolunun tamamının yerine geçmiş değildir: etkileşimli elite/boss
kontrolcüleri ve mevcut görsel entity yöneticileri şimdilik Phaser tarafında
kalır ve ayrı cihaz smoke testine tabidir.

### Mobil / dokunmatik

`shouldUseTouchControls()` (CORE) yalnızca birincil işaretçi kaba VE hover
üretemiyorken ekran üstü kontrolleri kurar: sağ altta dash + iki yetenek
düğmesi, sağ üstte duraklatma (bkz. `GameMobileControls`, `TouchControls`).
Klavyede kenar-tetikli olan yetenek/duraklatma girdileri dokunmatikte de kenar
tetiklidir; kare durumu taşıyan `dash` ise `VirtualActionSource` üzerinden
dokunmatik joystick'in eylem kümesiyle AYNI karede birleşir — ikisi ayrı
provider olsaydı hareket ederken dash basılamazdı. Android donanım geri tuşu
`vol:androidback` olayına köprülenir (`MainActivity.kt` → `backNavigation.ts`)
ve hangi ekranın açık olduğuna göre yönlendirilir (menüde çıkış onayı, oyunda
duraklatma, kart/ölüm ekranında tüketim). Uygulama arka plana alınınca
(`observeAppVisibility`) sanal basımlar temizlenir ve oyun otomatik
duraklatılır. Titreşim (`core/src/platform/haptics.ts`) adlandırılmış
desenlerle çalışır, varsayılan açıktır ve Ayarlar'dan kapatılabilir;
desteklemeyen platformda sessizce hiçbir şey yapmaz. Ayar YETENEĞE bağlıdır:
masaüstünde `navigator.vibrate` bulunmadığı için titreşim ancak bağlı bir oyun
kolunun rumble motoruyla mümkündür, o yüzden kol yokken kutu pasiftir ve kol
takıldığı anda canlı olarak etkinleşir (bkz. `observeHapticsCapability`).

Görüntü ayarları (ekran modu, pencere çözünürlüğü, grafik kalitesi) yalnız
dokunmatik OLMAYAN yüzeylerde gösterilir. **Pencere çözünürlüğü ayrıca native
bir pencere gerektirir** (`hasNativeWindow()`): tarayıcıda oynanan masaüstü
sürümünde pencereyi yeniden boyutlandıracak bir API yoktur, bu yüzden kontrol
devre dışıdır — etkin bırakılsa kullanıcı değeri değiştirir, değer kaydedilir
ve hiçbir şey olmazdı. Grafik kalitesi hem render DPR'ını hem partikül
yoğunluğunu CANLI değiştirir; DPR sağlayıcısı `bootstrap`ten geçer, kalite
profilleri `src/config/video.ts`te veridir.

### Grafik kalitesi

İki kademe vardır ve aralarındaki fark ÖLÇÜLEBİLİR:

| Knob                        | Yüksek | Düşük                        |
| --------------------------- | ------ | ---------------------------- |
| Rasterleme ölçeği           | 1.0    | 0.7 (**piksellerin ~%49'u**) |
| DPR tavanı                  | 2      | 1                            |
| Partikül sayısı             | ×1     | ×0.35                        |
| Partikül ömrü               | ×1     | ×0.6                         |
| Mermi izleri                | açık   | kapalı                       |
| Varlık kenar çizgileri      | açık   | kapalı                       |
| Saha göstergeleri           | açık   | kapalı                       |
| DOM `backdrop-filter`/gölge | açık   | kapalı                       |

En ağır kaldıraç rasterleme ölçeğidir. **Dünya boyutunu DEĞİŞTİRMEZ**: kamera
aynı çarpanla yakınlaştırıldığı için arena ve hızlar sabit kalır, fark yalnız
netliktir (bkz. `core/docs/primitives.md`). Bu ayrım aynı zamanda eski bir
tutarsızlığı kapatır — dünya eskiden cihaz pikseliydi ve 2x bir ekranda arena
%50 daha geniş oluyordu, yani kalite ayarı sessizce oynanışı değiştiriyordu.

Kademeler `src/config/video.ts` içinde VERİdir; mekanizma CORE
`GraphicsQuality`dedir ve oyuna özgü hiçbir knob CORE'da yaşamaz.

Masaüstü ve Tauri WebView'da F11 tam ekranı açıp kapatır; aynı akış CORE
`FullscreenController` üzerinden Phaser canvas + DOM kökünü birlikte kapsar.
Tarayıcı F11'i kendi penceresine ayırıyorsa uygulama olayı almaz ve tarayıcının
yerel davranışı korunur.

## Simülasyon zamanı

Render frame süresi `SimulationClock` üzerinden sabit adımlara bölünür
(`src/runtime/simulation/SimulationClock.ts`). Politika tek yerde durur ve
Phaser kurmadan test edilir: düşük FPS'te birden çok tam adımla gerçek zaman
geri kazanılır, sekme dönüşü gibi devasa delta'larda catch-up sınırı uygulanır
ve ATILAN süre raporlanır.

**Bilinen sınır:** 60 FPS üstünde girdi tepkisini bir kare geciktirmemek için
artık dilim değişken uzunlukta bir adım olarak koşulur. Bu, aynı girdinin
farklı render hızlarında farklı sonuç vermesi demektir — simülasyon henüz TAM
deterministik değil. Kaldırmak oynanış hissini değiştirir (16 ms'e kadar girdi
gecikmesi) ve render tarafında interpolasyon ister; ayrı bir tur olarak planlı.

## Dayanıklılık sözleşmesi

- Ayar yazımı başarısız olursa SESSİZ KALMAZ: `settingsPersistence` hatayı
  konsola, `diagnostics` olay akışına (`settingsPersistFailed`) ve abone olan
  UI'a birlikte taşır. Çalışma anında uygulanmış görünüp diske yazılamayan bir
  ayar, oyuncu uygulamayı kapatana kadar fark edilmezdi.
- Menü müziği kısmi yükleme başarısına dayanıklıdır: bozuk parça atlanır,
  geçici hata sonraki girişte yeniden denenir (bkz. `app/menuMusic.ts`).
- Ölüm müziği YÜKLENMİŞ adaylar arasından seçilir; hiç bilinen yoksa yine de
  denenir ve motor hatayı yutar.

- Sahne yeniden başlatıldığında klavye tuşları, Phaser yöneticileri, DOM ekranları,
  i18n dinleyicileri, rAF/timer'lar ve async telegraph'lar açıkta kalmaz; sahip
  olan sistemlerin `destroy()`/`stopAll()` sınırı vardır.
- Koşu bitişi (zafer/yenilgi) bir kuşak (generation) sayacıyla korunur: restart
  sonrası dönen eski bir istatistik-gönderim sonucu yeni koşunun üstüne özet
  ekranı açamaz.
- Runtime girişlerinde `NaN`, `Infinity`, negatif delta, geçersiz yön ve bozuk
  sayaç değerleri reddedilir veya güvenli sınıra doyurulur. Skor, ekonomi,
  can, cooldown ve ses parametreleri sonlu kalır.
- Ses ayarları debounce edilmiş yazmaları sıralı snapshot'larla persist eder;
  `flush()` devam eden yazmayı bekler. SFX yüklemesi sahne kapanınca cache'i
  yeniden canlandıramaz; oyun müziği de eski sahne yüklemesinden korunur.
- Kart etkileri planla/commit/rollback sınırında uygulanır; dışarı verilen
  envanter listesi iç diziyi mutasyona açmaz.

Bu sözleşme ağ geçidi değildir: gerçek tarayıcı Web Audio davranışı, Phaser
renderer/cihaz performansı ve uzun süreli gerçek oyun oturumu ayrıca manuel
smoke test gerektirir.

## Komutlar

| Komut                                                    | Açıklama                        |
| -------------------------------------------------------- | ------------------------------- |
| `pnpm --filter @volstudio/vol-hell dev`                  | Vite dev server                 |
| `pnpm --filter @volstudio/vol-hell build`                | Prod build                      |
| `pnpm --filter @volstudio/vol-hell preview`              | Prod build'i yerelde sun        |
| `pnpm --filter @volstudio/vol-hell typecheck`            | TypeScript doğrulama            |
| `pnpm --filter @volstudio/vol-hell test`                 | Test                            |
| `pnpm --filter @volstudio/vol-hell test:coverage`        | Test + kapsam eşikleri          |
| `pnpm --filter @volstudio/vol-hell benchmark:simulation` | Headless simülasyon benchmark'ı |
| `pnpm --filter @volstudio/vol-hell generate:audio`       | Ses ve müzik asset'lerini üret  |
| `pnpm --filter @volstudio/vol-hell audio:qa`             | Üretilen ses asset'lerini ölç   |

Shipped ses asset'leri (`public/assets/audio/**/*.ogg`) repoda tutulur; ses tasarımı değiştiğinde `pnpm --filter @volstudio/vol-hell generate:audio` ile yenilenir. Ara formatlar (WAV, MP3) repoda tutulmaz (bkz. [sound-synth](../../devtools/audio-synth/DESIGN.md), [music-engine](../../core/docs/music-engine.md)).

## UI

vol-hell kendi UI bileşenini icat etmez; tüm arayüz bileşenleri `@volstudio/core`'dan (`core/src/ui/`) gelir. Canlı örnekler için [devtools/vol-ui](../../devtools/vol-ui/README.md)'ye bakın.

## Lisans

[Apache License 2.0](../../LICENSE)
