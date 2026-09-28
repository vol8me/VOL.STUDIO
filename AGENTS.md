# VOL.STUDIO — Agent Rehberi

Bu dosya, bu depoda çalışan her insanın ve agent'ın ortak çalışma sözleşmesidir.
İki tür içerik taşır:

- **Değişmezler** bir kapıyla zorlanır. İhlal eden değişiklik yerelde
  reddedilir. Metin ile kapı ayrışırsa ikisi somut bir ihlal girdisiyle
  sınanır ve yanlış olan düzeltilir.
- **İlkeler** muhakemeye bırakılır ve gerekçeleriyle yazılır. Gerekçenin
  geçerli olmadığı bir durumda körü körüne uygulanmaz; sapma raporda söylenir.

Alt dizindeki bir `AGENTS.md` (bugün `devtools/pen.dev/AGENTS.md`) kendi
alanını daraltır, bu dosyayı gevşetmez. `CLAUDE.md` yalnız Claude Code'a özgü
pratikleri taşır ve buraya işaret eder.

## Repo haritası

Tauri v2 + Phaser 4 + TypeScript, pnpm workspace (`pnpm-workspace.yaml`).
Kalite kapıları yerelde `justfile` üzerinden koşar; bulut CI yoktur.

**Hedef platformlar:**

- **Windows:** NSIS/MSI, WebView2.
- **Android:** APK, sistem WebView'ı — `docs/android.md`.
- **Linux:** AppImage, WebKitGTK — `docs/android.md`, "Fedora / Linux release".
- **Steam Deck ve Valve donanımı:** ölçülmüş platform gerçekleri ve kararlar
  `docs/steam-deck.md`, işler `TODO.md`. Bugün Deck'e gönderilen oyun yoktur.

**Dil:** Ürünün ve belgelerin ana dili Türkçe'dir. Kod yorumları ve `.md`
dosyaları Türkçe yazılır; identifier'lar İngilizce kalır. İngilizce karşılığı
olan bir belge (`README.en.md` gibi) onunla aynı turda ve aynı başlık
yapısıyla güncellenir.

| Yol                     | Paket                     | Durum  | Rol                                                                                                                                |
| ----------------------- | ------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `core/`                 | `@volstudio/core`         | active | Oyun kelimesi bilmeyen motor: girdi, zaman, durum, uzam, kalıcılık, DOM UI bileşenleri, ses ve müzik çalma, i18n, Phaser köprüleri |
| `tauri-v2/`             | `@volstudio/tauri-v2`     | active | Paylaşılan native kabuk (Rust kütüphanesi; uygulama değildir), JS platform adaptörleri ve Android yön eklentisi                    |
| `devtools/audio-synth/` | `@volstudio/audio-synth`  | active | Deterministik ses ve müzik üretimi; kanonik yayın kapısı, manifest ve doğrulama                                                    |
| `devtools/pen.dev/`     | `@volstudio/pen.dev`      | active | Pencil tasarım kaynağından rig export'u ve tüketiciye gönderim                                                                     |
| `devtools/vol-ui/`      | `@volstudio/vol-ui`       | active | CORE UI bileşenlerinin vitrini ve piksel temelli görsel sözleşmesi                                                                 |
| `games/vol-hell/`       | `@volstudio/vol-hell`     | frozen | Gönderilmiş referans ürün                                                                                                          |
| `games/vol-arachnid/`   | `@volstudio/vol-arachnid` | frozen | Gönderilmiş referans ürün                                                                                                          |

Paketlerin durumu `workspace-lifecycle.json`dadır. Rutin kapılar yalnız
`active` paketleri koşar. Frozen bir paketin kanıtı annotated freeze
etiketindedir; o pakette yeniden çalışmak, belgelenmiş aktifleştirme
prosedürüyle başlar (`games/docs/new-game.md`, `docs/gates.md`).

Kök dizinler:

- `docs/`: repo geneli belgeler.
- `scripts/`: kapı uygulamaları (`scripts/quality/`), Linux paketleme, cihaz ölçümü, ortam kontrolü.
- `games/docs/`: oyun tarafı i18n rehberi ve yeni oyun listesi.
- `.github/assets/`: yalnız marka görselleri.

