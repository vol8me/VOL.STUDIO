# Android

İki oyunun native projeleri AYRIDIR: VOL.HELL `tauri-v2/src-tauri/gen/android`,
VOL.ARACHNID `games/vol-arachnid/src-tauri/gen/android`.

İkisi de **sürüm kontrolünde tutulur** ve yeniden üretilebilir değildir: yön
kilidi, çentik yerleşimi, geri hareketi ve sürükleyici tam ekran Tauri
yapılandırmasından ayarlanamadığı için `AndroidManifest.xml`, tema ve
`MainActivity.kt` elle düzenlendi. Ayrı paket kimlikleri
(`com.volstudio.game`, `com.volstudio.arachnid`) ikisinin aynı cihazda
birlikte kurulmasını sağlar.

## Build

JDK **21 LTS** gerekir; JDK 25 desteklenmez.

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/<sürüm>"
export JAVA_HOME=<JDK 21 LTS>
rustup target add aarch64-linux-android    # cihaz için; emülatör x86_64 ister

pnpm --filter @volstudio/tauri-v2 exec tauri android build --debug --target aarch64
adb install -r tauri-v2/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk

pnpm --filter @volstudio/vol-arachnid exec tauri android build --debug --target aarch64
adb install -r games/vol-arachnid/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

Drift testleri manifest, yön, `VIBRATE` izni, geri çağrısı, tam ekran ve paket
kimliklerini kaynak yapılandırmayla karşılaştırır — üretilmiş proje ile kaynak
sessizce ayrışamaz.

## Çalışma zamanı davranışı

Oyunlar yatay yöne kilitlidir, sistem çubukları gizlenir ve güvenli alan
(`env(safe-area-inset-*)`) HUD yerleşimine uygulanır. Ekran üstü kontroller
yalnız dokunmatik BİRİNCİL cihazlarda kurulur (`shouldUseTouchControls`).

## Fedora / Linux release

```bash
pnpm exec just tauri-build-linux
```

Tauri'nin AppImage sonlandırması `linuxdeploy`/ELF strip adımında kırılırsa
tarif önce AppDir'i üretir, ardından `build:linux-appimage` ile `NO_STRIP=1` ve
WebKit launcher kullanarak AppImage'i yeniden paketler.
