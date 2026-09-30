<img src="./docs/assets/banners/vol-studio-horizontal-lockup-transparent-1200x400.png" alt="VOL.STUDIO" />

Cross-platform monorepo bringing a Tauri v2 + Phaser 4 game runtime and
web-based developer tools into one workspace.

[Türkçe](README.md) · [Quality gates](docs/gates.md) · [Linux](docs/linux.md) · [Steam Deck](docs/steam-deck.md) · [Android](docs/android.md)

## Layout

```
core/                   # engine and DOM UI catalogue (@volstudio/core)
tauri-v2/               # shared native shell and plugins; not an app
devtools/audio-synth/   # deterministic sound and music generation
devtools/deck/          # Steam Deck probe and devkit automation
devtools/pen.dev/       # rig export from Pencil source
devtools/vol-ui/        # CORE UI showcase and visual contract
docs/                   # gates, platforms, new game guide
scripts/                # quality gates, Linux packaging, device measurement
```

There is no game in the tree today; a new game is set up under
`games/<game>/` following [docs/new-game.md](docs/new-game.md).

## Requirements

Node.js `^20.19.0` or `>=22.12.0` · pnpm >= 11.18 · Rust + Cargo ·
Android Studio (SDK + NDK) for Android · Visual Studio C++ Build Tools on
Windows. `pnpm run doctor:env` checks all of them.

## Commands

```bash
pnpm install
pnpm dev                 # dev servers of active packages
pnpm exec just dev-ui    # UI showcase

pnpm quick               # pre-commit gate
pnpm high                # pre-push gate
pnpm signoff             # release gate
pnpm exec just --list    # every recipe
```

## Where to look

| Topic                        | Location                                                     |
| ---------------------------- | ------------------------------------------------------------ |
| Working contract             | [AGENTS.md](AGENTS.md)                                       |
| CORE primitives, i18n, audio | [core/docs](core/docs)                                       |
| Phaser boundary              | [core/docs/phaser-boundary.md](core/docs/phaser-boundary.md) |
| New game package             | [docs/new-game.md](docs/new-game.md)                         |
| Sound generation             | [devtools/audio-synth](devtools/audio-synth/README.md)       |
| Work list                    | [TODO.md](TODO.md)                                           |

## License

[Apache License 2.0](LICENSE)
