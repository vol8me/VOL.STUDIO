<img src="./.github/assets/banners/vol-studio-horizontal-lockup-transparent-1200x400.png" alt="VOL.STUDIO" />

Tauri v2 + Phaser 4 oyun runtime'ı ile web tabanlı geliştirici araçlarını aynı
çalışma alanında buluşturan çapraz platform monorepo.

[English](README.en.md)

## Yığın

Phaser 4 · Tauri v2 (Rust) · TypeScript · Vite · pnpm workspace

## Yapı

```
core/                       # @volstudio/core — paylaşılan sistemler + DOM UI kütüphanesi
games/vol-hell/             # @volstudio/vol-hell — oyun (Vite kökü)
games/vol-arachnid/         # @volstudio/vol-arachnid — eklemli örümcek arena dikey kesiti
devtools/pen.dev/          # @volstudio/pen.dev — Pencil kaynağı, export hattı ve rig montajı
devtools/vol-ui/            # @volstudio/vol-ui — CORE UI canlı bileşen kataloğu
devtools/vol-asset-studio/  # @volstudio/vol-asset-studio — repo varlık çalışma ortamı
devtools/visual-synth/      # @volstudio/visual-synth — deterministik görsel asset compiler'ı
devtools/audio-synth/       # @volstudio/audio-synth — deterministik ses asset compiler'ı
tauri-v2/                   # @volstudio/tauri-v2 — native oyun kabuğu ve Rust backend
```

Doküman yüzeyi: [core/docs](core/docs) (i18n, ses/müzik motorları, CORE
primitifleri), [games/docs](games/docs) (oyun i18n'i) ve ilgili
`devtools/<paket>/README.md` dosyalarıdır.

## Gereksinimler

- Node.js `^20.19.0` veya `>=22.12.0`, pnpm >= 11.18
- Rust + Cargo, Visual Studio C++ Build Tools (Windows)
- Android Studio + SDK + NDK

## Komutlar

```bash
pnpm install
pnpm dev                                   # VOL.HELL + VOL.ARACHNID + iki geliştirici aracı
pnpm --filter @volstudio/vol-hell dev      # yalnızca VOL.HELL         :5173
pnpm --filter @volstudio/vol-arachnid dev  # yalnızca VOL.ARACHNID     :5178
pnpm --filter @volstudio/vol-ui dev        # yalnızca UI showcase'i   :5174
pnpm --filter @volstudio/vol-asset-studio dev # yalnızca Asset Studio :5175
pnpm tauri:dev                             # PC Tauri dev
pnpm build:game                            # VOL.HELL build
pnpm build:arachnid                        # VOL.ARACHNID build
pnpm build:tauri                           # PC installer build
pnpm tauri:android:dev                     # Android dev (bağlı cihaz/emülatör)
pnpm tauri:arachnid:android:dev            # Android dev — bağlı cihazda VOL.ARACHNID
pnpm benchmark:core                        # CORE headless workload ölçümü
pnpm benchmark:vol-hell                    # VOL.HELL simülasyon/render ölçümü
```

VOL.ARACHNID sabit kameralı arena dikey kesitidir: WASD örümceği yürütür,
Space kısa atılmayı tetikler; HUD hız ile atılma dolumunu gösterir.

### Android

Native proje `tauri-v2/src-tauri/gen/android` altında **sürüm kontrolünde tutulur**
(yeniden üretilebilir değildir): yön kilidi, çentik yerleşimi ve sürükleyici tam
ekran Tauri yapılandırmasından ayarlanamadığı için `AndroidManifest.xml`, tema ve
`MainActivity.kt` elle düzenlendi.

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/<sürüm>"
export JAVA_HOME=<JDK 21 LTS>
rustup target add aarch64-linux-android    # cihaz için; emülatör x86_64 ister

pnpm --filter @volstudio/tauri-v2 exec tauri android build --debug --target aarch64
adb install -r tauri-v2/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

Fedora/Linux release (deb, rpm ve AppImage):

```bash
pnpm exec just tauri-build-linux
```

Fedora'da Tauri'nin AppImage sonlandırması `linuxdeploy`/ELF strip adımında
kırılırsa tarif önce AppDir'i üretir, ardından `build:linux-appimage` ile
`NO_STRIP=1` ve VOL.HELL'in WebKit launcher'ını kullanarak AppImage'i yeniden
paketler. Bu yol native masaüstü doğrulamasında kullanılır. Android build için
JDK 21 LTS gerekir; JDK 25 desteklenmez.

Oyun yatay yöne kilitlidir, sistem çubukları gizlenir ve güvenli alan
(`env(safe-area-inset-*)`) HUD yerleşimine uygulanır. Ekran üstü kontroller
yalnızca dokunmatik birincil cihazlarda kurulur (`shouldUseTouchControls`).

### Doğrulama

Kalite kapıları `just` ile localde çalıştırılır. GitHub yalnızca source control, PR ve release için kullanılır; CI runner yoktur.

| Seviye          | Komut                              | Ne yapar                                                 |
| --------------- | ---------------------------------- | -------------------------------------------------------- |
| Pre-commit      | `pnpm quick`                       | sözleşme, format, typecheck, lint (~45 sn)               |
| Push öncesi     | `pnpm high`                        | quick + css lint + coverage eşikleri + tüm build'ler     |
| Release/signoff | `pnpm signoff`                     | high + cargo check/fmt/clippy                            |
| Uzun build      | `pnpm exec just tauri-build`       | game build + Tauri prod build (manuel)                   |
| Fedora/Linux    | `pnpm exec just tauri-build-linux` | deb + rpm + AppImage teslimi                             |
| Ortam           | `pnpm run doctor:env`              | Node, pnpm, Rust, just, FFmpeg, Tauri deps kontrolü      |
| Rapor           | `pnpm exec just report high`       | Kapıyı koşar, sonucu yapılandırılmış raporlar (`--json`) |

Benchmark komutları makineye özel süre eşiği koymaz; CORE mekanizmalarının ve
VOL.HELL'in render'dan ayrılmış simülasyonunun medyan/p95 adım maliyetini
ölçer. Ayrıntılı tekil tarifler için `pnpm exec just benchmark-core` ve
`pnpm exec just benchmark-vol-hell` kullanılabilir.

`pre-commit` → `pnpm quick` ve `pre-push` → `pnpm high` hook'ları `pnpm install`
sırasında kurulur; atlamak için `SKIP_SIMPLE_GIT_HOOKS=1`. Test yükü bilerek
push'a bırakıldı — testi de içeren hızlı kapı için `pnpm fast`.

Kapılar workspace'ten türer: yeni bir paket hiçbir kapıya elle eklenmez,
`pnpm -r` ve repo geneli glob'lar sayesinde kendiliğinden kapsanır.
`scripts/workspace-contract.mjs` bekçisi her commit'te bunu doğrular — bir paket
`test`/`test:coverage` script'i ya da coverage eşiği olmadan repoya giremez.

`doctor:env` adındaki ek tesadüfi değil: `pnpm doctor` pnpm'in KENDİ tanılama
komutudur ve aynı adlı bir script'i sessizce gölgeler — script hiç çalışmaz.
Yerleşik bir komutla çakışan script adları bir kapı testiyle engellenir.

Kapsam eşikleri kök `quality.json`da yaşar; paket `vitest.config.ts` dosyaları onu okur ve
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
