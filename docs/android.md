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

JDK 21 LTS gerekir. Windows araç/bootstrap kurulumu
[Windows](windows.md) belgesindedir; aşağıdaki ortam örneği Linux içindir.

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

## Ölçülmüş VOL.TEST referansı

Lenovo TB350FU, Android 14 native WebView ve Mali-G57 MC2; CSS alanı
1569×941, DPR 1,275. Senaryolar düşük kalitede aynı cihaz ve aynı ölçüm
betiğiyle 12'şer saniye örneklendi. Gerçek `requestAnimationFrame` aralıkları
kullanıldı; uzun kareler çıkarılmadı.

| Senaryo     | Önce FPS | Güncel FPS | Güncel p95 (ms) |
| ----------- | -------: | ---------: | --------------: |
| Boş         |    120,1 |      120,1 |             8,4 |
| Slalom      |     15,5 |      120,1 |             8,4 |
| Hedefler    |     22,7 |      120,0 |             8,4 |
| Fizik alanı |     12,5 |      119,1 |             8,4 |
| Çoklu tank  |     23,4 |      120,0 |             8,4 |

Kontrollü çizim deneyi, araç başına TileSprite palet yolu, gövde içindeki
karışık blend kipleri ve boş additive yayıcıların maliyetini ayırdı.
Ortak palet kare dokusu, gövdenin normal alfa çekirdeği ve tek namlu ışığı
katmanı aynı görsel parçaları korur. Simülasyon davranışı değişmez.

Hava önizlemeleri ayrı 8 saniyelik pencerelerle ve gerçek dokunmatik ateş
isteğiyle örneklendi; yağış önizlemesinin hazır birikimi bu yüke dahildir.

| Hava / yük            | Düşük FPS | Yüksek FPS | Yüksek p95 (ms) |
| --------------------- | --------: | ---------: | --------------: |
| Açık / boşta          |     120,0 |      119,9 |             8,4 |
| Yağmur / boşta        |     105,4 |       93,2 |            16,7 |
| Kar / boşta           |      88,9 |       66,3 |            16,8 |
| Toz / boşta           |     118,5 |      102,5 |            16,7 |
| Yağmur / sürekli ateş |      95,5 |       89,6 |            16,7 |

İki kademe kısa pencerede 60 FPS'i geçtiği için bu model yüksek başlar;
diğer Android modelleri ölçülene kadar düşük başlar. Kayıtlı tercih açılış
varsayılanından önce gelir. Kısa hava tablosu uzun oturum bütçesi değildir.

Yüksek kalite, kış/kar önizlemesi, çoklu tank ve sürekli gerçek dokunmatik
atış birlikte 10 dakika ölçüldü: 20 adet 30 saniyelik pencere, toplam ortalama
62,5 FPS ve pencere aralığı 58,9–64,8 FPS. İlk iki pencerenin p95'i 25 ms;
sonraki pencerelerde 16,7–16,8 ms. Başlangıç PSS belleği 328,2 MiB,
pencereler 303,5–319,8 MiB, son pencere 313,0 MiB; sürekli artış görülmedi.
Pil sıcaklığı 29,3 → 29,8 °C; bu sensör GPU sıcaklığı değildir. JavaScript
hatası görülmedi ve her pencerede atış barı boşaldı. İlk dakikadaki kareler
sonuçtan çıkarılmadı; bütün pencerelerde ≥60 FPS hedefi geçmedi.

Aynı oturumdan sonraki yüksek kar/boş dünya çizim ayrıştırmasında 512 parçacık
korundu: tam çizim 102,7 FPS, yağış katmanı görünmezken 120,0 FPS, yalnız
birikim katmanı görünmezken 109,6 FPS. Model ve parçacık güncellemesi çalışmaya
devam etti. Bu deney yağış çiziminin kalan maliyetini ayırır; görsel kaliteyi
düşürme veya bütün cihazlar için optimizasyon kararı değildir.

### Güncel commit, 10 dakikalık uzun oturum

