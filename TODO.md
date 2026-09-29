# VOL.STUDIO — iş listesi

Repo geneli işler; paket işleri paketin kendi `TODO.md`sindedir. Açık iş
`[ ]`, biten iş `[x]` olur ve `## Kapatılanlar`a tek satırla taşınır; eksik
çıkan kapanış yeni madde olarak açılır.

## Açık

### Sertleştirme

- [ ] **[P1] S0 — Kapılar.** Her kapının neyi sınadığı denetlenir; boşluklar
      kapatılır: rapor aşama haritası, Rust test/all-targets/feature matrisi,
      deck-probe testleri, betiklerin lint'i, lifecycle ↔ belge eşlemesi,
      `docs/*.md` yol kapısı, yerel ayara bağlı sıralama yasağı, audio-synth
      dizin katmanı ve `exports` kapısı. Kapanır: her kapı `docs/gates.md`de
      anlatılır ve `pnpm signoff` bir kez yeşil koşar.
- [ ] **[P1] S1 — Veri bütünlüğü.** `TauriStoreAdapter` yazı kaybı, boş kilidin
      çalınması, iki WAV çözücünün ayrışması ve audio-synth'in bütünlük
      hataları regresyon testleriyle düzeltilir.
- [ ] **[P1] SD — Steam Deck boşlukları.** Referans kabuk uygulaması, yeni oyun
      şablonu, uyku/uyanma, kısayol süzgeci, FPS sınırı ve glif köprüsü.
- [ ] **[P2] S2 — audio-synth sertleştirme.** Önbellek, paralel işçi, manifest
      ve analiz yolundaki bulgular.
- [ ] **[P2] S3 — Kalıntı.** Katalog politikası kapıya bağlanır; tüketicisiz
      bağımlılık ve eklentiler kaldırılır.
- [ ] **[P2] SH — Hiyerarşi.** Cargo workspace, stil ve test yerleşimi, Deck
      araçlarının tek dizinde toplanması.
- [ ] **[P1] SC — Repo ve kök dizin temizliği (kullanıcı geri bildirimi).**
      Kökteki her dosya ve dizin gerekçelendirilir ya da kaldırılır; git dışı
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
- [ ] **[P2] SB — Belgeler.** Paket README/DESIGN/TODO dosyaları minimal hâle
      gelir; `core` ve `tauri-v2` README kazanır.
- [ ] **[P3] S7 — Araç zinciri.** ESLint, Prettier ve TypeScript sürümleri
      ile yapılandırması güncellenir.

### Steam Deck ve Valve donanım ailesi

Ölçümler ve kararlar: [docs/steam-deck.md](docs/steam-deck.md).

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

### Android

- [ ] **[P3] Android 16 geniş ekranda yön kilidi.** Kapanır: bir oyunla,
      600dp üstü Android 16 cihaz ya da çalışan emülatör imajında
      `appCategory="game"` varken yön isteğinin uygulandığı ölçülür.

## Kapatılanlar

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
