# VOL.STUDIO — Agent Rehberi

Bu depoda çalışan her insanın ve agent'ın ortak sözleşmesi. İki tür içerik
taşır:

- **Değişmezler** bir kapıyla zorlanır; ihlal eden değişiklik yerelde
  reddedilir. Metin ile kapı ayrışırsa ikisi bir ihlal girdisiyle sınanır ve
  yanlış olan düzeltilir.
- **İlkeler** muhakemeye bırakılır; gerekçesinin geçmediği bir durumda körü
  körüne uygulanmaz, sapma raporda söylenir.

Alt dizindeki bir `AGENTS.md` (bugün `devtools/pen.dev/AGENTS.md`) kendi
alanını daraltır, bu dosyayı gevşetmez. `CLAUDE.md` yalnız Claude Code'a özgü
pratikleri taşır.

## Repo haritası

Tauri v2 + Phaser 4 + TypeScript, pnpm workspace. Kapılar yerelde `justfile`
üzerinden koşar; bulut CI yoktur. Ürün ve belge dili Türkçe'dir; kod
yorumları ve `.md` dosyaları Türkçe, identifier'lar İngilizce yazılır;
İngilizce karşılığı olan belge (`README.en.md`) aynı turda ve aynı başlık
yapısıyla güncellenir.

| Yol                     | Paket                    | Rol                                                                                    |
| ----------------------- | ------------------------ | -------------------------------------------------------------------------------------- |
| `core/`                 | `@volstudio/core`        | Oyun kelimesi bilmeyen motor ve UI kataloğu: girdi, zaman, durum, kalıcılık, ses, i18n |
| `tauri-v2/`             | `@volstudio/tauri-v2`    | Paylaşılan native kabuk (Rust kütüphanesi), eklentiler ve JS platform adaptörleri      |
| `devtools/audio-synth/` | `@volstudio/audio-synth` | Deterministik ses ve müzik üretimi; yayın kapısı, manifest, doğrulama                  |
| `devtools/deck/`        | `@volstudio/deck`        | Steam Deck ölçüm sondası ve devkit otomasyonu                                          |
| `devtools/pen.dev/`     | `@volstudio/pen.dev`     | Pencil kaynağından rig export'u                                                        |
| `devtools/vol-ui/`      | `@volstudio/vol-ui`      | CORE UI kataloğunun vitrini ve piksel temelli görsel sözleşmesi                        |

Paket durumu (`active`/`frozen`) `workspace-lifecycle.json`dadır; rutin
kapılar yalnız `active` paketleri koşar. Yeni oyun `games/<oyun>/` altına
kurulur: [docs/new-game.md](docs/new-game.md). Bitmiş bir ürün annotated
freeze etiketiyle arşivlenip ağaçtan kaldırılır; ağaçta frozen durmak karar
bekleyen kısa bir geçiş hâlidir.

Kök dizinler: `docs/` (repo geneli belgeler), `scripts/` (kapılar
`scripts/quality/`, Linux paketleme, cihaz ölçümü, ortam kontrolü),
`.github/assets/` (yalnız marka görselleri).

## Çalışma ilkeleri

- **Önce oku, sonra ölç.** Repo gerçeği (dosya, test, git durumu, cihaz)
  hafızadan önce gelir; bir iddia yazılmadan onu doğrulayan komut koşulur.
- **Kök neden.** Belirtiyi susturan geçici çözüm yerine neden düzeltilir;
  her düzeltme bir regresyon testi bırakır.
- **Kapsam kullanıcınındır.** İstenmeyen yan refactor yapılmaz; görülen sorun
  raporlanır ya da `TODO.md`ye yazılır.
- **Ölü kod ve ölü bağımlılık bırakılmaz.** Silinen bir sistemin yapılandırma
  girdisi, bağımlılığı, tipi ve belge satırı aynı turda silinir.
- **Kanıt iddiadan önce gelir.** Koşulmayan kapı "geçti" diye raporlanmaz.
  Servis, cihaz ya da görsel düzeltmesi kullanıcının gerçekten kullandığı
  örnekte doğrulanır; kanıt rapora girer.
- **İnsan yargısı uydurulmaz.** Dinleme, görsel beğeni ya da elle cihaz
  ölçümü yapılmadıysa "yapılmadı" olarak kalır.
- **Dışa açık ve geri alınması zor işlemler** (push, merge, etiket, silme,
  yayın) açık talep ister; commit de yalnız istendiğinde yapılır.
