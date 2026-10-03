# VOL.STUDIO — iş listesi

Repo geneli işler; paket işleri paketin kendi `TODO.md`sindedir. Açık iş `[ ]`,
biten iş `[x]` olur ve `## Kapatılanlar`a tek satırla taşınır. Eksik çıkan
kapanış yeni madde olarak açılır.

## Açık

Sıra yukarıdan aşağıya uygulama sırasıdır.

### UI tasarım dili ve VOL.SHOWCASE

- [ ] **[P1] UI — Fazlı arayüz uygulaması.** Onaylı sözleşme, bütün public
      yüzey envanteri ve uygulama görevleri [UI iş listesinde](docs/ui/TODO.md).
      Kapanır: UI-00–UI-13 görevleri, ilgili yerel kapılar ve gerçek
      platform/insan kabulü tamamlanır. Plan belgelerinin teslimi uygulama
      başlangıcı değildir; VOL.TEST ve cihaz işleri kendi ölçütleriyle açık kalır.

### VOL.TEST — test ortamı oyunu

Analiz ve kararlar: yerel sertleştirme raporu §0.6. Cihazlar
uygulama sırasında bağlıdır (Samsung bağlı değilse o cihaz "ölçülmedi").

- [x] **[P1] VT-R5 — Yeni seslerin insan dinleme onayı.** 33 kuru mekanik/metal
      teslim, sessiz boşta durum ve oyun olayı eşlemeleri hazır. Kullanıcı yeni
      seti dinleyerek onayladı.
- [ ] **[P1] VT-H3 — Nişan ve dokunmatik hissiyat.** Dünya yönünü koruyan taret,
      hedefe oturunca ateş, iki bölgeli sağ çubuk ve balistik hedef lazeri.
      Kontrol/fizik ve Chromium/WebKit testleri geçer. Kapanır: gerçek
      cihazda nişan, ateş eşiği ve hareket için insan kabulü.
- [ ] **[P1] VT-W — Dünya ve hava olayları.** Toz, yağmur ve kar; su/kar birikimi,
      zemin tutuşu, rüzgâr/mermi direnci ve görünür yansıma. Kapanır: seedli
      model, sabit adım determinizmi, fizik/render bağları ve cihaz bütçeleri;
      Lenovo yüksek kar/çoklu tank/atış 10 dakikada 58,9–64,8 FPS, ilk dakika
      p95 25 ms olduğundan bütün yüklerde bütçe kabulü halen açık.
- [ ] **[P3] VT-Q — Kalite ve cihaz bütçesi kabulü.** Kalıcı tercih ve
      ölçülmüş açılış kademesi hazır. Kapanır: yoğun hava/araç/atış yükünde
      uzun oturum bütçesi geçer; Deck sunum temposu D2 ile doğrulanır.
- [ ] **[P3] VT-S — CORE senaryo envanteri.** Boş, slalom, hedef atış,
      fizik sandbox ve çoklu tank senaryoları hazır. Kapanır: CORE yetenekleri
      tüketici/senaryo/test kanıtıyla eşlenir; gerekli eksik örnekler tamamlanır.
- [ ] **[P1] VT2 — Linux görünür açılış kabulü.** Ürüne özgü kimlik/ikon,
      Cargo üyeliği ve native kaynak sözleşmesi hazır; Rust kapısı geçer.
      Kapanır: son sürüm host'ta görünür açılır ve ekran görüntüsü alınır.
- [ ] **[P1] VT3 — Açılış servisleri.** Oturum, ekran kipi, girdi ve glif,
      metin girişi, menü süzgeci, kapsamlı kayıt, kapanış ve uyku boşaltması,
      ses, titreşim, Steamworks, Android geri tuşu ve yön, tanı. Tüketilmeyen
      tauri-v2 export'u silinir (K4). Kapanır: `pnpm high`; E2E Chromium + WebKit.
- [ ] **[P1] VT4 — Android.** Native proje izlenir, yön/çentik/tam ekran elle.
      İki cihazda kurulum, açılış, yatay/tam ekran, joystick, ateş barı,
      duraklatma, arka plan dönüşü ve kapanış kaydı yeniden doğrulandı.
      Kapanır: kısa dış bölge dokunuşu Samsung'da insan parmağıyla kabul edilir
      (sentetik basış örneklenmedi), uzun oturum bütçesi ve titreşim hissi
      yeniden ölçülür, görünür panel kabulü ayrı kalır.