## Çalışma ilkeleri

- **Önce oku, sonra ölç.** Repo gerçeği (dosya, betik, test, git durumu,
  cihaz) hafızadan ve varsayımdan önce gelir. Bir iddiayı yazmadan önce onu
  doğrulayan komutu koş.
- **Kök neden.** Belirtiyi susturan geçici çözüm yerine nedeni düzelt. Her
  düzeltme bir regresyon testi bırakır.
- **Kapsam kullanıcınındır.** İstenmeyen yan refactor yapılmaz. Görülen başka
  bir sorun raporlanır ya da `TODO.md`ye iş maddesi olarak yazılır. Plan
  istendiyse plan yazılır; uygulama istendiyse iş doğrulamayla biter.
- **Ölü kod ve ölü bağımlılık bırakılmaz.** Silinen bir sistemin yapılandırma
  girdisi, bağımlılığı, tip tanımı ve belge satırı da aynı turda silinir.
- **Kanıt iddiadan önce gelir.** Koşulmayan bir kapı "geçti" diye
  raporlanmaz; bu, en ağır hatadır. Bir servis, cihaz ya da görsel düzeltmesi,
  kullanıcının gerçekten kullandığı örnekte (açık port, bağlı cihaz)
  doğrulanır; kanıtı (ekran görüntüsü, ölçüm) rapora girer.
- **İnsan yargısı uydurulmaz.** Dinleme, görsel beğeni ya da cihaz başında
  elle ölçüm gerektiren bir sonuç yapılmadıysa "yapılmadı" olarak kalır.
- **Dışa açık ve geri alınması zor işlemler** (push, merge, etiket, silme,
  yayın) açık bir talep ister. Commit de yalnız kullanıcı istediğinde yapılır.
- **Yarım tur bırakılmaz.** İş bittiğinde çalışma ağacı temizdir ya da
  durumu açıkça yazılmıştır. Rapor çalıştırılan komutları, sonuçlarını ve
  kalan riski saklamadan söyler.
- **Ölçmeden optimize edilmez.** Performans kararı önce bir ölçümle gösterilir.
  Çıkan sayı ilgili belgeye yazılır; kaynak yorumuna değil.

## Değişmezler ve onları zorlayan kapılar