- **Yarım tur bırakılmaz.** İş bitince çalışma ağacı temizdir ya da durumu
  açıkça yazılmıştır.
- **Ölçmeden optimize edilmez.** Performans kararı bir ölçümle gösterilir;
  sayı ilgili belgeye yazılır, kaynak yorumuna değil.

## Değişmezler ve onları zorlayan kapılar

| Değişmez                                                                                                                                                                                                  | Kapı                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bağımlılık tek yönlüdür: `core` hiçbir oyunu ya da devtool'u import etmez; bir oyunun çalışma zamanı yalnız `core`, `tauri-v2` ve dış bağımlılıkları kullanır; devtool oyuna yalnız `devDependency` girer | `scripts/quality/layers.mjs`                                                                                                                          |
| Başka bir pakete yalnız `exports` haritasındaki yoldan girilir                                                                                                                                            | `scripts/quality/layers.mjs`                                                                                                                          |
| Her Tauri uygulamasının kimliği ürüne özgü ve benzersizdir (kayıt yolu ondan türer)                                                                                                                       | `scripts/quality/appIdentity.mjs`                                                                                                                     |
| JS eklenti bağımlılığı, Rust kaydı ve uygulama izni birbirine bağlıdır; ölü eklenti kalmaz                                                                                                                | `scripts/quality/tauriPlugins.mjs`                                                                                                                    |
| Tüketicisiz CORE UI bileşeni katalogdadır: vol-ui vitrininde gösterilir ve CORE testinde adıyla sınanır                                                                                                   | `scripts/quality/catalog.mjs`                                                                                                                         |
| Deterministik çıktı üreten kod yerel ayara bağlı sıralama (`localeCompare`) kullanmaz                                                                                                                     | `eslint.config.mjs`                                                                                                                                   |
| Frozen ağaç değişmez; aktif paket frozen pakete bağımlı olamaz                                                                                                                                            | `scripts/quality/workspaceLifecycle.mjs`                                                                                                              |
| Görünen metin i18n anahtarıdır; `tr.json` ile `en.json` aynı anahtarları taşır; modül düzeyinde `t()` çağrılmaz; ölü anahtar kalmaz                                                                       | paketlerin `keyParity` testleri, `scripts/quality/deadI18n.mjs`                                                                                       |
| Kaynak dosya en çok 1000 satırdır (kod, test, betik, stil, native); sınıra yakın dosyaya yeni davranış eklenmeden önce dosya bölünür                                                                      | `scripts/quality/sourceSize.mjs`                                                                                                                      |
| Dosyada yorum oranı en çok %40, tek yorum bloğu en çok 24 satırdır; oran aşımı yalnız gerekçe listesine yazılarak kabul edilir                                                                            | `scripts/quality/commentDensity.mjs`                                                                                                                  |
| Paket içinde çalışma zamanı modül döngüsü yoktur                                                                                                                                                          | `scripts/quality/moduleCycles.mjs`                                                                                                                    |
| `core` Phaser'ı yalnız kayıtlı köprü dosyalarında import eder                                                                                                                                             | `scripts/quality/phaserBoundary.mjs`, `core/docs/phaser-boundary.md`                                                                                  |
| CORE'un public tip yüzeyi kilitlidir; değişiklik bilinçlidir, tarihçe git'tedir                                                                                                                           | `scripts/quality/publicTypeSurface.mjs`, `core/tests/governance/publicSurface.test.ts`                                                                |
| Kapsam eşikleri ratchet'tir; büyük ve düşük kapsamlı dosya test ya da kanıtlı gerekçe ister                                                                                                               | `quality.json`, `scripts/quality/coverageBinding.mjs`, `scripts/quality/coverageShape.mjs`                                                            |
| Gönderilen bundle ve algoritmik ölçekleme her aktif oyun için bütçelidir                                                                                                                                  | `scripts/quality/bundleSize.mjs`, `scripts/quality/scalingBudget.mjs`                                                                                 |
| Geliştirme portları çakışmaz; her oyun kendi ikonunu taşır; Rust tek workspace ve tek kilittir                                                                                                            | `scripts/quality/devPorts.mjs`, `scripts/quality/productIcons.mjs`, `scripts/quality/cargoWorkspace.mjs`                                              |
| Sır ve üretilmiş çıktı commit edilmez                                                                                                                                                                     | `.gitignore`, `scripts/quality/tests/gitFiles.test.mjs`                                                                                               |
| Belgeler gerçeğe bağlıdır: anlatılan sembol, yol, betik ve kapı bileşimi vardır                                                                                                                           | `core/tests/governance/docSymbols.test.ts`, `devtools/audio-synth/tests/governance/docReferences.test.ts`, `scripts/quality/tests/agentDocs.test.mjs` |
| Aynı program, tohum ve sürüm her zaman aynı PCM'i verir                                                                                                                                                   | `devtools/audio-synth/tests/governance/`, `pnpm --filter @volstudio/audio-synth audio:production-check`                                               |

