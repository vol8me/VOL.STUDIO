# Yeni oyun paketi

Her madde onu zorlayan kapıdan türetilmiştir. Atlanan madde ya kapıyı kırar ya
da testlerin sessizce hiç koşmamasına yol açar.

## Üreten şablon

Yeni oyun, mevcut CORE ve paylaşılan native kabuk üzerinden üretilir:

```sh
pnpm new:game --name orbit --id com.volstudio.orbit --title ORBIT \
  --port 5191 --hmr-port 1431 --e2e-port 5192
pnpm install
NEW_GAME_PACKAGE="@volstudio/orbit"
pnpm --filter "${NEW_GAME_PACKAGE}" build
cargo check --manifest-path games/orbit/src-tauri/Cargo.toml --offline
pnpm signoff
```

Ad küçük harfli kebab-case, kimlik üç veya daha fazla parçalı ters alan adıdır.
Üç port farklı olmalıdır; mevcut ürün kimliği, paket adı, yol ve portlar
reddedilir. Betik `games/<ad>` ağacını kurar; lifecycle'a `active` kaydı,
`quality.json`a taban kapsam eşiği, bundle ve ölçekleme bütçesi ekler. Mevcut
kayıtlar korunur; üretim başarısız olursa yeni ağaç ve kayıtlar geri alınır.

Kaynak `tauri-v2/templates/game/`dir. `.template` uzantıları üretimde kaldırılır.
Şablon Phaser sahnesi, CORE düğmesi, iki dil, kaynakla eşleşen birim testleri,
Chromium/WebKit E2E, `coreAliases()`, ortak public asset hattı ve uygulamanın
kendi bağlamını üreten Rust crate'ini taşır. Native crate kökün
`games/*/src-tauri` workspace glob'una kendiliğinden girer; ayrı Cargo kilidi
oluşturulmaz. İlk native kontrolü yeni crate kaydını kök Cargo kilidine ekler;
Rust kapısının `--locked` koşusu bundan sonra yeni paketi de sınar. Kullanılmayan ürün eklentileri ve başka oyunun oynanışı kopyalanmaz.

İkon kimlikten deterministik üretilen bir başlangıç çizimidir; yayın öncesi
ürün çizimiyle değiştirilir. Şablon Android native projesini üretmez; init sonrasında izlenen proje ürün kaynağıdır:
`pnpm --filter <paket> tauri android init` ardından oyun paketinde
`pnpm exec tauri icon src-tauri/icons/icon.png` çalıştırılarak ürün ikonları
üretilir. Başlangıç ölçekleme ölçümü CORE uzamsal indeksini kullanır; oynanış
eklendiğinde betik ve bütçe gerçek oyun yükünü ölçmelidir. Cihaz kabulü ayrıca
uygulanır; şablon üretimi cihaz kabulünü kanıtlamaz.

## Zorunlu

| Ne                                                             | Kapı                                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `workspace-lifecycle.json` → `active` kaydı                    | `scripts/quality/workspaceLifecycle.mjs`                                        |
| `package.json` → `typecheck`, `test`, `test:coverage`          | `scripts/quality/cli/workspace-contract.mjs` (`REQUIRED_SCRIPTS`)               |
| `vitest.config.ts`                                             | `test:coverage` varsa `scripts/quality/cli/workspace-contract.mjs` onu da ister |
| `quality.json` → paket adı altında kapsam eşikleri             | `scripts/quality/config.mjs`; eşik `floor`un altına inemez                      |
| `quality.json` → `bundles` ve `scaling` girdileri              | `scripts/quality/bundleSize.mjs`, `scripts/quality/scalingBudget.mjs`           |
| `tsconfig.json`, `vite.config.ts`, `index.html`                | `build` ve `typecheck`                                                          |
| `vite.config.ts` + `vitest.config.ts` → `coreAliases()`        | `scripts/vite/coreAliases.mjs`; CORE alt yolları elle yazılmaz                  |
| `<oyun>/src/i18n/tr.json` + `en.json` ve bir `keyParity` testi | [core/docs/i18n.md](../core/docs/i18n.md)                                       |
| `<oyun>/src-tauri/` varsa kendi ikonu ve çakışmayan dev portu  | `scripts/quality/productIcons.mjs`, `scripts/quality/devPorts.mjs`              |

`bundles` ve `scaling` girdisi yazılmazsa ölçüm yapılmaz; `scaling.<paket>.$measure`
benchmark betiğini, argümanlarını ve rapordaki seri adlarını taşır. Aynı paketin
preview ve e2e portu aynı olabilir; iki ayrı paket aynı portu bildiremez.

## Sınırlar