| Değişmez                                                                                                                                                                                                                                                                                                      | Neden                                                                                                | Kapı                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bağımlılık tek yönlüdür. `core` hiçbir oyunu ya da devtool'u import etmez. Bir oyunun çalışma zamanı yalnız `core`, `tauri-v2` ve dış bağımlılıkları kullanır. Devtool bir oyuna yalnız build/test zamanında, `devDependency` olarak girer. Devtool → devtool kenarı yalnız gerekçesiyle yazılmışsa meşrudur. | `devtools/` ağacı yokken bir oyunun build grafiği çözülebilmelidir; araç ürünün sözleşmesine sızmaz. | `scripts/quality/layers.mjs`                                                                                                                          |
| Frozen ağaç değişmez; aktif paket frozen pakete bağımlı olamaz.                                                                                                                                                                                                                                               | Referans ürünün kanıtı etiketindedir.                                                                | `scripts/quality/workspaceLifecycle.mjs`                                                                                                              |
| Kullanıcıya görünen metin i18n anahtarıdır. `tr.json` ile `en.json` aynı anahtarları taşır. Modül düzeyinde `t()` çağrılmaz. Ölü anahtar kalmaz.                                                                                                                                                              | Import anında i18n başlamamış olabilir; ölü anahtar çevirmene ve gözden geçirene yük olur.           | paketlerin `keyParity` testleri, `scripts/quality/deadI18n.mjs`                                                                                       |
| Kaynak dosya en çok 1000 satırdır (kod, test, betik, stil, native). Yeni davranış, sınıra yakın bir dosyaya "kapı yeşil kalsın" diye eklenmez; dosya önce bölünür.                                                                                                                                            | Büyük dosya birden fazla sorumluluğun işaretidir. Bölünür; muafiyet yoktur.                          | `scripts/quality/sourceSize.mjs`                                                                                                                      |
| Dosyada yorum oranı en çok %40, tek yorum bloğu en çok 24 satırdır. Oran aşımı yalnız kapının gerekçe listesine yazılarak kabul edilir; blok sınırı gerekçeyle susturulamaz.                                                                                                                                  | Uzun gerekçe belgeye aittir.                                                                         | `scripts/quality/commentDensity.mjs`                                                                                                                  |
| Paket içinde çalışma zamanı modül döngüsü yoktur (yalnız tip importları sayılmaz).                                                                                                                                                                                                                            | Döngü yükleme sırasını kırılgan yapar.                                                               | `scripts/quality/moduleCycles.mjs`                                                                                                                    |
| `core` Phaser'ı yalnız kayıtlı köprü dosyalarında import eder.                                                                                                                                                                                                                                                | Motor bağımsızlığı bilinçli bir sınırdır.                                                            | `scripts/quality/phaserBoundary.mjs`, `core/docs/phaser-boundary.md`                                                                                  |
| CORE'un public tip yüzeyi kilitlidir; değişiklik bilinçlidir ve tarihçesi yazılır.                                                                                                                                                                                                                            | Tüketiciyi sessizce kıran bir export değişikliği görünür olmalıdır.                                  | `scripts/quality/publicTypeSurface.mjs`, `core/docs/public-surface.md`                                                                                |
| Kapsam eşikleri ratchet'tir; büyük ve düşük kapsamlı dosya test ya da kanıtlı gerekçe ister.                                                                                                                                                                                                                  | Kapsam gerilemesi sessiz kalmaz.                                                                     | `quality.json`, `scripts/quality/coverageBinding.mjs`, `scripts/quality/coverageShape.mjs`                                                            |
| Gönderilen bundle ve algoritmik ölçekleme bütçelidir.                                                                                                                                                                                                                                                         | Boyut ve karmaşıklık sızıntısı ölçüyle yakalanır.                                                    | `scripts/quality/bundleSize.mjs`, `scripts/quality/scalingBudget.mjs`                                                                                 |
| Geliştirme portları çakışmaz; her oyun kendi ürün ikonunu taşır; Tauri, wry ve tao kilitleri eşittir.                                                                                                                                                                                                         | Paralel geliştirme, ürün kimliği ve native sürüm tutarlılığı.                                        | `scripts/quality/devPorts.mjs`, `scripts/quality/productIcons.mjs`, `scripts/quality/cargoLockParity.mjs`                                             |
| Sır ve üretilmiş çıktı commit edilmez.                                                                                                                                                                                                                                                                        | Depo herkese açıktır.                                                                                | `.gitignore`, `scripts/quality/tests/gitFiles.test.mjs`                                                                                               |
| Belgeler gerçeğe bağlıdır: anlatılan sembol, yol, betik ve kapı bileşimi gerçekten vardır.                                                                                                                                                                                                                    | Bayat belge bir sonraki oturumu çözülmüş işin peşine düşürür.                                        | `core/tests/governance/docSymbols.test.ts`, `devtools/audio-synth/tests/governance/docReferences.test.ts`, `scripts/quality/tests/agentDocs.test.mjs` |
| Ses üretiminin yayın, kimlik ve render yüzeyi sözleşmesi.                                                                                                                                                                                                                                                     | Aynı program, tohum ve sürüm her zaman aynı PCM'i verir.                                             | `devtools/audio-synth/tests/governance/`, `pnpm --filter @volstudio/audio-synth audio:production-check`                                               |

Depo herkese açık olduğu için şunlar koda, belgeye ve günlüğe girmez:

- `.env`, anahtar, keystore, token.
- Kişisel tanımlayıcılar: kullanıcı adı, cihaz adresi, oturum belirteci.
- Başka projelerin adları ve iç sınıf adları.

Şüphe varsa commit edilmez, sorulur.

## Kalite kapıları

Kapıların tek kaynağı `justfile`'dır; bu tablo onu izler ve bir kapı onu
denetler. `just` global değildir; `pnpm exec just <tarif>` ya da aşağıdaki
`pnpm` betikleriyle çağrılır.

