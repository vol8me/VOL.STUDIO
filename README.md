<img src="./.github/assets/banners/vol-studio-horizontal-lockup-transparent-1200x400.png" alt="VOL.STUDIO" />

Tauri v2 + Phaser 4 oyun çalışma zamanı ile web tabanlı geliştirici araçlarını
aynı çalışma alanında buluşturan çapraz platform monorepo.

[English](README.en.md) · [Kalite kapıları](docs/gates.md) · [Linux](docs/linux.md) · [Steam Deck](docs/steam-deck.md) · [Android](docs/android.md)

## Yapı

```
core/                   # motor ve DOM UI kataloğu (@volstudio/core)
tauri-v2/               # paylaşılan native kabuk ve eklentiler; uygulama değildir
devtools/audio-synth/   # deterministik ses ve müzik üretimi
devtools/deck-probe/    # Steam Deck ölçüm sondası
devtools/pen.dev/       # Pencil kaynağından rig export'u
devtools/vol-ui/        # CORE UI vitrini ve görsel sözleşmesi
docs/                   # kapılar, platformlar, yeni oyun rehberi
scripts/                # kalite kapıları, Linux paketleme, cihaz ölçümü
```

Bugün ağaçta oyun yoktur; yeni oyun `games/<oyun>/` altına
[docs/new-game.md](docs/new-game.md) ile kurulur.

## Gereksinimler

Node.js `^20.19.0` veya `>=22.12.0` · pnpm >= 11.18 · Rust + Cargo ·
Android için Android Studio (SDK + NDK) · Windows'ta Visual Studio C++ Build
Tools. `pnpm run doctor:env` hepsini denetler.

## Komutlar

```bash
pnpm install
pnpm dev                 # aktif paketlerin geliştirme sunucuları
pnpm exec just dev-ui    # UI vitrini

pnpm quick               # commit öncesi kapı
pnpm high                # push öncesi kapı
pnpm signoff             # sürüm kapısı
pnpm exec just --list    # tüm tarifler
```

## Nereye bakmalı

| Konu                         | Yer                                                          |
| ---------------------------- | ------------------------------------------------------------ |
| Çalışma sözleşmesi           | [AGENTS.md](AGENTS.md)                                       |
| CORE primitifleri, i18n, ses | [core/docs](core/docs)                                       |
| Phaser sınırı                | [core/docs/phaser-boundary.md](core/docs/phaser-boundary.md) |
| Yeni oyun paketi             | [docs/new-game.md](docs/new-game.md)                         |
| Ses üretimi                  | [devtools/audio-synth](devtools/audio-synth/README.md)       |
| İş listesi                   | [TODO.md](TODO.md)                                           |

## Lisans

[Apache License 2.0](LICENSE)
