<img src="./.github/assets/banners/vol-studio-horizontal-lockup-transparent-1200x400.png" alt="VOL.STUDIO" />

Cross-platform monorepo combining a Tauri v2 + Phaser 4 game runtime with
browser-based developer tools in one workspace.

[Türkçe](README.md)

## Stack

Phaser 4 · Tauri v2 (Rust) · TypeScript · Vite · pnpm workspace

## Structure

```
core/                       # @volstudio/core — shared systems + DOM UI library
games/vol-hell/             # @volstudio/vol-hell — the game (Vite root)
devtools/pen.dev/          # @volstudio/pen.dev — Pencil source, export pipeline and rig assembly
devtools/vol-ui/            # @volstudio/vol-ui — live CORE UI component catalog
devtools/vol-asset-studio/  # @volstudio/vol-asset-studio — repository asset workbench
devtools/visual-synth/      # @volstudio/visual-synth — deterministic visual asset compiler
devtools/audio-synth/       # @volstudio/audio-synth — deterministic audio asset compiler
tauri-v2/                   # @volstudio/tauri-v2 — native game wrapper and Rust backend
```

Documentation lives in [core/docs](core/docs) (i18n, audio/music engines, CORE
primitives), [games/docs](games/docs) (game i18n), and each relevant
`devtools/<package>/README.md`.

## Requirements

- Node.js `^20.19.0` or `>=22.12.0`, pnpm >= 11.18
- Rust + Cargo, Visual Studio C++ Build Tools (Windows)
- Android Studio + SDK + NDK

## Commands

```bash
pnpm install
pnpm dev                                   # game + two developer tools
pnpm --filter @volstudio/vol-hell dev      # game only               :5173
pnpm --filter @volstudio/vol-ui dev        # UI showcase only        :5174
pnpm --filter @volstudio/vol-asset-studio dev # Asset Studio only    :5175
pnpm tauri:dev                             # PC Tauri dev
pnpm build:game                            # Build the game
pnpm build:tauri                           # Build PC installers
pnpm tauri:android:dev                     # Android dev (connected device/emulator)
pnpm benchmark:core                        # Measure CORE headless workloads
pnpm benchmark:vol-hell                    # Measure VOL.HELL simulation/render
```

### Android

The native project under `tauri-v2/src-tauri/gen/android` is **kept in version
control** (it is not reproducible): orientation lock, display-cutout layout and
immersive fullscreen cannot be expressed in Tauri's configuration, so
`AndroidManifest.xml`, the theme and `MainActivity.kt` are hand-edited.

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/<version>"
export JAVA_HOME=<JDK 17>
rustup target add aarch64-linux-android    # for devices; emulators need x86_64

pnpm --filter @volstudio/tauri-v2 exec tauri android build --debug --target aarch64
adb install -r tauri-v2/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

The game is locked to landscape, system bars are hidden, and safe-area insets
(`env(safe-area-inset-*)`) are applied to HUD placement. On-screen controls are
mounted only on touch-primary devices (`shouldUseTouchControls`).

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

Benchmark commands do not impose machine-specific performance thresholds; they
measure median/p95 step cost for CORE mechanisms and VOL.HELL's renderer-free
simulation. For the corresponding just recipes, use
`pnpm exec just benchmark-core` and `pnpm exec just benchmark-vol-hell`.

The `pre-commit` → `pnpm quick` and `pre-push` → `pnpm high` hooks are installed during `pnpm install`; set `SKIP_SIMPLE_GIT_HOOKS=1` to bypass them. Tests are deliberately deferred to push — use `pnpm fast` for the quick gate including tests.

Gates derive from the workspace: a new package is never wired into a gate by
hand — `pnpm -r` and repo-wide globs pick it up automatically.
`scripts/workspace-contract.mjs` enforces this on every commit: a package cannot
enter the repo without `test`/`test:coverage` scripts and coverage thresholds.

The `:env` suffix is not incidental: `pnpm doctor` is pnpm's OWN diagnostic
command and silently shadows a script of the same name — the script never runs.
A gate test rejects script names that collide with pnpm builtins.

Coverage thresholds live in the root `quality.json`; package `vitest.config.ts`
files read it and the guard reads the same file, so the two cannot drift.
Writing a threshold inline in a config breaks the gate. The file is schema
validated on every read (`scripts/quality/config.mjs`), so a typo yields a
single message that says where to look.

The `just` binary lands in `node_modules/.bin` and is not on the global `PATH` — use `pnpm fast` or `pnpm exec just fast`, not a bare `just fast`. For single gates (`typecheck`, `lint`, `coverage`, `rust`, `test-pkg <package>` …): `pnpm exec just --list`.

## License

[Apache License 2.0](LICENSE)