| Kapı           | Ne zaman                | Bileşim                                                                                             |
| -------------- | ----------------------- | --------------------------------------------------------------------------------------------------- |
| `pnpm quick`   | pre-commit, ~45 sn      | `contract` `format-check` `typecheck` `lint`                                                        |
| `pnpm fast`    | yerel geliştirme        | `quick` `test`                                                                                      |
| `pnpm high`    | pre-push                | `quick` `rust` `lint-css` `coverage` `coverage-shape` `audio-test` `build` `bundle` `scaling` `e2e` |
| `pnpm signoff` | sürüm ve kilometre taşı | `high` `coverage-audio` `audio-verify` `security-js` `security-rust`                                |

`signoff`un audio kapsamı tek başına yaklaşık 19 dakika sürer.

**Git kancaları:**

- `simple-git-hooks` ile kurulur: pre-commit `pnpm quick`, pre-push `pnpm high`.
- Kanca atlanmaz. Atlamak kaçınılmazsa (`SKIP_SIMPLE_GIT_HOOKS=1`) bu açıkça raporlanır.

Düşen tek kapı zincirin tamamı yerine yeniden koşulur:

```bash
pnpm exec just typecheck
pnpm exec just lint
pnpm exec just lint-css
pnpm exec just format-check
pnpm exec just test-pkg vol-ui
pnpm exec just coverage
pnpm exec just rust
pnpm exec just contract
pnpm exec just report high
pnpm exec just --list
```

`pnpm exec just report <kapı> --json` sonucu makine-okunur verir; agent
döngüleri bunu kullanır.

- **Kapılar workspace'ten türer.** `scripts/quality/runActive.mjs` paketleri
  `pnpm list` ile bulur ve lifecycle'a göre süzer; hiçbir kapıda elle paket
  listesi tutulmaz. Betiği olmayan paketi sessizce atlamaması için `contract`,
  her aktif paketin `typecheck`, `test` ve `test:coverage` betiklerini ve
  kapsam eşiklerini ister.
- **`quality.json` tek kaynaktır ve her okunuşta şema doğrulamasından
  geçer** (`scripts/quality/config.mjs`).
  - Eşikler ölçülen kapsamın yaklaşık 2 puan altına kilitlenir. Eşiği düşürerek geçmek yoktur; eşik yalnız kapsam artınca yükselir.
  - Her ölçüm tarihiyle `$comment` kaydına yazılır.
  - Muafiyet yalnız gerekçesiyle `exempt` alanına girer.
- `pnpm exec just test` kapsam eşiği uygulamaz. Yeşil görünüp `high`'ı
  kırabilir.
- **Betik adı pnpm'in yerleşik bir komutuyla çakışırsa hiç çalışmaz.** Ortam
  kontrolü bu yüzden `pnpm run doctor:env`dir.
- **Cihaz ölçümü kapı değildir.** Cihaz her zaman bağlı değildir ve kapının
  koşulu bir masadaki donanım olamaz. Android ve Steam Deck ölçümleri,
  sonrakinin kıyaslandığı referans kayıtlardır.

Kapıların ayrıntılı anlatımı: `docs/gates.md`.

## Mimari ilkeler

**CORE'un üç katmanı** (`core/docs/primitives.md`):

1. **Mekanizma** oyun kelimesi bilmez.
2. **Sunum** durumu çizer ve niyeti bildirir; kural taşımaz.
3. **Tarif** yaygın kuralı hazır verir, ama opt-in'dir.

Bir bileşene kural eklemeden önce sorulan soru: _başka bir oyun bunu farklı
isteyebilir mi?_ Cevap evetse kural tarif katmanına gider. Bir sunum bileşeni
kendi defterini tutmaz; iki defter kaçınılmaz olarak kayar.

**Kaynak yaşam döngüsü:**

- Eklenen her listener, timer ve abonelik `destroy()` ya da sahne kapanışında kaldırılır. Sahne yeniden başlayınca çift abonelik oluşmaz.
- Tek kaynaklı bir bileşen kaynağını doğrudan temizleyebilir.
- İki ya da daha fazla bağımsız kaynağı olan bileşen `DisposableScope` kullanır. Elle tutulan N temizlik satırı kolay unutulur; kapsam onları ters sırada ve hata izolasyonlu kapatır.