- [ ] **[P1] VT5 — Steam Deck.** steamrt4 paketi ve `pnpm deck`. Kapanır: glibc
      bekçisi; bağlı Deck'te açılış, ekran görüntüsü ve kare ölçümü.
- [ ] **[P1] VT-H2 — VOL.TEST cila turu (cihazda).** Kullanıcı dizüstü
      bilgisayarında görünür pencere açılışını ve ekran kilidi sonrası girdi
      turunu eliyle yaptığını ve onayladığını bildirdi; ekran kilidi yeniden
      kilitlendi. Titreşim hissi ve Deck eliyle ölçümler açık. Kapanır: her
      cihazdan ekran görüntüsü ve kullanıcının his onayı.
- [ ] **[P1] VT7 — Yeni oyun iskeleti kabulü.** Üretici ve
      `tauri-v2/templates/game` sözleşmesi hazır. Kapanır: iskeletten üretilen paket
      `pnpm signoff`u ilk denemede geçer.

### Belgeler

- [ ] **[P1] SB — Belgeler sıfırdan.** `AGENTS.md`, `CLAUDE.md`, bütün
      README'ler ve `DESIGN.md`ler yeniden yazılır: kısa, net, gerçek. İngilizce
      README'ler silinir. Belgelerdeki bağlam anlatısı (tarihçe, karar süreci,
      oturum hikâyesi) kalkar. `docs/` gerçekle doğrulanır; Deck belgesi ölçülmüş
      gerçek, karar ve devkit sözleşmesi olarak yeniden kurulur. Paket
      TODO'larının `Kapatılanlar` bölümleri tek satırlık maddelere iner.
      Kapanır: belge kapıları yeşil, İngilizce kopya kalmaz.

### Cihaz turları

- [ ] **[P1] Lenovo görünür panel ve ekran yakalama.** Sistem yakalaması siyah
      çıktı; aynı oturumun GPU karesi dolu ve GL hatası sıfır. Kapanır: soğuk
      açılış ve arka plan dönüşünde gerçek panel ile sistem ekran görüntüsü
      birlikte doğrulanır; Mali EGL yakalama hatasının nedeni ayrılır.
- [ ] **[P1] SD3 — libmanette çökme izi.** Tarihsel SIGSEGV için çekirdek
      dökümü/yeniden üretim yok; yeni ölçümlerin çökmeden çalışması kök neden
      kabulü değildir. Kapanır: kol hot-plug ve titreşim matrisiyle döküm
      incelenir, neden düzeltilir veya kanıtla dışlanır.

- [ ] **[P1] Deck'teki kalıntılar.** Eski ürünlerin ve sondanın sürüm dizinleri,
      non-Steam kısayolları, `~/.local/share/<kimlik>/` verileri, deneme
      dosyaları. Kapanır: envanter kullanıcıya gösterilir, onaylı liste silinir,
      sistem bileşenleri yerinde kalır.
- [ ] **[P1] SD8 — Uyku ve uyanma Deck'te.** Kapanır: son değer uyku öncesi
      diske ulaşır, ses uyanışta geri gelir.
- [ ] **[P1] D0 — Deck'te insan eliyle açık ölçümler.** Kapanır: yalnız eldeki
      cihazla ölçülemeyenler açık kalır.
- [ ] **[P1] D1 — steamrt4 paketi SteamOS host'unda ve SLR4'te açılıp OGG çalar.** Host ölçümü vardır; gerçek SLR4 kısayolu ve codec/ses doğrulaması açıktır.
- [ ] **[P1] D1 — `pnpm deck` uçtan uca.** Derler, yükler, başlatır, ölçer, ekran
      görüntüsü alır; komut sözleşmeleri testli.
- [ ] **[P1] D2 — gamescope kare zamanlaması.** Isınmış VOL.TEST pencereleri 59–60 FPS, p95 18–21 ms. Kapanır: host/SLR4 ve sunum istatistikleriyle kök neden ayrılır; 1280×800'de ≥59 FPS, p95 ≤18 ms bütün yüklerde sağlanır.
- [ ] **[P1] D2 — Kayıt ve boşaltma kanıtı.** Yazma ortasında SIGKILL kaydı
      bozamaz; üretim kipinde SIGTERM ve gerçek uykuda son değer diske ulaşır.
- [ ] **[P1] D2 — `synced` / `device` kapsamı.** Kapsamsız anahtar derlenmez;
      eski tek dosyalı kayıttan yedekli geçiş testli.
- [ ] **[P2] D2 — Uykudan dönüşte zaman güvenliği.** Saat sıçraması testli;
      Deck'te uyku turu ölçülür.
