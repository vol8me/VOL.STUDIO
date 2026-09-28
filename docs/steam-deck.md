# Steam Deck ve Valve donanım ailesi

> **Durum:** Hiçbir aktif oyun henüz Steam Deck'e gönderilmiyor. Bu belge
> platformun ölçülmüş gerçeklerini, bunlardan çıkan kararları ve Deck'e
> özgü sözleşmeleri tutar. Yapılacak işler kök [TODO.md](../TODO.md)dedir.
> İlk platform ölçümleri 2026-09-23'te bir Deck üzerinde, amaca özel bir
> Tauri sondasıyla yapıldı (Phaser 4 WebGL + Gamepad + ses + yaşam döngüsü
> kaydı). VOL.HELL'in ayrı D7 turu aşağıda açıkça adlandırılır. Bu iki sonda,
> gerçek Steam App ID ile yayımlanmış Steam Input düzeni veya Valve onayı
> yerine geçmez.

Hedef tek bir cihaz değil, Valve'ın ortak uyumluluk programıdır. Verified
incelemesi 2026'dan beri Steam Deck, Steam Machine (29 Haziran 2026) ve
Steam Frame için tek bir kriter setiyle yapılır. Yeni Steam Controller
(4 Mayıs 2026) Deck'in kontrol düzenini ekransız taşır. Frame (ARM64, VR)
bu belgenin kapsamı dışındadır.

## Hedef: Verified kriterleri ve bizim eşiklerimiz

| Başlık            | Valve kriteri                                                                                                                | Bizim eşiğimiz                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Kontrolcü desteği | Fiziksel kontrollerle bütün içeriğe erişim; kontrolcüyü açmak için oyun içi ayar gerekmez                                    | Oyun ilk kareden kolla başlar ve biter                            |
| Glifler           | Ekrandaki glif kullanılan girdiyle eşleşir (Deck, Steam Controller ya da Xbox); etkin değilken klavye/fare glifi gösterilmez | Glif ailesi gerçek aygıttan çözülür, girdi değişince değişir      |
| Metin girişi      | Steamworks ekran klavyesi ya da kullanıcının dilini destekleyen, yalnız kolla kullanılan yerleşik giriş                      | Türkçe karakterli yerleşik klavye; Steamworks varsa onun klavyesi |
| Performans        | Deck'te 800p'de 30 FPS, Steam Machine'de 1080p'de 30 FPS varsayılan ayarla                                                   | 1280×800'de 60 FPS, kare süresi p95 ≤ 18 ms                       |
| Çözünürlük        | 1280×800 (tercih) ya da 1280×720                                                                                             | 16:10 birincil; 16:9 ve TV çözünürlükleri desteklenir             |
| Okunabilirlik     | 1280×800'de en küçük karakter 9 px'in altına inmez (öneri 12 px)                                                             | Taban 12 px                                                       |
| Kesintisizlik     | "Desteklenmeyen cihaz" uyarısı yok; başlatıcı varsa kolla gezilir                                                            | Başlatıcı yok                                                     |

Valve'ın önerileri de bağlayıcı kabul edilir:

- Kayıtlar Steam Cloud ile eşitlenir; grafik ayarları cihaza özgü kalır ve eşitlenmez.
- Tek oyunculu içerik internetsiz oynanır.
- Fare ile çubuk girdisi aynı anda kabul edilir; biri ötekini kilitlemez.
- Her oyunun bir FPS sınırı vardır: kendi sınırı ya da sistemin sınırlayıcısı.
- Uykudan önce kayıt güvenceye alınır.

## Ölçülmüş cihaz ve çalışma ortamı

**Cihaz:**

- Steam Deck LCD ("Jupiter"), SteamOS 3.8.16, çekirdek 6.16, glibc 2.41, gamescope 3.16.23.
- Panel fiziksel olarak 800×1280; gamescope 1280×800 sunar. Yenileme hızı sınırları 40–60 Hz.
- Steam "gamepad UI" oturumunda çalışır.

**Host kütüphaneleri:**

- GTK 3/4, GStreamer (~200 eklenti), FUSE 2/3 var.
- **WebKitGTK yoktur.**
- Steam Linux Runtime 1.0/3.0/4.0 kaplarından istenen kurulu olabilir.

**Steam'in oyuna verdiği ortam** (belgelenmiş API'lere ek olarak ölçülmüştür):

