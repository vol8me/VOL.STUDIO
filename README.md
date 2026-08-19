<img src="./.github/assets/banners/vol-studio-horizontal-lockup-transparent-1200x400.png" alt="VOL.STUDIO" />

Tauri v2 + Phaser 4 ile geliştirilen çapraz platform oyun monoreposu.

[English](README.en.md)

## Yığın

Phaser 4 · Tauri v2 (Rust) · TypeScript · Vite · pnpm workspace

## Yapı

```
core/            # @volstudio/core — paylaşılan sistemler + DOM tabanlı UI kütüphanesi
games/vol-hell/  # @volstudio/vol-hell — oyun (Vite kökü)
games/vol-ui/    # @volstudio/vol-ui — core UI component'lerinin canlı showcase'i
games/design/    # @volstudio/design — Pencil tasarım kaynağı, export pipeline'ı ve rig montajı
tauri-v2/        # @volstudio/tauri-v2 — native wrapper ve Rust backend
```

Doküman yüzeyi: [core/docs](core/docs) (i18n, ses/müzik motorları) ve [games/docs](games/docs) (oyun i18n'i).

## Gereksinimler

- Node.js `^20.19.0` veya `>=22.12.0`, pnpm >= 11.18
- Rust + Cargo, Visual Studio C++ Build Tools (Windows)
- Android Studio + SDK + NDK

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

Kalite kapıları `just` ile localde çalıştırılır. GitHub yalnızca source control, PR ve release için kullanılır; CI runner yoktur.

| Seviye          | Komut                        | Ne yapar                                                 |
| --------------- | ---------------------------- | -------------------------------------------------------- |
| Pre-commit      | `pnpm quick`                 | sözleşme, format, typecheck, lint (~45 sn)               |
| Push öncesi     | `pnpm high`                  | quick + css lint + coverage eşikleri + tüm build'ler     |
| Release/signoff | `pnpm signoff`               | high + cargo check/fmt/clippy                            |
| Uzun build      | `pnpm exec just tauri-build` | game build + Tauri prod build (manuel)                   |
| Ortam           | `pnpm run doctor:env`        | Node, pnpm, Rust, just, FFmpeg, Tauri deps kontrolü      |
| Rapor           | `pnpm exec just report high` | Kapıyı koşar, sonucu yapılandırılmış raporlar (`--json`) |

`pre-commit` → `pnpm quick` ve `pre-push` → `pnpm high` hook'ları `pnpm install`
sırasında kurulur; atlamak için `SKIP_SIMPLE_GIT_HOOKS=1`. Test yükü bilerek
push'a bırakıldı — testi de içeren hızlı kapı için `pnpm fast`.

Kapılar workspace'ten türer: yeni bir paket hiçbir kapıya elle eklenmez,
`pnpm -r` ve repo geneli glob'lar sayesinde kendiliğinden kapsanır.
`scripts/workspace-contract.mjs` bekçisi her commit'te bunu doğrular — bir paket
`test`/`test:coverage` script'i ya da coverage eşiği olmadan repoya giremez.

Kapsam eşikleri kök `quality.json`da yaşar; beş `vitest.config.ts` onu okur ve
bekçi de aynı dosyayı okur, yani ayrışamazlar. Bir config'e eşiği satır içi
yazmak kapıyı kırar. Dosya her okunuşta şema doğrulamasından geçer
(`scripts/quality/config.mjs`) — bir yazım hatası, nereye bakılacağını söyleyen
tek bir hata mesajı verir.

`just` ikilisi `node_modules/.bin` altına kurulur, global `PATH`'e girmez —
çıplak `just fast` değil `pnpm fast` ya da `pnpm exec just fast` kullanılır.
Tekil kapılar (`typecheck`, `lint`, `coverage`, `rust`, `test-pkg <paket>` …)
için: `pnpm exec just --list`.

## Lisans

[Apache License 2.0](LICENSE)