`093e4c8d` commit'inden üretilen debug APK, Lenovo TB350FU (120 Hz), yüksek başlangıç kalitesi,
`scripts/android/device-benchmark.mjs 600`. Dokunma girdisi verilmedi (araçlar kendi yolunda). Boş dünya: 71.642 kare,
jank %0,04, p50/p90/p99 9/14/17 ms, kaçan vsync 4, PSS 295 MB (grafik 151 MB), soğuk açılış 735–978 ms. Çoklu tank:
61.528 kare, jank %3,97, p50/p90/p99 12/16/23 ms, kaçan vsync 11, PSS 303 MB (grafik 151 MB), soğuk açılış 678–689 ms.
Bellek büyümesi yok. Oyun içi FPS örneği yok (ölçüm kipi yalnız Deck ortamıyla açılır), değerler native çizimdir.
Çoklu tank yükünde jank oranı belirgin; hava önizlemesi ve sürekli dokunmatik ateş bu turda eklenmedi.

Native titreşim durum sorgusu destek bildirdi; geçerli desen kabul edildi,
geçersiz desen reddedildi. Motorun fiziksel hissi insan doğrulaması ister.
Samsung bu 600 sn'lik ölçümde erişilebilir değildi; sonraki turda 90 sn'lik boş dünya ölçümü yukarıdadır, uzun oturum ve çoklu tank Samsung'da ölçülmedi. Kontrol ve titreşim hissiyatı gerçek insan kabulü olarak ayrı kalır;
ses yayını teknik QA, runtime decode/çıkış ise hedef cihaz doğrulamasıdır.

### Dikey ve yatay native kare ölçümü (2026-10-08)

Güncel çalışma ağacından üretilen debug APK (`vol-test`; yeni dakika haritası ve yükleme ekranı dahil), iki cihaz × iki yön,
`scripts/android/device-benchmark.mjs 90` (90 sn, dokunma girdisi yok, boş dünya). Değerler native `gfxinfo` karesidir,
oyun FPS'i değildir; yön her koşuda `settings put system user_rotation` ile sabitlendi, koşu sonunda cihazın özgün
ayarı geri yazıldı.

| Cihaz                   | Yön   | Kare        | Jank          | p50/p90/p99 (ms) | Kaçan vsync | PSS (grafik) |
| ----------------------- | ----- | ----------- | ------------- | ---------------- | ----------- | ------------ |
| Lenovo TB350FU (120 Hz) | dikey | 9040 / 8952 | %2,07 / %2,33 | 10/14/20         | 5           | 298 (154) MB |
| Lenovo TB350FU (120 Hz) | yatay | 9071 / 9051 | %1,89 / %2,18 | 10/14/20         | 4           | 310 (152) MB |
| Samsung (60 Hz)         | dikey | 5280 / 5299 | %0,44 / %0,30 | 8/9/14           | 0           | 187 (41) MB  |
| Samsung (60 Hz)         | yatay | 5312 / 5306 | %0,36 / %0,32 | 8/9/14           | 0           | 187 (41) MB  |

Kare ve jank hücrelerinde iki koşu vardır (ilk / ikinci); p50/p90/p99, kaçan vsync ve bellek ikinci koşudandır.
Okuma: Samsung'da jank %0,5 altında ve vsync kaçmıyor; yön fark yaratmıyor. Lenovo'da jank %1,9–2,3 ve dört
koşuda tutarlı: yukarıdaki 600 sn'lik %0,04 ölçümüne göre yüksek. Fark **açıklanmadı**: ölçüm süresi (90 sn, açılış
kareleri payı büyük), farklı commit (yeni dakika haritası ve yükleme ekranı) ya da cihaz durumu olabilir; hangisi olduğu
ayrı bir 600 sn koşuyla ayrıştırılmadı. Çoklu tank, hava önizlemesi ve dokunma yüklü oturum bu turda koşulmadı.

### Vitrin sekmeleri, Chrome'da dikey ve yatay (2026-10-08)

Vitrin (`devtools/vol-showcase`) aynı cihazlarda Chrome'da (`adb reverse` ile yerel önizleme sunucusu, CDP) 14 sekmenin
tamamı için sekme sekme kaydırılarak gezildi: sunulan kare (rAF aralığı) ölçüldü ve her sekmeden kaydırma dilimi başına
ekran görüntüsü alındı. Ölçüm yöntemi vitrindeki kare ölçeriyle aynıdır (`Shift+B` ya da `?bench`); gezen betik
oturuma özeldir ve repoda yoktur, yinelenebilir olan parça kare ölçeridir.

