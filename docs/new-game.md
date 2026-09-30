# Yeni oyun paketi

Her madde onu zorlayan kapıdan türetilmiştir. Atlanan madde ya kapıyı kırar ya
da testlerin sessizce hiç koşmamasına yol açar.

## Zorunlu

| Ne                                                             | Kapı                                                                  |
| -------------------------------------------------------------- | --------------------------------------------------------------------- |
| `workspace-lifecycle.json` → `active` kaydı                    | `scripts/quality/workspaceLifecycle.mjs`                              |
| `package.json` → `typecheck`, `test`, `test:coverage`          | `scripts/workspace-contract.mjs` (`REQUIRED_SCRIPTS`)                 |
| `vitest.config.ts`                                             | `test:coverage` varsa `scripts/workspace-contract.mjs` onu da ister   |
| `quality.json` → paket adı altında kapsam eşikleri             | `scripts/quality/config.mjs`; eşik `floor`un altına inemez            |
| `quality.json` → `bundles` ve `scaling` girdileri              | `scripts/quality/bundleSize.mjs`, `scripts/quality/scalingBudget.mjs` |
| `tsconfig.json`, `vite.config.ts`, `index.html`                | `build` ve `typecheck`                                                |
| `vite.config.ts` + `vitest.config.ts` → `coreAliases()`        | `scripts/vite/coreAliases.mjs`; CORE alt yolları elle yazılmaz        |
| `<oyun>/src/i18n/tr.json` + `en.json` ve bir `keyParity` testi | [core/docs/i18n.md](../core/docs/i18n.md)                             |
| `<oyun>/src-tauri/` varsa kendi ikonu ve çakışmayan dev portu  | `scripts/quality/productIcons.mjs`, `scripts/quality/devPorts.mjs`    |

`bundles` ve `scaling` girdisi yazılmazsa ölçüm yapılmaz; `scaling.<paket>.$measure`
benchmark betiğini, argümanlarını ve rapordaki seri adlarını taşır. Aynı paketin
preview ve e2e portu aynı olabilir; iki ayrı paket aynı portu bildiremez.

## Sınırlar

- Oyunun çalışma zamanı (`<oyun>/src/`) yalnız `core`, `tauri-v2` ve dış bağımlılıkları
  import eder; devtool ve başka oyun import edemez. `<oyun>/scripts/` ve `<oyun>/tests/`
  build/doğrulama zamanıdır.
- Aktif paket frozen pakete bağımlı olamaz.

## Kendiliğinden olanlar

- `typecheck`, `test`, `build` ve `test:e2e` betikleri
  `scripts/quality/runActive.mjs` ile keşfedilir.
- Rust kapısı `<paket>/src-tauri/Cargo.toml` taşıyan her aktif paketi tarar.
  Crate kök `Cargo.toml`un `members` listesine girer; kendi kilidi ve profili
  olmaz (`scripts/quality/cargoWorkspace.mjs`).
- `active` + `<paket>/src-tauri/tauri.conf.json` taşıyan paket cihaz ölçümü adayıdır
  (`scripts/quality/deviceApps.mjs`).

## Sıra

1. Paketi kur, `workspace-lifecycle.json`a `active` kaydını ekle, `pnpm install`.
2. `pnpm --filter <paket> typecheck`.
3. `quality.json`a eşikleri, bundle ve ölçekleme bütçesini yaz.
4. `pnpm quick`.
5. E2E varsa `test:e2e` betiğini ekle.
6. `pnpm signoff`.

## Dondurma, emeklilik, yeniden açma

- **Dondurma:** paket bitince annotated `<paket>/final-<tarih>` etiketi atılır;
  `workspace-lifecycle.json`da `status: "frozen"` ile `freezeTag`,
  `freezeCommit`, `decisionDate`, `reason` yazılır; `.prettierignore` ve
  `.stylelintignore`a `<yol>/**` eklenir (ESLint yok sayma listesi lifecycle'dan
  türer). Frozen ağaç değişmez. `frozen` kısa bir geçiş hâlidir: frozen
  ağaç rutin kapılarda koşmaz ve CORE değişiklikleriyle sessizce bozulur;
  karar verilince emekliliğe geçer.
- **Emeklilik:** frozen ürün ağaçta tutulmaz; etiket arşivdir. Paket, lifecycle
  kaydı, `quality.json` girdileri, yok sayma satırları ve belge anmaları aynı
  commit'te silinir. CORE'a katkısı olan bileşenler katalogda kalır.
- **Yeniden açma:** etiketten dal açılır, `status` `active`e çekilir, freeze
  alanları silinir, bağımlılık ve eşikler güncel zincire taşınır.

## Steam Deck kabulü

Kabul yeni oyunun kendisine aittir; başka bir oyunun ya da test App ID'sinin
ölçümü onu kanıtlamaz. Ölçüm koşulları [steam-deck.md](steam-deck.md)
belgesindedir; cihaz deneyi kalite kapısı değildir.

| İş                                                                          | Kanıt                                                                               |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Oyuna özgü Tauri kimliği, ikon ve SteamRT4 AppDir; host glibc sızıntısı yok | `productIcons.mjs`, SteamRT4 paket bekçisi; taze AppDir başlatma ve ekran görüntüsü |
| 1280×800 panelde canvas/backing, DOM safe-area, 16:9 ve harici ekran düzeni | WebKit ekran testi ve gerçek Deck ölçümü                                            |
| Kısa/uzun B, Menu, A, RT; bütün ekranlarda odak ve glifler                  | CORE odak testleri, oyun E2E ve fiziksel Steam Input olay izi                       |
| Metin girişinde Steam kayan klavyesi ve fallback                            | `TextEntryProvider` testi ve Deck'te gerçek giriş                                   |
| WebView bağlam menüsü, uzun basış balonu ve sürükleme hayaleti kapalı       | `nativeMenus` testleri; Deck'te uzun basış deneyi                                   |
| Ses: kanonik program, manifest, codec/loop/peak                             | `audio:production-check`, `audio-verify`, Deck WebKit decode, insan dinlemesi       |
| Titreşim sürücüsü, kalıcı tercih, uyku ve hotplug                           | `tauri-v2` testleri, Deck komut izi ve fiziksel his onayı                           |
| İlerleme ve cihaz ayarı ayrı store; kapatmada yazı kaybı yok                | kalıcılık regresyonları, SIGTERM/uyku deneyi, gerçek App ID ile Cloud turu          |
| Yoğunluk etiketli kare ölçümü; 800p hedefi 60 FPS, p95 ≤ 18 ms              | `pnpm deck` ile `full` ölçümü                                                       |

Gerçek App ID ve yayımlanmış Steam Input düzeni, iki cihazda Cloud turu, Deck
Verified kararı ve OLED Deck ölçümü ayrı kabul hücreleridir; yapılmadıysa
"ölçülmedi" yazılır.