- Oyunun çalışma zamanı (`<oyun>/src/`) yalnız `core`, `network`, `tauri-v2` ve dış bağımlılıkları
  import eder; devtool ve başka oyun import edemez. `<oyun>/scripts/` ve `<oyun>/tests/`
  build/doğrulama zamanıdır.
- Aktif paket frozen pakete bağımlı olamaz.

## Seçmeli multiplayer profili

Yeni oyun çevrimdışı başlayabilir. Bağlantı gerekirse `@volstudio/network/protocol`
ve `@volstudio/network/client` exports'ları oyunun istemcisinden kullanılır;
oyunun sunucu odası, başsız simülasyonu, combat ve world schema'sı ürünün
`games/<oyun>/server/` ve `games/<oyun>/src/sim/` alanlarında kalır. Ortak pakete başka oyunun
harita, tank, ekonomi veya gameplay kuralları sokulmaz.

VOL.TEST'teki örnekte `server:dev` Node otoritesini localhost'ta başlatır,
`build:server` Vite oyun bundle'ından ayrı Node bundle üretir; ürün `build`
ikisini de koşar. Gerçek ağ odası deneyi `games/vol-test/tests/server/WorldRoom.test.ts`
içindedir; `joinOrCreate` dolu odadan sonra yeni oda oluşturabildiğinden oda
başına limit ile toplam oyuncu limitini ayırır. İstemciden yalnız doğrulanmış
girdi kabul edilir ve her sabit sim adımında en fazla bir niyet işlenir.

Bağlantı bütçesi dünyaya bağlıdır. Yüksek sayıda bant ve birim içeren, oyuncusuz da işleyen bir
dünya için Colyseus `Schema` ile durumu çoğaltmak yerine deterministik simülasyonu istemcide de
koşturup yalnız komutları göndermek ölçülen seçenektir ([VOL.FORGE](../games/vol-forge/DESIGN.md);
sayılar ve sınırlar [araştırmada](backend-research.md)). Bu yol savaş sisini ve gizli bilgiyi
taşımaz; onlar için ilgi alanı çerçevesi gerekir. Karar, oyunun gizli bilgi ihtiyacına göre verilir.

Bağlantı açıldığında `DisposableScope` ve oda aboneliğinin `dispose()` yolu
kapanışta çalışır. Paketli Tauri'de sunucu URL'si `connect-src` CSP listesine,
güvenli yayın uçları WSS/HTTPS'e ve auth token politikasına uyarlanır.
Oyuncu konumu, takım, hasar ve ekonomi yalnız sunucuda değiştirilir. Kalıcı
dünya için her dünya bir writer, snapshot+journal, komut idempotency, yeniden
bağlanma ve görünürlük/chunk bütçesi olmadan yayın kabul edilmez.
[Araştırma ve maliyet](backend-research.md), [paket](../network/README.md).

## Kendiliğinden olanlar

- `typecheck`, `test`, `build` ve `test:e2e` betikleri
  `scripts/quality/runActive.mjs` ile keşfedilir.
- Rust kapısı `<paket>/src-tauri/Cargo.toml` taşıyan her aktif paketi tarar.
  Crate kök `Cargo.toml`un `members` listesine girer; kendi kilidi ve profili
  olmaz (`scripts/quality/cargoWorkspace.mjs`).
- `active` + `<paket>/src-tauri/tauri.conf.json` taşıyan paket cihaz ölçümü adayıdır
  (`scripts/quality/deviceApps.mjs`).

## Dondurma, emeklilik, yeniden açma

- **Dondurma:** paket bitince annotated `<paket>/final-<tarih>` etiketi atılır;
  `workspace-lifecycle.json`da `status: "frozen"` ile `freezeTag`,
  `freezeCommit`, `decisionDate`, `reason` yazılır; `.prettierignore`a ve
  `package.json` → `stylelint.ignoreFiles`a `<yol>/**` eklenir (ESLint yok sayma listesi lifecycle'dan
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
| Ses: kanonik program, manifest, codec/loop/peak                             | `audio:production-check`, `audio-verify`, Deck WebKit decode/çıkış teknik QA        |
| Titreşim sürücüsü, kalıcı tercih, uyku ve hotplug                           | `tauri-v2` testleri, Deck komut izi ve fiziksel his onayı                           |
| İlerleme ve cihaz ayarı ayrı store; kapatmada yazı kaybı yok                | kalıcılık regresyonları, SIGTERM/uyku deneyi, gerçek App ID ile Cloud turu          |
| Yoğunluk etiketli kare ölçümü; 800p hedefi 60 FPS, p95 ≤ 18 ms              | `pnpm deck` ile `full` ölçümü                                                       |

Gerçek App ID ve yayımlanmış Steam Input düzeni, iki cihazda Cloud turu, Deck
Verified kararı ve OLED Deck ölçümü ayrı kabul hücreleridir; yapılmadıysa
"ölçülmedi" yazılır.
