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
games/vol-forge/ # @volstudio/vol-forge — single-screen recipe/catalog visual generator
games/design/    # @volstudio/design — Pencil design source, export pipeline and rig assembly
tauri-v2/        # @volstudio/tauri-v2 — native wrapper and Rust backend
```

Documentation surface: [core/docs](core/docs) (i18n, audio/music engines, CORE primitives) and [games/docs](games/docs) (game i18n).

## Requirements

- Node.js `^20.19.0` or `>=22.12.0`, pnpm >= 11.18
- Rust + Cargo, Visual Studio C++ Build Tools (Windows)
- Android Studio + SDK + NDK

## Commands

```bash
pnpm install
pnpm dev                                   # all three dev servers (5173/5174/5175)
pnpm --filter @volstudio/vol-hell dev      # game only               :5173
pnpm --filter @volstudio/vol-ui dev        # UI showcase only        :5174
pnpm --filter @volstudio/vol-forge dev     # visual generator only   :5175
pnpm tauri:dev                             # PC Tauri dev
pnpm build:game                            # Build the game
pnpm build:tauri                           # Build PC installers
```

### Verification

Quality gates run locally via `just`. There is no CI runner; GitHub is used only for source control, pull requests and releases.

| Level           | Command                      | What it runs                                               |
| --------------- | ---------------------------- | ---------------------------------------------------------- |
| Pre-commit      | `pnpm quick`                 | contract, format, typecheck, lint (~45 s)                  |
| Pre-push        | `pnpm high`                  | quick + CSS lint + coverage thresholds + all builds        |
| Release/signoff | `pnpm signoff`               | high + cargo check/fmt/clippy                              |
| Long build      | `pnpm exec just tauri-build` | game build + Tauri prod build (manual)                     |
| Environment     | `pnpm run doctor:env`        | Node, pnpm, Rust, just, FFmpeg, Tauri deps                 |
| Report          | `pnpm exec just report high` | Runs a gate and reports the result structurally (`--json`) |

The `pre-commit` → `pnpm quick` and `pre-push` → `pnpm high` hooks are installed during `pnpm install`; set `SKIP_SIMPLE_GIT_HOOKS=1` to bypass them. Tests are deliberately deferred to push — use `pnpm fast` for the quick gate including tests.

Gates derive from the workspace: a new package is never wired into a gate by
hand — `pnpm -r` and repo-wide globs pick it up automatically.
`scripts/workspace-contract.mjs` enforces this on every commit: a package cannot
enter the repo without `test`/`test:coverage` scripts and coverage thresholds.

The `:env` suffix is not incidental: `pnpm doctor` is pnpm's OWN diagnostic
command and silently shadows a script of the same name — the script never runs.
A gate test rejects script names that collide with pnpm builtins.

Coverage thresholds live in the root `quality.json`; all five `vitest.config.ts`
files read it and the guard reads the same file, so the two cannot drift.
Writing a threshold inline in a config breaks the gate. The file is schema
validated on every read (`scripts/quality/config.mjs`), so a typo yields a
single message that says where to look.

The `just` binary lands in `node_modules/.bin` and is not on the global `PATH` — use `pnpm fast` or `pnpm exec just fast`, not a bare `just fast`. For single gates (`typecheck`, `lint`, `coverage`, `rust`, `test-pkg <package>` …): `pnpm exec just --list`.

## License

[Apache License 2.0](LICENSE)
