# VOL-HELL

Erken iskelet aşamasında bir Phaser oyunu. Henüz oynanabilir değil.

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

| Komut                                         | Açıklama             |
| --------------------------------------------- | -------------------- |
| `pnpm --filter @volstudio/vol-hell dev`       | Vite dev server      |
| `pnpm --filter @volstudio/vol-hell build`     | Prod build           |
| `pnpm --filter @volstudio/vol-hell typecheck` | TypeScript doğrulama |

## UI

vol-hell kendi UI bileşenini icat etmez; tüm arayüz bileşenleri `@volstudio/core`'dan (`core/src/ui/`) gelir. Canlı örnekler için [games/vol-ui](../vol-ui/README.md)'ye bakın.

## Lisans

[Apache License 2.0](../../LICENSE)
