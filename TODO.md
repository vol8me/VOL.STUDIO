# VOL.STUDIO — iş listesi

Repo geneli işler; paket işleri paketin kendi `TODO.md`sindedir. Açık iş `[ ]`,
biten iş `[x]` olur ve `## Kapatılanlar`a tek satırla taşınır. Eksik çıkan
kapanış yeni madde olarak açılır.

## Açık

Sıra yukarıdan aşağıya uygulama sırasıdır.

### Hiyerarşi ve temizlik

- [ ] **[P1] SH2 — `scripts/` düzeni.** Linux paketleme, Android cihaz ölçümü ve
      kapı CLI'ları kendi alt dizinlerine; testleri yanlarına. Kapanır:
      `scripts/` kökünde yalnız `doctor.mjs` ve alt dizinler kalır.
- [ ] **[P1] SH3 — Deck araçları tek dizinde.** deck-probe, Deck betikleri ve
      ölçüm kayıtları devtools/deck altında. Kapanır: Deck'e ait kod tek
      pakettedir, `pnpm deck` oradan koşar.
- [ ] **[P1] SH4 — CORE hiyerarşisi.** Tek dosyalı dizinler birleşir,
      `ui/controls` bölünür, CSS bileşen grubunun yanına gider, testler kaynağın
      aynasıdır. Kapanır: tip yüzeyi ve görsel temeller değişmeden kapılar yeşil.
- [ ] **[P1] SH5 — audio-synth yerleşimi.** v1 render yolları, fikstürü ve
      testi silinir (K7); veri dizinleri taşınır ve manifestler yeniden
      yayımlanır (K6); ortak çekirdek kernel dizinine; kökteki testler alt dizinlere.
      Kapanır: `verify --all` her manifesti `identical` bulur, PCM kimliği aynı.
- [ ] **[P1] SC — Repo ve kök temizliği.** Kök ve paketlerdeki her dosya ve
      dizin, yapılandırma, betik, belge ve yerel artık gerekçelendirilir ya da
      kaldırılır: .idea, .directory, bayat .vscode girdileri,
      .gitignore'un her satırı, testlerin paket ağacına yazdığı çıktılar,
      paketlerde kalan coverage, dist ve test-results çıktıları. Kapanır: kökte
      yalnız gerekçesi belgede yazılı girdiler kalır; bekçi kök girdi listesini
      kilitler.
- [ ] **[P1] Bağlam ve bağlamlı yorum temizliği.** Belgelerdeki bağlam anlatısı
      silinir; bütün kaynak türlerinde tarihçe, plan ve faz kimliği, ölçüm
      günlüğü, karar anlatısı ve kodu tekrar eden yorumlar kalkar. Yorumda
      yalnız koddan okunamayan gerekçe ve sözleşme kalır. Kapanır: tarama bu
      kalıplarda sıfır verir; yorum bekçisi kuralı kilitler.

### VOL.TEST — test ortamı oyunu

Analiz: yerel sertleştirme raporu §0.4. Uygulama analizin onayından sonra
başlar; Android ve Deck cihazları uygulama sırasında bağlıdır.

- [ ] **[P1] VT0 — Analiz onayı ve ürün ikonu onayı.**
- [ ] **[P1] VT1 — Paket iskeleti.** games/vol-test; web açılışı, i18n, kapı
      girdileri. Kapanır: `pnpm quick` ve paket testleri yeşil.
- [ ] **[P1] VT2 — Tauri kabuğu (Linux).** Kimlik `com.volstudio.voltest`, ikon,
      Cargo üyeliği. Kapanır: Rust kapısı yeşil; host'ta açılış ekran görüntüsü.
- [ ] **[P1] VT3 — Açılış servisleri.** Oturum, ekran kipi, girdi ve glif,
      metin girişi, menü süzgeci, kapsamlı kayıt, kapanış ve uyku boşaltması,
      ses, titreşim, Steamworks, Android geri tuşu ve yön, tanı. Tüketilmeyen
      tauri-v2 export'u silinir (K4). Kapanır: `pnpm high`; E2E Chromium + WebKit.
- [ ] **[P1] VT4 — Android.** Native proje izlenir, yön/çentik/tam ekran elle.
      Kapanır: bağlı iki cihazda kurulum, açılış, ekran görüntüsü.
- [ ] **[P1] VT5 — Steam Deck.** steamrt4 paketi ve `pnpm deck`. Kapanır: glibc
      bekçisi; bağlı Deck'te açılış, ekran görüntüsü ve kare ölçümü.
- [ ] **[P2] VT6 — Windows.** Yapılandırma ve kod yolu. Kapanır: yapılandırma
      testleri; paket yerelde üretilemediği için "ölçülmedi".
- [ ] **[P1] VT7 — Yeni oyun iskeleti.** VOL.TEST'ten çıkarılır
      (tauri-v2/templates/game). Kapanır: iskeletten üretilen paket
      `pnpm signoff`u ilk denemede geçer.

### Belgeler

- [ ] **[P1] SB — Belgeler sıfırdan.** `AGENTS.md`, `CLAUDE.md`, bütün
      README'ler ve `DESIGN.md`ler yeniden yazılır: kısa, net, gerçek. İngilizce
      README'ler silinir. `docs/` gerçekle doğrulanır; Deck belgesi ölçülmüş
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
