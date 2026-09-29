# VOL.STUDIO — iş listesi

Repo geneli işler; paket işleri paketin kendi `TODO.md`sindedir. Açık iş
`[ ]`, biten iş `[x]` olur ve `## Kapatılanlar`a tek satırla taşınır; eksik
çıkan kapanış yeni madde olarak açılır.

## Açık

### Sertleştirme

- [ ] **[P1] SD8 — Uyku/uyanma Deck'te kanıtlanır.** Kabuk logind kilidi,
      `registerSuspendFlush`/`onSystemResume` ve CORE `resumeAudioAfterWake`
      tarifi uygulandı; Deck'te uyku turu yapılmadı. Kapanır: Deck'te son değer
      uyku öncesi diske ulaşır ve ses uyanışta geri gelir.
- [ ] **[P1] E1 — Tek girdi hakemi ve tek kol kaynağı.** CORE'da üç ayrı kol
      seçimi ve iki kip hakemi var; glif ile oynanış kipi ayrışabilir.
      Kapanır: kare başına tek kol yoklaması ve tek hakem; testli.
- [ ] **[P1] SD9 — Referans kabuk uygulaması (SH'deki devtools/deck
      taşımasından sonra).** deck-probe CORE ve tauri-v2
      JS'ini (kayıt, oturum, odak, glif, metin girişi, kapanış) uçtan uca koşar.
      Tipsiz `probe.js` TypeScript'e taşınır ve tip denetimine girer.
      Bugün tüketicisi olmayan tauri-v2 platform export'ları (Steamworks
      klavye/bağlama paneli/glif, Linux titreşim kaydı, Android yön) burada
      tüketilir; tüketilmeyen kalırsa silinir.
      Kapanır: WebKit E2E ve Deck ölçümü bu uygulamayla yapılır.
- [ ] **[P1] SD10 — Deck'e hazır yeni oyun iskeleti (SH'den sonra,
      tauri-v2/templates/game; Android geri tuşu varsayılanı dahil).** Tauri yapılandırması,
      yetenekler, başlatıcı, masaüstü şablonu, Steam Input manifestosu,
      1280×800 pencere, kayıt kapsamları ve oturuma göre grafik varsayılanı.
      Kapanır: iskeletten kurulan paket `pnpm signoff`u ilk denemede geçer.
- [ ] **[P3] `feature/asset-studio` yerel dalı (kullanıcı eli).** HEAD'e dahil
      ama uzaktaki kopyasından farklı olduğu için `-D` ister; zorla silme
      otomatik izin denetiminde reddedildi. Diğer 12 dal ve stash silindi.
      Kapanır: dal silinir; uzak eski dallar S8'de.
- [ ] **[P2] SH — Hiyerarşi.** Cargo workspace, stil ve test yerleşimi, Deck
      araçlarının tek dizinde toplanması.
- [ ] **[P1] SC — Repo ve kök dizin temizliği (kullanıcı geri bildirimi).**
      Kapsam 2026-09-30'da büyüdü: kök ve paketlerdeki her dosya ve dizin,
      yapılandırma, betik, belge ve yerel artık gerekçelendirilir ya da
      kaldırılır; git dışı
      yerel artıklar da kapsamdadır. Bilinenler: ölü .idea/ (editör VS Code),
      KDE `.directory` dosyası, silinmiş paketi çalıştıran
      .vscode/launch.json, kök target/ (ortak Cargo çıktısı; SH'deki Cargo
      workspace ile tek hedef dizine iner), eski kapıdan kalan paket başına
      Cargo target/ dizinleri, `graphify-out/` ve `.claude/` yerel
      çıktılarının yeri ve boyutu, kök yapılandırma dosyalarının sayısı ve
      yeri (`.prettierrc.json`, `.stylelintrc.json`, iki ignore dosyası,
      `quality.json`, `workspace-lifecycle.json`, `tsconfig.base.json`),
      `.gitignore`un her satırı, testlerin paket ağacına yazdığı
      devtools/audio-synth/export/samples, paketlerde kalan coverage/,
      dist/, test-results/, src-tauri/gen/ ve android/.tauri/.
      Kapanır: kökte yalnız gerekçesi `README.md` ya da `AGENTS.md`de yazılı
      girdiler kalır; `git status --ignored` yalnız belgelenmiş yerel
      dizinleri gösterir; bir bekçi kök girdi listesini kilitler.
- [ ] **[P1] SB — Belgeler sıfırdan (kullanıcı talimatı 2026-09-30).**
      İngilizce README'lerin hepsi kalkar (kökteki `README.en.md` dahil).
      `AGENTS.md` ve `CLAUDE.md` sıfırdan, profesyonel yazılır. Bütün
      README'ler yeniden yazılır: kısa, net, README biçiminde; `core`,
      `tauri-v2` ve Deck araçları README kazanır. `DESIGN.md` dosyaları
      sıfırdan, yalnız bugünkü kodun doğruladığı tasarımla yazılır. `docs/`
      kapsamdadır: her belge gerçekle doğrulanır, birleşir ya da silinir.
      Kaynak yorumlarındaki ölçüm günlükleri (37 dosyada 44 "ölçüldü"
      satırı) belgeye taşınır. Kapanır: belge kapıları yeşil, her belge
      kendi sorumluluğunu taşır, İngilizce kopya kalmaz.
