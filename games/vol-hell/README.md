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

| Alan       | İçerik                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| Koşu akışı | 20 dalga × 40 sn, dalga sonu dükkân, elit (10) ve boss (20) dalgaları                                |
| Savaş      | Düşman kataloğu (rusher / swarmer / special), telegraph, elit ve boss davranışları                   |
| İlerleme   | Spark/Flux ekonomisi, seviye atlama, kart kataloğu (ability / buff / takas), dükkan reroll/kilitleme |
| Ability    | Zincir şimşek, ateş alanı, çoklu atış, kule — Q/E slotlarına takılır                                 |
| Ses        | `@volstudio/core` müzik motoru üzerinden adaptif müzik + SFX yönetimi                                |

Oynanış sayıları `src/config/` altında veri olarak durur; denge değişikliği kod değil config işidir.

## Dayanıklılık sözleşmesi

- Sahne yeniden başlatıldığında klavye tuşları, Phaser yöneticileri, DOM ekranları,
  i18n dinleyicileri, rAF/timer'lar ve async telegraph'lar açıkta kalmaz; sahip
  olan sistemlerin `destroy()`/`stopAll()` sınırı vardır.
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

| Komut                                              | Açıklama                       |
| -------------------------------------------------- | ------------------------------ |
| `pnpm --filter @volstudio/vol-hell dev`            | Vite dev server                |
| `pnpm --filter @volstudio/vol-hell build`          | Prod build                     |
| `pnpm --filter @volstudio/vol-hell preview`        | Prod build'i yerelde sun       |
| `pnpm --filter @volstudio/vol-hell typecheck`      | TypeScript doğrulama           |
| `pnpm --filter @volstudio/vol-hell test`           | Test                           |
| `pnpm --filter @volstudio/vol-hell test:coverage`  | Test + kapsam eşikleri         |
| `pnpm --filter @volstudio/vol-hell generate:audio` | Ses ve müzik asset'lerini üret |
| `pnpm --filter @volstudio/vol-hell audio:qa`       | Üretilen ses asset'lerini ölç  |

Shipped ses asset'leri (`public/assets/audio/**/*.ogg`) repoda tutulur; ses tasarımı değiştiğinde `pnpm --filter @volstudio/vol-hell generate:audio` ile yenilenir. Ara formatlar (WAV, MP3) repoda tutulmaz (bkz. [sound-synth](../../core/docs/sound-synth.md), [music-engine](../../core/docs/music-engine.md)).

## UI

vol-hell kendi UI bileşenini icat etmez; tüm arayüz bileşenleri `@volstudio/core`'dan (`core/src/ui/`) gelir. Canlı örnekler için [devtools/vol-ui](../../devtools/vol-ui/README.md)'ye bakın.

## Lisans

[Apache License 2.0](../../LICENSE)