- [ ] **[P2] Windows kayıt yazıcısı.** `vol_store_write` hatasız yazar, bozuk
      kayıt yedekten okunur.
- [ ] **[P3] Android 16 geniş ekranda yön kilidi.** 600dp üstü cihaz ya da
      emülatörde `appCategory="game"` ile ölçülür.
- [ ] **[P3] OLED Deck ve Steam Machine kare zamanlaması.** Cihaz bulununca.

### Kod

- [x] **[P2] B6 — Ses değişimine göre push doğrulaması.** `high` sesin alt
      takımını, `signoff` tam takımını koşar. Değişen ses kaynakları CORE
      dosyalarıyla birlikte `vitest related` ile modül grafiğinden seçilir;
      silinen kaynak, vitest yapılandırması veya belirsiz değişiklik tam takımı
      koşar, yayın kapısının tam doğrulaması korunur.

- [ ] **[P3] A20 — Titreşim darbeleri tek zamanlayıcı iş parçacığından yürür.**
- [ ] **[P3] Samsung kısa dokunuş kabulü.** Cihaz sentetik sabit basışta
      oyunun örneklediği `pointermove` üretmediği için kısa dış bölge
      dokunuşunun kabulü bu turda ölçülemedi. Kapanır: kullanıcının Samsung'da
      kısa nişan/ateş basışını ve iç bölge ayrımını eliyle onaylaması.
- [ ] **[P2] `braces` advisory'si yayımlanmış düzeltmesiz.** `GHSA-vfj7-8cjw-p6xm`
      (`pnpm audit` 1240992) `braces <=3.0.3` için stack tükenmesi bildiriyor ve
      `first_patched_version` boş: yamalı sürümü yok. Yol yalnız geliştirme
      araç zincirinde (`stylelint → micromatch → braces`), gönderilen oyuna girmez.
      Kapanır: yama çıktığında kilit yükseltilir; `security-js` o gün yeşile döner.
- [ ] **[P3] S7 — Ana sürüm geçişleri.** ESLint 10, stylelint 17, jsdom 30,
      Vitest 5 ve TypeScript 7 için uyumluluk ayrı ayrı doğrulanır. Kapanır:
      ilgili paketlerin ve kapıların yeni ana sürümde geçmesi.
- [ ] **[P3] CORE sıkı indeks denetimi.** `noUncheckedIndexedAccess` 610
      tanı üretir; pen.dev'de etkin ve kapıyla korunur. Kapanır: CORE'da
      denetim açıkken tip kapısı geçer; indis varsayımları daraltılır.

### Kullanıcı talebini bekleyenler

- [ ] **K3 — Birleştirme.** `dev` ve `main` birleştirmesi kullanıcı talebine kadar
      yapılmaz (S8).
- [ ] **K5 — Silme.** Uzak eski dallar ve yerel `feature/asset-studio` yerinde
      kalır.

## Kapatılanlar

- [x] **Ses yüklemesi yaşam döngüsü.** CORE banka/döngü istekleri aynı partide başlar, eşzamanlı yükleme birleşir; söküm indirmeyi iptal eder ve geç decode kaynak kurmaz.

- [x] VOL.TEST ölçümü gerçek kalite, senaryo, tohum, mevsim/hava ve sekiz CPU aşamasını kaydeder; bağlam geçişi ile Deck rapor zinciri regresyon testli.

- [x] VOL.TEST native uyanışta ortak ses bağlamını toparlar; sökülmüş sahne ve bağlam yaşam döngüsü regresyon testli, gerçek Deck uyku kabulü SD8'de açık.

- [x] VOL.TEST çoklu araç çizimi ortak palet dokusu, ayrı namlu ışığı katmanı ve boş yayıcı görünürlüğüyle sınırlandı; yaşam döngüsü ve çizim sırası regresyon testli.

- [x] VOL.TEST ölçüm seçimleri ilgisiz cihaz ayarı değişikliklerinde korunur; kalıcı tercihlerle karışmaz.

- [x] E1 — VOL.TEST girdi yöneticisinin durumu HUD gliflerine gider; paylaşılan yolda ikinci kol yoklaması ve kip hakemi yoktur, regresyon testli.
- [x] VT6 — Windows NSIS hedefi, ürün kimliği, ikon ve pencere yetenekleri yapılandırma testleriyle kilitli; Windows cihazı ölçülmedi.

- [x] VT-R1 — Kimlikli çoklu araç, sahibi olan mermi ve olay, araç–araç SAT teması ve kimlikle görünüm kaydı; iki araçlı simülasyon ve sahne testleri.

