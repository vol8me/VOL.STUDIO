# VOL.STUDIO Agent Anayasası

Bu dosya repo genelinde bağlayıcıdır. Bir alt klasörde kendi `AGENTS.md`'si
varsa (ör. `devtools/pen.dev/`) o dosya bu kuralları **daraltır**, gevşetmez.

## Başlangıç

- Her işte önce bu dosyayı oku. Sonra repo gerçeğini kontrol et: dosya, script,
  test, git durumu. Varsayımla değil, ölçümle çalış.
- Kullanıcının verdiği kapsamı genişletme; istenmeyen yan refactor üretme.
- Plan istenmişse planda kal; uygulama istenmişse işi doğrulamayla bitir.
- Bitiş raporunda çalıştırılan komutları, sonuçlarını ve kalan riski açık yaz.
  Düşen bir kapıyı "geçti" diye raporlamak en ağır ihlaldir.

## Kimlik

- Tauri v2 + Phaser 4 + TypeScript, pnpm workspace monorepo.
- Paketler: `core`, `games/vol-hell`, `games/vol-arachnid`, `devtools/pen.dev`,
  `devtools/vol-ui`, `devtools/vol-asset-studio`, `tauri-v2`.
- Hedefler: Windows (MSI/NSIS) ve Android (APK), tek kod tabanından.
- **Oyunun ve dokümantasyonun ana dili Türkçe'dir.** Kod yorumları ve `.md`
  dosyaları Türkçe yazılır; kod identifier'ları Türkçeleştirilmez.

## Bozulamaz Kurallar

1. **Kullanıcıya görünen metin hard-coded yazılmaz.** Tüm metinler i18n
   üzerinden gelir; `tr.json` ve `en.json` key paritesi zorunludur.
2. **Module-level `i18next.t()` yasaktır.** Import anında `i18n.init()` henüz
   bitmemiştir, boş string döner. Çağrı build fonksiyonunun İÇİNDE olur.
3. **`core` hiçbir oyun ya da devtool import etmez.** Bağımlılık tek yönlüdür:
   oyunlar ve geliştirici araçları `core`'u tüketir. `core` içinde oyuna özel
   varsayım (kart adı, dalga sayısı, düşman türü) bulunmaz.