| Cihaz (CSS alanı, DPR)         | Yön   | 14 sekme FPS | Yavaş sekme |
| ------------------------------ | ----- | ------------ | ----------- |
| Samsung S21 FE (384×725, 2,8)  | dikey | 59,9 (hepsi) | —           |
| Samsung S21 FE (796×283, 2,8)  | yatay | 59,9–60,0    | —           |
| Lenovo TB350FU (856×1317, 1,4) | dikey | 56,7–60,0    | Text 56,7   |
| Lenovo TB350FU (1427×747, 1,4) | yatay | 58,3–60,0    | Text 58,3   |

Bu gezintiyle dört gerçek kusur bulundu ve düzeltildi: yatay Samsung'da ekran klavyesinin Vazgeç/Bitti satırı kırpılıyordu
(`OnScreenKeyboard`), Workbench görüntü çubuğu kart kırpmasının arkasında kalıyordu, Kimlik ikon galerisi tek dar sütuna
düşüyordu, SlotGrid telefon dikeyinde sağdan kırpılıyordu. Bu bir ekran görüntüsü ve kare incelemesidir; dokunma hissi,
ses ve insan kabulü yerine geçmez.

## Fiziksel kabulün kanıt sınırı

İki Android profilindeki ekran görüntüsü referansı kurulum/açılış, yatay
HUD, joystick sürüş/nişan, ateş, duraklat/devam, arka plan dönüşü ve kayıt
akışını kapsar. Seri numarası, adres ve kullanıcı kimliği repoya girmez. `device-benchmark` her iki
cihazda da native Activity süresini "oyun FPS'i" diye yazmaz; app-private
`diagnostics.jsonl` kaydı olmadığı için oyun FPS'i, oyuna hazır zamanı, ilk
fiziksel sunum ve renderer `bilinmiyor` olarak kalır. Sunulan kare ayrıca
`scripts/android/frame-stats.mjs` ile örneklenir: `dumpsys gfxinfo framestats`
`DisplayPresentTime`, `GpuCompleted` ve girdi satırlarını verir (Android 14
tablette VOL.TEST: 120 Hz, sunum p50 32,2 ms). Sütun yoksa kapsam
`unsupported` yazılır; çekirdek girdi zamanı bu yola dahil değildir.

Ses çıkışı `scripts/android/audio-players.mjs <paket>` ile örneklenir: `dumpsys audio`
oynatıcılarını uygulamanın uid'ine süzer ve oynatıcının AudioFlinger'a ulaşıp ulaşmadığını
(`started`, tür, örnekleme hızı) ayrıca sessize alınıp alınmadığını (`mutedState`) verir. Kanıt
"çıkışa ulaştı" ile sınırlıdır; sesin duyulduğunu göstermez. Android 14 tablette Chrome 154 ile
vitrin ses laboratuvarı sürülürken 48 kHz AAudio oynatıcısı `started` göründü; cihazın medya
akış seviyesi 0 olduğundan `mutedState` `streamVolume`dı (cihaz ayarı değiştirilmedi).

Kısa dış bölge dokunuşu Lenovo'da kanıtlandı: 60 ms'lik sabit basış
patlamasında ateş barı ölçülen karelerde tükendi (202 → 5 dolu piksel), aynı
koordinatlarda iç bölge (deadzone üstü ama giriş eşiği altı) patlamasında ise
25 karenin tamamında tam kaldı. Samsung'da aynı ölçüm sentetik sabit basışla
tekrarlanamadı: bu cihazda `adb input` sabit basışta oyunun örneklediği bir
`pointermove` üretmiyor; merkezden rim'e sürükleme ile ateş doğrulandı
(bar tükendi, mermi göründü), 60–100 ms sürüklemeler yetersiz kaldı. Enjeksiyon sınırı fiziksel kısa basış kabulünü kanıtlamaz;
Samsung'da insan parmağıyla kabul açık kalır.

Cihazlarda ölçülen tek sayı HUD FPS göstergesinin tek anlık okumasıdır;
ölçüm penceresi değildir. Uzun oturum bütçesi, kar/çoklu tank yükü ve
titreşim hissi yeniden kabul edilmiş değildir.

Sistem ekran yakalamasında siyah çıktı ve Mali EGL bellek hatası görüldü.
Aynı oturumda GPU kare örneği tank piksellerini, açık WebGL bağlamını ve sıfır
GL hatasını gösterdi. Çalışan simülasyon ya da FPS sayısı tek başına görünür
panel kabulü değildir; yakalama sorunu çözülmeden güncel Lenovo görsel kabulü
kapanmaz.
