# Steam Deck ve Valve donanım ailesi

Platformun ölçülmüş gerçekleri, onlardan çıkan kararlar ve devkit sözleşmesi.
Ölçümler bir LCD Deck üzerinde `devtools/deck-probe` sondasıyla (Phaser 4
WebGL, Gamepad, ses, yaşam döngüsü kaydı) ve bir oyunun devkit turuyla
yapılmıştır; gerçek App ID, yayımlanmış Steam Input düzeni ya da Valve onayı
yerine geçmez. Yapılacak işler kök [TODO.md](../TODO.md)dedir; yeni oyunun
kabul listesi [new-game.md](new-game.md#steam-deck-kabulü)dedir.

Hedef, Valve'ın ortak uyumluluk programıdır: Verified incelemesi Steam Deck,
Steam Machine ve Steam Frame için tek kriter setiyle yapılır; yeni Steam
Controller Deck'in kontrol düzenini taşır. Frame (ARM64, VR) kapsam dışıdır.

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

Valve'ın önerileri de bağlayıcıdır:

- Kayıtlar Steam Cloud ile eşitlenir; grafik ayarları cihaza özgü kalır.
- Tek oyunculu içerik internetsiz oynanır.
- Fare ile çubuk girdisi aynı anda kabul edilir; biri ötekini kilitlemez.
- Her oyunun bir FPS sınırı vardır: kendi sınırı (`createVolGame({ fpsLimit })`)
  ya da sistemin sınırlayıcısı.
- Uykudan önce kayıt güvenceye alınır.

## Cihaz ve çalışma ortamı

- Steam Deck LCD ("Jupiter"), SteamOS 3.8, çekirdek 6.16, glibc 2.41,
  gamescope 3.16. Panel fiziksel olarak 800×1280; gamescope 1280×800 sunar,
  yenileme 40–60 Hz. Oyun Steam "gamepad UI" oturumunda çalışır.
- Host'ta GTK 3/4, GStreamer ve FUSE 2/3 vardır; **WebKitGTK yoktur.**
- Logind uykudan önce bir uygulamaya en çok 5 sn gecikme kilidi tanır
  (`InhibitDelayMaxUSec`).

**Steam'in oyuna verdiği ortam:**

| Değişken                                                 | Değer / anlam                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| `SteamDeck`, `SteamOS`, `SteamGamepadUI`, `SteamTenfoot` | `1` — Deck'te ve Big Picture oturumunda                             |
| `SteamAppId`, `SteamGameId`                              | Uygulama kimliği (devkit kısayolunda da atanır)                     |
| `SteamVirtualGamepadInfo`                                | Sanal kolların arkasındaki gerçek aygıtı listeleyen dosyanın yolu   |
| `DISPLAY`                                                | `:1` — oyunlar ikinci XWayland'dedir                                |
| `XDG_SESSION_TYPE`                                       | `x11`; `WAYLAND_DISPLAY` yoktur, `GAMESCOPE_WAYLAND_DISPLAY` vardır |
| `GDK_BACKEND`                                            | `x11` (linuxdeploy GTK kancası koyar; gamescope'ta doğrudur)        |
| `SDL_ENABLE_STEAM_SCREEN_KEYBOARD`                       | SDL'e özgüdür; WebView'ı etkilemez                                  |

`SteamVirtualGamepadInfo` biçimi:

```ini
[slot 0]
name=Steam Deck Controller
VID=0x28de
PID=0x1205
type=steam
```

Steam kullanıcı adı ve oturum belirteçleri de aynı ortamda gelir; teşhis kodu
ortamı izin listesiyle okur, `Steam*` önekiyle toptan kayıt yapılmaz.

**WebView'ın gördüğü cihaz:**

- `maxTouchPoints=0`, `pointer: fine`, `hover: true`, `any-pointer: coarse`;
  `shouldUseTouchControls()` Deck'te `false` döner.
- WebGL2 vardır; sürücü adı gizlidir (`"Apple GPU"`), cihaz sınıfı native
  taraftan okunur. Ayrı GPU süreci yoktur.
- AudioContext açılışta `running`, 44,1 kHz.
- Gamepad API vardır; `vibrationActuator` yoktur (WebKitGTK 2.52; 2.54
  libmanette ile getirir).

**Girdi düğümleri:**

| Düğüm         | Aygıt                               | Yetenek                                                                                    |
| ------------- | ----------------------------------- | ------------------------------------------------------------------------------------------ |
| `event4`      | Steam Deck Controller               | Yalnız KEY+MSC+REP (lizard klavye yüzeyi); **ABS yok**                                     |
| `event12`     | Steam Deck Controller               | REL_X/Y, yüksek çözünürlüklü teker, BTN_LEFT/RIGHT (trackpad fare yüzeyi)                  |
| `event14`     | `Microsoft X-Box 360 pad 0`         | Steam Input'un sanal kolu; oyun yokken de hazır; ABS eksenleri, HAT, **EV_FF + FF_RUMBLE** |
| `event18`     | FTS3528 dokunmatik                  | ABS_MT çoklu dokunma                                                                       |
| `event19`     | FTS3528 ikincil düğüm               | ABS_X/Y                                                                                    |
| `event21`     | `steamos-manager`                   | Yalnız KEY — Steam/QAM sistem tuşlarını enjekte eder                                       |
| `hidraw0/2/4` | Steam Deck Controller (`28de:1205`) | Gerçek pad verisi ve haptik komutlarının HID yolu                                          |

Fiziksel kol düğümlerinde force-feedback biti yoktur. `rtcwake` yüklüdür.
Güç sayaçları uzaktan okunur: BAT1, `steamdeck_hwmon`, `amdgpu` ve RAPL
`energy_uj`.

## Dağıtım yolu

- Native Linux yapısı; WebKitGTK paketle taşınır.
- Derleme steamrt4 SDK kabında (podman) yapılır: `pnpm build:linux-steamrt4`.
- Gönderilen şey açılmış bir AppDir'dir; pressure-vessel kabında FUSE
  olmadığı için AppImage gönderilmez.
- Çalışma zamanı Steam Linux Runtime 4.0'dır (Debian 13 tabanlı).

| Deneme                                                                         | Sonuç                                                                                           |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Fedora 44'te (glibc 2.43) üretilmiş AppImage                                   | Açılmaz: paketlenmiş WebKit, GLib ve ICU `GLIBC_2.42`, `GLIBC_2.43`, `GLIBC_ABI_GNU2_TLS` ister |
| Debian 13 kabında (glibc 2.41, WebKitGTK 2.52.6) üretilmiş sonda, SteamOS host | Açılır                                                                                          |
| Aynı sonda, Steam Linux Runtime 4.0 kabında                                    | Açılır; WebGL2, ses ve Gamepad API çalışır                                                      |

**Reddedilen yollar:** Proton + WebView2 (kullanıcı kurulumu ister, Microsoft
desteklemez); host'un WebKit'i (yoktur); Steam Linux Runtime 3.0 (glibc 2.31,
Debian 13 ikilisi açılmaz).

**Paket içeriği:**

- Grafik sürücü kütüphaneleri (`libgbm`, `libEGL`, `libGL`, `libdrm`) pakete
  girmez; host'tan gelir.
- WebKit, GTK, GLib, ICU, libmanette ve GStreamer eklentileri (ogg, vorbis,
  opus, pulseaudio, autodetect) pakete girer. Debug ikiliyle açılmış AppDir
  515 MB'tır.
- AppDir `AppRun` üzerinden paket bağlanmadan çalışır; kap içinde
  `linuxdeploy` FUSE'süz koşar (`APPIMAGE_EXTRACT_AND_RUN=1`).
- Paketteki hiçbir ELF `GLIBC_2.41` üstünü istemez; bekçi çıktı AppDir'inde
  koşar.

**Kimlik ve kayıt yolu:** veri dizini Tauri kimliğinden türer
(`~/.local/share/<identifier>`) ve Steam Cloud kökü bu yola bağlanır. Kimlik
oyuna özgüdür; değiştirmek kayıt yolunu değiştirir ve yedekli tek seferlik
geçiş ister.

## Çizim ve kare zamanlaması

Koşul: 1280×800, Phaser 4 WebGL; saf `requestAnimationFrame`, boş sahne, 1000
ve 4000 hareketli sprite.

| Yol                                                | Saf rAF       | 4000 sprite (10 sn) | p50 / p95 / p99     | Web süreci CPU |
| -------------------------------------------------- | ------------- | ------------------- | ------------------- | -------------- |
| WebKit varsayılanı (DMA-BUF açık, DRM vblank)      | 50,2 FPS      | 50 FPS              | 20 / 21 / 21 ms     | ~%30           |
| DMA-BUF kapalı                                     | ölçülmedi     | 49,9 FPS            | 20 / 20 / 25 ms     | ~%76           |
| DMA-BUF açık + `WEBKIT_FORCE_VBLANK_TIMER=1`, host | 62,3 FPS      | 59,5 FPS            | 16 / 20 / 26 ms     | ölçülmedi      |
| Aynısı, Steam Linux Runtime 4.0                    | 62,2 FPS      | 59,9 FPS            | 17 / 18 / 19 ms     | ölçülmedi      |
| Kabuk kuralı (otomatik), SLR4                      | 62,2–62,4 FPS | 58,9–59,2 FPS       | 17 / 19–20 / 21+ ms | ölçülmedi      |

**Kök neden:** WebKit'in DRM vblank izleyicisi (`drmWaitVBlank`) gamescope
altında yükten bağımsız 50 Hz tempo verir; gamescope'un sınırı ve dinamik
yenileme hızı 60'tır, oyun odaktayken
`GAMESCOPE_DISPLAY_REFRESH_RATE_FEEDBACK` 50'ye iner. Zamanlayıcı
izleyicisine zorlamak 60'ı geri getirir.

**Kural** (`tauri-v2/src-tauri/src/lib.rs`, `linux_webview_plan`; tam tablo
[linux.md](linux.md#webview-çizim-yolu)):

- gamescope oturumunda (`GAMESCOPE_WAYLAND_DISPLAY` ya da `GAMESCOPE_STATS`)
  kabuk `WEBKIT_FORCE_VBLANK_TIMER=1` verir ve DMA-BUF çizicisini açık bırakır;
  kapalı yola göre aynı kare hızında ~2,5 kat daha az CPU harcar.
- Dışarıdan verilen değişken ezilmez (`set_env_default`).
- Kabuk oturumu `session_kind` komutuyla bildirir, ön yüz `getSessionKind()`
  ile okur: `gamescope` (Deck oyun kipi), `bigpicture` (masaüstünde Steam Big
  Picture: `SteamGamepadUI`/`SteamTenfoot`), `desktop`. İlk ikisi kol kipiyle
  başlar; gamescope'ta kabuk bütün pencereleri tam ekrana alır.

**Açık zamanlama soruları:**

- Zamanlayıcı ~62 Hz'te serbest koşar, panel 60 Hz; p95 ≤ 18 ms eşiği 4000
  sprite'ta karşılanmadı, p99 ara sıra kaçan kareyi gösterir. Sunum temposu
  gamescope istatistikleriyle ölçülmelidir.
- `WEBKIT_DISPLAY_REFRESH_THROTTLE_FPS` yalnız yenileme hızının bölenlerini
  kabul eder.
- OLED Deck 90 Hz'tir; zamanlayıcının orada davranışı ölçülmedi.

## Girdi

**Deck'in verdiği:** Steam Input, API kullanmayan oyuna kolu sanal bir Xbox
360 kolu olarak sunar; trackpad'ler varsayılan şablonda fare üretir;
dokunmatik ekran gamescope'un dokunma kipiyle iletilir ama WebView
`maxTouchPoints=0` bildirir; arka tuşlar, gyro ve trackpad'in kendisi yalnız
Steam Input API ile ya da kullanıcı eşlemesiyle görünür.

**CORE'un karşılığı:**

- `GamepadController`: standart eşleme, ölü bölge, analog hareket ve nişan;
  eylem → düğme bağı `GamepadActionBinding` verisidir.
- `InputModeArbiter`: son anlamlı girdi kazanır, eşit kenarda histerezis
  görevliyi korur; fare ve çubuk nişanı birbirini kilitlemez.
  `inputModeForSession('gamescope')` başlangıç kipini kola kurar; Gamepad
  API'nin kolu ilk basışa kadar göstermemesine bağlanmaz.
- `FocusNavController`: D-pad ve çubuk uzamsal odak taşır
  (`pickDirectionalTarget`), A etkinleştirir, Menu `onMenu`, LB/RB sekme
  değiştirir. Odak halkası (`vol-focusnav-current`) yalnız kol/klavye
  kipinde görünür.
- Tek geri yığını: `triggerBack` Android geri, Escape ve kolun B'sini aynı
  yığına bağlar; `Modal` açıkken kendini kaydeder.

**Oyunun işi:** Menu'yü duraklatmaya, nişanı sağ çubuğa, ateş/atılmayı
tetiklere bağlamak; bağlar `<oyun>/src/config/` altında veridir.

**Oyun turunda görülen tuzaklar** (her yeni oyunun kabulünde sınanır):

- Glif ailesini bir kez seçen kod hot-plug ve kip değişiminde bayat glif
  bırakır.
- 1280×720 sabit pencere 16:10 panelde siyah bant bırakır.
- Tek fiziksel B basışı iki olaya dönüşüp duraklatmayı aç-kapa yapabilir.
- Açılır açılmaz ilk eylemine odaklanan seçim ekranı, önceki basışın
  bırakılmasıyla yanlış seçim yapabilir.
- UI'da sağ çubuk imleci taşımaz; imleç yalnız işaretçi olaylarından beslenir.
- Sol trackpad WebKit'in Undo/Print kısayollarını tetikleyebilir; kabuk
  betiği ve `suppressNativeMenus` yazdırma, yenileme, bul, geri/ileri ve metin
  alanı dışında geri al/tümünü seç kısayollarının varsayılanını durdurur.
- Paketlenen libmanette ile süreç SIGSEGV ile düşebilir.

## Glifler

Aile çözüm sırası: Steamworks girdi türü → `SteamVirtualGamepadInfo` üzerinden
gerçek VID/PID (native köprü) → `Gamepad.id` → `SteamDeck=1` → Xbox.

Aileler: Xbox, PlayStation, Nintendo, **Valve** (Deck ve yeni Steam
Controller: A/B/X/Y, L1/R1, L2/R2, L4/R4/L5/R5, View, Menu, iki trackpad;
omuz tuşları LB/RB değil **L1/R1**), klavye, fare.

Depo herkese açıktır: Valve'ın partner sitesinden indirilen glif çizimleri
depoya girmez; Steam istemcisinin glifleri çalışma zamanında Steamworks'ten yol
olarak alınabilir; depodaki set CC0 kaynaklıdır (Kenney Input Prompts, Xelu);
marka logoları çizilmez.

Bilinmeyen: Gamepad API sırası ile sanal kol yuvası numarasının eşleşmesi.

## Metin girişi

`core/src/ui/textEntry/`: `Input`/`TextArea` odaklanınca
`requestTextEntryForElement` çalışır; kip `gamepad` ise native odak
kaldırılır ve klavye açılır. Sağlayıcı kayıtlıysa (`setTextEntryProvider`)
platform klavyesi, yoksa `OnScreenKeyboard` açılır: Türkçe Q düzeni,
ı/İ/ğ/ü/ş/ö/ç birinci sınıf tuş; shift tuşları yeniden yaratmaz, odak yerinde
kalır; parola ekranda maskelenir; alanın `maxLength`i klavyeye ve Steam'e
taşınır; B/Escape ortak geri yığınından iptal eder ve başlangıç değeri döner;
Bitti commit eder ve odak alana döner.

## Titreşim

- `core` haptik katmanının `gamepad` arka ucu `vibrationActuator`'a dayanır;
  Deck'teki WebKitGTK 2.52'de yoktur.
- Sanal kolun evdev FF'i oyun sürecinden `EVIOCSFF`'te **EFAULT** verir
  (uinput yüklemesi devkit oyununa servis edilmez).
- `hidraw2` Deck'in `ID_TRIGGER_RUMBLE_CMD` (0xEB) feature raporunu kabul eder
  (SDL `hidapi_steamdeck` biçimi); kabuğun hidraw arka ucu süreç içinden
  `backend:"hidraw"` ile raporu gönderir, kare zamanlaması bozulmaz. Motorun
  dönüşü elle hissedilerek doğrulanır.
- `tauri-v2` Linux sürücüsünün öncelik sırası: Steamworks Steam Input
  titreşimi (katman varsa) → `hidraw` HID rumble → evdev `FF_RUMBLE` (yalnız
  yüklemeyi kabul eden ortamlar). Paketlenen WebKit ≥ 2.54 olduğunda
  tarayıcı yolu kendiliğinden devreye girer.

## Yaşam döngüsü: uyku, kapatma, kayıt

**Ölçülen:** SIGTERM'i Rust yakalar ve JS olayı 2 ms içinde alır; süreç
tanınan süre sonunda düzgün kapanır (host ve SLR4). Uyku sırasında Wi-Fi
kesilir. Steamworks'te uyanma bildirimi `AppResumingFromSuspend_t`'dir.

**Kararlar:**

- **Atomik yazıcı** (`tauri-v2/src-tauri/src/store.rs`): geçici dosya →
  `fsync` → güncel kayıt `.bak` olarak bağlanır → geçici dosya güncelin
  üstüne `rename` → (Unix'te) dizin `fsync`; güncel dosya hiçbir anda diskten
  kalkmaz. Disk işi ana iş parçacığı dışında, ad başına sırayla koşar.
  `tauri-plugin-store` `save()`'i doğrudan `fs::write` yaptığı için
  kullanılmaz; `TauriStoreAdapter` kabuğun `vol_store_read`/`vol_store_write`
  komutlarını kullanır.
- **Kurtarma:** güncel dosya eksik ya da bozuksa tam geçici dosya ya da `.bak`
  okunur (`recovered`); hiçbiri okunamazsa bozuk dosyalar `.corrupt-<zaman>`
  adıyla karantinaya alınır ve kayıt boş başlar (`reset`). İkisi de
  `createScopedStores(gameId, { onIntegrity })` ile tüketiciye bildirilir.
- **Boşaltma:** paylaşılan kabuk SIGTERM/SIGINT/SIGHUP'ı her kipte yakalayıp
  `vol:terminate` yayınlar; JS bütün `registerShutdownFlush` kancaları bitince
  `vol_flush_done` gönderir (sınır 1,5 sn). Çıkış olağan olay yolundan
  (haptik durdurma dahil) 128+sinyal koduyla yapılır. SIGKILL'e karşı güvence
  atomikliktir. logind `PrepareForSleep` aboneliği yoktur.
- **Kapsamlar:** `synced` (ilerleme; gerçek App ID'de Auto-Cloud adayı) ve
  `device` (grafik, pencere, cihaz ses ayarları, dil; Cloud'a konmaz) ayrı
  dosyalardır.
- **Zaman:** `performance.now()` uyku süresini saymaz, `Date.now()` uykudan
  sonra sıçrar; duvar saatine bağlı mantık bu farkla yazılır, simülasyon adımı
  sınırlanır.

## Görüntü ve okunabilirlik

- gamescope pencereyi çıkış çözünürlüğünde tam ekrana zorlar; pencere kipi ve
  çözünürlük seçenekleri etkisizdir. `displayCapabilitiesForSession`
  (`core/src/platform`) gamescope'ta `{ windowMode: false, resolution: false }`
  döner; ayar ekranı etkisiz satırı gizler.
- 1280×800'de 9 px metin zar zor seçilir, 12 px okunur; taban 12 px'tir.
  `devtools/vol-ui/tests/e2e/readability.spec.ts` WebKit'te 1280×800 ve
  1280×720'de görünen her metnin ≥ 12 px olduğunu, 1920×1080'de 1,5×,
  3840×2160'ta 3× ölçeklendiğini sınar (`--vol-layout-zoom`).
- 16:10 birincil orandır; 16:9 ve geniş oranlar letterbox ile yerleşir.

## Steamworks katmanı (oyun başına isteğe bağlı)

Eklenti `tauri-v2/plugins/vol-steamworks`, JS adaptörü
`tauri-v2/src/platform/steamworks.ts`. `steamworks` cargo feature'ı olmadan da
derlenir (komutlar stub döner, `status.compiled:false`); sonda feature'ı
`VOL_CARGO_FEATURES=steamworks` ile açar.

- Deck'te `available`, `deck`, `bigPicture`, `overlayEnabled`,
  `cloudEnabled`, `inputReady`, `manifestOk` true döner; aksiyon seti
  aktivasyonu, kontrolcü listesi (`steamworksType:"steamdeck"`) ve Cloud
  yaz/oku/sil çalışır; eklenti kare zamanlamasını değiştirmez.
- `SetInputActionManifestFilePath` ilk `RunFrame`den önce çağrılır; dosya
  `"Action Manifest"` köklü .vdf'dir ve `bundle.resources` ile paketlenir.
- `GetDigitalActionOrigins` yalnız aktif konfigürasyonda bağlanmış origin
  döndürür; test App ID 480 altında `[]` gelir. Resmi konfigürasyon gerçek App
  ID ile oyunun işidir.
- `ShowGamepadTextInput` `TextEntryProvider` sözleşmesine oturur (sonuç
  `vol-steamworks:text-input` olayıyla; overlay yoksa yerel klavye).
  `ShowFloatingGamepadTextInput` metni odaklı alana doğrudan yazar.
- `GameOverlayActivated` JS'e `vol-steamworks:overlay` olarak taşınır;
  duraklatma kararı oyunundur.
- `init_app` App ID'yi env'e yazar, `steam_appid.txt` gerekmez.
  `libsteam_api.so` `steamworks-sys` derleme çıktısından paketlenir; depoya
  binary girmez.
- Katmanı taşımayan oyun kol, glif ve klavye yollarıyla eksiksiz çalışır.

## Devkit sözleşmesi

Otomasyon `pnpm deck <komut>` (`scripts/deck.mjs`): `discover`, `deploy`,
`run`, `stop`, `log`, `shot`, `power`, `measure`, `mode`, `clean`, `full`.
Ölçüm kayıtları git dışı devtools/deck-probe/records/ altına yazılır ve depoya
girmez. Deck ölçümü kapı değildir; sonraki ölçümün
kıyaslandığı referanstır.

- Devkit anahtarı `~/.config/steamos-devkit/devkit_rsa`, SSH kullanıcısı
  `deck`. Cihaz mDNS'te `_steamos-devkit._tcp` olarak ilan edilir; adres sabit
  yazılmaz (`DECK_HOST`).

| Adım              | Komut / kural                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Hazırlık          | `python3 ~/devkit-utils/steamos-prepare-upload --gameid <id>` → hedef dizin                                             |
| Yükleme           | rsync ile `~/devkit-game/<id>/`                                                                                         |
| Kayıt             | `steam-client-create-shortcut --parms <JSON>`; alanlar: `gameid`, `directory`, `argv`, `env`, `settings`, `force_appid` |
| Oyun kimliği      | `^[A-Za-z_][A-Za-z0-9_.]+$`; tire kabul edilmez                                                                         |
| Başlatma dosyası  | `argv[0]` yüklenen dizinin içinde olmalıdır                                                                             |
| Native çalıştırma | `settings.steam_play = "0"`                                                                                             |
| Kap seçimi        | `settings.compat_tool`: `SteamLinuxRuntime_4`, `SteamLinuxRuntime_sniper`, `proton-stable`…                             |
| Ortam değişkeni   | Kayıttaki `env` oyuna ulaşmaz; değişkenler yüklenen başlatıcı betikle verilir                                           |
| Başlatma          | `steam-devkit-rpc run-game gameid=<id>`                                                                                 |
| Ekran görüntüsü   | `gamescopectl screenshot <yol>` (1280×800 PNG)                                                                          |
| Uzaktan çıkış     | Yok; sürece sinyal gönderilir                                                                                           |
| Temizlik          | `steamos-delete`                                                                                                        |

## Açık ölçümler

İnsan eliyle, cihaz başında ölçülür:

- Arka tuşlar; sanal kol yuvası ↔ Gamepad sırası; ölü bölge hissi.
- Trackpad ve dokunmatiğin ürettiği olay türü (`pointerType`).
- Steam ve Quick Access düğmesinin `blur`/`visibilitychange` üretip üretmediği.
- Uyku ve uyanmada `requestAnimationFrame` sürekliliği, AudioContext durumu,
  saat sıçramaları.
- Steam arayüzündeki "Oyundan çık" düğmesinin gönderdiği sinyal sırası.
- Titreşim motorlarının elle hissedilmesi.
- 60 ve 30 FPS'te güç tüketimi.
- OLED Deck (90 Hz) ve Steam Machine (TV çıkışı) kare zamanlaması.
