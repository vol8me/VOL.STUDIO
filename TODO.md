# VOL.STUDIO — iş listesi

Repo geneli işler; paket işleri paketin `TODO.md`sinde. Kapanan madde silinir.
Aktif iş: VOL.LIFE Adım 1 — [games/vol-life/TODO.md](games/vol-life/TODO.md).

## Kalite ve altyapı

### P1

- [ ] **Kapsam şekli gerekçeleri koda dayansın.** `quality.json` →
      `coverageShape.acknowledged`: `BossController.ts` durum makinesi birim
      testi alır; vol-hell e2e'si BAŞLA'ya basıp `GameScene`'i açar;
      `GameAudio.ts` test ya da sınanabilir gerekçe alır; `PCController.ts` ve
      `TouchController.ts` gerekçeleri kodla doğrulanır.
- [ ] **`quick` kapsam çıktısına bağlı kalmasın.** Gerçek repo şekil
      doğrulaması `coverageShape.test.mjs`ten çıkar, yalnız
      `just coverage-shape`te koşar; temiz klonda `pnpm quick` yeşil kalır.

### P2

- [ ] **Kapsam şekli yalnız o koşunun lcov'unu okusun.** Eşiği olup lcov'u
      olmayan paket geçmez; `high`da ölçülmeyen paket (audio-synth) `high`
      kararına girmez.
- [ ] **Rust `high`a girsin** ya da `signoff`ta kalma gerekçesi
      `docs/gates.md`ye yazılsın.
- [ ] **`sourceSize`, `commentDensity` ve `deadI18n` izlenmeyen dosyaları da
      görsün** (`git ls-files --cached --others --exclude-standard`); testle
      kilitlenir.
- [ ] **Her oyun kendi ikon setini taşısın** (masaüstü `bundle.icon`, Android
      mipmap); `tauri-v2/src-tauri/icons` kalkar.
- [ ] **`just tauri-ios` tarifi silinsin.**

### P3

- [ ] **`validateDeviceApps` `workspace-contract.mjs`e bağlansın;** test yalnız
      fixture'ları sınar.
- [ ] **Bundle ölçüsü Σ gzip(dosya) olsun** (`bundleSize.mjs`).
- [ ] **Bundle vendor sınıflaması yol ayırıcısından bağımsız olsun;** win32
      yoluyla test edilir.
- [ ] **Satır sınırı `.mjs`yi de kapsasın.** CSS için karar verilir: kapsama
      alınıp 1000+ satırlık beş dosya bölünür ya da dışarıda kalma gerekçesi
      `docs/gates.md`ye yazılır.
- [ ] **`docs/gates.md` `deviceApps` ve `coverage-shape` kapılarını anlatsın.**
- [ ] **`pnpm dev` vol-life'ı da açsın;** `README.md` ve `README.en.md`
      güncellenir.
- [ ] **Dört `Cargo.lock`taki `tauri` sürüm eşitliği bir bekçiyle kilitlensin.**
- [ ] **`games/vol-hell/tests/platform/androidDrift.test.ts` açıklamasındaki
      yol düzeltilsin** (`games/vol-hell/src-tauri/gen/android`).
- [ ] **`devtools/visual-synth/tests/memoryEstimateAccuracy.test.ts` yorumu
      TODO'ya işaret etmesin;** "borç değil" kararını söylesin.

## Ertelenen

- **iOS/WKWebView MP3 fallback'i manuel** (`pnpm convert:ios`); iOS hedefe
  girdiğinde ses build'ine bağlanır.