**Ölçüler veridir:** Oynanış sayıları oyunun `games/<oyun>/src/config/`
ağacında yaşar. Denge değişikliği çalışma zamanı dosyasına dokunmaz.

**UI:**

- Oyunlar kendi bileşenini icat etmez; `core/src/ui/` kullanılır. CORE'a
  giren bileşen oyuna özgü varsayım taşımaz ve aynı turda vol-ui vitrinine ve
  `devtools/vol-ui/README.md` sekme tablosuna eklenir.
- Listeler kimliğe göre diff'lenir; DOM her güncellemede yıkılmaz.
- `prefers-reduced-motion` altında `animationend` gelmeyebilir; animasyona
  bağlı temizlik bir zamanlayıcıyla yedeklenir.
- İçerik büyüyebiliyorsa kaydırma en dış panelde tanımlanır.
- Dokunma hedefi politikası vol-ui README'sindedir.

**i18n:** Motor ve başlatma sırası `core/docs/i18n.md`de, oyun yüzeyindeki
desen ve dinamik anahtarlar `games/docs/i18n.md`dedir. Dinamik anahtar önekleri
beyan edilir; beyanı kuran kod yoksa ölü anahtar kapısı düşer.

**Determinizm bir seçimdir ve korunur:**

- Simülasyon saati ve durumu alınabilir RNG `core/docs/primitives.md`de anlatılır.
- audio-synth aynı girdiden aynı baytı üretir; doğrulaması bunun üstüne kuruludur.

**Kalıcılık:**

- Depolama `IStorageAdapter` arkasındadır; web'de `localStorage`, Tauri'de native store.
- Yazma koordinasyonu `AutosaveCoordinator` ve `PersistedObservableState` iledir.
- Kayıtların atomik yazılması ve senkronlanan/cihaza özgü ayrımı açık iştir (`TODO.md`, Steam Deck bölümü).

**Platform katmanı:**

- `tauri-v2/src-tauri` bir uygulama değil, paylaşılan kabuktur. Bağlam her oyunun kendi uygulama crate'inde üretilir.
- Native kaynak taşıyan bir eklenti yalnız onu kullanan uygulamada kaydedilir.
- Linux WebView çizim yolu ölçüme dayalı kurallarla seçilir (`docs/android.md`, `docs/steam-deck.md`). Ölçülmemiş bir ortama kural yazılmaz.
- JS tarafında platform soruları ayrı yüklemlerle cevaplanır:
  - kabuk türü (`getRuntimePlatform`)
  - işaretçi türü (`shouldUseTouchControls`)
  - titreşim sürücüsü
  - geri hareketi yığını

## Asset'ler ve üretim hatları

**Bir asset'in üç hâli ve üç ayrı sahibi vardır:**

- **Kaynak** yazarındır.
- **Ara çıktı** onu üreten aracındır.
- **Gönderilen hâl** tüketen paketindir ve build'in tek gerçek girdisidir.

Ara çıktının commit'lenmesi yeniden üretilebilirliğe bağlıdır. Deterministik
bir betiğin ürettiği çıktı commit'lenmez. Repo dışı bir araç ve elle bir adım
gerektiren çıktı commit'lenir. Commit'lense bile hiçbir oyun ara çıktıyı
doğrudan okumaz; senkron adımıyla kendi ağacına alır. `devtools/` silindiğinde
oyunların build'i geçmeye devam eder.

**audio-synth** (`devtools/audio-synth/README.md`, `devtools/audio-synth/DESIGN.md`):

- Sesler ve müzik kanonik yayın yolundan geçer: job → yayın kapısı → manifest.
- Manifest programı, render yüzeyini ve PCM kimliğini kaydeder. Doğrulama yeniden render edip karşılaştırır.
- Düğüm sözleşmesi sürüm artmadan değişemez (`pnpm --filter @volstudio/audio-synth audio:surface-lock`).
- Üretim kanıtı `pnpm --filter @volstudio/audio-synth audio:production-check` iledir.
- Canary dinlemesi yalnız `devtools/audio-synth/canaries/reviews.json`daki insan beyanıyla kapanır;
  bayat sürüm beyanı etkin durumda `pending-human` sayılır. Dinleme uydurulmaz.

