# Steam Deck ve Valve donanım ailesi

> **Durum:** Hiçbir aktif oyun henüz Steam Deck'e gönderilmiyor. Bu belge
> platformun ölçülmüş gerçeklerini, bunlardan çıkan kararları ve Deck'e
> özgü sözleşmeleri tutar. Yapılacak işler kök [TODO.md](../TODO.md)dedir.
> Ölçümler 2026-09-23'te bir Deck üzerinde, amaca özel bir Tauri sondasıyla
> yapıldı (Phaser 4 WebGL + Gamepad + ses + yaşam döngüsü kaydı). Belgedeki
> her sayı o ölçümdendir; ölçülmemiş olan "Açık ölçümler" bölümündedir.

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

| Yol                                                | Saf rAF   | 4000 sprite (10 sn) | p50 / p95 / p99 | Web süreci CPU |
| -------------------------------------------------- | --------- | ------------------- | --------------- | -------------- |
| WebKit varsayılanı (DMA-BUF açık, DRM vblank)      | 50,2 FPS  | 50 FPS, 500 kare    | 20 / 21 / 21 ms | ~%30           |
| DMA-BUF kapalı                                     | ölçülmedi | 49,9 FPS, 499 kare  | 20 / 20 / 25 ms | ~%76           |
| DMA-BUF açık + `WEBKIT_FORCE_VBLANK_TIMER=1`, host | 62,3 FPS  | 59,5 FPS, 595 kare  | 16 / 20 / 26 ms | ölçülmedi      |
| Aynısı, Steam Linux Runtime 4.0                    | 62,2 FPS  | 59,9 FPS, 599 kare  | 17 / 18 / 19 ms | ölçülmedi      |

CPU değerleri 200 sprite'lık etkileşim fazında `top`'tan okundu. XWayland süreci DMA-BUF açıkken ~%13, kapalıyken ~%16 idi. Boş sahnede ve 1000 sprite'ta kare hızları aynı yolun 4000 sprite değerinden ±0,5 FPS içindeydi.

**Kök neden:**

- WebKit'in DRM vblank izleyicisi (`drmWaitVBlank`) gamescope altında 50 Hz tempo veriyor.
- Aynı anda gamescope'un FPS sınırı 60 ve dinamik yenileme hızı 60; XRandR 59,81 Hz bildiriyor.
- Oyun odaktayken `GAMESCOPE_DISPLAY_REFRESH_RATE_FEEDBACK` 50'ye iniyor.
- Tempo yükten bağımsız: boş sahne de 4000 sprite da aynı 50 FPS'te kalıyor.
- Zamanlayıcı izleyicisine zorlamak 60'ı geri getiriyor.

**Kural:**