Depo herkese açıktır; `.env`, anahtar, keystore, token, kişisel tanımlayıcı
(kullanıcı adı, cihaz adresi, oturum belirteci) ve başka projelerin adları
koda, belgeye ve günlüğe girmez. Şüphe varsa commit edilmez, sorulur.

## Kalite kapıları

Kapıların tek kaynağı `justfile`'dır. `just` global değildir; `pnpm exec just
<tarif>` ya da aşağıdaki `pnpm` betikleriyle çağrılır. Ayrıntı:
[docs/gates.md](docs/gates.md).

| Kapı           | Ne zaman              | Bileşim                                                                                             |
| -------------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| `pnpm quick`   | pre-commit            | `contract` `format-check` `typecheck` `lint`                                                        |
| `pnpm fast`    | yerel geliştirme      | `quick` `test`                                                                                      |
| `pnpm high`    | pre-push              | `quick` `rust` `lint-css` `coverage` `coverage-shape` `audio-test` `build` `bundle` `scaling` `e2e` |
| `pnpm signoff` | sürüm, kilometre taşı | `high` `coverage-audio` `audio-verify` `security-js` `security-rust`                                |

- Kancalar `simple-git-hooks` ile kurulur (pre-commit `pnpm quick`, pre-push
  `pnpm high`) ve atlanmaz; `SKIP_SIMPLE_GIT_HOOKS=1` kaçınılmazsa raporlanır.
- Düşen tek kapı zincirin tamamı yerine yeniden koşulur:
  `pnpm exec just typecheck`, `pnpm exec just lint`, `pnpm exec just coverage`,
  `pnpm exec just rust`, `pnpm exec just contract`, `pnpm exec just --list`.
- `pnpm exec just report <kapı> --json` sonucu makine-okunur verir.
- Kapılar workspace'ten türer (`scripts/quality/runActive.mjs`); hiçbir kapıda
  elle paket listesi tutulmaz. `quality.json` tek kaynaktır ve her okunuşta
  şemayla doğrulanır; eşik yalnız kapsam artınca yükselir, muafiyet
  gerekçesiyle `exempt`e girer.
- `pnpm exec just test` kapsam eşiği uygulamaz; yeşil görünüp `high`'ı kırabilir.
- pnpm'in yerleşik komutuyla çakışan betik adı hiç çalışmaz; ortam kontrolü bu
  yüzden `pnpm run doctor:env`dir.
- Cihaz ölçümü (Android, Steam Deck) kapı değildir; sonraki ölçümün
  kıyaslandığı referans kayıttır.

## Mimari ilkeler

**CORE'un üç katmanı** ([core/docs/primitives.md](core/docs/primitives.md)):
mekanizma oyun kelimesi bilmez; sunum durumu çizer ve niyeti bildirir, kural
taşımaz; tarif yaygın kuralı hazır verir ama opt-in'dir. Bir bileşene kural
eklemeden önce sorulan soru: _başka bir oyun bunu farklı isteyebilir mi?_
Evetse kural tarif katmanına gider. Bir sunum bileşeni kendi defterini tutmaz.

**Katalog:** CORE'da hiçbir üründe tüketicisi olmayan bileşenler bilinçli
olarak bekletilir; her biri vol-ui vitrininde gösterilir ve kendi testleriyle
korunur (bekçi: `scripts/quality/catalog.mjs`). Kataloğa giren bileşen oyuna özgü varsayım taşımaz ve aynı turda
vitrine ve `devtools/vol-ui/README.md` sekme tablosuna eklenir.

**Kaynak yaşam döngüsü:** eklenen her listener, timer ve abonelik
`destroy()` ya da sahne kapanışında kaldırılır; iki ya da daha fazla bağımsız
kaynağı olan bileşen `DisposableScope` kullanır.

**Ölçüler veridir:** oynanış sayıları `games/<oyun>/src/config/` ağacında yaşar.

**UI:** oyunlar kendi bileşenini icat etmez, `core/src/ui/` kullanır; listeler
kimliğe göre diff'lenir; `prefers-reduced-motion` altında animasyona bağlı
temizlik bir zamanlayıcıyla yedeklenir; kaydırma en dış panelde tanımlanır;
dokunma hedefi politikası vol-ui README'sindedir.

**i18n:** [core/docs/i18n.md](core/docs/i18n.md).

**Determinizm korunur:** simülasyon saati ve durumu alınabilir RNG
`core/docs/primitives.md`de; audio-synth aynı girdiden aynı baytı üretir.

**Kalıcılık:** depolama `IStorageAdapter` arkasındadır (web'de
`localStorage`, Tauri'de kabuğun atomik yazıcısı); yazma koordinasyonu
`AutosaveCoordinator` ve `PersistedObservableState` iledir; ilerleme `synced`, cihaz ayarları `device`
kapsamındadır.

**Platform katmanı:** `tauri-v2/src-tauri` bir uygulama değil paylaşılan
kabuktur; bağlam her oyunun kendi crate'inde üretilir. Native kaynak taşıyan
eklenti yalnız onu kullanan uygulamada kaydedilir. Linux WebView çizim yolu
ölçüme dayalı kurallarla seçilir ([docs/linux.md](docs/linux.md)); ölçülmemiş
ortama kural yazılmaz. JS'de platform soruları ayrı yüklemlerle cevaplanır:
kabuk türü (`getRuntimePlatform`), oturum (`getSessionKind`), işaretçi türü
(`shouldUseTouchControls`), titreşim sürücüsü, geri hareketi yığını.

## Asset'ler ve üretim hatları

Bir asset'in kaynağı yazarındır, ara çıktısı onu üreten aracındır, gönderilen
hâli tüketen paketindir ve build'in tek girdisidir. Deterministik betiğin
ürettiği ara çıktı commit'lenmez; repo dışı araç ya da elle adım gerektiren
ara çıktı commit'lenir ama hiçbir oyun onu doğrudan okumaz. `devtools/`
silindiğinde oyunların build'i geçer.

**audio-synth** ([README](devtools/audio-synth/README.md),
[DESIGN](devtools/audio-synth/DESIGN.md)): sesler kanonik yayın yolundan geçer
(job → yayın kapısı → manifest); manifest programı, render yüzeyini ve PCM
kimliğini kaydeder, doğrulama yeniden render edip karşılaştırır; düğüm
sözleşmesi sürüm artmadan değişemez
(`pnpm --filter @volstudio/audio-synth audio:surface-lock`); canary dinlemesi
yalnız `devtools/audio-synth/corpus/canaries/reviews.json`daki insan beyanıyla kapanır.

**pen.dev:** `.pen` dosyasına yalnız Pencil MCP araçlarıyla erişilir; kurallar
`devtools/pen.dev/AGENTS.md`dedir.

**Tema ve fontlar:** tema `pnpm gen:theme` ile üretilir; fontlar
`pnpm --filter @volstudio/core download-fonts` ile indirilir.

## Platformlar

- **Linux:** [docs/linux.md](docs/linux.md) — AppImage/AppDir paketleme ve
  WebView çizim yolu (`pnpm build:linux-appimage`, `pnpm build:linux-steamrt4`).
- **Steam Deck ve Valve donanımı:** [docs/steam-deck.md](docs/steam-deck.md) —
  ölçülmüş gerçekler, kararlar, devkit sözleşmesi (`pnpm deck`).
- **Android:** [docs/android.md](docs/android.md) — bir oyunun native
  projesinin kurulumu ve cihaz ölçümü (`pnpm benchmark:device`).
- **Windows:** NSIS/MSI, WebView2.

## Belgeler

| Belge                                                  | Sorumluluk                                           |
| ------------------------------------------------------ | ---------------------------------------------------- |
| `README.md`, `README.en.md`                            | Monorepo girişi, komutlar, nereye bakılacağı         |
| `TODO.md`                                              | Repo geneli iş listesi                               |
| `docs/`                                                | Kapılar, platformlar, yeni oyun rehberi              |
| `core/docs/`                                           | CORE primitifleri, i18n, müzik motoru, Phaser sınırı |
| `<paket>/README.md`                                    | Paketin ne olduğu ve komutları                       |
| `<paket>/DESIGN.md`                                    | Paketin neden böyle olduğu                           |
| `<paket>/TODO.md`                                      | Paketin kendi iş listesi                             |
| `justfile`, `quality.json`, `workspace-lifecycle.json` | Kapılar, eşikler ve paket durumu için tek kaynaklar  |

- **Belge bugünü anlatır.** Sözleşme, karar ve kullanım yazılır; geçmiş,
  dalga/tur anlatısı ve ölçüm günlüğü yazılmaz (geçmiş git'tedir). Kod
  değişince onu anlatan belge aynı turda güncellenir.
- **Geçici planlama belgesi açılmaz.** Yapılacak iş `TODO.md`ye gider; kod
  yorumları geçici bir belgeye işaret etmez.
- **TODO dosyaları iş listesidir.** Madde işi ve "Kapanır:" ölçütünü kısa
  söyler; biten madde `[x]` olup `## Kapatılanlar`a tek satırla taşınır;
  eksik çıkan kapanış yeni madde olarak açılır.

