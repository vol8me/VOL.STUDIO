# Android

Her oyunun native projesi AYRIDIR ve KENDİ paketinin altındadır:
`games/<oyun>/src-tauri/gen/android`. Ortak Rust kabuğu
`tauri-v2/src-tauri`dedir ve bir uygulama değildir — kendi `tauri.conf.json`u,
kimliği ya da üretilmiş projesi yoktur.

Hepsi **sürüm kontrolünde tutulur** ve yeniden üretilebilir değildir: yön
kilidi, çentik yerleşimi, geri hareketi ve sürükleyici tam ekran Tauri
yapılandırmasından ayarlanamadığı için `AndroidManifest.xml`, tema ve
`MainActivity.kt` elle düzenlendi. Ayrı paket kimlikleri
(`com.volstudio.game`, `com.volstudio.arachnid`, `com.volstudio.life`) üçünün
aynı cihazda birlikte kurulmasını sağlar.

## Build

JDK **21 LTS** gerekir; JDK 25 desteklenmez.

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/<sürüm>"
export JAVA_HOME=<JDK 21 LTS>
rustup target add aarch64-linux-android    # cihaz için; emülatör x86_64 ister

pnpm --filter @volstudio/vol-hell exec tauri android build --debug --target aarch64
adb install -r games/vol-hell/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk

pnpm --filter @volstudio/vol-arachnid exec tauri android build --debug --target aarch64
adb install -r games/vol-arachnid/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk

pnpm --filter @volstudio/vol-life exec tauri android build --debug --target aarch64
adb install -r games/vol-life/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

Drift testleri manifest, yön, oyun kategorisi, `VIBRATE` izni, geri çağrısı,
tam ekran, kayıtlı yönün açılışta uygulanması ve paket kimliklerini kaynak
yapılandırmayla karşılaştırır — üretilmiş proje ile kaynak sessizce ayrışamaz.

## Çalışma zamanı davranışı

Sistem çubukları gizlenir ve güvenli alan (`env(safe-area-inset-*)`) HUD
yerleşimine uygulanır. İki ayrı soru iki ayrı yüklemle cevaplanır:

- **İşaretçi türü** (`shouldUseTouchControls`, CORE): ekran üstü kontroller
  yalnız dokunmatik BİRİNCİL cihazlarda kurulur.
- **Kabuk** (`getRuntimePlatform`, `@volstudio/tauri-v2`: `web` / `desktop` /
  `android`): tam ekran düğmesi Android kabuğunda gösterilmez, çünkü sistem
  çubukları zaten gizlidir; çıkış onayı Android kabuğunda fareli cihazda (DeX)
  da kurulur; native pencere yetenekleri yalnız masaüstündedir. Telefon
  tarayıcısı `web`dir: orada DOM tam ekranı tarayıcı çubuklarını gerçekten
  kaldırır.

VOL.HELL ve VOL.ARACHNID yatay yöne KİLİTLİDİR (`sensorLandscape`). VOL.LIFE'ta
yön oyuncunun seçimidir; varsayılan `userPortrait`tır. WebView'ın
`screen.orientation.lock()`u Android'de desteklenmediği için seçim
`vol-orientation` eklentisiyle (`tauri-v2/plugins/vol-orientation`) uygulanır,
native tarafta saklanır ve `MainActivity` açılışında sayfa yüklenmeden geri
yüklenir. Yön değişimi Activity'yi yeniden yaratmaz (`configChanges`), yani
dünya sıfırlanmaz.

Üç manifest de `android:appCategory="game"` taşır: Android 16, en dar kenarı
600dp ve üstü ekranlarda yön kilidini ve yön isteklerini yok sayar; oyun
kategorisi bundan muaftır.

## Native eklentiler

Kotlin kaynağı taşıyan bir eklenti yalnız ona DOĞRUDAN bağımlı uygulamanın
APK'sına girer (`links` → `DEP_<links>_ANDROID_LIBRARY_PATH` → gradle). Bu
yüzden böyle bir eklenti paylaşılan kabukta herkese değil, onu kullanan
uygulamanın `run_with_context_and` çağrısında kaydedilir; aksi hâlde bağımlılığı
olmayan uygulama açılışta eklenti sınıfını bulamazdı. Eklenti crate'i kendi
`Cargo.lock`unu taşır ve Rust kapısıyla Tauri sürüm eşitliği bekçisine girer.

## Fedora / Linux release

```bash
pnpm exec just tauri-build-linux
```

Tauri'nin AppImage sonlandırması `linuxdeploy`/ELF strip adımında kırılırsa
tarif önce AppDir'i üretir, ardından `build:linux-appimage` ile `NO_STRIP=1` ve
WebKit launcher kullanarak AppImage'i yeniden paketler.

### WebView çizim yolu

Paylaşılan kabuk (`configure_linux_webview`) WebView yaratılmadan önce çizim
yolunu seçer ve dışarıdan verilen değişkeni ezmez. WebKit'in DMA-BUF çizicisi
bazı sürücülerde boş WebView bıraktığı için güvenli yol onu kapatmaktır, ama o
yolda her kare CPU üzerinden kopyalanır. Tek istisna ölçülen durumdur: ekranı
tek başına NVIDIA sürücüsü sürüyorsa ve oturum yerel Wayland ise çizici açık
kalır ve `__NV_DISABLE_EXPLICIT_SYNC=1` verilir. Ölçüm (RTX 3050 / 610.57,
KDE Plasma 6.7, WebKitGTK 2.52, 1920×1080, boş sahne):

| Yol                                          | Sonuç                        |
| -------------------------------------------- | ---------------------------- |
| Çizici kapalı                                | 18 FPS, web işlemi %89       |
| Çizici açık, yerel Wayland                   | açılışta Gdk Error 71, çöküş |
| Çizici açık, XWayland (`GDK_BACKEND=x11`)    | boş pencere                  |
| Çizici açık + explicit sync kapalı (Wayland) | 60 FPS, web işlemi %12       |

Değişkenleri elle vermek kuralı devre dışı bırakır; ör. boş pencere görülen bir
sürücüde `WEBKIT_DISABLE_DMABUF_RENDERER=1`. vol-hell AppImage başlatıcısı
(`linux.AppRun`) bu değişkeni kendi düzeyinde `1` yapar; AppImage bu yüzden
kabuk kuralına girmeden güvenli yolda kalır.
