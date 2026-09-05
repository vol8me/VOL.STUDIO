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

## Devamı

- [DESIGN.md](DESIGN.md) — sistemler, denge, simülasyon/render sınırı, mobil ve
  grafik kalitesi kararları, dayanıklılık sözleşmesi
- [kök README](../../README.md) — monorepo geneli, kurulum, kalite kapıları

## Lisans

[Apache License 2.0](../../LICENSE)
