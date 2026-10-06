<img src="./docs/assets/banners/vol-studio-horizontal-lockup-transparent-1200x400.png" alt="VOL.STUDIO" />

Tauri v2, Phaser 4 ve TypeScript ile geliştirilen çapraz platform oyun
çalışma alanı. Paylaşılan motor, native kabuk ve geliştirici araçları pnpm
workspace içinde ayrı sorumluluklarla yaşar. VOL.TEST bu katmanları gerçek
oyun akışında sınayan test ürünüdür.

## Paketler

| Yol                      | Paket                     | Sorumluluk                                      |
| ------------------------ | ------------------------- | ----------------------------------------------- |
| `core/`                  | `@volstudio/core`         | Oyunlardan bağımsız motor ve DOM UI kataloğu    |
| `tauri-v2/`              | `@volstudio/tauri-v2`     | Paylaşılan native kabuk ve platform adaptörleri |
| `devtools/audio-synth/`  | `@volstudio/audio-synth`  | Deterministik ses ve müzik üretimi, yayın ve QA |
| `devtools/deck/`         | `@volstudio/deck`         | Steam Deck sondası ve devkit otomasyonu         |
| `devtools/pen.dev/`      | `@volstudio/pen.dev`      | Pencil tasarımından rig export ve gönderim      |
| `devtools/vol-showcase/` | `@volstudio/vol-showcase` | CORE UI vitrini ve görsel sözleşme              |
| `games/vol-test/`        | `@volstudio/vol-test`     | Motor ve kabuğun uçtan uca test oyunu           |

Aktif paketler `workspace-lifecycle.json` ile belirlenir. Yeni ürün
[oyun kurma rehberi](docs/new-game.md) üzerinden `games/` altında oluşturulur.

## Kurulum ve geliştirme

Node.js `22.23.1` sürümü `.node-version` ve `package.json` içinde sabittir; pnpm sürümü `package.json` içindedir. Native build
Rust ve Cargo; Android SDK ve NDK; Windows C++ Build Tools gerektirir.
Ortam denetimi eksik gereksinimleri raporlar.

Windows host kurulumu, native süreç/shim çözümü ve ayrı Android araç profili
[Windows rehberindedir](docs/windows.md). Git Bash ve MSVC gerekir; standard
pnpm/just shim'leri yeterlidir. Linux/Deck paketleme ayrı Linux builder'da
yürür. Metinlerde LF kuralı `.gitattributes` tarafından korunur.

```bash
pnpm install
pnpm run doctor:env
pnpm dev
pnpm exec just dev-ui
```

## Kalite kapıları

Kapıların tek kaynağı `justfile`'dır; rutin kapılar yalnız aktif paketlerde
çalışır. Bulut CI yerine yerel kapılar ve git kancaları kullanılır.

```bash
pnpm quick                 # commit öncesi
pnpm fast                  # geliştirme doğrulaması
pnpm high                  # push öncesi
pnpm signoff               # sürüm ve kilometre taşı
pnpm exec just --list      # tekil kapılar
```

Düşen tek kapı bağımsız yeniden çalıştırılır. Koşulmayan kapı geçmiş sayılmaz;
cihaz ölçümü ve insan dinlemesi otomatik kapıların yerine geçmez.

## Belgeler

| Konu                   | Belge                                                                |
| ---------------------- | -------------------------------------------------------------------- |
| Çalışma sözleşmesi     | [AGENTS.md](AGENTS.md)                                               |
| Kapılar ve raporlar    | [docs/gates.md](docs/gates.md)                                       |
| Motor                  | [core/README.md](core/README.md)                                     |
| Native kabuk           | [tauri-v2/README.md](tauri-v2/README.md)                             |
| Linux                  | [docs/linux.md](docs/linux.md)                                       |
| Steam Deck             | [docs/steam-deck.md](docs/steam-deck.md)                             |
| Android                | [docs/android.md](docs/android.md)                                   |
| Ses üretimi            | [audio-synth/README.md](devtools/audio-synth/README.md)              |
| Rig üretimi            | [pen.dev/README.md](devtools/pen.dev/README.md)                      |
| UI kataloğu            | [vol-showcase/README.md](devtools/vol-showcase/README.md)            |
| UI uygulama sözleşmesi | [UI fazları ve nihai plan](docs/ui/README.md)                        |
| Açık işler             | [TODO.md](TODO.md)                                                   |
| Teknik değerlendirme   | [Monorepo denetimi ve iyileştirme kararları](docs/monorepo-audit.md) |

## Lisans

[Apache License 2.0](LICENSE)
