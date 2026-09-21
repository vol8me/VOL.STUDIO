# Yeni oyun paketi eklemek

Bu liste tahmin değil: her madde onu ZORLAYAN kapıdan türetildi. Sırayla
uygulanırsa `pnpm signoff` ilk denemede yeşil olur; atlanan bir madde ya kapıyı
kırar ya da — daha kötüsü — testlerinizin sessizce hiç koşmamasına yol açar.

## Zorunlu

| Ne                                                           | Neden / hangi kapı                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `workspace-lifecycle.json` \u2192 `active` kaydı             | Paket repo varlığı ile rutin kalite kapı kapsamını bağlar (`workspaceLifecycle.mjs`) |
| `package.json` \u2192 `typecheck`, `test`, `test:coverage`   | `scripts/workspace-contract.mjs` üçünü de arar (`REQUIRED_SCRIPTS`)                  |
| `vitest.config.ts`                                           | `test:coverage` varsa workspace-contract config dosyasını da ister                   |
| `quality.json` \u2192 paket adı altında kapsam eşikleri      | Eşikler `floor`un altına inemez; muafiyetin gerekçesi yazılı olmalı                  |
| `tsconfig.json`, `vite.config.ts`, `index.html`              | Build ve typecheck kapıları                                                          |
| `vite.config.ts` + `vitest.config.ts` \u2192 `coreAliases()` | CORE alt yolları elle yazılmaz; alias sızıntı testi bunu sınar                       |
| `src/i18n/tr.json` + `en.json` ve bir `keyParity` testi      | Kullanıcıya görünen metin hard-code edilmez                                          |

## Sınırlar ve Yaşam Döngüsü

1. **Katman Sınırları:** Oyunun **çalışma zamanı** (`src/`) yalnız `core`'u,
   `tauri-v2`yi ve dış bağımlılıkları import eder — hiçbir devtool'u, hiçbir başka
   oyunu. `scripts/quality/layers.mjs` bunu zorlar. `scripts/` ve `tests/` bu
   sınırın dışındadır (build/doğrulama zamanı).
2. **Lifecycle Sözleşmesi:** Yeni bir paket eklendiğinde `workspace-lifecycle.json`a
   `status: "active"` olarak kaydedilmelidir. Rutin kapılar (`quick`, `high`,
   `signoff`) dinamik olarak yalnız `active` durumdaki paketleri çalıştırır.
3. **Dondurulmuş (Frozen) Paket Bağımlılığı Yasağı:** Yeni aktif bir oyun asla
   `frozen` statüsündeki bir pakete (`vol-hell`, `vol-arachnid` vb.) bağımlı olamaz.
4. **Frozen İmmutability:** Dondurulan oyun paketleri mevcut `HEAD` üzerinde
   kesinlikle değiştirilemez (immutable); doğrulamaları annotated Git etiketi
   (`freezeTag`) ve commit hash'i (`freezeCommit`) üzerinden kilitlenir.
5. **Yeniden Aktifleştirme Prosedürü:** Dondurulmuş bir oyunda yeniden aktif
   çalışma yürütülecekse:
   - `workspace-lifecycle.json` dosyasında `status` "active"e çekilir.
   - `freezeTag`, `freezeCommit`, `decisionDate`, `reason` alanları kaldırılır.
   - Bağımlılıklar, eşikler ve araç zinciri senkronize edilir.
   - Geliştirme tamamlandığında bilinçli yeni bir freeze etiketi ve commit ile dondurulur.

## Otomatik olan ve OLMAYAN

**Otomatik:**

- `runActive.mjs` üzerinden `typecheck`, `test`, `build` ve `test:e2e` script'leri
  aktif paketler için dinamik keşfedilir; `justfile` içinde elle liste tutulmaz.
- Rust kapısı `src-tauri/Cargo.toml` taşıyan her aktif paketi tarar; yeni oyun
  eklendiğinde `check`/`fmt`/`clippy` kendiliğinden kapsar.

**Otomatik DEĞİLDİR:**

- `quality.json` \u2192 `bundles` altına paket girdisi eklenmezse bundle boyutu
  ölçülmez.
- `quality.json` \u2192 `scaling.<paket>.$measure` benchmark betiğini, argümanlarını
  ve rapordaki seri/alan adlarını taşır; tarif olmadan bütçe "ölçülemedi" sayılır.
  Oran anahtarı girdilerini kendi adında taşır: `fxParts72Over18` = 72 girdideki
  süre \u00f7 18 girdideki süre.

**Geliştirme portu seçerken çakışmayı kapı sınar** (`scripts/quality/devPorts.mjs`):
iki AYRI paket aynı portu bildiremez. Kendi preview portunuzla kendi e2e portunuz
aynı olabilir.

## Sıra

1. Paketi kur, `workspace-lifecycle.json`a `status: "active"` ekle, `pnpm install`.
2. `pnpm --filter <paket> typecheck` — alias ve tsconfig doğru mu?
3. `quality.json`a eşikleri ve (build varsa) bundle bütçesini yaz.
4. `pnpm quick` — sözleşme, format, typecheck, lint.
5. E2E yazdıysanız `package.json` içine `test:e2e` script'i ekleyin (runActive otomatik yakalar).
6. `pnpm signoff`.
