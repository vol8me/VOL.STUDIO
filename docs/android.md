# Android

Her oyunun native projesi kendi paketindedir:
`games/<oyun>/src-tauri/gen/android`. Paylaşılan kabuk (`tauri-v2/src-tauri`)
uygulama değildir; kendi `tauri.conf.json`u, kimliği ya da üretilmiş projesi
yoktur.

Üretilmiş proje sürüm kontrolünde tutulur ve elle düzenlenir: yön kilidi,
çentik yerleşimi, geri hareketi ve sürükleyici tam ekran Tauri
yapılandırmasından ayarlanamaz; `AndroidManifest.xml`, tema ve
`MainActivity.kt` bu yüzden kaynaktır. Her oyun ayrı paket kimliği taşır.
Oyun, manifestin kaynak yapılandırmasından ayrışmadığını bir drift testiyle
korur (yön, `appCategory`, `VIBRATE` izni, geri çağrısı, tam ekran, kimlik).

## Build

JDK 21 LTS gerekir.

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/<sürüm>"
export JAVA_HOME=<JDK 21 LTS>
rustup target add aarch64-linux-android    # cihaz; emülatör x86_64 ister

pnpm --filter <oyun-paketi> exec tauri android build --debug --target aarch64
adb install -r games/<oyun>/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

Kabuk, ikon ya da native proje değişince uygulama bağlı cihazlara kurulur,
açılır ve ekran görüntüsüyle doğrulanır. Referans ölçüm:
`pnpm benchmark:device`.

## Çalışma zamanı

Sistem çubukları gizlenir; güvenli alan (`env(safe-area-inset-*)`) HUD
yerleşimine uygulanır.

- **İşaretçi türü** (`shouldUseTouchControls`, CORE): ekran üstü kontroller
  yalnız dokunmatik birincil cihazda kurulur.
- **Kabuk** (`getRuntimePlatform`: `web` / `desktop` / `android`): tam ekran
  düğmesi Android kabuğunda gösterilmez; çıkış onayı fareli cihazda (DeX) da
  kurulur; native pencere yetenekleri yalnız masaüstündedir. Telefon
  tarayıcısı `web`dir.
- **Yön:** WebView'ın `screen.orientation.lock()`u Android'de desteklenmez;
  yön sözleşmesi `tauri-v2/plugins/vol-orientation` eklentisindedir. Yön
  değişimi Activity'yi yeniden yaratmaz (`configChanges`).
- **Titreşim:** `observeAndroidHaptics` yalnız Android kabuğunda
  `tauri-v2/plugins/vol-haptics` eklentisini sorgular. `VIBRATE` izni ve
  `hasVibrator()` birlikte doğrulanır; destek varsa CORE desenleri Android
  `Vibrator`/`VibratorManager` üzerinden oynatılır. Genlik kontrolü olmayan
  motor varsayılan genliği kullanır; Android 24–25 aynı deseni aç/kapa
  sürelerine çevirir. Arka plana geçiş ve aboneliğin kapanışı titreşimi keser.
  Eklenti yalnız tüketen uygulamanın Android bağımlılığı ve mobil iznidir;
  telefon tarayıcısı CORE'un Vibration API yolunu kullanır. Native komutun
  kabul edilmesi fiziksel his onayı değildir.
- **Oyun kategorisi:** manifest `android:appCategory="game"` taşır; Android 16
  600dp üstü ekranlarda yön kilidini yok sayar, oyun kategorisi muaftır.
- **Yerel WebView menüleri:** kabuk sağ tık/uzun basış menüsünü ve sürükleme
  hayaletini sayfa yüklenmeden enjekte edilen betikle kapatır
  (`tauri-v2/src-tauri/src/native_menus.rs`); web hedefinde aynı davranışı
  `suppressNativeMenus` verir. Metin alanlarında seçim korunur.

## Native eklentiler

Kotlin kaynağı taşıyan eklenti yalnız ona doğrudan bağımlı uygulamanın APK'sına
girer (`links` → `DEP_<links>_ANDROID_LIBRARY_PATH` → gradle). Böyle bir
eklenti paylaşılan kabukta değil, onu kullanan uygulamanın
`run_with_context_and` çağrısında kaydedilir; yoksa bağımlılığı olmayan
uygulama açılışta eklenti sınıfını bulamaz. Eklenti crate'i kök Cargo
workspace'inin üyesidir ve kökteki tek kilitle derlenir.

## VOL.TEST cihaz referansı

Lenovo TB350FU, Android 14 native WebView; 2000×1199 piksel, CSS alanı
1569×941, DPR 1,275. Soğuk açılış 1058 ms. Her koşul 8 saniye boyunca gerçek
`requestAnimationFrame` aralıklarıyla ölçüldü; uzun kareler çıkarılmadı.
Sürekli ateş dokunmatik sağ çubukla üretildi, ses döngüleri ve atışlar açıktı.

| Kademe | Yük          |   FPS | p95 (ms) | p99 (ms) | En uzun kare (ms) |
| ------ | ------------ | ----: | -------: | -------: | ----------------: |
| Düşük  | Boşta        | 120,0 |      8,4 |      8,4 |               8,5 |
| Düşük  | Sürekli ateş | 113,4 |     16,6 |     16,7 |              25,0 |
| Yüksek | Boşta        | 119,3 |      8,4 |      8,5 |              16,7 |
| Yüksek | Sürekli ateş | 115,3 |      8,5 |     16,7 |              16,8 |

İki kademe de 60 FPS hedefini geçtiği için bu model yüksek başlar; diğer
Android modelleri ölçülene kadar düşük başlar. Kaydedilmiş kullanıcı tercihi
açılış varsayılanından önce gelir. Kısa pencereler kademe üstünlüğü ya da uzun
süreli termal kararlılık kanıtı değildir. Samsung cihazı bağlı değildi;
ölçülmedi. Ses düğümlerinin başlaması doğrulandı; insan dinleme ve dokunmatik
hissiyat onayı bekler.