- [ ] **[P3] S7 — Araç zinciri.** ESLint, Prettier ve TypeScript sürümleri
      ile yapılandırması güncellenir.

### Kullanıcı kararı bekleyenler

Kritik kararlar kullanıcıya açıktır; onaysız uygulanmaz. Ayrıntı: yerel
sertleştirme raporu §16.

- [ ] **K3 — Birleştirme.** Dal zinciri `dev`e ve `main`e nasıl ve ne zaman gider.
- [ ] **K4 — Tüketicisiz platform export'ları.** Budansın mı, referans
      uygulamaya mı bağlansın (geçici öneri: SD9'a bağlama).
- [ ] **K5 — Uzak eski dallar ve `feature/asset-studio`.** Silinsin mi.
- [ ] **K6 — audio-synth veri yerleşimi.** Taşıma 36 manifestin yeniden
      yayınını ister; yapılsın mı.
- [ ] **K7 — audio-synth v1 yolları.** Emekliye mi ayrılsın, korunsun mu
      (geçici: korundu).
- [ ] **K8 — Arşiv pratiği.** Bitmiş ürün etiket + ağaçtan kaldırma ile mi arşivlenir.
- [ ] **K9 — Android.** Oyun yokken cihaz doğrulaması ve betikleri uykuda mı.
- [ ] **K11 — TODO `Kapatılanlar`.** Kalsın mı, kısalsın mı.

### Steam Deck ve Valve donanım ailesi

Ölçümler ve kararlar: [docs/steam-deck.md](docs/steam-deck.md).

- [ ] **[P1] Deck'teki kalıntıların temizliği (Deck bağlı, kullanıcı başında).**
      Eski ürünlerin ve sondanın sürüm dizinleri (`~/devkit-game/`), non-Steam
      kısayolları, `~/.local/share/<kimlik>/` verileri ve deneme dosyaları.
      Kapanır: cihaz envanteri kullanıcıya gösterilir, onaylı liste silinir,
      sistem bileşenleri (SteamLinuxRuntime_4) yerinde kalır.
- [ ] **[P1] Deck belgesi sağlamlaştırılır.** `docs/steam-deck.md` ölçülmüş
      gerçek, karar ve devkit sözleşmesi olarak sıfırdan kurulur; ölçülmeyen
      "ölçülmedi" kalır. Kapanır: belgedeki her iddia ölçüme, koda ya da
      teste bağlıdır.
- [ ] **[P1] D0 — Deck'te insan eliyle açık ölçümler.** Kapanır:
      `docs/steam-deck.md` "Açık ölçümler" listesinde yalnız eldeki cihazla
      ölçülemeyenler kalır.
- [ ] **[P1] D1 — steamrt4 derlemesi kanıtlanır.** Kapanır: paketteki hiçbir
      ELF `GLIBC_2.41` üstünü istemez (bekçi testli); AppDir SteamOS host'unda
      ve SLR4'te açılıp OGG çalar.
- [ ] **[P1] D1 — `pnpm deck` uçtan uca.** Kapanır: tek komut derler, yükler,
      başlatır, ölçer ve ekran görüntüsü alır; komut sözleşmeleri testlidir.
- [ ] **[P1] D2 — gamescope kare zamanlaması.** Kapanır: 1280×800'de ≥ 59 FPS
      ve p95 ≤ 18 ms Deck'te ölçülür.
- [ ] **[P1] D2 — Atomik kayıt ve boşaltma kanıtı.** Kapanır: yazmanın
      ortasında SIGKILL enjekte eden test kaydı bozamaz; SIGTERM ve uyku
      yollarında son değer Deck'te diske ulaşır.
- [ ] **[P1] D2 — `synced` / `device` kapsamı.** Kapanır: kapsamsız anahtar
      derlenmez; tek dosyalı eski kayıttan iki kapsama yedekli geçiş CORE'da
      testlidir.
- [ ] **[P2] D2 — Uykudan dönüşte zaman güvenliği.** Kapanır: saat sıçraması
      birim testlidir; Deck'te uyku-uyanma turu ölçülür.
- [ ] **[P3] OLED Deck ve Steam Machine'de kare zamanlaması.** Kapanır: cihaz
      bulunduğunda ölçüm `docs/steam-deck.md`ye girer.

- [ ] **[P3] A20 — Titreşim darbesi başına bloklayan iş parçacığı.** Kapanır:
      darbeler tek zamanlayıcı iş parçacığından yürür.

### Windows

- [ ] **[P2] Kayıt yazıcısı Windows'ta doğrulanır.** Dizin fsync'i Windows'ta
      atlanır ve rename güncelin üstüne yazar; bu yol yerelde ölçülemedi.
      Kapanır: Windows derlemesinde `vol_store_write` hatasız yazar ve bozuk
      kayıt yedekten okunur.

### Android

- [ ] **[P3] Android 16 geniş ekranda yön kilidi.** Kapanır: bir oyunla,
      600dp üstü Android 16 cihaz ya da çalışan emülatör imajında
      `appCategory="game"` varken yön isteğinin uygulandığı ölçülür.

## Kapatılanlar

- [x] **S3 — Kalıntı.** Katalog kapısı (`scripts/quality/catalog.mjs`):
      CORE kökünden açılan her UI bileşeni vitrinde ve testte; ekran klavyesi
      vitrine girdi. iOS MP3 yedeği ve dönüştürücüsü, kullanılmayan Tauri CLI,
      audio-synth ölü sembolleri, öksüz barrel ve eski kök API kaldırıldı;
      araştırma betikleri `devtools/audio-synth/scripts/research/`
      dizininde; önbellek parmak izi yalnız
      yüklenen CORE dosyalarını özetler; boş provenance alanları yazılmaz;
      v1 yolları politika gereği kalır; plan kimliği ve tarihçe yorumları
      temizlendi. knip kullanılmayan export 94 → 43.
- [x] **S2 — audio-synth sertleştirme** (AS4, AS6, AS7, AS9, AS12–AS16,
      AS21; AS20 paket TODO'sunda açık).
- [x] **S0 — Kapılar denetlendi, boşluklar kapatıldı; `pnpm signoff` yeşil**
      (oturum başından beri kırmızı olan ses kapsamı dahil).
- [x] **SD (ikinci dilim) — kabuk ve Steamworks sağlamlığı.** Aygıt yokken
      odak kaybı tarama yapmaz ve yoklama geri çekilir (A8, A9); Steamworks
      geç açılan Steam'e yeniden bağlanır ve disk/Cloud komutları ana iş
      parçacığı dışında (A11, A12); Steam metin girişi overlay kapanışı ya da
      süre sınırıyla çözülür (A13); yazı tipi yarış zamanlayıcısı ve sağlayıcı
      reddi temizlendi (A17, A21); tam ekran okuması bloklayan havuzda (A19);
      tek Cloud stratejisi Auto-Cloud (E9); web menü bastırıcısı kabukla aynı
      evrede (E10).
- [x] **SD15 — Steam Input titreşimi ve aksiyon verisi** (cihazda denenmedi).
- [x] **SD14 — `SteamVirtualGamepadInfo` glif köprüsü** (tek kolda; yuva sırası D0'da).
- [x] **SD (ilk dilim) — Deck kol ve kabuk boşlukları.** Ekran klavyesinde
      odak kaybı ve iptal sözleşmesi, parola maskesi ve alan sınırı, Big
      Picture oturumu, tarayıcı kısayol süzgeci, kol bağlantı kancası, uygulama
      kimliği bekçisi, gamescope'ta bütün pencerelerin tam ekranı, FPS sınırı
      seçeneği, Deck kayıtlarının paket dizinine alınması.
- [x] **S1 — Veri bütünlüğü.** Store yazıcısı güncel dosyayı hiç kaldırmaz,
      okuma geçici/yedek jenerasyondan kurtarır ya da karantinaya alıp
      bildirir; disk işi ana iş parçacığı dışında; adaptör ilk okumayı paylaşır;
      kapanış boşaltması kabukta her kipte açık; audio-synth kilidi atomik,
      yayın asset ile manifesti birlikte yerleştirir.
- [x] **SK — Ürün emekliliği.** vol-hell ve vol-arachnid etiketleriyle
      arşivlenip ağaçtan kaldırıldı; lifecycle mekanizması korundu.
- [x] **D7 — Oyunla Deck referansı (iptal).** Oyun emekliye ayrıldı; kabul
      listesi yeni oyuna devredildi.
- [x] **D8 — Yeni oyun rehberi Deck kabul listesini taşır.**
- [x] **D6 — İsteğe bağlı Steamworks katmanı.**
- [x] **D5 — Okunabilirlik ve ölçek kapısı.**
- [x] **D5 — Kolla metin girişi.**
- [x] **D5 — gamescope altında görüntü ayarları.**
- [x] **D4 — Glif sistemi.**
- [x] **D4 — Linux'ta titreşimin native yolu.**
- [x] **D3 — Gamepad sağlayıcısı ve girdi kipi politikası.**
- [x] **D3 — Kolla arayüz gezinmesi.**
- [x] **Deneysel paketler emekliye ayrıldı; kanıtlanmış mekanizmalar CORE'a
      taşındı.**
- [x] **Büyük ve kritik dosyalar test kanıtına bağlandı.**
- [x] **1000 satır sınırı bütün kaynak türlerine genişletildi.**
- [x] **Her oyun kendi ürün kimliğini taşır.**
- [x] **Rust push kapısına dahil edildi.**