- Gamescope oturumunda (`GAMESCOPE_WAYLAND_DISPLAY` var) kabuk `WEBKIT_FORCE_VBLANK_TIMER=1` verir ve DMA-BUF çizicisini açık bırakır.
- Bugünkü `configure_linux_webview` Deck'te çiziciyi kapatır; bu ölçümle çelişir. Aynı kare hızında 2,5 kat CPU harcatır.
- NVIDIA kuralı ([android.md](android.md#webview-çizim-yolu)) korunur.
- Dışarıdan verilen değişken ezilmez.

**Açık kalan zamanlama soruları:**

- Zamanlayıcı ~62 Hz'te serbest koşuyor, panel 60 Hz. Host koşusunda p99 25–29 ms'ye çıktı; bu ara sıra kaçan kareyi gösteriyor. Sunum temposu (takılma, kare atlama) gamescope istatistikleriyle ölçülmeli.
- `WEBKIT_DISPLAY_REFRESH_THROTTLE_FPS` yalnız yenileme hızının böleni olan değerleri kabul eder.
- OLED Deck 90 Hz'te çalışır. Zamanlayıcının orada 60'ta kalıp kalmadığı ölçülmedi.

## Girdi

**Bugünkü durum:**

- `core`'da gamepad sağlayıcısı yok.
- `InputManager` aktif sağlayıcıyı "dokunmatik her zaman önce" kuralıyla seçiyor.
- Fare `providesRestingState` ile sürekli nişan sinyali veriyor.
- Deck'te dokunmatik, kol ve trackpad aynı anda mevcuttur.

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

- VOL.HELL'de bugün metin girişi yok. `core`'un `Input` ve `TextArea` bileşenleri var.
- `core` bir metin girişi isteği sözleşmesi taşır. Kol kipinde giriş alanı odaklanınca klavye kendiliğinden açılır.
- Steamworks katmanı varsa `ShowFloatingGamepadTextInput` kullanılır. Bu çağrı yalnız Deck arayüzünde uygulanmıştır.
- Katman yoksa `core`'un yalnız kolla kullanılan ekran klavyesi açılır. Klavye Türkçe karakterleri taşır (ç, ğ, ı, İ, ö, ş, ü).

## Titreşim

- `core` haptik katmanının `gamepad` arka ucu `vibrationActuator`'a dayanır. Bu Deck'teki WebKitGTK 2.52'de yoktur; Debian 13'ün bugünkü sürümü 2.52.6'dır.
- **Karar:** `tauri-v2`'ye native bir Linux haptik sürücüsü eklenir.
  - Steamworks varsa Steam Input titreşimi kullanılır.
  - Yoksa sanal kola evdev force-feedback gönderilir; Deck ve Steam Controller bu titreşimi kendi haptik motorlarıyla öykünür.
- Paketlenen WebKit ≥ 2.54 olduğunda tarayıcı yolu kendiliğinden devreye girer.

## Yaşam döngüsü: uyku, kapatma, kayıt

**Ölçülen:**

- SIGTERM'i Rust yakalar; JS olayı 2 ms içinde alır.
- Süreç tanınan süre sonunda düzgün kapanır. Bu hem host'ta hem Steam Linux Runtime 4.0'da ölçüldü.
- Uykudan önce logind gecikme kilidi 5 sn'dir.
- Uyku sırasında Wi-Fi kesilir. Steam Cloud'un dinamik eşitlemesi dosyaları uyku anında yukarı gönderir.
- Steamworks'te uyanma bildirimi `AppResumingFromSuspend_t`'dir.

**Bulgular:**

- `tauri-plugin-store` 2.4.4'ün `save()`'i doğrudan `fs::write` yapar: geçici dosya, `fsync` ya da `rename` yok. Yazma sırasında süreç öldürülür ya da güç kesilirse dosya yarım kalır.
- VOL.HELL ilerlemeyi ve cihaz ayarlarını (ses, tuş, video) tek bir dosyada tutar.

**Kararlar:**

- **Atomik yazıcı:** geçici dosya → `fsync` → `rename` → dizin `fsync`. Bir önceki nesil yedek olarak kalır. Bozuk kayıt okunursa yedeğe dönülür ve durum raporlanır.
- **Boşaltma protokolü:**
  - SIGTERM, SIGINT, SIGHUP ve logind `PrepareForSleep` bir "şimdi boşalt" olayı üretir.
  - `core` bekleyen yazıları boşaltır ve onaylar; süre sınırlıdır.
  - SIGKILL'e karşı güvence boşaltma değil, atomikliktir.
- **Kalıcılık kapsamları:** `synced` (ilerleme; Cloud'a gider) ve `device` (grafik, pencere, cihaz ses ayarları; gitmez). Kapsamlar ayrı dosyalardır.
- **Zaman:** `performance.now()` monoton saattir ve uyku süresini saymaz. `Date.now()` uykudan sonra sıçrar. Duvar saatine bağlı mantık bu farkla yazılır; simülasyon adımı sınırlanır.

## Görüntü ayarları gamescope altında

- Gamescope pencereyi çıkış çözünürlüğünde tam ekrana zorlar. Pencere kipi ve çözünürlük seçenekleri orada etkisizdir.
- VOL.HELL bu seçenekleri `getRuntimePlatform() === 'desktop'` ile açar. Deck de `desktop` sayıldığı için etkisiz seçenekler görünür.
- **Karar:** Kabuk gamescope oturumunu ayrı bir yetenek olarak bildirir; bu seçenekler orada sunulmaz.
- Deck'in varsayılan grafik kalitesi cihaz kapsamında tutulur. Oyuncu hiçbir ayarı değiştirmek zorunda kalmaz.

## Okunabilirlik ve ölçek

- 1280×800'de 9 px metin Deck ekranında zar zor seçilir, 12 px okunur (sonda ekran görüntüsü). Taban 12 px'tir.
- Denetim Playwright'ın WebKit projesinde yapılır; Deck'teki motor WebKitGTK'dır. E2E bugün yalnız Chromium'da koşar.
- Ölçülen boyutlar:
  - 1280×800 ve 1280×720.
  - Steam Machine için 1920×1080 ve 3840×2160, oturma mesafesi için bir UI ölçeğiyle.
- 16:10 birincil orandır. 16:9 ve geniş oranlar letterbox ile doğru yerleşir.

## Steamworks katmanı (oyun başına isteğe bağlı)

- **Kütüphane:** `steamworks` crate 0.13.1 (Temmuz 2026) şunları sağlar:
  - Steam Input: aksiyon setleri, aksiyon origin'leri, glif yolu.
  - `is_steam_running_on_steam_deck`.
  - Kayan ve Big Picture klavyesi.
  - Remote Storage, UserStats ve `GameOverlayActivated`.
- Titreşim ve boyutlu PNG/SVG glif çağrıları güvenli API'de yoktur; `steamworks-sys` ile tamamlanır.
- **Overlay:** Masaüstünde Steam overlay'i WebView'ın üstüne çizilmez. Overlay süreç içi bir swapchain'e kanca atar; WebView süreç dışında çizer. Deck'in Game Mode'unda overlay'i gamescope birleştirir.
- **App ID ve SDK:**
  - Katman bir App ID ister; geliştirme test kimliği 480'dir.
  - `steam_appid.txt` yalnız geliştirmededir.
  - SDK'nın dağıtılabilir kütüphanesi oyunla gider, depoya girmez.
- Katmanı taşımayan oyun, yukarıdaki kol, glif ve klavye yollarıyla eksiksiz çalışır.

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

VOL.HELL `frozen`'dır. Deck desteğinin uçtan uca kanıtı için yeniden
aktifleştirilir (prosedür: [games/docs/new-game.md](../games/docs/new-game.md)).
Kabulden sonra yeni bir annotated freeze etiketiyle yeniden dondurulur;
eski etiketler değişmez. VOL.ARACHNID dondurulmuş kalır.

**2026-09-23'te güncel `core`'a karşı ölçülen hazırlık:**

- `tsc`: hata yok.
- ESLint: temiz.
- 69 test dosyası / 761 test geçiyor.
- 1000 satırı aşan dosya yok.
- Prettier uyarıları yalnız üretilmiş `src-tauri/gen/schemas` dosyalarında.

**Deck'e özgü değişecekler:**

- Oyuna özgü uygulama kimliği ve kayıt geçişi; bugünkü kimlik `com.volstudio.game`.
- `linux.AppRun`'daki sabit önbellek adı ürün adından türer.
- Kayıtların `synced` ve `device` kapsamlarına bölünmesi.
- Gamescope altında görüntü ayarları.
- Duraklatmanın Menu'ye, nişanın sağ çubuğa bağlanması.
- Bütün ekranların kolla gezilmesi.

## Açık ölçümler

Aşağıdakiler insan eliyle, cihaz başında ölçülür. Ölçüldükçe tarih ve
cihazla yukarıdaki bölümlere taşınır.

- **Gamepad API:** standart eşleme, tuş ve eksen sırası; arka tuşlar; sanal kol yuvası ↔ Gamepad sırası.
- **Trackpad ve dokunmatik:** hangi olay türünü ürettiği (`pointerType`); oyun bunları nasıl görüyor.
- **Steam ve Quick Access düğmesi:** WebView'da `blur` ya da `visibilitychange` üretip üretmediği.
- **Uyku ve uyanma:** `requestAnimationFrame` sürekliliği, AudioContext durumu, saat sıçramaları.
- **Steam'den çıkış:** Steam'in "Oyundan çık" komutunun gönderdiği sinyal sırası ve tanıdığı süre.
- **Evdev titreşimi:** sanal kola evdev force-feedback'in Steam Linux Runtime 4.0 kabı içinden çalışıp çalışmadığı.
- **Pil:** 60 FPS ve 30 FPS'te güç tüketimi (`/sys/class/power_supply`).
- **OLED Deck ve Steam Machine:** kare zamanlaması (90 Hz; TV çıkışı).