**pen.dev:** `.pen` dosyasına yalnız Pencil MCP araçlarıyla erişilir; kurallar
`devtools/pen.dev/AGENTS.md`dedir.

**Gönderilen asset'ler** (ses, doku, font) tüketen paketin ağacında commit'lenir.
Onları üreten ara biçimler (kayıpsız WAV, ara export, `dist`) commit'lenmez ve
üreten betikle belgelenir.

**Tema ve fontlar:**

- Tema `pnpm gen:theme` ile `core/scripts/gen-theme.mjs`den üretilir.
- Fontlar `pnpm --filter @volstudio/core download-fonts` ile indirilir.

## Platformlar ve cihazda doğrulama

**Android** (`docs/android.md`):

- Her oyunun native projesi kendi `games/<oyun>/src-tauri/gen/android` ağacındadır ve elle düzenlendiği için sürüm kontrolündedir.
- Kabuk, ikon ya da native proje değişince uygulama bağlı cihazlara kurulur, açılır ve ekran görüntüsüyle doğrulanır.
- Referans ölçüm: `pnpm benchmark:device`.

**Linux:**

- `pnpm build:linux-appimage` AppImage'ı yeniden paketler ve WebKit medya zincirini bir OGG ile sınar.
- Host'ta üretilen paket host'un glibc'sine bağlanır. Başka bir dağıtım ve Steam için derleme bir kapta yapılır (`docs/steam-deck.md`).

**Steam Deck** (`docs/steam-deck.md`):

- Devkit erişimi, dağıtım yolu, WebView kuralı, girdi, glif, kayıt ve okunabilirlik kararları orada; uygulanacak işler `TODO.md`de.
- Deck ölçümü de kapı değil, referanstır.

## Belgeler

| Belge                                                  | Sorumluluk                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `README.md`, `README.en.md`                            | Monorepo girişi, yığın, komutlar, nereye bakılacağı                          |
| `TODO.md`                                              | Repo geneli iş listesi                                                       |
| `docs/gates.md`                                        | Kapıların ne yaptığı, lifecycle yönetişimi, belge kapıları                   |
| `docs/android.md`                                      | Android derleme ve çalışma zamanı; Linux paketleme ve WebView çizim yolu     |
| `docs/steam-deck.md`                                   | Steam Deck ve Valve donanımı: ölçümler, kararlar, devkit sözleşmesi          |
| `core/docs/`                                           | CORE primitifleri, i18n, müzik motoru, Phaser sınırı, public yüzey tarihçesi |
| `games/docs/`                                          | Oyun tarafı i18n ve yeni oyun paketi listesi                                 |
| `<paket>/README.md`                                    | Paketin ne olduğu ve komutları; tanıtımdır, tasarım belgesi değildir         |
| `<paket>/DESIGN.md`                                    | Paketin neden böyle olduğu                                                   |
| `<paket>/TODO.md`                                      | Paketin kendi iş listesi                                                     |
| `devtools/pen.dev/AGENTS.md`                           | Tasarım ve export hattının kendi kuralları                                   |
| `justfile`, `quality.json`, `workspace-lifecycle.json` | Kapılar, eşikler ve paket durumu için tek kaynaklar                          |

- **Belge gerçeğin gerisine düşmez.** Kod değişince onu anlatan belge aynı turda güncellenir. Kapı komutu değişirse önce `justfile`, sonra belgeler.
- **Geçici planlama belgesi açılmaz.** Analiz, plan ve iş günlüğü için ayrı dosya açılmaz. Kalıcı bilgi ilgili README, DESIGN ya da `docs/` belgesine, yapılacak iş `TODO.md`ye gider. Kod yorumları geçici bir belgeye asla işaret etmez.
- **TODO dosyaları iş listesidir:**
  - Madde işi ve "Kapanır:" ölçütünü kısa söyler; gerekçe ve ölçüm belgeye gider.
  - Biten madde `[x]` olur ve `## Kapatılanlar` bölümüne kısa hâliyle taşınır; silinmez.
  - Eksik çıkan kapanış yeni bir madde olarak açılır.

