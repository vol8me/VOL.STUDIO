# Windows

Windows geliştirme ortamı ve kapıların Windows'ta nasıl davrandığı. Linux'ta
çalışan her şey Windows'ta da çalışır; farkı yalnız araç çözümlemesindedir.

Ortam denetimi `pnpm run doctor:env` eksik gereksinimleri raporlar.

## Gereksinimler

| Araç                          | Sürüm                                | Neden                                                                                              |
| ----------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Node.js                       | `22.23.1`                            | `.node-version` ve `package.json` aynı kesin sürümü taşır; deterministik ses çıktısı buna bağlıdır |
| pnpm                          | `11.18.0`                            | `packageManager` alanında sabit                                                                    |
| Rust                          | stable                               | Tauri kabuğu ve plugin crate'leri                                                                  |
| Visual Studio C++ Build Tools | 2022                                 | MSVC linker; `cargo build` bunun olmadan bağlanamaz                                                |
| Python                        | 3.12+                                | Deck komutları (`sh -c python3 -c ...`) bunu çalıştırır                                            |
| Git for Windows               | son sürüm                            | `bash`, `ssh`, `rsync` yerine geçen Git Bash katmanı                                               |
| FFmpeg                        | son sürüm                            | audio-synth ses üretimi                                                                            |
| cargo-audit                   | `cargo install cargo-audit --locked` | `signoff` kapısının `security-rust` aşaması                                                        |
| JDK                           | 21 LTS                               | Android build; Android Studio'nun JBR'si 25'tir ve hedeflenen sürüm değildir                       |
| Android SDK                   | platform 36 + build-tools 36         | `compileSdk`/`targetSdk` değerleri                                                                 |
| Android NDK                   | `27.0.12077973`                      | AGP 8.11'in varsayılanı                                                                            |
| Android CMake                 | `3.22.1`                             | AGP 8.11'in varsayılanı                                                                            |
| WebView2                      | son sürüm                            | Tauri masaüstü kabuğu                                                                              |

## PATH'te gerçek çalıştırılabilir dosya

Node'un `execFileSync`/`spawnSync` çağrıları Windows'ta **uzantısız** komut
adını çalıştıramaz; yalnız `.exe`, `.cmd` veya `.bat` yollarını çalıştırır.
Bu iki yerde kapı kodu sahte komut çağırır:

- `scripts/doctor.mjs` ve `scripts/quality/workspaceLifecycle.mjs` `pnpm`
  çağırır.
- `scripts/quality/tests/*.test.mjs` `node_modules/.bin/just` çağırır; pnpm bu
  dizinde POSIX'te yürütülebilir dosya, Windows'ta yalnız `just.CMD` shim'i
  üretir.

Bu yüzden PATH'te **gerçek `.exe`** bulunmalıdır; pnpm'in ve `rust-just`
paketlerinin sunduğu `.exe` dosyaları ayrı bir dizine yerleştirilir. Aynı
sebeple `.CMD`/`.bat` çalıştırmak `shell: true` gerektirir; `cmd.exe` kendi
PATH'ini kullandığı için sahte komut testlerinde bu kaçınılır ve komutun tam
yolu açıkça verilir.

## Satır sonu

Git for Windows `core.autocrlf=true` varsayılanıyla çalışır ve checkout'ta tüm
dosyaları CRLF'e çevirir. Bu iki kapıyı bozar:

- Prettier `endOfLine: lf` bekler; CRLF'de **tüm** dosyalar `format-check`'ten
  düşer.
- Bekçi fixture'ları `/` ile yazılmış yolları `\` ile karşılaştırır; eşleşme
  sessizce kırılır.

Bu yüzden `core.autocrlf=input` kullanılır: commit'te CRLF LF'e çevrilir,
checkout'ta depodaki LF korunur. `input` değeri `true`'dan güvenlidir çünkü
hiçbir koşulda depoya CRLF girmez.

Raporlanan yollar daima POSIX'tir. `node:path` `join`/`relative` platforma
bağlı ayraç üretir; `scripts/quality/workspaceLifecycle.mjs` içindeki
`posixPath()` tek dönüşüm noktasıdır ve bekçi mesajları, fixture eşleşmeleri
ile sözleşme yolları bu primitive'i kullanır.

## Ölçülemeyen platform sözleşmeleri

Bazı kapılar Linux'a özgü davranışı ölçer. Windows'ta bunlar **atlanır** ve
raporda gerekçesiyle görünür; sessizce geçmiş sayılmaz:

| Aşama                        | Neden                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `doctor` → Tauri sistem deps | `pkg-config` ve `webkit2gtk` Linux'ya özgüdür; Windows'ta WebView2 karşılığı gelir |
| `e2e` → WebKit ses           | Playwright'ın Windows WebKit'i `AudioContext` sunmaz; Linux WebKitGTK sunar        |
| Deck SIGTERM                 | `/proc` taraması gerektirir                                                        |
| `linux-steamrt4`             | steamrt4 kabuğu Linux'ta kurulur                                                   |

Windows piksel temelleri `-win32.png` olarak ayrı dosyalarda tutulur; Linux
temelleriyle karışmaz ve kapı her iki motoru da ayrı ölçer.

## Steam Deck

Steam Deck Linux cihazdır; dağıtım AppDir paketi `pnpm build:linux-steamrt4`
üretir ve bu adım steamrt4 SDK kabuğunda, yani Linux'ta çalışır. Windows'ta
`pnpm deck` komutları (keşif, dağıtım, ölçüm) cihaz tarafında SSH kullanır ve
çalışır; paketleme adımı Linux gerektirir.

Devkit erişimi için SSH anahtarı `~/.config/steamos-devkit/devkit_rsa`
konumunda beklenir. Cihazın mDNS kaydı çözülebiliyorsa `pnpm deck discover`
adresi kendi bulur.

## Android

`docs/android.md` oyun başına kurulumu anlatır. Windows'a özgü iki nokta:

- `ANDROID_HOME`, `ANDROID_SDK_ROOT`, `ANDROID_NDK_HOME`, `NDK_HOME` ve
  `JAVA_HOME` kullanıcı düzeyinde tanımlanır; `platform-tools` ve
  `cmdline-tools` PATH'e eklenir.
- Cihaz `adb devices -l` çıktısında `device` durumunda olmalıdır. `unauthorized`
  durumunda cihaz ekranındaki USB hata ayıklama onayı beklenir.

Ölçüm betiği `adb`'yi `shell: true` ile çağırır (Windows'ta `adb.cmd` tek
çalıştırma yoludur) ve bekleme için kabuk `sleep`ine değil Node saatine bağlıdır.
