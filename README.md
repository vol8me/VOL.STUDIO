<img src="./.github/assets/banners/vol-studio-horizontal-lockup-transparent-1200x400.png" alt="VOL.STUDIO" />

Tauri v2 + Phaser 4 ile geliştirilen çapraz platform oyun monoreposu. Tek kod tabanından Windows (MSI/NSIS) ve Android (APK) çıktısı üretir.

[English](README.en.md)

## Yığın

Phaser 4 · Tauri v2 (Rust) · TypeScript · Vite · pnpm workspace

## Yapı

```
core/            # @volstudio/core — paylaşılan sistemler + DOM tabanlı UI kütüphanesi
games/vol-hell/  # @volstudio/vol-hell — oyun (Vite kökü)
games/vol-ui/    # @volstudio/vol-ui — core UI component'lerinin canlı showcase'i
tauri-v2/        # @volstudio/tauri-v2 — native wrapper ve Rust backend
```

## Gereksinimler

- Node.js `^20.19.0` veya `>=22.12.0`, pnpm >= 11.18
- Rust + Cargo, Visual Studio C++ Build Tools (Windows)
- Android Studio + SDK + NDK ve Windows Geliştirici Modu (Android için)

## Komutlar

```bash
pnpm install
pnpm dev                                   # Vite dev server (yalnızca tarayıcı)
pnpm --filter @volstudio/vol-ui dev        # UI component showcase'i
pnpm tauri:dev                             # PC Tauri dev
pnpm build:game                            # Oyun build
pnpm build:tauri                           # PC installer build
```

### Doğrulama

CI (`.github/workflows/ci.yml`) her push ve PR'da bu altı kapıyı koşar:

```bash
pnpm -r typecheck                          # Tüm paketlerde TS doğrulama
pnpm -r test                               # Tüm paketlerde test
pnpm lint                                  # ESLint
pnpm format:check                          # Prettier (düzeltmek için: pnpm format)
pnpm lint:css                              # Stylelint
pnpm build:game                            # Oyun build
```

## Lisans

[Apache License 2.0](LICENSE)