**Yorum doktrini: varsayılan yorumsuzluktur.** Yorum yalnız koddan
çıkarılamayanı söyler: sessiz bir tuzak, tüketicinin varsayamayacağı bir
sözleşme, dış dünyanın dayattığı bir gariplik. Kodu tekrar eden cümle,
"eskiden şöyleydi" anlatısı, ölçüm günlüğü, bölüm başlığı ve başka dosyadaki
gerekçenin kopyası yazılmaz.

## Test disiplini

- Yeni davranışın testi aynı turda yazılır; düzeltilen hata regresyon testi
  bırakır.
- Test kaynağın aynasıdır: `<paket>/tests/` ağacı `<paket>/src/` ağacını
  yansıtır ve test dosyası sınadığı modülün adını taşır.
- Ağır testler süre büyütülerek değil yapıyla ucuzlatılır; genel
  `testTimeout` büyütülmez.
- Kapsam dışlaması yalnız çalıştırılabilir satırı olmayan dosyalar içindir.
- Disk gerçeğini sınayan testler gerçek geçici dizinde koşar.
- E2E Chromium ve WebKit'te koşar; vol-ui'nin piksel temelleri yalnız bilinçli
  bir görsel değişiklikte yenilenir.

## Git

- `main` kararlı, `dev` entegrasyon dalıdır; yeni iş `feature/<konu>` ya da
  `bugfix/<konu>` ile başlar; merge yalnız istendiğinde yapılır.
