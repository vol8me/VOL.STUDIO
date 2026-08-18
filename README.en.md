<img src="./.github/assets/banners/vol-studio-horizontal-lockup-transparent-1200x400.png" alt="VOL.STUDIO" />

Cross-platform game monorepo built with Tauri v2 + Phaser 4.

[Türkçe](README.md)

## Stack

Phaser 4 · Tauri v2 (Rust) · TypeScript · Vite · pnpm workspace

## Structure

```
core/            # @volstudio/core — shared systems + DOM-based UI library
games/vol-hell/  # @volstudio/vol-hell — the game (Vite root)
games/vol-ui/    # @volstudio/vol-ui — live showcase of the core UI components
games/design/    # @volstudio/design — Pencil design source, export pipeline and rig assembly
tauri-v2/        # @volstudio/tauri-v2 — native wrapper and Rust backend
```

Documentation surface: [core/docs](core/docs) (i18n, audio/music engines) and [games/docs](games/docs) (game i18n).

## Requirements

- Node.js `^20.19.0` or `>=22.12.0`, pnpm >= 11.18
- Rust + Cargo, Visual Studio C++ Build Tools (Windows)
- Android Studio + SDK + NDK

## Commands

```bash
pnpm install
pnpm dev                                   # Vite dev server (browser only)
pnpm --filter @volstudio/vol-ui dev        # UI component showcase
pnpm tauri:dev                             # PC Tauri dev
pnpm build:game                            # Build the game
pnpm build:tauri                           # Build PC installers
```

### Verification

Quality gates run locally via `just`. There is no CI runner; GitHub is used only for source control, pull requests and releases.

| Level           | Command                      | What it runs                                  |
| --------------- | ---------------------------- | --------------------------------------------- |
| Pre-commit      | `pnpm fast`                  | format, typecheck, lint, test                 |
| Pre-push        | `pnpm high`                  | fast + CSS lint + coverage thresholds + build |
| Release/signoff | `pnpm signoff`               | high + cargo check/fmt/clippy                 |
| Long build      | `pnpm exec just tauri-build` | game build + Tauri prod build (manual)        |
| Environment     | `pnpm run doctor:env`        | Node, pnpm, Rust, just, FFmpeg, Tauri deps    |

The `pre-commit` → `pnpm fast` and `pre-push` → `pnpm high` hooks are installed during `pnpm install`; set `SKIP_SIMPLE_GIT_HOOKS=1` to bypass them.

The `just` binary lands in `node_modules/.bin` and is not on the global `PATH` — use `pnpm fast` or `pnpm exec just fast`, not a bare `just fast`. For single gates (`typecheck`, `lint`, `coverage`, `rust`, `test-pkg <package>` …): `pnpm exec just --list`.

## License

[Apache License 2.0](LICENSE)