4. **Sınır ZAMANDIR, paket değil.** Bir oyunun **çalışma zamanı** (`src/`)
   yalnız `core`'u ve dış bağımlılıkları import eder — hiçbir devtool'u,
   hiçbir başka oyunu. **Build/doğrulama zamanı** (`scripts/`, `tests/`) bir
   devtool üreticisini kullanabilir, ama `devDependencies` olarak: `dependencies`
   o paketi gönderilen bundle'ın sözleşmesine sokar. Üretilen asset, üreten
   aracın ağacında bırakılmaz; tüketen paketin kendi ağacına **senkronlanır**
   (`vol-hell` sesi, `vol-arachnid` rig'i böyle çalışır). Ölçüt nettir: `devtools/`
   ağacı yokken oyunun **build grafiği** çözülebilmelidir. (pnpm'in workspace
   tutarlılık kontrolü ayrı bir katmandır ve kayıp bir paketi zaten yakalar;
   kural o kontrolü değil, kodun bağımlılığını konuşur.)
   Devtool'lar bir **oyunu** hiç import etmez. Devtool → devtool kenarı ancak
   `scripts/quality/layers.mjs` içindeki `DEVTOOL_EDGES`de gerekçesiyle
   **yazılıysa** meşrudur ve döngü her hâlükârda reddedilir; iki devtool
   birbirine bağlandığında ikisi de tek başına sökülemez hâle gelir.
   Bir paketin repo dosyalarını **veri** olarak okuması modül bağımlılığı
   değildir. Bu kuralın makine karşılığı `pnpm quick` içindeki
   `workspace-contract` kapısıdır; metin ile kapı ayrı düşerse metin değil
   **kapı** doğruyu söyler.
5. **Ölçüler ve denge kod değil veri işidir.** Oynanış sayıları `src/config/`
   altında yaşar; bir dengeleme değişikliği runtime dosyasına dokunmamalıdır.
6. **Listener eklenen her yerde kaldırılır.** `languageChanged`, DOM olayları,
   `setTimeout`, `requestAnimationFrame` — hepsinin `destroy()`/`SHUTDOWN`
   karşılığı olur. Sahne yeniden başlatıldığında çift abonelik oluşmamalıdır.
   **Ham timer mı, `DisposableScope` mı?** Kod tabanında ikisi de meşru ve
   bilinçli olarak bir arada yaşıyor (bkz. `core/src/lifecycle/
DisposableScope.ts` sınıf yorumu): TEK bir kaynağı (bir `setTimeout`,
   bir listener) yönetip `destroy()`'u o kaynağı kapatmaktan ibaret olan bir
   component, kaynağı kendi alanında tutup doğrudan `clearTimeout`/vb.
   çağırabilir (ör. `LongPressButton`, `CardTile`) — ekstra soyutlama
   okunabilirlik kazandırmaz. İKİ VEYA DAHA FAZLA bağımsız kaynağı olan bir
   component (birkaç listener, listener+timer karışımı, abonelik) her zaman
   `DisposableScope` kullanır (ör. `Carousel`, `GameScene`, `InputManager`):
   elle tutulan N kaynak için simetrik N temizlik satırı kolayca unutulan
   bir adımdır, `DisposableScope.dispose()` bunu tersten/hata-izolasyonlu
   tek çağrıya indirger.
7. **Gizli bilgi commit edilmez.** `.env`, anahtar, keystore, token. Şüphe
   varsa commit etme, sor.
8. **Bulut CI yoktur, kapılar localdir.** `.github/workflows/` altına yeni
   pipeline dosyası kullanıcı onayı olmadan açılmaz. Doğrulama `justfile`
   kapılarıyla yerelde yapılır.

## Anti-Borç Disiplini

- **God object yasağı.** Mantık taşıyan tek bir dosya büyüyorsa en geç ~600
  satırda sorumluluk bölünür. Yeni davranış "kapı yeşil kalsın" diye zaten
  büyük olan dosyaya eklenmez.
- **Yarım tur bırakılmaz.** İş bittiğinde çalışma ağacı temiz veya durumu
  açıkça raporlanmış olur.
- **Doküman gerçeğin gerisine düşürülmez.** Kod değişince onu anlatan `.md`
  aynı turda güncellenir. Eskimiş bir doküman, bir sonraki oturumu çözülmüş
  işin peşine düşürür; yasaktır.
- **Ölü kod ve ölü bağımlılık bırakılmaz.** Silinen bir sistemin config
  girdisi, devDependency'si, tip tanımı ya da doküman satırı da silinir.
- **Yeni `.md` açmadan önce mevcut yüzeye bak.** Analiz/plan/worklog için ayrı
  dosya açılmaz; içerik ilgili README'ye ya da `TODO.md`'ye işlenir.
- **Ölçmeden optimize edilmez, ölçüm koda yazılmaz.** Bir performans kararı
  önce benchmark ile gösterilir; çıkan sayı `TODO.md`ye ya da paketin
  README'sine geçer. Kaynak yorumlarında ölçüm günlüğü tutulmaz.

## Yorum Doktrini

Yorum **sözleşmeyi** anlatır: ne garanti edilir, hangi sınır geçerlidir, çağıran
neyi varsaymamalıdır. Olayı anlatmaz.

- **Bugünkü okuyucuya yaz.** "Bir dönem şöyleydi, şu oldu, bu yüzden böyle"
  anlatısı altı ay sonra kimseye lazım değildir; kalan bilgi "bu sınır neden
  var"dır. Bir alternatifin denenip elendiği BİLGİ ise tek cümleye iner.
- **Karar kaydı yorum değildir.** Ölçüm sayıları, "şunu ekleyeceğiz",
  "bu blok kararın kaydıdır" gibi içerik `TODO.md`ye ya da `core/docs/`e
  gider. Sınıf yorumu tüketicinin okuduğu yerdir, geliştirme günlüğü değil.
- **Uzunluk sözleşmeden gelir.** `StatBlock` gibi gerçekten karmaşık bir
  sözleşme uzun yazılır; onlarca satırlık bir blok yalnız hikâye anlatıyorsa
  kısaltılır.
- **Kod kendini anlatıyorsa yorum yazılmaz.** Yorum, koda bakarak
  ÇIKARILAMAYACAK olanı söyler.

## Doküman Yüzeyi

| Dosya                        | Sorumluluk                                                           |
| ---------------------------- | -------------------------------------------------------------------- |
| `README.md` / `README.en.md` | Monorepo girişi, yapı, komutlar, kapılar                             |
| `TODO.md`                    | Tarih sıralı denetim/çalışma kaydı                                   |
| `core/docs/`                 | i18n, ses/müzik motorları, CORE primitifleri, görsel sentez doktrini |
| `games/docs/`                | Oyun tarafı i18n rehberi                                             |
| `games/<paket>/README.md`    | O paketin ne olduğu ve komutları — TANITIM, tasarım belgesi değil    |
| `<paket>/DESIGN.md`          | O paketin NEDEN böyle olduğu; README'nin taşımadığı tasarım kararı   |
| `devtools/<paket>/README.md` | Geliştirici aracının amacı ve komutları                              |
| `devtools/pen.dev/AGENTS.md` | Tasarım/export hattının kendi kuralları                              |
| `justfile`                   | Kalite kapılarının tek kaynağı (tarif listesi)                       |
| `quality.json`               | Kapsam eşikleri ve tabanı (tek kaynak)                               |
| `scripts/quality/config.mjs` | `quality.json`un tek okuyucusu + şema doğrulayıcısı                  |

Bir kapının komutu değişirse **önce `justfile`** güncellenir; `README.md`,
`README.en.md` ve bu dosya onu izler. Kapı komutu bir `.md` içinde justfile'dan
bağımsız yazılmaz.

Türkçe bir `.md`'nin `.en.md` karşılığı varsa ikisi birlikte güncellenir;
başlık yapıları aynı kalır.

## Kalite Kapıları

**Bulut CI yoktur.** Kapılar `justfile` üzerinden yerelde koşar; GitHub
yalnızca source control, PR ve release içindir. Yeşili doğrulayan tek merci
senin çalıştırdığın komuttur — koşmadığın bir kapıyı "geçti" yazamazsın.

| Kapı           | Komut                 | Kapsam                                      |
| -------------- | --------------------- | ------------------------------------------- |
| Pre-commit     | `pnpm quick`          | sözleşme, format, typecheck, lint (~45 sn)  |
| Push öncesi    | `pnpm high`           | quick + css lint + coverage + tüm build'ler |
| Release        | `pnpm signoff`        | high + cargo check/fmt/clippy               |
| Ortam kontrolü | `pnpm run doctor:env` | Node, pnpm, Rust, just, FFmpeg, Tauri deps  |

`pre-commit` → `pnpm quick`, `pre-push` → `pnpm high` git hook'ları
`simple-git-hooks` ile kurulur (`pnpm install` sırasında). Test yükü bilerek
push'a bırakıldı; testi de içeren hızlı kapı `pnpm fast`. Hook'u atlamak
gerekiyorsa `SKIP_SIMPLE_GIT_HOOKS=1` kullanılır ve **atlandığı raporlanır**.

Tek bir kapı düştüğünde tüm zinciri değil o kapıyı tekrar koş:

```bash
pnpm exec just typecheck        # tip
pnpm exec just lint             # ESLint
pnpm exec just lint-css         # Stylelint
pnpm exec just format-check     # Prettier
pnpm exec just test             # tüm paketler (kapsam eşiği YOK)
pnpm exec just test-pkg vol-ui  # tek paket
pnpm exec just coverage         # test + kapsam eşikleri
pnpm exec just rust             # cargo check + fmt + clippy
pnpm exec just contract         # workspace sözleşmesi (kapı kapsamı)
pnpm exec just report high      # kapıyı koş, sonucu yapılandırılmış raporla
pnpm exec just report quick --json  # aynısı, JSON çıktı (agent döngüleri için)
pnpm exec just --list           # tüm tarifler
```

`just` ikilisi `just-install` devDependency'siyle `node_modules/.bin` altına
kurulur; **global PATH'te yoktur.** Çıplak `just fast` çalışmaz, `pnpm fast`
ya da `pnpm exec just fast` çalışır.

**Kapılar workspace'ten türer, elle liste tutulmaz.** `typecheck`/`test`/
`coverage` `pnpm -r` ile, `build` `pnpm -r --if-present build` ile, `lint:css`
repo geneli `**/*.css` globu + `.stylelintignore` ile çalışır. Yeni bir paket
hiçbir kapıya elle eklenmez, kendiliğinden kapsanır.

`pnpm -r --if-present` script'i olmayan paketi **hata vermeden atlar**. Bu
yüzden `scripts/workspace-contract.mjs` bekçisi `quick` içinde koşar ve şunları
zorunlu kılar: her paketin `typecheck`/`test`/`test:coverage` script'i olması,
coverage eşiklerinin tanımlı ve tabanın üstünde olması. Muafiyet gerekiyorsa
kök `quality.json`un `exempt` alanına **gerekçesiyle** yazılır; sessiz muafiyet
yoktur.

`quality.json` her okunuşta ŞEMA DOĞRULAMASINDAN geçer
(`scripts/quality/config.mjs`): eksik/yanlış tipte/tanınmayan bir metrik adı
sorunların tamamını listeleyen tek bir hata verir. Doğrulama olmadan `floor` →
`flor` gibi bir yazım hatası bekçiyi `TypeError: Cannot convert undefined or
null to object` ile düşürüyordu — kapı kırılıyordu ama nereye bakılacağı belli
olmuyordu.

**Kapsam eşikleri kök `quality.json`da yaşar — tek doğruluk kaynağı.** Paket
`vitest.config.ts` dosyaları bu dosyayı okur, bekçi de aynı dosyayı okur;
ayrışamazlar.
Bir config'e eşiği SATIR İÇİ yazmak `contract` kapısını kırar.

**Kapsam eşikleri ratchet'tir.** Ölçülen gerçek kapsamın ~2 puan altına
kilitlenir. Kapsamı düşüren bir değişiklik kapıyı kırar; eşiği düşürerek
geçmek yasaktır, eşik ancak kapsam artınca yükselir.

`pnpm -r test` kapsam eşiklerini uygulamaz; yeşil görünüp `high`'ı kırabilir.
`pnpm doctor` pnpm'in **kendi** built-in komutudur, justfile tarifi değil;
ortam kontrolü için `pnpm run doctor:env` kullanılır.

## pnpm Script Adları

`pnpm <ad>` yerleşik bir pnpm komutuyla çakışırsa script **hiç çalışmaz**,
sessizce gölgelenir: `"doctor": "just doctor"` yazılıydı ama `pnpm doctor`
pnpm'in kendi tanılama komutunu koşuyordu ve "kapı geçti" diye raporlanan çıktı
başka bir komuta aitti. Gölgelenme riski taşıyan adlara bir ek konur
(`doctor:env`). `core/tests/governance/qualityConfig.test.ts` bunu doğrular.

## Test Disiplini

- Yeni davranışın testi aynı turda yazılır. Düzeltilen her hata için
  regresyon testi bırakılır.
- **Ağır testler bölünür, timeout büyütülmez.** Genel `testTimeout` artırmak
  başka testlerdeki gerçek takılmaları gizler. Bölünemeyen bütünsel bir test
  varsa süresi o testte, gerekçesiyle birlikte verilir.
- Coverage `exclude`'u yalnızca çalıştırılabilir satırı olmayan dosyalar
  içindir (barrel, tip, `.d.ts`). Test edilmediği için dışlama yapılmaz.

## CORE Katmanları

CORE üç katmandır ve sınırları karışmaz (ayrıntı: `core/docs/primitives.md`):

1. **Mekanizma** — oyun kelimesi bilmez, sunumdan bağımsız (`Scheduler`,
   `StateMachine`, `ResourcePool`, `ObjectPool`, `SpatialIndex`, geometri).
2. **Sunum** — durumu çizer, niyeti callback ile bildirir; **kural taşımaz**.
3. **Tarif** — yaygın kuralı hazır verir ama **opt-in**'dir; hiçbir bileşen
   onu arkanda varsaymaz (`resolveSkillStates`, `applyXpGain`).

**Bir sunum bileşeni kendi defterini tutmaz.** `XPBar` seviye hesabını, `SkillTree`
kilit açmayı, `WaveCounter` tur ilerletmeyi bir dönem KENDİ yapıyordu; oyunun
kendi sistemi de aynı şeyi tuttuğu için iki defter kaçınılmaz olarak kayıyordu.
Bileşene kural eklemeden önce sor: _başka bir oyun bunu farklı isteyebilir mi?_
Cevap evetse kural tarif katmanına aittir.

## UI Kuralları

- Oyunlar kendi UI bileşenini icat etmez; `core/src/ui/` kullanılır. Yeni bir
  bileşen `core`'a eklendiyse **`devtools/vol-ui` showcase'ine de eklenir** ve
  README'sindeki sekme tablosu güncellenir.
- Bir bileşen `core`'a girdiğinde oyuna özel varsayım taşımaz; oyun mantığı
  (RNG, fiyat, havuz) çağıranda kalır, bileşen yalnızca durumu çizip niyeti
  callback ile bildirir.
- Liste render'ı kimliğe göre diff'lenir; her güncellemede DOM yıkıp yeniden
  kurmak animasyonları yanlış tetikler ve odağı düşürür.
- `prefers-reduced-motion: reduce` altında `animationend` hiç ateşlenmeyebilir;
  animasyona bağlı temizlik her zaman bir zamanlayıcıyla da yedeklenir.
- Panel içeriği büyüyebiliyorsa yükseklik sınırı ve kaydırma en dış panelde
  tanımlanır; yalnızca iç listeyi sınırlamak paneli taşırır.

## Git Akışı

- `main` stabil, `dev` aktif entegrasyon dalıdır.
- Yeni iş `feature/<konu>` veya `bugfix/<konu>` ile başlar.
- **Kullanıcı istemediyse commit/push yapılmaz.**
- Commit öncesi `git status` okunur; takipsiz dosyaların commit'e girmesi
  gerekip gerekmediği tek tek doğrulanır.
- Shipped oyun asset'leri (ses OGG/MP3, doku, font) repoda tutulur; bunları
  üreten ara formatlar (kayıpsız WAV, ara export çıktısı, build/dist) repoda
  tutulmaz ve üreten script'le birlikte belgelenir.
- **Bir asset'in üç hâli vardır ve üçünün sahibi ayrıdır.** _Kaynak_
  (`devtools/<araç>/pen/`, `recipes/`) yazarındır. _Ara çıktı_
  (`devtools/<araç>/export/`, `pen_export/`) aracındır. _Gönderilen_ hâl
  (`games/<oyun>/public/assets/`, `src/assets/`) tüketen paketindir ve build'in
  tek gerçek girdisidir.
- **Ara çıktının commit'lenip commit'lenmediği, REPODAN yeniden üretilebilir
  olup olmamasına bakar.** Deterministik bir script'in ürettiği çıktı
  (`audio-synth`, `visual-synth` export'ları) commit'lenmez; `.gitkeep`li dizin
  kalır. Repo dışı bir araç ve elle bir adım gerektiren çıktı (`pen_export/`,
  Pencil MCP export'u) **commit'lenir** — yeniden üretilemeyen bir şey ara çıktı
  sayılıp silinemez. Hangi kovada olduğu o aracın `AGENTS.md`inde yazılıdır.
- **Sahiplik ile commit ayrı sorulardır.** Ara çıktı commit'lense bile bir oyun
  onu DOĞRUDAN okumaz; senkron adımıyla kendi ağacına alır (bkz. Kural 4).
  `devtools/` silindiğinde oyunun build'i geçmeye devam etmelidir.

## Bitti Sayma Kriteri

- İlgili kapılar çalıştırılmış ve sonuçları raporlanmış olmalı.
- `git status --short` kontrol edilmiş olmalı.
- Değişen davranışın dokümanı güncellenmiş olmalı.
- Kalan risk ve bilinçli olarak yapılmayanlar saklanmadan yazılmış olmalı.
