<img src="./.github/assets/banners/vol-studio-horizontal-lockup-transparent-1200x400.png" alt="VOL.STUDIO" />

Tauri v2 + Phaser 4 oyun runtime'ı ile web tabanlı geliştirici araçlarını aynı
çalışma alanında buluşturan çapraz platform monorepo.

[English](README.en.md) · [Kalite kapıları](docs/gates.md) · [Android](docs/android.md)

## Yığın

Phaser 4 · Tauri v2 (Rust) · TypeScript · Vite · pnpm workspace

## Yapı

```
core/                       # paylaşılan sistemler + DOM UI kütüphanesi
games/vol-hell/             # oyun (Vite kökü)
games/vol-arachnid/         # eklemli örümcek arena dikey kesiti
devtools/pen.dev/           # Pencil kaynağı, export hattı ve gönderim aracı
devtools/vol-ui/            # CORE UI canlı bileşen kataloğu
devtools/vol-asset-studio/  # repo varlık çalışma ortamı
devtools/visual-synth/      # deterministik görsel asset compiler'ı
devtools/audio-synth/       # deterministik ses asset compiler'ı
tauri-v2/                   # native oyun kabuğu ve Rust backend
```

## Gereksinimler

Node.js `^20.19.0` veya `>=22.12.0` · pnpm >= 11.18 · Rust + Cargo ·
Android Studio (SDK + NDK) · Windows'ta Visual Studio C++ Build Tools

`pnpm run doctor:env` hepsini kontrol eder.

## Komutlar

```bash
pnpm install
pnpm dev                                       # iki oyun + iki geliştirici aracı
pnpm --filter @volstudio/vol-hell dev          # :5173
pnpm --filter @volstudio/vol-arachnid dev      # :5178
pnpm --filter @volstudio/vol-ui dev            # UI showcase  :5174
pnpm --filter @volstudio/vol-asset-studio dev  # Asset Studio :5175

pnpm quick                                     # commit öncesi kapı
pnpm high                                      # push öncesi kapı
pnpm signoff                                   # release kapısı
```

Build ve Android tarifleri için [docs/android.md](docs/android.md), kapıların
ne yaptığı için [docs/gates.md](docs/gates.md). Tüm tarifler:
`pnpm exec just --list`.

## Nereye bakmalı

| Konu                              | Yer                                                          |
| --------------------------------- | ------------------------------------------------------------ |
| CORE primitifleri, i18n, ses      | [core/docs](core/docs)                                       |
| Phaser sınırı: katman mı motor mu | [core/docs/phaser-boundary.md](core/docs/phaser-boundary.md) |
| Yeni oyun paketi eklemek          | [games/docs/new-game.md](games/docs/new-game.md)             |
| Açık borç ve kabul edilmiş sınır  | [TODO.md](TODO.md)                                           |

## Lisans

[Apache License 2.0](LICENSE)
