# VOL.STUDIO — iş listesi

> **TODO disiplini:** Açık iş `[ ]`, biten iş `[x]` olur. Biten madde silinmez;
> kısa hâliyle dosyanın sonundaki `## Kapatılanlar` bölümüne taşınır. Eksik
> çıkan bir kapanış yeni bir `[ ]` maddeyle yeniden açılır.

Repo geneli işler; paket işleri paketin kendi `TODO.md`sinde.

## Açık

- [ ] **[P2] Android 16 geniş ekranda yön kilidini yok saymasın.** Android 16,
      en dar kenarı 600dp ve üstü ekranlarda `screenOrientation`ı yok sayar;
      oyun kategorisi (`android:appCategory="game"`) belirtilirse yön kilidi
      uygulanır. Manifestlerde kategori eklendi ancak gerçek cihazda veya
      emülatörde ölçülmedi: `device-benchmark.mjs` içinde kategori var mı yok
      mu denetimi yok; oyun çalıştırılmadan paket bilgisi okunmuyor; Android
      16 davranışını doğrulayan bir CI/yerel kapı yok; `ORIENTATION_MAP`te
      kategori var ve drift testleri kilitliyor. Kapanır: 600dp ve üstü
      emülatörde ya da tablette, kategori varken yön isteğinin uygulandığı
      ölçülür. Fiziksel tablet (TB350FU, Android 14, sw588) kriteri
      karşılamıyor; `vol-tablet-36` emülatörü (API 36, pixel_tablet, sw800)
      açılıp uygulama başlatılabiliyor ama misafir image'ının DMA mapper'ı
      (`!rcEnc->featureInfo()->hasReadColorBufferDma`) bozuk: SurfaceFlinger,
      `screencap` ve `dumpsys` aynı assert ile çöküyor; görsel ölçüm ve yön
      kanıtı yapılamıyor. Çözüm: farklı Android 16 imajı (`default`/`android-36`)
      denemek, Cuttlefish kurmak (root gerekir) veya Android 16 büyük ekranlı
      fiziksel cihaz bulmak.
- [ ] **[P1] Steam Deck Verified — platform altyapısı ve uyumluluk hazırlığı.**
      Valve Steam Deck Verified (Yeşil Onay Rozeti) standartları aktif platform
      çalışmalarında (`core`, `tauri-v2`, jenerik cihaz/deployment araçları, `vol-ui`
      yeterlilik vitrini ve gelecekteki aktif oyunlar) karşılanır:
      _ **Girdi:** HTML5 Gamepad API üzerinden tam XInput kontrolcü desteği;
      gamepad bağlıyken arayüzde asla klavye/fare glifi göstermeme (`core/src/ui/primitives/Glyph`);
      metin kutuları için sanal klavye köprüsü (`ShowFloatingGamepadTextInput`).
      _ **Ekran & Tipografi:** 1280×800 (16:10) yerel çözünürlük desteği;
      1280×800'de hiçbir metin 9 pikselin altına düşemez (repo geneli CSS/yönetişim testi).
      _ **Linux & Gamescope:** Jenerik Linux AppImage dağıtım hattında DMA-BUF ve
      Wayland/X11 Gamescope oturum yönetim kurallarının genel platform standardı hâline getirilmesi.
      _ **Güç & Suspend:** Konsol uykuya alınıp uyandırıldığında (suspend/resume)
      `audioContext.resume()` ve WebGL context restore mekanizmasının generic platformda garanti edilmesi.
      \_ **Frozen Ürün Sözleşmesi:** Frozen `vol-hell` ve `vol-arachnid` oyunları
      mevcut HEAD'de kaynak değişikliğine tabi tutulmaz; yalnızca freeze tag'i üzerinden
      referans/smoke doğrulaması olarak kalır. Kaynak düzeyinde Steam Deck adaptasyonu
      ancak explicit lifecycle reactivation ile mümkündür.

## Kapatılanlar

### 2026-09-20 — deneysel paketleri emekliye ayırma ve CORE kazanımları

- [x] **Kanıtlanmamış ürün/araç yüzeyleri framework'e fosilleştirilmeden
      kaldırıldı.** Yapay yaşam deneyi, görsel sentez prototipi ve varlık
      çalışma ortamı workspace, kalite kapıları, Android/cihaz ölçümü, komutlar,
      lockfile ve belgelerden birlikte çıkarıldı. Gönderilen oyunların build
      grafiği bu paketlerden bağımsız kaldı.
- [x] **Kanıtlanmış ortak mekanizmalar CORE'a taşındı.** Durumu alınabilir
      deterministik RNG, seri son-değer-kazanır otomatik kayıt, doğrulama
      politikasını tüketicide bırakan gözlemlenebilir kalıcı state ve i18n
      başlamadan çalışabilen fatal açılış yüzeyi generic sözleşme ve regresyon
      testleriyle eklendi. VOL.HELL'in görüntü, ses ve tuş ayarları ortak
      kalıcılık mekanizmasının gerçek tüketicileri oldu; fatal yüzey vol-ui'de
      sergilendi.
- [x] **Mevcut CORE kazanımları korundu.** `CommandHistory`, `Sheet`,
      `SimulationClock`, haptics platform seam'i ve geliştirilmiş
      `WorldCameraController` gerçek kalan tüketici/sözleşmeleriyle yaşamaya
      devam ediyor; ürün alanına bağlı simülasyon, SDF, alan ve codec kodu
      CORE'a taşınmadı.

### 2026-09-10 — kanıtlı kapsam şekli, taze veri, ürün ikonları

- [x] **Büyük ve kritik dosyalar test kanıtına bağlandı.** `coverageShape`
      gerekçe haritasını kanıtlı hâle getirdi; `BossController`, `GameAudio`,
      `PCController` ve `TouchController` doğrudan birim testleriyle
      kapsandı.
- [x] **1000 satır sınırı CSS dahil tüm kaynak türlerine genişletildi.**
      Büyük stil dosyaları bileşen sınırlarında bölündü; `cssImports`
      bekçisi sahipsiz stil dosyalarını engelledi.
- [x] **Her oyun kendi ürün kimliğini taşır.** Ortak Tauri şablon ikonları
      kaldırıldı, oyunlar kendi SVG kaynaklarından üretilmiş ikon setlerini
      kendi `src-tauri` ağaçlarına aldı; `productIcons` ayrışmayı kilitledi.
- [x] **Rust push kapısına dahil edildi.** `cargoLockParity` tauri/wry/tao
      sürümlerini kilitledi, `just rust` üç yerli crate'in format/clippy/check
      adımlarını birleştirdi.
- [x] **TODO arşivi temizlendi.** Kapanan 16 madde git geçmişine devredildi,
      dosya yalnız aktif borcu tutan boyuta indirildi.
