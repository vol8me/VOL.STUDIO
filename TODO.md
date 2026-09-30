# VOL.STUDIO — iş listesi

Repo geneli işler; paket işleri paketin kendi `TODO.md`sindedir. Açık iş `[ ]`,
biten iş `[x]` olur ve `## Kapatılanlar`a tek satırla taşınır. Eksik çıkan
kapanış yeni madde olarak açılır.

## Açık

Sıra yukarıdan aşağıya uygulama sırasıdır.

### VOL.TEST — test ortamı oyunu

Analiz ve kararlar: yerel sertleştirme raporu §0.4, §0.4b, §0.4c. Cihazlar
uygulama sırasında bağlıdır (Samsung bağlı değilse o cihaz "ölçülmedi").

- [ ] **[P1] VT-R1 — Çoklu varlık altyapısı.** Simülasyon tek tanka bağlı:
      varlık kimliği, araç listesi, kontrol edilen araç, sahibi olan mermi ve
      olaylar, araç–araç çarpışması, görünüm kaydı (kimlik → görünüm).
      Kapanır: iki araçlı simülasyon ve sahne testleri.
- [ ] **[P1] VT-R3 — Dokunmatik ve HUD düzeni.** Sabit CORE joystick
      (hareket + nişan), fren ve hızlanma düğmeleri; tam ekran yalnız webde ve
      haritanın altında; minimap'te soluk ızgara. Kapanır: E2E dokunmatik ve
      telefon ekran görüntüsü.
- [ ] **[P1] VT-R4 — Silah ve efekt gerçekçiliği.** Mermi gövdesi ve izi,
      namlu ağzı patlaması ve zemin tozu, menzil sonu/duvar patlaması (şok
      halkası, parlama, enkaz, kararmış zemin izi), gerçekçi palet izi
      (palet baskısı dokusu), ateşte kamera okunurluğu bozmaz. Kapanır:
      görünüm testleri ve ekran görüntüsü.
- [ ] **[P1] VT-R5 — Ses.** audio-synth ile oyuna özgü, organik, gerçeğe yakın
      sesler (müzik ve ambiyans yok): motor, palet, taret servosu, top atışı,
      patlama, duvar çarpması, fren kayması, hızlanma, UI. Sürekli sesler
      hız/yükle modüle edilir. Kapanır: audio-synth yayın kapısı, verify,
      oyunda sesler ve kullanıcının dinleme onayı.
- [ ] **[P3] VT-S — Test senaryoları.** Boş dünya korunur; açılıp kapanan
      senaryolar: slalom, hedef atış, fizik sandbox, çoklu tank. Her CORE
      yeteneği bir senaryoda sınanır.
- [ ] **[P1] VT2 — Tauri kabuğu (Linux).** Kimlik `com.volstudio.voltest`, ikon
      tank SVG parçalarından üretilir (birleşik çizim üreticisi geri gelir),
      Cargo üyeliği, `gen/schemas` yoksayılır. Kapanır: Rust kapısı yeşil;
      host'ta açılış ekran görüntüsü.
- [ ] **[P1] VT3 — Açılış servisleri.** Oturum, ekran kipi, girdi ve glif,
      metin girişi, menü süzgeci, kapsamlı kayıt, kapanış ve uyku boşaltması,
      ses, titreşim, Steamworks, Android geri tuşu ve yön, tanı. Tüketilmeyen
      tauri-v2 export'u silinir (K4). Kapanır: `pnpm high`; E2E Chromium + WebKit.
- [ ] **[P1] VT4 — Android.** Native proje izlenir, yön/çentik/tam ekran elle.
      Kapanır: bağlı iki cihazda kurulum, açılış, ekran görüntüsü.
- [ ] **[P1] VT5 — Steam Deck.** steamrt4 paketi ve `pnpm deck`. Kapanır: glibc
      bekçisi; bağlı Deck'te açılış, ekran görüntüsü ve kare ölçümü.
- [ ] **[P1] VT-H2 — VOL.TEST cila turu (cihazda).** Hissiyat zarfı cihazda
      doğrulanır (Deck 90 Hz, Android dokunmatik), titreşim cihazda denenir;
      bulgular zarfa ve ayara işlenir. Kapanır: her cihazdan ekran görüntüsü
      ve kullanıcının his onayı.
- [ ] **[P2] VT6 — Windows.** Yapılandırma ve kod yolu. Kapanır: yapılandırma
      testleri; paket yerelde üretilemediği için "ölçülmedi".
- [ ] **[P1] VT7 — Yeni oyun iskeleti.** VOL.TEST'ten çıkarılır
      (tauri-v2/templates/game). Kapanır: iskeletten üretilen paket
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

- [ ] **[P1] Deck'teki kalıntılar.** Eski ürünlerin ve sondanın sürüm dizinleri,
      non-Steam kısayolları, `~/.local/share/<kimlik>/` verileri, deneme
      dosyaları. Kapanır: envanter kullanıcıya gösterilir, onaylı liste silinir,
      sistem bileşenleri yerinde kalır.
- [ ] **[P1] SD8 — Uyku ve uyanma Deck'te.** Kapanır: son değer uyku öncesi
      diske ulaşır, ses uyanışta geri gelir.
- [ ] **[P1] D0 — Deck'te insan eliyle açık ölçümler.** Kapanır: yalnız eldeki
      cihazla ölçülemeyenler açık kalır.
- [ ] **[P1] D1 — steamrt4 paketi SteamOS host'unda ve SLR4'te açılıp OGG çalar.**
- [ ] **[P1] D1 — `pnpm deck` uçtan uca.** Derler, yükler, başlatır, ölçer, ekran
      görüntüsü alır; komut sözleşmeleri testli.
- [ ] **[P1] D2 — gamescope kare zamanlaması.** 1280×800'de ≥ 59 FPS, p95 ≤ 18 ms.
- [ ] **[P1] D2 — Kayıt ve boşaltma kanıtı.** Yazma ortasında SIGKILL kaydı
      bozamaz; SIGTERM ve uykuda son değer diske ulaşır.
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

- [ ] **[P1] E1 — Tek girdi hakemi ve tek kol kaynağı.** Kare başına tek kol
      yoklaması ve tek hakem; testli.
- [ ] **[P3] A20 — Titreşim darbeleri tek zamanlayıcı iş parçacığından yürür.**
- [ ] **[P3] S7 — Araç zinciri.** ESLint, Prettier, TypeScript sürüm ve
      yapılandırması.

### Kullanıcı talebini bekleyenler

- [ ] **K3 — Birleştirme.** `dev` ve `main` birleştirmesi kullanıcı talebine kadar
      yapılmaz (S8).
- [ ] **K5 — Silme.** Uzak eski dallar ve yerel `feature/asset-studio` yerinde
      kalır.

## Kapatılanlar

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
