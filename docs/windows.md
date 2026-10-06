# Windows

Windows 11 geliştirme hattı; Linux builder ve gerçek ürün kabulü ayrı
sorumluluklardır. Host araçları `pnpm run doctor:env`, Android profili
`node scripts/doctor.mjs --android` ile denetlenir.

## Destek sınırı

| Yol                                       | Windows sorumluluğu                | Ayrı doğrulama                                    |
| ----------------------------------------- | ---------------------------------- | ------------------------------------------------- |
| Web geliştirme, CORE, UI ve yerel kapılar | Native Windows Node/pnpm/Git Bash  | quick/high ve tam audio kapsamı                   |
| Windows native kabuk                      | MSVC, Windows SDK, WebView2        | NSIS/MSI kurulum, DPI, pencere ve servis kabulü   |
| Android                                   | JDK/SDK/NDK ile APK üretimi ve adb | Paketli uygulama ve gerçek tablet kabulü          |
| Deck devkit                               | SSH keşif/transfer/sonda           | Linux builder, host/SLR4 ve gerçek Steam olayları |
| Linux AppImage/steamrt4                   | Ayrı Linux builder gerekir         | ELF/GLIBC, WebKitGTK/GStreamer ve görünür açılış  |

Araç denetiminin yeşili installer, oyun performansı, Steam olayları veya
dokunma/haptik hissi kabulü değildir. Güncel kanıt ve açık işler
[denetim](monorepo-audit.md#18-f01f03-uygulama-durumu) ve [kök TODO](../TODO.md)
içindedir.

## Host kurulumu

Node sürümü `.node-version`, pnpm sürümü `package.json#packageManager`
içindedir. Git for Windows, Rust stable MSVC toolchain, Visual Studio 2022
C++ Build Tools (masaüstü C++ workload ve Windows SDK), WebView2, FFmpeg ve
cargo-audit gerekir. Tauri'nin [resmi Windows gereksinimleri](https://v2.tauri.app/start/prerequisites/#windows)
native bağımlılıkların kurulumunu açıklar. Python yalnız Deck devkit araçları
için gerekir; host kalite kapılarının gereksinimi değildir.

Yeni PowerShell oturumunda, repo kökünde:

```powershell
npm.cmd install --global pnpm@11.18.0
pnpm.cmd install --frozen-lockfile
pnpm.cmd --filter @volstudio/vol-test exec playwright install chromium webkit
cargo install cargo-audit --locked
pnpm.cmd run doctor:env
pnpm.cmd quick
pnpm.cmd high
```

Corepack ile aynı sabit pnpm sürümünü kurmak da geçerlidir. `pnpm.cmd`
PowerShell execution-policy nedeniyle ps1 shim'inin engellenmesini önler;
normal `pnpm` adı çalışıyorsa kullanılabilir. Paket yöneticisinin ürettiği
shim yeterlidir; pnpm.exe veya just.exe dosyalarını elle kopyalama zorunluluğu
yoktur. just exact repo devDependency'sidir ve `pnpm exec just` ile çağrılır.

Linux node_modules ağacı Windows'ta kullanılmaz; temiz clone'da normal
install çalıştırılır. pnpm'in store konumu kurulu ağaçtan farklıysa mevcut
node_modules başka store'a bağlanmış demektir: temiz clone tercih edilir,
sürüm kilidi değiştirilmez. Araç kurulumundan sonra yeni terminal açılır.

## Komut ve linker sözleşmesi

`scripts/quality/command.mjs` süreç sınırının sahibidir. Native exe doğrudan
argv ile çalışır; cmd/bat shim'leri cross-spawn'ın PATH/PATHEXT çözümü ve
escaping'iyle çağrılır. Genel `shell: true` kullanılmaz. Boşluk, Unicode,
tırnak, & işareti, farklı cwd ve PATH gerçek süreç fixture'larında sınanır.
TS test yardımcıları shim yerine Node ile çözümlenen tsx JS girişini başlatır.

Git Bash repo tarafından Git kurulumundan çözülür; WindowsApps/WSL bash
launcher'ının PATH'te önce gelmesi kapıyı Linux çalışma zamanına geçirmez.
Doctor bu gölgeyi uyarı olarak raporlar. WSL geliştirmesi ayrı Linux
bağımlılık ağacı ve builder profilidir.

Doctor, PATH'teki ilk link.exe banner'ından kesin derleme sonucu çıkarmaz.
Rust host'unun Windows MSVC olduğunu kontrol eder, küçük bir Rust programını
bağlar ve çalıştırır. Başarısız gerçek prob kapıyı düşürür; başarılı link
PATH'teki GNU link'in otomatik olarak kırıcı olduğu varsayımını çürütür.

## Android araç profili

Repo profili `scripts/quality/androidToolchain.mjs` içindedir: JDK 21,
SDK platform 36, build-tools 36.0.0, NDK 27.0.12077973, CMake 3.22.1 ve
aarch64-linux-android Rust hedefi. Bu repo tercihi Tauri'nin bütün projeler
için tek sürüm gereksinimi olarak sunulmaz. [Android rehberi](android.md)
oyun başına native kaynak ve build sözleşmesini taşır.

Android Studio SDK Manager ile bu bileşenleri kur; JDK 21'i ayrıca seç.
Yeni oturumda JAVA_HOME JDK köküne, ANDROID_HOME SDK köküne, NDK_HOME ilgili
NDK sürüm köküne işaret eder. ANDROID_SDK_ROOT/ANDROID_NDK_HOME gibi aliaslar
tanımlıysa aynı kökü göstermelidir. Örnek, SDK yolu mevcut ortamdan alınır:

```powershell
$env:NDK_HOME = Join-Path $env:ANDROID_HOME 'ndk/27.0.12077973'
rustup target add aarch64-linux-android
node scripts/doctor.mjs --android
pnpm.cmd --filter @volstudio/vol-test exec tauri android build --debug --target aarch64
```

Profil java ve javac sürümünü, SDK dosyalarını, NDK revision/clang/sysroot'u
ve Rust hedefini kontrol eder. Tek source.properties veya JRE yeterli
sayılmaz. Cihaz adresi/seri kimliği rapora girmez. APK/Activity/panel kabulü
bu profilin yerine ayrıca yapılır.

## Satır sonu ve disk yolları

`.gitattributes` metinlerde LF'i zorlar; bu kural local autocrlf ayarından
bağımsızdır. Prettier LF bekler. File URL disk yoluna fileURLToPath ile
çevrilir; protokol ve karşılaştırma yolları slash ile normalize edilir.
Windows chmod izin bitleri POSIX yazma reddini taklit etmez: rollback
fixture'ı gerçek eksik kaynak veya dosya/dizin çakışması üretir.
Windows directory fsync desteklemez; bu açık sınır güç kesintisi
dayanıklılığının POSIX ile aynı olduğu anlamına gelmez.

Doctor tarayıcı probunun JavaScript'ini stdin üzerinden Node'a iletir.
Çok satırlı program CMD argümanına konmaz; `pnpm.cmd` sessizce boş sonuç
üretebilir. Başarı için Chromium ve WebKit ayrı ayrı başlatılıp kapanmalıdır.

`high`, frontend build'ini Rust'tan önce çalıştırır: Tauri bağlamı derlenirken
`frontendDist` diskte bulunmalıdır. Boş bir `dist` oluşturmak kabul değildir.
Rust kapısını tek başına temiz ağaçta çalıştırmadan önce `pnpm exec just build`
gerekir; birleşik kapı bu sırayı kendi sağlar.

`steamworks` feature'lı Cargo binary'si SDK runtime DLL'ini de gerektirir;
yalnız Cargo derlemesi paketli açılış kanıtı değildir. DLL ve izin bağının
NSIS tesliminde doğrulanması F09.1, store/flush native ürün turu F04 sahibindedir.
Güncel kaynak, Rust disk ve SDK sahiplik kanıtı [F04 raporundadır](monorepo-audit.md#19-f04-uygulama-durumu).

Ölçülen Node 22.23.1 profilinde Unicode yolda senkron public kopyası native
süreci çökertebildi. Ortak public hook'u asenkron kopyayı tamamlanana kadar
bekler; font/glifler ve oyun public dosyaları aynı build'de korunur.

## Linux ve Deck sınırı

Linux pkg-config/GTK/WebKitGTK bağımlılığı Windows'ta ölçülmez. Windows
Playwright WebKit'in AudioContext sınırı testte gerekçesiyle görünür;
Chromium/WebKit testleri farklı kabul kaynaklarıdır. Piksel temelleri
platform ekiyle ayrıdır; sırf kapı yeşillensin diye yenilenmez.

`pnpm deck` Windows'ta devkit araç yoludur; paketleme için
[Linux builder](linux.md) ve [Deck sözleşmesi](steam-deck.md) geçerlidir.
SSH erişimi oyun/Steam/suspend kabulü değildir. Windows node_modules veya
Windows binary'si Deck Linux paketi yerine gönderilmez.
