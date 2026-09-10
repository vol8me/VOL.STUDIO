<img src="./.github/assets/banners/vol-studio-horizontal-lockup-transparent-1200x400.png" alt="VOL.STUDIO" />

Cross-platform monorepo bringing a Tauri v2 + Phaser 4 game runtime and
web-based developer tools into one workspace.

[Türkçe](README.md) · [Quality gates](docs/gates.md) · [Android](docs/android.md)

## Stack

Phaser 4 · Tauri v2 (Rust) · TypeScript · Vite · pnpm workspace

## Layout

```
core/                       # shared systems + DOM UI library
games/vol-hell/             # game (Vite root)
games/vol-arachnid/         # articulated spider arena vertical slice
games/vol-life/             # observed artificial world — groundwork stage
devtools/pen.dev/           # Pencil source, export pipeline and sync tool
devtools/vol-ui/            # live component catalogue for CORE UI
devtools/vol-asset-studio/  # repository asset workspace
devtools/visual-synth/      # deterministic visual asset compiler
devtools/audio-synth/       # deterministic audio asset compiler
tauri-v2/                   # SHARED native shell (not an app); each game carries its own src-tauri
```

## Requirements

Node.js `^20.19.0` or `>=22.12.0` · pnpm >= 11.18 · Rust + Cargo ·
Android Studio (SDK + NDK) · Visual Studio C++ Build Tools on Windows

`pnpm run doctor:env` checks all of them.

## Commands

```bash
pnpm install
pnpm dev                                       # vol-hell + vol-arachnid + vol-life + both dev tools
pnpm --filter @volstudio/vol-hell dev          # :5173
pnpm --filter @volstudio/vol-arachnid dev      # :5178
pnpm --filter @volstudio/vol-life dev          # :5180
pnpm --filter @volstudio/vol-ui dev            # UI showcase  :5174
pnpm --filter @volstudio/vol-asset-studio dev  # Asset Studio :5175

pnpm quick                                     # pre-commit gate
pnpm high                                      # pre-push gate
pnpm signoff                                   # release gate
```

Build and Android recipes in [docs/android.md](docs/android.md); what the gates
do in [docs/gates.md](docs/gates.md). Every recipe: `pnpm exec just --list`.

## Where to look

| Topic                            | Location                                                     |
| -------------------------------- | ------------------------------------------------------------ |
| CORE primitives, i18n, audio     | [core/docs](core/docs)                                       |
| Phaser boundary: layer or engine | [core/docs/phaser-boundary.md](core/docs/phaser-boundary.md) |
| Adding a new game package        | [games/docs/new-game.md](games/docs/new-game.md)             |
| Open debt and accepted limits    | [TODO.md](TODO.md)                                           |

## License

[Apache License 2.0](LICENSE)
