# Yeni oyun paketi eklemek

Bu liste tahmin değil: her madde onu ZORLAYAN kapıdan türetildi. Sırayla
uygulanırsa `pnpm signoff` ilk denemede yeşil olur; atlanan bir madde ya kapıyı
kırar ya da — daha kötüsü — testlerinizin sessizce hiç koşmamasına yol açar.

## Zorunlu

| Ne                                                      | Neden / hangi kapı                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `workspace-lifecycle.json` → `active` kaydı             | Paket repo varlığı ile rutin kalite kapı kapsamını bağlar (`workspaceLifecycle.mjs`) |
| `package.json` → `typecheck`, `test`, `test:coverage`   | `scripts/workspace-contract.mjs` üçünü de arar (`REQUIRED_SCRIPTS`)                  |
| `vitest.config.ts`                                      | `test:coverage` varsa workspace-contract config dosyasını da ister                   |
| `quality.json` → paket adı altında kapsam eşikleri      | Eşikler `floor`un altına inemez; muafiyetin gerekçesi yazılı olmalı                  |
| `tsconfig.json`, `vite.config.ts`, `index.html`         | Build ve typecheck kapıları                                                          |
| `vite.config.ts` + `vitest.config.ts` → `coreAliases()` | CORE alt yolları elle yazılmaz; alias sızıntı testi bunu sınar                       |
| `src/i18n/tr.json` + `en.json` ve bir `keyParity` testi | Kullanıcıya görünen metin hard-code edilmez                                          |

## Sınırlar ve Yaşam Döngüsü

1. **Katman Sınırları:** Oyunun **çalışma zamanı** (`src/`) yalnız `core`'u,
   `tauri-v2`yi ve dış bağımlılıkları import eder — hiçbir devtool'u, hiçbir başka
   oyunu. `scripts/quality/layers.mjs` bunu zorlar. `scripts/` ve `tests/` bu
   sınırın dışındadır (build/doğrulama zamanı).
2. **Lifecycle Sözleşmesi:** Yeni bir paket eklendiğinde `workspace-lifecycle.json`a
   `status: "active"` olarak kaydedilmelidir. Rutin kapılar (`quick`, `high`,
   `signoff`) dinamik olarak yalnız `active` durumdaki paketleri çalıştırır.
3. **Dondurulmuş (Frozen) Paket Bağımlılığı Yasağı:** Yeni aktif bir oyun asla
   `frozen` statüsündeki `vol-arachnid` gibi bir pakete bağımlı olamaz.
4. **Frozen İmmutability:** Dondurulan oyun paketleri mevcut `HEAD` üzerinde
   kesinlikle değiştirilemez (immutable); doğrulamaları annotated Git etiketi
   (`freezeTag`) ve commit hash'i (`freezeCommit`) üzerinden kilitlenir.
   Dondururken `.prettierignore` ve `.stylelintignore`a `<path>/**` girdisi
   eklenir — ESLint ignores'u `workspace-lifecycle.json`dan kendiliğinden
   türer, `frozenToolSelection.test.mjs` üç yüzeyi birlikte kilitler.
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
- Cihaz ölçüm adaylığı da otomatiktir: `active` + `src-tauri/tauri.conf.json`
  taşıyan paket `device-benchmark` keşfine (`deviceBenchmarkCandidates`)
  kendiliğinden girer; frozen'a çekilince çıkar.

**Otomatik DEĞİLDİR:**

- `quality.json` → `bundles` altına paket girdisi eklenmezse bundle boyutu
  ölçülmez.
- `quality.json` → `scaling.<paket>.$measure` benchmark betiğini, argümanlarını
  ve rapordaki seri/alan adlarını taşır; tarif olmadan bütçe "ölçülemedi" sayılır.
  Oran anahtarı girdilerini kendi adında taşır: `fxParts72Over18` = 72 girdideki
  süre ÷ 18 girdideki süre.

**Geliştirme portu seçerken çakışmayı kapı sınar** (`scripts/quality/devPorts.mjs`):
iki AYRI paket aynı portu bildiremez. Kendi preview portunuzla kendi e2e portunuz
aynı olabilir.

## Deck ve Valve donanımı kabul listesi

Bu liste yeni oyunun kendi kabulüdür; VOL.HELL D7 ölçümü veya devkit App ID 480
bir başka oyunun cihaz sonucunu kanıtlamaz. Ölçüm koşulları ve sınırlar
`docs/steam-deck.md` belgesindedir. Cihaz deneyi kalite kapısı değildir.

| İş                                                                          | Otomatik kapı veya kanıt                                                               |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Oyuna özgü Tauri kimliği, ikon ve SteamRT4 AppDir; host glibc sızıntısı yok | `productIcons.mjs`, SteamRT4 paket bekçisi; taze AppDir başlatma ve ekran görüntüsü    |
| 1280×800 panelde canvas/client/backing, DOM safe-area ve 16:9/dock düzeni   | Oyun WebKit ekran testi ve gerçek Deck/harici ekran ölçümü                             |
| Kısa/uzun B, Menu, A, RT; menu, pause, kart, ayar, ölüm odak ve glifleri    | CORE odak birim/DOM testleri, oyun E2E ve fiziksel Steam Input olay izi                |
| Metin girişinde Steam modal/kayan klavye, OS klavyesi ve fallback           | `TextEntryProvider` birim testi ve Deck'te gerçek giriş                                |
| Ses/müzik: kanonik program, publish manifest, codec/loop/peak doğrulaması   | `audio:production-check`, `audio-verify`, Deck WebKit decode ve insan dinlemesi        |
| Titreşim sürücüsü, kalıcı tercih, olay gücü ve uyku/hotplug                 | `tauri-v2` testleri, Deck statü/komut izi ve fiziksel his onayı                        |
| İlerleme ve cihaz ayarı ayrı store; eski kayıt ve kapatma yazıları korunur  | kalıcılık regresyonları, SIGTERM/uyku deneyi ve gerçek App ID Cloud turu               |
| Tohumlu 0/10/20/30+ düşman, kart ve boss kare pencereleri                   | faz/yoğunluk etiketli oyun ölçümü; 800p hedefi 60 FPS, p95 ≤18 ms                      |
| Aktif Tauri oyununun cihaz adayı ve güvenli yeni release ölçümü             | `deviceBenchmarkCandidates`, `node scripts/deck.mjs full <oyun>`; eski release korunur |

Gerçek App ID ve yayımlanmış Steam Input düzeni, Cloud'un iki cihazda
offline→online deneyi, Valve Verified kararı ve bulunmayan OLED Deck/Steam
Machine ölçümleri ayrı kabul hücreleridir. Bunlar yapılmadıysa “ölçülmedi”
olarak yazılır; VDF kabulü veya App ID 480 bunların yerine geçmez.

## Sıra

1. Paketi kur, `workspace-lifecycle.json`a `status: "active"` ekle, `pnpm install`.
2. `pnpm --filter <paket> typecheck` — alias ve tsconfig doğru mu?
3. `quality.json`a eşikleri ve (build varsa) bundle bütçesini yaz.
4. `pnpm quick` — sözleşme, format, typecheck, lint.
5. E2E yazdıysanız `package.json` içine `test:e2e` script'i ekleyin (runActive otomatik yakalar).
6. `pnpm signoff`.