- [x] VT-R4 — Mermi gövdesi, hale ve duman izi; namlu patlaması (ateş topu, yan jetler, toz, basınç halkası); patlama (parlama, şok halkası, parça, toz, duman, yanık); pabuç desenli sürekli palet izi; atışta kamera sarsılmaz, patlama sarsıntısı uzaklıkla söner; CORE GraphicsQuality ile iki kademe. Glow filtresi ölçülüp reddedildi.
- [x] VT-R3 — Sabit CORE joystick'ler, fren ve hızlanma sütunu; tam ekran yalnız webde ve haritanın altında; minimap'te soluk ızgara; telefon yatayında örtüşmezlik E2E kapısı.
- [x] VT-R2 — Fren (Space, kol B, dokunmatik düğme) paletleri kilitler; Stribeck statik/kinetik sürtünme, birleşik kayma elipsi, tork sınırlı aktarma ve motor freni; keskin dönüşte drift; 20 s yerde kalan kayma çizgisi; hissiyat zarfına fren, drift ve dönüşte fren ölçüleri eklendi.
- [x] VT-C — VOL.TEST'teki genel parçalar CORE'a taşındı (`FollowCamera`, açı, gürültü, `ActionEdges`, katı cisim ve temaslar, `VirtualStickSource`, `poseSourceOf`); VOL.TEST hepsini CORE'dan tüketiyor.
- [x] I1 — `PCController` kare arasında düşen tuş basışını bir okuma boyunca tutar; testli.
- [x] H1 — `vibrate(desen, şiddet)`: telefonda darbe süresi, kolda motor gücü, native sürücüye şiddet iletilir; testli. Ayrı süre parametresi eklenmedi, şiddet süreyi ölçekler.
- [x] VT-H — VOL.TEST sertleştirme: katı cisim fiziği (paylaşılan motor gücü, direksiyon önceliği, hıza bağlı dönme direnci), süspansiyon, oyun/UI renk ayrımı, ayarlar tek yerde, titreşim, değişmez + hissiyat + kare hızı testleri, E2E kol ve dokunmatik.
- [x] VT1 — VOL.TEST oyun çekirdeği: boş çöl dünyası, organik-robotik SVG tank, arachnid kamerası, yalnız CORE bileşenli HUD, klavye/kol/dokunmatik, kapılar ve E2E.
- [x] VT0 — VOL.TEST analizi ve kapsamı onaylandı; ikon onaylı.
- [x] Kod yorumlarında bağlam temizliği; bekçi `scripts/quality/contextComments.mjs`.
- [x] SC — Kök ve repo temizliği; kök girdileri gerekçesiyle kilitli (`scripts/quality/rootEntries.mjs`).
- [x] SH5 — audio-synth: v1 emekli (K7), kernel katmanı, testler kaynağın aynası, veri corpus/records/locks altında ve yeniden yayımlandı (K6).
- [x] SH4 — CORE hiyerarşisi: amaçlı dizinler, ui/controls bölündü, stiller grubun yanında, testler kaynağın aynası.
- [x] SH3 — Deck araçları devtools/deck paketinde; `pnpm deck` oradan koşar.
- [x] SH2 — `scripts/` amaca göre alt dizinlerde; testler yanında.
- [x] SH1 — Tek Cargo workspace, tek kilit, tek hedef dizini.
- [x] S3 — Kalıntı; katalog bekçisi; knip export 94 → 43.
- [x] S2 — audio-synth sağlamlığı.
- [x] SD — Deck kol ve kabuk boşlukları, Steamworks, uyku, glif.
- [x] S1 — Kayıt, kapanış boşaltması ve audio-synth yayını atomik.
- [x] S0 — Kapılar denetlendi; `pnpm signoff` yeşil.
- [x] SK — vol-hell ve vol-arachnid arşiv etiketiyle ağaçtan kaldırıldı.
- [x] K4, K6, K7, K8, K9, K10, K11 — Kararlar verildi (2026-09-30).
- [x] D3–D8 — Deck girdi, glif, metin girişi, görüntü ve Steamworks katmanları.
- [x] Deneysel paketler emekliye ayrıldı; mekanizmalar CORE'a taşındı.
- [x] Büyük ve kritik dosyalar test kanıtına bağlandı.
- [x] 1000 satır sınırı bütün kaynak türlerinde.
- [x] Her uygulama kendi ürün kimliğini taşır.
- [x] Rust push kapısında.