| Değişken                                                 | Değer / anlam                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| `SteamDeck`, `SteamOS`, `SteamGamepadUI`, `SteamTenfoot` | `1` — Deck'te ve Big Picture oturumunda çalışıldığını bildirir      |
| `SteamAppId`, `SteamGameId`                              | Uygulama kimliği (devkit kısayolunda da atanır)                     |
| `SteamVirtualGamepadInfo`                                | Sanal kolların arkasındaki gerçek aygıtı listeleyen dosyanın yolu   |
| `DISPLAY`                                                | `:1` — oyunlar ikinci XWayland'dedir                                |
| `XDG_SESSION_TYPE`                                       | `x11`; `WAYLAND_DISPLAY` yoktur, `GAMESCOPE_WAYLAND_DISPLAY` vardır |
| `GDK_BACKEND`                                            | `x11` (linuxdeploy GTK kancası koyar; gamescope'ta doğrudur)        |
| `SDL_ENABLE_STEAM_SCREEN_KEYBOARD`                       | SDL'e özgüdür; WebView'ı etkilemez                                  |

`SteamVirtualGamepadInfo` dosyasının biçimi (Deck'in kendi kolu):

```ini
[slot 0]
name=Steam Deck Controller
VID=0x28de
PID=0x1205
type=steam
```

Steam kullanıcı adı ve oturum belirteçleri de aynı ortamda gelir. Teşhis
kodu ortamı **izin listesiyle** okur; `Steam*` önekiyle toptan kayıt yapılmaz.

**WebView'ın gördüğü cihaz:**

- `maxTouchPoints=0`, `pointer: fine`, `hover: true`, `any-pointer: coarse`.
  Bu yüzden `shouldUseTouchControls()` Deck'te `false` döner; ekran üstü kontroller kurulmaz.
- WebGL2 var. Sürücü adı gizlidir (`"Apple GPU"`); cihaz sınıfı WebGL'den okunamaz, native taraftan okunur.
- Ayrı GPU süreci yoktur; WebGL web sürecinde çalışır.
- AudioContext açılışta hemen `running`, 44,1 kHz.
- Gamepad API vardır; `vibrationActuator` yoktur (WebKitGTK 2.52). Titreşim WebKitGTK 2.54'te libmanette ile gelir.

**Güç:** logind bir uygulamaya uykudan önce en çok 5 sn gecikme kilidi tanır (`InhibitDelayMaxUSec`).

**Girdi düğümü haritası (2026-09-27, LCD Deck):**

| Düğüm         | Aygıt                               | Yetenek                                                                                                         |
| ------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `event4`      | Steam Deck Controller               | Yalnız KEY+MSC+REP; ~tüm klavye tuşları. **ABS yok** — çubuklar ve tuşlar evdev'e düşmez (lizard klavye yüzeyi) |
| `event12`     | Steam Deck Controller               | REL_X/Y + yüksek çözünürlüklü teker + BTN_LEFT/RIGHT (lizard/trackpad fare yüzeyi)                              |
| `event14`     | `Microsoft X-Box 360 pad 0`         | Steam Input'un sanal kolu; **oyun yokken de hazır.** ABS X/Y/Z/RX/RY/RZ + HAT0X/Y; **EV_FF + FF_RUMBLE (0x50)** |
| `event18`     | FTS3528 dokunmatik                  | ABS_MT çoklu dokunma                                                                                            |
| `event19`     | FTS3528 ikincil düğüm               | ABS_X/Y                                                                                                         |
| `event21`     | `steamos-manager`                   | Yalnız KEY — Steam/QAM gibi sistem tuşlarını enjekte eder                                                       |
| `hidraw0/2/4` | Steam Deck Controller (`28de:1205`) | Gerçek pad verisinin ve haptik komutlarının geçtiği HID yolu                                                    |

- Fiziksel kol düğümlerinde (`event4`, `event12`) **force-feedback biti yoktur**.
  Titreşim ya sanal kolun evdev FF'ine yazılır ya da hidraw/Steam Input üzerinden
  gönderilir; fiziksel düğüme FF yazmak mümkün değildir.
- `rtcwake` yüklüdür; betikli uyku-uyanma turu uzaktan kurulabilir. Turun rAF/AudioContext
  yarısı D1 sondasını ister.
- Güç sayaçları uzaktan okunur: BAT1 `charge_now`/`voltage_now`/`status`,
  `steamdeck_hwmon` (pil sıcaklığı, PD sözleşmesi), `amdgpu/slowPPT` ve `edge`
  sıcaklığı, RAPL `energy_uj` (package-0, core). 60/30 FPS güç ölçümü için eksik
  tek parça kontrollü yük üreten sondadır (D1).

## Dağıtım yolu

**Karar:**

- Native Linux yapısı; WebKitGTK paketle birlikte taşınır.
- Derleme steamrt4 SDK kabında (podman) yapılır.
- Gönderilen şey açılmış bir AppDir'dir. AppImage dosyası gönderilmez; pressure-vessel kabında FUSE yoktur.
- Çalışma zamanı Steam Linux Runtime 4.0 (Debian 13 tabanlı; Valve'ın yeni native oyunlar için önerisi).

| Deneme                                                                         | Sonuç                                                                                           |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Fedora 44'te (glibc 2.43) üretilmiş VOL.HELL AppImage                          | Açılmaz: paketlenmiş WebKit, GLib ve ICU `GLIBC_2.42`, `GLIBC_2.43`, `GLIBC_ABI_GNU2_TLS` ister |
| Debian 13 kabında (glibc 2.41, WebKitGTK 2.52.6) üretilmiş sonda, SteamOS host | Açılır                                                                                          |
| Aynı sonda, Steam Linux Runtime 4.0 kabında (`steamrt4_platform_4.0.20260805`) | Açılır; WebGL2, ses ve Gamepad API çalışır                                                      |

**Reddedilen yollar:**

- **Proton + WebView2:** WebView2'yi Proton önekine kullanıcının kurması gerekir ve Microsoft bu yolu desteklemez. Verified'ın "kullanıcı yapılandırma yapmaz" tanımıyla bağdaşmaz.
- **Host'un WebKit'i:** SteamOS'ta yoktur.
- **Steam Linux Runtime 3.0 (sniper):** Debian 11 ve glibc 2.31 tabanlıdır; Debian 13'te derlenen ikili orada açılmaz.

**Paket içeriği kuralları:**

- Grafik sürücü kütüphaneleri (`libgbm`, `libEGL`, `libGL`, `libdrm`) pakete girmez; host'tan gelir. Ölçülen AppDir bu kurala uyuyordu.
- WebKit, GTK, GLib, ICU, libmanette ve GStreamer eklentileri (ogg, vorbis, opus, pulseaudio, autodetect) pakete girer.
- Paket boyutu izlenir: debug ikiliyle açılmış AppDir 515 MB'tı.
- Tauri'nin AppImage paketleyicisi WebKit yardımcı süreç yollarını göreli yapar. AppDir, `AppRun` üzerinden paket bağlanmadan çalışır.
- Kap içinde `linuxdeploy` FUSE'süz koşar (`APPIMAGE_EXTRACT_AND_RUN=1`).
- Ön yüz (JS) glibc'den bağımsızdır ve host'ta derlenebilir. Rust ikilisi ve paketleme kap içinde yapılır.

**Kimlik ve kayıt yolu:** Uygulamanın veri dizini Tauri kimliğinden türer
(`~/.local/share/<identifier>`) ve Steam Cloud kökü bu yola bağlanır. Kimlik
oyuna özgü olmalıdır. Kimliği değiştirmek kayıt yolunu değiştirir; bu
yüzden eski yoldan tek seferlik, yedekli bir geçiş gerekir.

## Çizim ve kare zamanlaması

**Ölçüm koşulları:** 1280×800, Phaser 4 WebGL. Fazlar sırayla: saf `requestAnimationFrame`, boş sahne, 1000 ve 4000 hareketli sprite. Her fazda kare süresi dağılımı ölçüldü.

| Yol                                                | Saf rAF       | 4000 sprite (10 sn) | p50 / p95 / p99     | Web süreci CPU |
| -------------------------------------------------- | ------------- | ------------------- | ------------------- | -------------- |
| WebKit varsayılanı (DMA-BUF açık, DRM vblank)      | 50,2 FPS      | 50 FPS, 500 kare    | 20 / 21 / 21 ms     | ~%30           |
| DMA-BUF kapalı                                     | ölçülmedi     | 49,9 FPS, 499 kare  | 20 / 20 / 25 ms     | ~%76           |
| DMA-BUF açık + `WEBKIT_FORCE_VBLANK_TIMER=1`, host | 62,3 FPS      | 59,5 FPS, 595 kare  | 16 / 20 / 26 ms     | ölçülmedi      |
| Aynısı, Steam Linux Runtime 4.0                    | 62,2 FPS      | 59,9 FPS, 599 kare  | 17 / 18 / 19 ms     | ölçülmedi      |
| Kabuk kuralı (otomatik, `env` yok), SLR4           | 62,2–62,4 FPS | 58,9–59,2 FPS       | 17 / 19–20 / 21+ ms | ölçülmedi      |

> İki temiz turda (v2+v3) kabuk kuralı `env` dosyası olmadan kendiliğinden
> uygulandı (`session_kind` = `gamescope`, `WEBKIT_FORCE_VBLANK_TIMER=1`,
> `WEBKIT_DISABLE_DMABUF_RENDERER=0` kayıtta okundu). FPS eşiği (≥59)
> sınırda tutuyor; p95 ≤ 18 ms eşiği ise 4000 sprite'ta karşılanmadı —
> zamanlayıcının panelden serbest koşması ara sıra kaçan kare üretiyor
> (bkz. açık zamanlama soruları). D2'nin bu alt maddesi bu yüzden açık kalır.

CPU değerleri 200 sprite'lık etkileşim fazında `top`'tan okundu. XWayland süreci DMA-BUF açıkken ~%13, kapalıyken ~%16 idi. Boş sahnede ve 1000 sprite'ta kare hızları aynı yolun 4000 sprite değerinden ±0,5 FPS içindeydi.

**Kök neden:**

- WebKit'in DRM vblank izleyicisi (`drmWaitVBlank`) gamescope altında 50 Hz tempo veriyor.
- Aynı anda gamescope'un FPS sınırı 60 ve dinamik yenileme hızı 60; XRandR 59,81 Hz bildiriyor.
- Oyun odaktayken `GAMESCOPE_DISPLAY_REFRESH_RATE_FEEDBACK` 50'ye iniyor.
- Tempo yükten bağımsız: boş sahne de 4000 sprite da aynı 50 FPS'te kalıyor.
- Zamanlayıcı izleyicisine zorlamak 60'ı geri getiriyor.

**Kural (uygulandı — `tauri-v2/src-tauri/src/lib.rs` `linux_webview_plan`):**

- Gamescope oturumunda (`GAMESCOPE_WAYLAND_DISPLAY` ya da `GAMESCOPE_STATS` var) kabuk `WEBKIT_FORCE_VBLANK_TIMER=1` verir ve DMA-BUF çizicisini açık bırakır. Birim testi kural tablosunu üç oturum için kilitler.
- NVIDIA kuralı ([android.md](android.md#webview-çizim-yolu)) korunur: tek başına NVIDIA'nın sürdüğü yerel Wayland'da çizici açık + `__NV_DISABLE_EXPLICIT_SYNC=1`; zamanlayıcı oraya verilmez.
- Diğer her oturumda çizici güvenli (kapalı) yolda kalır.
- Dışarıdan verilen değişken ezilmez (`set_env_default`).
- Kabuk oturumu JS'e `session_kind` komutuyla bildirir (`gamescope`/`desktop`); ön yüz `getSessionKind()` ile okur — D5'in "gamescope'ta pencere ayarını gizle" kancası budur.
- Deck'te 4000 sprite'ta DMA-BUF kapalı 49,9 FPS/p95 21 ms; açık+zamanlayıcı 59,6 FPS/p95 19 ms ölçüldü — aynı hızda ~2,5 kat CPU tasarrufu.

**Açık kalan zamanlama soruları:**

- Zamanlayıcı ~62 Hz'te serbest koşuyor, panel 60 Hz. Host koşusunda p99 25–29 ms'ye çıktı; bu ara sıra kaçan kareyi gösteriyor. Sunum temposu (takılma, kare atlama) gamescope istatistikleriyle ölçülmeli.
- `WEBKIT_DISPLAY_REFRESH_THROTTLE_FPS` yalnız yenileme hızının böleni olan değerleri kabul eder.
- OLED Deck 90 Hz'te çalışır. Zamanlayıcının orada 60'ta kalıp kalmadığı ölçülmedi.

## Girdi

**Bugünkü durum (2026-09-28 itibarıyla kurulmuş):**

- `core`'da `GamepadController` var: standart eşleme, ölü bölge, analog
  hareket ve nişan; eylem → düğme bağı `GamepadActionBinding` verisidir.
- Kip politikası `InputModeArbiter`'dadır: kenar-zamanı yeniliğiyle "son
  anlamlı girdi kazanır", eşit kenarda görevli üstünlüğü histerezis verir.
  `InputManager`'ın eski "dokunmatik her zaman önce" kuralı bu hakeme
  taşındı; eylemler sağlayıcılar üzerinden birleşir ve durağan fare nişanı
  kol nişanı serbestken yaşar — kimse kimseyi kilitlemez.
- `inputModeForSession('gamescope')` başlangıç kipini kola kurar; Gamepad
  API'nin "ilk tuşa basılana dek kolu göstermeme" kuralına bağlanmaz.
- Arayüzde `FocusNavController`: D-pad ve çubuk uzamsal odak taşır
  (`pickDirectionalTarget`), A tıklar, Menu `onMenu` geri çağrısı,
  LB/RB sekme geçişi. Odak halkası `vol-focusnav-current` sınıfıyla yalnız
  kol/klavye kipinde görünür; işaretçi basışı sınıfı siler.
- Geri yığını tektir: `triggerBack` Android geri, Escape ve kolun B'sini
  aynı yığına bağlar; `Modal` açıkken kendini aynı yığına kaydeder.
- Kanıt: core birim testleri (sağlayıcı 11, politika 10, odak 16) ve
  `devtools/vol-ui` sanal-kol E2E'si (6/6) — ilk basışta halka, uzamsal
  gezinme, A etkinleştirme, LB/RB sekme, Menu→dialog→B zinciri.

**Deck'in verdiği:**

- Steam Input, API kullanmayan oyuna kolu sanal bir Xbox 360 kolu (`Microsoft X-Box 360 pad N`) olarak sunar.
- Trackpad'ler varsayılan şablonda fare üretir.
- Dokunmatik ekran gamescope'un dokunma kipiyle iletilir, ama WebView `maxTouchPoints=0` bildirir.
- Arka tuşlar (L4/R4/L5/R5), gyro ve trackpad'in kendisi yalnız Steam Input API ile ya da kullanıcının eşlemesiyle görünür.

**Kararlar:**

- **Mekanizma:** `core`'da gamepad sağlayıcısı.
  - Standart eşleme, ölü bölge, analog hareket ve nişan.
  - Eylem → düğme bağı veridir (klavyedeki `PCActionBinding` gibi).
- **Girdi kipi politikası:**
  - Son anlamlı girdi kazanır ve histerezis vardır: trackpad titremesi ya da küçük fare hareketi kipi değiştirmez.
  - Fare ve çubuk nişanı birikir; biri ötekini kilitlemez.
  - Deck'te (`SteamDeck=1`) oyun ilk kareden kol kipinde başlar. Gamepad API kolu ancak bir tuşa basıldıktan sonra gösterir; ilk karar ona bağlanamaz.
- **Arayüzde kolla gezinme:**
  - D-pad ve çubuk uzamsal odak taşır, A etkinleştirir.
  - B geri gider. Android geri hareketi, Escape ve kolun B tuşu **tek** bir geri yığınını paylaşır.
  - Menu duraklatır, L1/R1 sekme değiştirir.
  - Odak halkası yalnız kol ve klavye kipinde görünür.
  - `core` bileşenlerinin roving tabindex ve modal odak tuzağı korunur; köprü bunların üstüne kurulur.
- **Oyuna özgü (VOL.HELL):**
  - Duraklatma bugün yalnız ESC'dedir; Menu'ye de bağlanır.
  - Nişan fareyledir; sağ çubuğa bağlanır.
  - Ateş ve atılma tetiklere bağlanır. Bağlar `src/config/` altında veridir.

## Glifler

**Aile çözüm sırası:**

1. Steamworks girdi türü (katman varsa).
2. `SteamVirtualGamepadInfo` üzerinden gerçek VID/PID ve tür (native köprü).
3. `Gamepad.id`.
4. `SteamDeck=1`.
5. Xbox.

**Aileler:**

- Xbox
- PlayStation
- Nintendo
- **Valve:** Deck ve yeni Steam Controller aynı düzeni kullanır: A/B/X/Y, L1/R1, L2/R2, L4/R4/L5/R5, View, Menu, iki trackpad. Deck omuz tuşlarını LB/RB değil **L1/R1** diye adlandırır.
- Klavye
- Fare

**Varlıklar ve lisans:**

- Depo herkese açıktır. Valve'ın partner sitesinden indirilen glif çizimleri depoya girmez.
- Steam istemcisinin glifleri çalışma zamanında Steamworks'ten yol olarak alınabilir.
- Depodaki set CC0 kaynaklıdır (Kenney Input Prompts, Xelu); kaynak kaydı tutulur.
- Marka logoları çizilmez.

**Bilinmeyen:** Gamepad API sırası ile sanal kol yuvası numarasının eşleşmesi.

## Metin girişi

- **Uygulandı (2026-09-27, D5):** `core/src/ui/textEntry/` sözleşmesi.
  `Input`/`TextArea` odaklanınca `requestTextEntryForElement` çalışır; kip
  probu `gamepad` diyorsa native odak kaldırılır ve klavye açılır. Probu
  `InputManager` kurulumda `arbiter.mode === 'gamepad'` olarak kaydeder.
- Sağlayıcı kayıtlıysa (`setTextEntryProvider` — D6 Steamworks dikişi)
  platform klavyesi açılır; yoksa `OnScreenKeyboard`: Türkçe Q düzeni,
  ı/İ/ğ/ü/ş/ö/ç birinci sınıf tuş, shift tek tuşluk, B/Escape ortak geri
  yığınından iptal eder, Bitti commit eder ve odak alana geri döner.
- Steamworks katmanında hedef `ShowFloatingGamepadTextInput` olacaktır.
  Bu çağrı yalnız Deck arayüzünde uygulanmıştır.

## Titreşim

- `core` haptik katmanının `gamepad` arka ucu `vibrationActuator`'a dayanır. Bu Deck'teki WebKitGTK 2.52'de yoktur; Debian 13'ün bugünkü sürümü 2.52.6'dır.
- **Ölçülen (2026-09-27):**
  - Fiziksel kolun evdev düğümleri (`event4`, `event12`) FF yeteneği taşımaz.
  - Steam Input'un sanal kolu `Microsoft X-Box 360 pad 0` (`event14`) **EV_FF +
    FF_RUMBLE** taşır ve oturumda oyun yokken de hazırdır.
  - Kolun üç `hidraw` düğümü (`28de:1205`) doğrudan açılabilir; Deck'in gerçek
    haptik motorlarına giden HID protokolü bu yoldadır.
- **Ölçülen (2026-09-27, oyun süreci içinden):** sonda AppImage'ından tarama
  `nodes:21 opened:11 rumbleCapable:1 uploadFailed:1` — sanal kol
  `EVIOCSFF`'te **EFAULT** verir: uinput yüklemesi yaratıcı (steamos-manager)
  tarafından devkit oyununda servis edilmiyor. `hidraw2` (input2 uç noktası)
  `ID_TRIGGER_RUMBLE_CMD` (0xEB) feature raporunu `rc=65` ile kabul etti
  (SDL `hidapi_steamdeck` biçimi). Fiziksel titreşim insan eliyle
  doğrulanacak — motor akımı `steamdeck_hwmon` çözünürlüğünde görünmedi.
- **Ölçülen (2026-09-27, uçtan uca uygulama içi):** hidraw arka ucu eklendikten
  sonra sonda AppImage'ı `vol_haptics_status` → `backend:"hidraw",
device:"hidraw2"` ve `vol_haptics_rumble` → `ok` döndürdü — yani HID rumble
  raporu süreç içinden, kendi sürücümüzle kabul edildi. Aynı koşuda kare
  zamanlaması bozulmadı (4000 sprite 58,8 FPS, p95 18 ms). Motorun elle
  hissedilmesi yine insan doğrulaması ister.
- **Karar (ölçüme göre güncellendi):** `tauri-v2` Linux sürücüsünün öncelik
  sırası:
  1. Steamworks katmanı varsa Steam Input titreşimi (D6, isteğe bağlı).
  2. `hidraw` üzerinden Deck HID rumble raporu (0xEB) — ölçülmüş yol.
  3. evdev `FF_RUMBLE` — yalnız upload'ı kabul eden ortamlar (masaüstü
     Linux'ta gerçek FF'li kollar); Deck'te sanal kola yazılamaz.
- Paketlenen WebKit ≥ 2.54 olduğunda tarayıcı yolu kendiliğinden devreye girer.

## Yaşam döngüsü: uyku, kapatma, kayıt

**Ölçülen:**

- SIGTERM'i Rust yakalar; JS olayı 2 ms içinde alır.
- Süreç tanınan süre sonunda düzgün kapanır. Bu hem host'ta hem Steam Linux Runtime 4.0'da ölçüldü.
- Uykudan önce logind gecikme kilidi 5 sn'dir.
- Uyku sırasında Wi-Fi kesilir. Steam Cloud'un eşitlemesi gerçek App ID ve
  Auto-Cloud ayarı varsa dosyaları gönderebilir; VOL.HELL için iki cihazlı tur
  yapılmadı.
- Steamworks'te uyanma bildirimi `AppResumingFromSuspend_t`'dir.

**Bulgular:**

- `tauri-plugin-store` 2.4.4'ün `save()`'i doğrudan `fs::write` yapar: geçici dosya, `fsync` ya da `rename` yok. Yazma sırasında süreç öldürülür ya da güç kesilirse dosya yarım kalır. Bu yüzden `TauriStoreAdapter` artık paylaşılan kabuğun `vol_store_read`/`vol_store_write` komutlarını kullanır (`tauri-v2/src-tauri/src/store.rs`) — plugin-store bağımlılığı `tauri-v2`'den kalktı.
- VOL.HELL'in eski sürümü ilerlemeyi ve cihaz ayarlarını tek dosyada tutuyordu;
  güncel oyun bunları `synced` ve `device` dosyalarına ayırıyor.

**Kararlar (uygulandı):**

- **Atomik yazıcı:** geçici dosya → `fsync` → yedek değişimi → `rename` → dizin `fsync` — birim testi `store.rs`'te; her adım sınavlı.
- **Kurtarma:** güncel dosya bozuksa `.bak` okunur, `recovered` işareti adapter'in `onRecovered` kancasına düşer; ikisi de bozuksa okuma hata verir, sessizce boş kayıt yutturulmaz.
- **Boşaltma protokolü:**
  - Diagnostics eklentisi SIGTERM/SIGINT/SIGHUP'ı yakalayıp `vol:terminate` yayınlar; JS bütün `registerShutdownFlush` kancaları bitince tek `flush_done` gönderir (süre sınırı 1,5 sn).
  - logind `PrepareForSleep` aboneliği dbus bağımlılığı gerektirir — bu turda eklenmedi; askı boşluğu zaten `suspend-gap` kaydıyla ölçülüyor.
  - SIGKILL'e karşı güvence boşaltma değil, atomikliktir.
- **Kalıcılık kapsamları:** `synced` (ilerleme; gerçek App ID'de Auto-Cloud
  yapılandırılırsa eşitlenebilir) ve `device` (grafik, pencere, cihaz ses
  ayarları; Cloud'a konmaz). Kapsamlar ayrı dosyalardır.
- **Zaman:** `performance.now()` monoton saattir ve uyku süresini saymaz. `Date.now()` uykudan sonra sıçrar. Duvar saatine bağlı mantık bu farkla yazılır; simülasyon adımı sınırlanır.

## Görüntü ayarları gamescope altında

- Gamescope pencereyi çıkış çözünürlüğünde tam ekrana zorlar. Pencere kipi ve çözünürlük seçenekleri orada etkisizdir.
- **Uygulandı (2026-09-27, D5):** `displayCapabilitiesForSession`
  (`core/platform`) oturum sınıfını yeteneğe çevirir — gamescope'ta
  `{ windowMode: false, resolution: false }`. Ayar ekranı bu tabloya
  bağlanır: etkisiz satır GİZLENİR (devre dışı kalmaz). vol-ui forms
  sekmesinde oturum simülasyonuyla görünür; kalite seçimi
  `device.volui:display-quality` kapsamına kaydeder (ekran başına tercih).
- Deck doğrulaması D7'de VOL.HELL entegrasyonuyla yapılır.

## Okunabilirlik ve ölçek

- 1280×800'de 9 px metin Deck ekranında zar zor seçilir, 12 px okunur (sonda ekran görüntüsü). Taban 12 px'tir.
- **Uygulandı (2026-09-27, D5):** `devtools/vol-ui/tests/e2e/readability.spec.ts`
  WebKit projesinde koşar — 1280×800 ve 1280×720'de görünen her metin
  ≥ 12px; 1920×1080'de UI 1.5×, 3840×2160'ta 3× ölçeklenir
  (`--vol-layout-zoom` medya sorgularıyla, `zoom` üzerinden sanal çözünürlük).
  `--vol-text-micro` 12px tabanına çıkarıldı; kapı `high` zincirindedir.
- 16:10 birincil orandır. 16:9 ve geniş oranlar letterbox ile doğru yerleşir.

## Steamworks katmanı (oyun başına isteğe bağlı)

D6 uygulandı. Eklenti `tauri-v2/plugins/vol-steamworks`, JS adaptörü
`tauri-v2/src/platform/steamworks.ts`; `steamworks` cargo feature'ı
olmadan da derlenir (komutlar stub döner, `status.compiled:false`).
Sonda `devtools/deck-probe` feature'ı `VOL_CARGO_FEATURES=steamworks`
ile açar ve manifestoyu `bundle.resources` üzerinden paketler.

- **Deck'te ölçülenler (devkit sondası, 2026-09-27):**
  `available`, `deck`, `bigPicture`, `overlayEnabled`, `cloudEnabled`,
  `inputReady` → tümü true; `manifestOk` → true; aksiyon seti aktivasyonu
  ve kontrolcü listesi (`steamworksType:"steamdeck"`) döner; Steam Cloud
  yaz/oku/sil turu doğrulandı; eklenti açıkken kare zamanlaması
  değişmedi (59,4–60,1 FPS, p95 ≤ 20 ms).
- **Manifesto disiplini:** `SetInputActionManifestFilePath` ilk
  `RunFrame`den önce çağrılmalıdır — eklenti init sırasında pompayı
  başlatmadan geçirir; dosya `"Action Manifest"` köklü .vdf'dir.
  Sonuç `status.manifestOk` alanında raporlanır.
- **Glif:** `GetDigitalActionOrigins` yalnız aktif konfigürasyonda
  bağlanmış origin döndürür; manifesto tek başına `[]` üretir (appId 480
  altında resmi bağlama yok). Gerçek App ID + manifesto
  `configurations` bölümündeki resmi konfigürasyonlarla dolmalı — oyun
  tarafının işi.
- **Metin girişi:** `ShowGamepadTextInput` modal diyalog `core`'un
  `TextEntryProvider` sözleşmesine birebir oturur (sonuç
  `vol-steamworks:text-input` olayıyla döner; overlay yoksa `false` →
  yerel klavye). `ShowFloatingGamepadTextInput` ayrı komuttur; metni
  odaklı alana doğrudan yazar, blur/refocus akışına girmez.
- **Overlay:** `GameOverlayActivated` olayı `vol-steamworks:overlay`
  olarak JS'e taşınır; duraklatma kararı oyunundur. Masaüstünde overlay
  WebView üstüne çizilmez; Game Mode'da gamescope birleştirir.
- **App ID ve SDK:** geliştirme kimliği 480 (Spacewar); `init_app` env'e
  yazar, `steam_appid.txt` gerekmez. `libsteam_api.so` `steamworks-sys`
  derleme çıktısından linuxdeploy'a verilir — depoya binary girmez,
  `steamrt4-build.sh` mutlak yolu `LD_LIBRARY_PATH`'e ekler.
- Katmanı taşımayan oyun, kol/glif/klavye yollarıyla eksiksiz çalışır.

## Devkit sözleşmesi ve otomasyon

**Erişim:**

- Devkit istemcisinin anahtarı `~/.config/steamos-devkit/devkit_rsa`'dır; SSH kullanıcısı `deck`.
- Cihaz mDNS'te `_steamos-devkit._tcp` olarak ilan edilir. IP adresi sabit yazılmaz.

| Adım              | Komut / kural                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Hazırlık          | `python3 ~/devkit-utils/steamos-prepare-upload --gameid <id>` → hedef dizin                                             |
| Yükleme           | rsync ile `~/devkit-game/<id>/`                                                                                         |
| Kayıt             | `steam-client-create-shortcut --parms <JSON>`; alanlar: `gameid`, `directory`, `argv`, `env`, `settings`, `force_appid` |
| Oyun kimliği      | `^[A-Za-z_][A-Za-z0-9_.]+$`; tire kabul edilmez                                                                         |
| Başlatma dosyası  | `argv[0]` yüklenen dizinin içinde olmalıdır                                                                             |
| Native çalıştırma | `settings.steam_play = "0"`                                                                                             |
| Kap seçimi        | `settings.compat_tool`: `SteamLinuxRuntime_4`, `SteamLinuxRuntime_sniper`, `proton-stable`…                             |
| Ortam değişkeni   | Kayıttaki `env` alanı ölçümde oyuna ulaşmadı; değişkenler yüklenen başlatıcı betikle verilir                            |
| Başlatma          | `steam-devkit-rpc run-game gameid=<id>`                                                                                 |
| Ekran görüntüsü   | `gamescopectl screenshot <yol>` (1280×800 PNG)                                                                          |
| Uzaktan çıkış     | Yok; sürece sinyal gönderilir                                                                                           |
| Temizlik          | `steamos-delete`                                                                                                        |

Deck ölçümü bir **kapı değildir**. Cihaz her zaman bağlı değildir ve bir
kapının koşulu geliştiricinin masasındaki donanım olamaz. Ölçüm çıktısı,
Android cihaz ölçümünde olduğu gibi, sonraki ölçümün kıyaslandığı bir
referanstır.

## VOL.HELL referans tüketici olarak

VOL.HELL D7 turunda yeniden aktifleştirildi (`workspace-lifecycle.json`:
active; kapsam eşiği 82/80/73/77 ratchet'li). Oynanabilirlik ve ses kabulünden
sonra active/frozen kararını kullanıcı verecek; kendiliğinden freeze yapılmaz.
VOL.ARACHNID dondurulmuş kalır.

**D7 kapsamı (2026-09-27):**

- **Kayıt kapsamları:** `synced` → `vol-hell-synced.json` (Steam Cloud
  Auto-Cloud için aday), `device` → `vol-hell-device.json` (ayarlar, dil).
  Tek dosyalı eski kayıt `migrateLegacySave` ile hedefe yazılıp geri
  okunarak doğrulanır; eski kaynak korunur ve var olan kapsamlı kayıt
  yeniden yazılmaz. Gerçek App ID Cloud eşitlemesi henüz kanıtlanmadı.
- **Kol ve gezinme:** `InputManager` `gamepad` sağlayıcısı (sol çubuk
  hareket, sağ çubuk nişan, RT `fire`, A `dash`); `FocusNavController`
  belge ömürlü; Menu → pause delegesi, B/Escape/Android-geri tek geri
  yığını; gamescope'ta pencere/çözünürlük satırları sunulmaz.
- **Native:** `vol-steamworks` (`steamworks` feature'ı) + `vol-diagnostics`
  eklentileri `run_with_context_and` üzerinden; manifesto
  `steam_input_manifest.vdf` `bundle.resources`'ta; AppRun
  `libsteam_api.so`'yu Steam istemcisinden çözer.
- **Ölçüm yüzeyi:** `src/app/deckMeasure.ts` ve native `vol-diagnostics`
  kayıt/izleyicisi yalnız `VOL_DECK_MEASURE=1` (`deck.mjs mode`) ile çalışır;
  normal üretim açılışında JSONL veya sinyal izleyicisi başlamaz. Ölçümde 10 saniyelik `perf` pencereleri,
  `pad-connected`/`pad-input` ve `steamworks` durum kayıtları JSONL'e
  düşer; `summarizeReport` bunları faz tablosunda toplar
  (`measure --seconds <n>` duvar-saati kipi).

**Deck'te ölçülenler (2026-09-27, devkit `run-game`, gamescope):**

- Steamworks: `available`, `deck`, `bigPicture`, `overlayEnabled`,
  `cloudEnabled`, `inputReady`, `manifestOk` → tümü true, appId 480.
- Kol: `pad-connected` `"Steam Deck"`/`standard`; ilk fiziksel basım
  `pad-input` kaydıyla kanıtlı (t≈12,7 s).
- Eski ölçüm kaydında 9 pencere 58,0–59,4 FPS, p95 ≤ 21 ms,
  > 34 ms kare oranı pencere başına ≤ %1 idi. Pencereler sahne ve yükle
  > etiketlenmediği için bunların tamamı gerçek oynanış sonucu sayılamaz;
  > ayrı ekran görüntüsü DALGA 1 HUD ve dövüş yüzeyini doğrular.
- Kapanış: SIGTERM → `vol:terminate` → son pencere `final:true` ile
  diske düştü → `flushed:true` temiz çıkış.
- Kayıt: `device.*` store dosyası (`vol-hell-device.json`) dil ve ses
  ayarlarıyla doğdu; `synced` dosyası istatistik ilk yazıldığında
  oluşacak — turda yazılmadı.

**İnsan turunda kalacaklar:** kolla menü gezintisi hissi, pause/nişanın
oynanışta doğrulanması, overlay açılışı ve metin girişi diyalogları,
titreşimin elle hissedilmesi.

### D7 sağlamlaştırma başlangıç matrisi (2026-09-27)

Burada “bildirim” kullanıcı deneyimini, “kaynak” depoda yeniden okunan kodu,
“hipotez” henüz kanıtlanmamış nedeni söyler. Test sütunu hedef doğrulamadır;
yeşil olduğu ayrıca yazılmadıkça koşulmuş sayılmaz. 2026-09-27 ön denemesinde
eski Deck paketi Steam kütüphanesine döndü: süreç SIGSEGV ile kapandı,
`libmanette-0.2` yığını görüldü. Bu yüzden bu tablodaki hiçbir oyun ekranı
yeniden Deck'te kabul edilmiş değildir.

| Konu            | Gerçek gözlem                                                                                   | Henüz hipotez                                                      | Tekrar üretim ve ürün etkisi                                                                                      | Sahip                                 | Gerekli test                      | Deck kanıtı                                | İnsan kabulü                        |
| --------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------- | ------------------------------------------ | ----------------------------------- |
| A Glif          | Bildirim: gerekli yerlerde yok; kaynakta `controlGlyph` aileyi bir kez seçiyor.                 | Hot-plug ve kip geçişi bayat glif bırakabilir.                     | Menü, ayar, pause, kart, dükkân ve HUD'da kol/klavye/dokunma değiştir; yanlış eylem ve erişilebilir etiket riski. | CORE glif mekanizması, oyun yerleşimi | DOM + WebKit ekran matrisi        | Her ekranın gerçek görüntüsü bekliyor.     | Yerleşim ve okunabilirlik bekliyor. |
| B Görüntü       | Bildirim: siyah bant; kaynakta oyun penceresi 1280×720, panel 1280×800.                         | Gamescope fullscreen yaması 16:10'u düzeltebilir.                  | Panel, OS pencere, canvas client/backing ve DOM sınırlarını 16:10/16:9/TV'de ölç; kullanılabilir alan kaybı.      | tauri-v2 kabuk, oyun ölçek            | Boyut/safe-area DOM + WebKit      | Yeni build görüntüsü bekliyor.             | TV/dock ergonomisi bekliyor.        |
| C Metin         | Bildirim: OS klavyesi touchpad ile çalışıyor; oyunda Steam provider çağrısı kaynakta bulunmadı. | Yalnız kol başlangıcında AudioContext/metin girişi kilitlenebilir. | Modal/kayan klavye, yerleşik klavye ve OS klavyesini ayrı dene; metin girişinin kesilmesi.                        | CORE sağlayıcı, oyun entegrasyonu     | Sağlayıcı + gerçek WebKit         | Fiziksel giriş bekliyor.                   | Klavye kullanımı bekliyor.          |
| D Titreşim      | Bildirim: hissedilmiyor; native aygıt/`None` tek sefer önbellekte.                              | Hotplug, uyku veya bozuk FD; `ok` motor hissi değildir.            | Durum, komut ve fiziksel motoru ayrı ölç; geri bildirimin yokluğu.                                                | tauri-v2 sürücü, oyun ayarı           | Yeniden keşif ve hata enjeksiyonu | Yeni statü/komut bekliyor.                 | Fiziksel his bekliyor.              |
| E Gezinme       | Bildirim: stick, D-pad, touchpad ve slider zor; 220 ms geri engeli kaynakta.                    | Odak sınırı ve çift olaylar etkili olabilir.                       | Art arda geri, stick tekrar, slider, modal, scroll; menü erişimini engeller.                                      | CORE odak, vol-ui, oyun ekranı        | Saf + DOM + WebKit; fiziksel kol  | Ekran/olay kaydı bekliyor.                 | Ergonomi bekliyor.                  |
| F Geri/pause    | Bildirim: B anlık durup dönebiliyor; `GameMobileControls` geri handler'ı toggle yapıyor.        | Tek fiziksel basım iki API olayına dönüşebilir; ölçülmedi.         | Kısa/uzun B, Menu, Escape; oyun, pause, ayar, kart, ölüm; yanlış unpause.                                         | CORE olay sınırı, oyun eylemi         | Tek/çift olay regresyonu + WebKit | Fiziksel olay dizisi bekliyor.             | Doğal basım hissi bekliyor.         |
| G Otomatik ateş | Bildirim: Android benzeri seçilebilir ateş; dokunma sağ çubuğu temasla `fire` üretiyor.         | Deck seçiminin anlamı kullanıcı kararı gerektiriyor.               | Sağ çubuk/RT, pause/kart ve cooldown; istemsiz ateş.                                                              | Oyun ayarı ve eylemi                  | Saf + oyun sahnesi                | Fiziksel nişan/tetik bekliyor.             | Ürün seçimi ve ergonomi bekliyor.   |
| H Sağ çubuk UI  | Bildirim: cursor hareket etmiyor; `CustomCursor` pointer olaylarından besleniyor.               | UI için sanal pointer köprüsü gerekebilir.                         | Oyun AIM, UI odak/cursor, hover, click, scroll, touchpad; yanlış kart seçimi.                                     | CORE mekanizma, oyun eşleme           | Pointer semantiği + WebKit        | Fiziksel cursor bekliyor.                  | Hız ve kontrol bekliyor.            |
| I FPS           | Bildirim: 10–20 düşmanda yavaşlıyor; D7'de 9 pencere 58–59,4 FPS, p95 en çok 21 ms.             | Mevcut rAF kaydı sahne/yük ayırmadığından neden bilinmiyor.        | Tohumla 0/10/20/30+ düşman, kart ve boss; 60 FPS ve p95 ≤18 ms hedefi.                                            | scripts ölçüm, oyun profil            | Yük/evre kimlikli örnekleme       | Aynı pencerede CPU/GC/kare kaydı bekliyor. | Oynanabilirlik bekliyor.            |
| J Kart          | Bildirim: açılır açılmaz yanlış seçim; `CardPicker.show()` ilk action'a odaklanıyor.            | UI→UI geçişte basım devri ve pointer-up yarışabilir.               | Çoklu level-up, shop, Enter ve sanal mouse; ilerleme seçimi geri alınamaz.                                        | CORE güvenli niyet sınırı, oyun akışı | Saf + DOM + WebKit                | Gerçek ardışık kart bekliyor.              | Seçim rahatlığı bekliyor.           |
| K Sol touchpad  | Bildirim: Undo/Print tarayıcı davranışı.                                                        | Steam Input eşlemesi, native klavye veya WebKit kısayolu olabilir. | İçerik kaydetmeden olay türü/bağlamı ölç; yanlış tarayıcı eylemi.                                                 | scripts sonda, oyun bağlamı           | Olay sınıflama + WebKit           | Fiziksel olay izi bekliyor.                | Touchpad kullanımı bekliyor.        |

## Açık ölçümler

Aşağıdakiler insan eliyle, cihaz başında ölçülür. Ölçüldükçe tarih ve
cihazla yukarıdaki bölümlere taşınır.

- **Gamepad API:** sanal kol `"Steam Deck"`/`standard` olarak görünür ve
  ilk fiziksel basım oyuna ulaştı (2026-09-27, vol-hell `pad-connected` +
  `pad-input` kayıtları). Detay kalanlar: arka tuşlar; sanal kol yuvası ↔
  Gamepad sırası; eksen ölü bölgesinin hissi.
- **Trackpad ve dokunmatik:** hangi olay türünü ürettiği (`pointerType`); oyun bunları nasıl görüyor.
- **Steam ve Quick Access düğmesi:** WebView'da `blur` ya da `visibilitychange` üretip üretmediği.
- **Uyku ve uyanma:** `requestAnimationFrame` sürekliliği, AudioContext durumu, saat sıçramaları.
- **Steam'den çıkış:** `devkit run-game` sürecine SIGTERM → JS
  `vol:terminate` dinleyicisi flush'ını tamamladı → `flushed:true`
  temiz çıkış (2026-09-27 ölçüldü). Steam arayüzündeki "Oyundan çık"
  düğmesinin gönderdiği sıra insan turunda ayrıca sınanır.
- **Titreşimin hissedilmesi:** hidraw raporu `rc=65` ile kabul edildi
  (ölçüldü) ama motorların gerçekten döndüğü ancak elde tutularak doğrulanır.
- **Pil:** 60 FPS ve 30 FPS'te güç tüketimi (sayaçlar okunabilir; kontrollü yük D1 sondasını ister).
- **OLED Deck ve Steam Machine:** kare zamanlaması (90 Hz; TV çıkışı).
