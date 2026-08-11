<img src="./.github/assets/banners/vol-studio-horizontal-lockup-transparent-1200x400.png" alt="VOL.STUDIO" />

Cross-platform game monorepo built with Tauri v2 + Phaser 4. Produces Windows (MSI/NSIS) and Android (APK) builds from a single codebase.

[Türkçe](README.md)

## Stack

Phaser 4 · Tauri v2 (Rust) · TypeScript · Vite · pnpm workspace

## Structure

```
core/            # @volstudio/core — shared systems + DOM-based UI library
games/vol-hell/  # @volstudio/vol-hell — the game (Vite root)
games/vol-ui/    # @volstudio/vol-ui — live showcase of the core UI components
tauri-v2/        # @volstudio/tauri-v2 — native wrapper and Rust backend
```

## Requirements

- Node.js `^20.19.0` or `>=22.12.0`, pnpm >= 11.18
- Rust + Cargo, Visual Studio C++ Build Tools (Windows)
- Android Studio + SDK + NDK and Windows Developer Mode (for Android)

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

CI (`.github/workflows/ci.yml`) runs these six gates on every push and pull request:

```bash
pnpm -r typecheck                          # Typecheck all packages
pnpm -r test                               # Test all packages
pnpm lint                                  # ESLint
pnpm format:check                          # Prettier (fix with: pnpm format)
pnpm lint:css                              # Stylelint
pnpm build:game                            # Build the game
```

## License

[Apache License 2.0](LICENSE)