- Commit mesajı İngilizce Conventional Commits başlığı ve nedeni anlatan
  Türkçe gövdedir. Bir commit tek konuyu taşır.
- Commit öncesi `git status` okunur; izlenmeyen dosyalar tek tek doğrulanır.
- Freeze etiketleri değişmez; yeniden dondurma yeni bir annotated etiketle yapılır.
- `.github/workflows/` altına onaysız pipeline eklenmez.

## Araçlar

- **graphify:** `graphify-out/` varsa mimari ve bağımlılık sorularında önce
  ona sorulur (`graphify query`, `graphify affected`); kod değişince
  `graphify update .`. Çıktı yereldir.
- **Claude Code yerel dizini:** `.claude/` git dışıdır; araç çıktısı oraya
  değil, paketin git dışı `<paket>/records/` ya da `<paket>/export/`
  dizinine yazılır.
- **Ortam:** `pnpm run doctor:env`. **Geliştirme:** `pnpm dev`, vitrin için
  `pnpm exec just dev-ui`. **Temizlik:** `pnpm exec just clean`,
  `pnpm exec just clean-all`.
- **Teşhis:** CORE'un Diagnostics katmanı `?debug` ve `?perf` kiplerinde ölçüm
  toplar; `core/scripts/debug-server.mjs` bunları yerel bir sunucuda toplar.
- **Benchmark:** `pnpm benchmark:core`; kapılanan tek performans ölçüsü
  algoritmik ölçekleme oranıdır.

## Bitti sayma

- İlgili kapılar koşulmuş ve sonuçları raporlanmıştır.
- `git status --short` okunmuştur.
- Değişen davranışın belgesi ve TODO maddesi günceldir.
- Kalan risk ve bilinçli olarak yapılmayanlar yazılmıştır.