**Yorum doktrini: varsayılan yorumsuzluktur.** Yorum yalnız koddan
çıkarılamayanı söyler: sessiz bir tuzak, tüketicinin varsayamayacağı bir
sözleşme, dış dünyanın dayattığı bir gariplik.

Yorumda şunlar olmaz:

- Kodu tekrar eden cümle.
- "Eskiden şöyleydi" anlatısı.
- Ölçüm günlüğü.
- Bölüm başlığı ve ayraç.
- Başka dosyadaki gerekçenin kopyası; sahibi olan dosyaya tek satırla işaret edilir.

Uzun gerekçe bir belgedir ve belgeye taşınır.

## Test disiplini

- **Yeni davranışın testi aynı turda yazılır.** Düzeltilen hata regresyon testi bırakır.
- **Ağır testler süre büyütülerek değil yapıyla ucuzlatılır:**
  - Pahalı hazırlık paylaşılır; bozan testler bir kopya üzerinde çalışır.
  - Süre yalnız gerekeni testte verilir ve gerekçesi tek bir yerde durur.
  - Genel `testTimeout` büyütülmez; gerçek takılmaları gizler.
- **Kapsam dışlaması** yalnız çalıştırılabilir satırı olmayan dosyalar içindir (barrel, tip, `.d.ts`).
- **Disk gerçeğini sınayan testler gerçek geçici dizinde koşar.** Taklit edilen bir disk, sınanan farkı tanım gereği üretemez.
- **E2E Chromium ve WebKit'te koşar.** vol-ui'nin piksel temelleri yalnız bilinçli bir görsel değişiklikte yenilenir.

## Git

- **Dallar:** `main` stabildir, `dev` entegrasyon dalıdır. Yeni iş `feature/<konu>` ya da `bugfix/<konu>` ile başlar. Uzun iş zincirleri kullanıcının kararıyla ayrı dallarda sürebilir; merge yalnız istendiğinde yapılır.
- **Commit mesajı:** İngilizce Conventional Commits başlığı (`feat(audio): …`) ve nedeni anlatan Türkçe gövde.
- **Commit öncesi** `git status` okunur; izlenmeyen dosyaların commit'e girip girmeyeceği tek tek doğrulanır.
- **Freeze etiketleri değişmez.** Yeniden dondurma yeni bir annotated etiketle yapılır.
- **Bulut CI açılmaz:** `.github/workflows/` altına onaysız pipeline eklenmez.

## Araçlar

- **Yerel bilgi grafiği (graphify):** `graphify-out/` varsa mimari, bağımlılık ve "bunu kim çağırıyor" sorularında dosya dosya aramadan önce ona sorulur: `graphify query`, `graphify affected`, `graphify god-nodes`. Kod değiştikçe `graphify update .` ile tazelenir. Çıktı yereldir ve commit edilmez.
- **Pencil MCP:** `.pen` dosyalarına tek erişim yoludur.
- **Playwright:** E2E ve vol-ui görsel sözleşmesi.
- **Ortam kontrolü:** `pnpm run doctor:env` Node, pnpm, Rust, just, FFmpeg ve Tauri bağımlılıklarını denetler.
- **Geliştirme:** `pnpm dev` aktif paketlerin geliştirme sunucularını birlikte açar; vitrin için `pnpm exec just dev-ui`. Artefakt temizliği `pnpm exec just clean`, Rust hedefleri dahil `pnpm exec just clean-all`.
- **Teşhis:** CORE'un Diagnostics katmanı `?debug` ve `?perf` kiplerinde ölçüm toplar; `core/scripts/debug-server.mjs` bunları yerel bir sunucuda toplar.
- **Benchmark:** `pnpm benchmark:core` CORE iş yüklerini ölçer. Mutlak süre kapı değildir; algoritmik ölçekleme oranı `scaling` kapısındadır (`docs/gates.md`).

## Bitti sayma

- İlgili kapılar çalıştırılmış ve sonuçları raporlanmıştır.
- `git status --short` okunmuştur.
- Değişen davranışın belgesi ve TODO maddesi günceldir.
- Kalan risk ve bilinçli olarak yapılmayanlar saklanmadan yazılmıştır.
