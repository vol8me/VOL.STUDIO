# VOL.STUDIO — iş listesi

Repo geneli açık işlerin sahibidir. UI alt işleri [UI TODO](docs/ui/TODO.md),
audio işleri [audio TODO](devtools/audio-synth/TODO.md) içindedir; aynı iş
birden fazla listede checkbox olarak tutulmaz. Tasarım kararları ve teknik
kanıt [monorepo denetimindedir](docs/monorepo-audit.md).

`[ ]` açık, `[x]` kanıtıyla kapanmış iştir. Kimlikler tekildir; eski kimlikler
başka işe verilmez. Her açık madde yalnız kalan işi ve kısa bir **Kapanır**
ölçütünü taşır. Kapsamdan çıkarılan iş tamamlandı olarak işaretlenmez.
Görev doğrulaması ilgili davranışla sınırlıdır; repo kapılarının sözleşmesi
[AGENTS.md](AGENTS.md) ve [kapı belgesindedir](docs/gates.md).

## Açık

### F04 — Kalıcılık ve native yaşam döngüsü

- [ ] **[P1] F04.4 — Steam callback ve kapanış kabulü.** Windows kayıt/kapanış regresyonları mevcut. Kalan: gerçek Steam popup/overlay ve metin callback yaşamı, SDK drop ve Deck SIGTERM zaman aşımı nedeni. **Kapanır:** kısa native turda son değer, callback temizliği ve kapanış sonucu kaydedilir; cihaz kabulünün sahibi F08.6'dır.

### F07 — CORE UI ve VOL.SHOWCASE

Açık UI işlerinin tek sahibi [UI TODO](docs/ui/TODO.md)'dur. Katalog,
erişilebilirlik ve kısa native kontroller orada izlenir; burada ikinci
checkbox veya toplam tutulmaz.

### F08 — Linux ve Steam Deck

- [ ] **[P2] F08.2 — Paylaşılabilir cihaz kanıtı.** **Kapanır:** success/failed/timedOut ayrımı sanitizer roundtrip'te korunur; host/SLR4 doğru etiketlenir; schema/runId/stamp zinciri doğrulanır, gizli adres veya cihaz/kullanıcı kimliği dışarı çıkmaz.
- [ ] **[P1] F08.3 — Host ve SLR4 görünür açılışı.** Açılış kanıtları mevcut; codec ve paket/runtime bağının kalan teknik kabulü ayrıştırılır. **Kapanır:** aynı ürün paketi için host ve gerçek SLR4 pencere/ekran görüntüsü ile OGG çözme/çıkış sonucu ayrı kaydedilir; ölçülmeyen çıktı NOT-RUN kalır.
- [ ] **[P1] F08.4 — Windows'tan Deck devkit zinciri.** **Kapanır:** keşif/DNS/SSH/build/aktarım/launch/screenshot kısa uçtan uca turda doğrulanır; başarısız preflight görünürdür ve mevcut shell-kapalı SSH quoting korunur.
- [ ] **[P1] F08.6 — Steam, kayıt ve uyku olayları.** **Kapanır:** overlay/QAM, fiziksel kol, Steam metni/haptik, tek uyku/uyanma ve terminate/SIGKILL senaryolarında son değer, saat/ses toparlanması ve kaynak temizliği kaydedilir; libmanette sorunu dump/tekrar veya karşıt kanıtla ayrılır. F04.4 aynı kabulü tekrar sahiplenmez.

### F09 — Mevcut ürünün platform ve sunum işleri

- [ ] **[P1] F09.1 — Windows ürün kabulü.** **Kapanır:** paketli NSIS/WebView2 kurulum/açılış/kaldırma; DPI 125/150/200; klavye/kol/metin/clipboard, ekran kipi, ses, kayıt ve kapanış kısa işlevsel turda doğrulanır.
- [ ] **[P1] F09.2 — Android ürün kabulünün kalanı.** Lenovo'nun güncel paketinde 18 çevrimdışı ve 16 ağ kontrolü geçti. **Kapanır:** güncel Samsung turu, fiziksel ≥600dp Android 16 yön davranışı ve gerçek bölünmüş ekran ölçülür; yoğunluk benzetimi fiziksel cihaz yerine sayılmaz.
- [ ] **[P2] F09.5 — VOL.TEST görsel/ses değerlendirmesi.** Örümcek gölgeleri, Manta, çekirdek/duyarga, hasar/can izi, çevrimiçi HUD, batış ve Goliath yerleşimi teknik olarak doğrulandı. **Kapanır:** kullanıcı değerlendirmesi kaydedilir ve bu yapının Samsung görünür turu tamamlanır.
- [ ] **[P2] F09.6 — Yetenek sesleri ve sunumu.** **Kapanır:** kalkan açılış/emilim/kapanış ve kuşatma kurulum sesleri audio-synth teknik kabulüyle yayımlanır; animasyon/kubbe değerlendirmesi ve kısa Samsung/Deck yetenek turu kaydedilir.
- [ ] **[P2] F09.7 — Menü, arka plan ve geliştirici ayarları.** **Kapanır:** sağ şerit geçişi, araç alayının ritmi/yoğunluğu, okunurluk ve ayarlar Samsung/Lenovo/Deck'te kısa örneklerle değerlendirilir; menü ve en uzak yakınlaştırma kare ölçümü kendi kapsamıyla raporlanır.
- [ ] **[P2] F09.8 — Sıçrayıcılar ve dünya katmanları.** **Kapanır:** Jackal/Panther/Rhino kontrolü ve oranları; yürüyüş/dönüş/sıçrama/iniş, bitki/kaya, göl/buz/batış ve ses sunumu kısa gerçek oyun turunda birim başına değerlendirilir; bot dengesi insan oyunuyla karşılaştırılır.
- [ ] **[P2] F09.9 — Barracuda, Leviathan ve mech değerlendirmesi.** **Kapanır:** araç oranı, adım hissi, bacak/silah okunurluğu, telefon garajı ve botlarla ölçülmüş denge gerçek oyun turunda değerlendirilir.
- [ ] **[P2] F09.10 — Yenilenen oyun seslerinin değerlendirmesi.** **Kapanır:** 49 oyun sesinin kullanıcı dinleme sonucu kaydedilir; kabul edilmeyen program düzeltilip teknik yayın kapısıyla yeniden yayımlanır.

### F10 — Güvenlik ve sınırlı bakım

- [ ] **[P3] F10.2 — Majör bağımlılık geçişleri.** **Kapanır:** ESLint/stylelint/jsdom/Vitest/TypeScript geçişleri yayımlanmış destek matrisiyle tek tek ve ilgili paket doğrulamasıyla uygulanır; ilgisiz toplu yükseltme yapılmaz.
- [ ] **[P3] F10.3 — Sıkı indeks ve ölçüm doğruluğu.** **Kapanır:** CORE noUncheckedIndexedAccess varsayımları daraltılır, scaling ortak şema kullanır; A/A gürültüsü, desteklenmeyen iz ve retry ayrımı negatif fixture'larla doğrulanır, ölçülen kapsam korunur.
- [ ] **[P3] F10.4 — Haptik scheduler kararı.** **Kapanır:** mevcut driver/scheduler gecikme, eşzamanlılık ve iptal örnekleriyle ölçülür; worker gerekiyorsa tek sahipli geçiş regresyonla uygulanır, gerekmiyorsa ölçümle mevcut mimari korunur.
- [ ] **[P3] F10.5 — Yeni donanım profilleri.** **Kapanır:** OLED Deck/Steam Machine erişilebilir olduğunda ayrı kısa frame/runtime profili alınır; başka cihazın sonucu taşınmaz.
- [ ] **F10.6 — Dal bakımı.** **Kapanır:** merge hedefleri belirlenir, eski yerel/uzak dalların erişilebilir işi korunur; Git bakımı kayıp commit/çalışma olmadan ayrı işlemde tamamlanır.
- [ ] **[P3] F10.12 — Tauri minör geçişi.** Ön koşul: F09.1/F09.2 native temel çizgisi. **Kapanır:** planlanan Tauri geçişinde Cargo/pnpm sürüm paritesi ve Rust kapısı korunur; Windows/Android/Linux kısa native karşılaştırması yapılır, çözülen advisory kayıtları kaldırılır; toplu cargo update yapılmaz.

### F11 — Testlerin sağlamlığı

- [ ] **[P3] F11.9 — Sabit beklemelerin daraltılması.** **Kapanır:** mevcut sabit beklemeler dosya bazında olay/koşula çevrilir veya gerçek zaman ölçümü gerekçesiyle bırakılır; fixedWaitBudget gerçekleşen azalışa indirilir, timeout artırılarak hata gizlenmez.

### F13 — Network ve mevcut oyun tüketicisi

- [ ] **[P1] F13.3 — Üretim ağ sınırları.** Protokol/istemci/sunucu, origin/IP/katılım/oda sınırları ve yerel native bağlantı kanıtı mevcut. **Kapanır:** hesap kimliği/auth sağlayıcısı, internet WSS ve uzak endpoint CSP/taşıma, süreç keşfi, savaş sisi ve hedeflere ait paketli bağlantı matrisi ayrı teknik kabulle tamamlanır.
- [ ] **[P1] F13.6 — Bozuk ağ ve oturum senaryoları.** **Kapanır:** düzeltme/snap sayaçları, gerçek paket kaybı ve sınırlı bozuk-payload korpusu; maç sonu/doğuş/çift kopuş/sunucu boşaltma/arka plan-ağ değişimi ayrı senaryolarda sınanır; Node/Chromium/WebKit/Android manevra/çarpışma/ateş öngörüsü deterministiktir. Gecikme telafisi yalnız ölçüm gerektirirse eklenir.
- [ ] **[P1] F13.7 — Ajan laboratuvarı ve bot sürücüsü.** AgentLab ve bütçeli temel sürücü mevcut. **Kapanır:** betikli girdi senaryoları ve senaryo başına kayıt/hüküm eklenir; istemci başına bayt ve uzlaştırma sayaçları sunucu metrics yüzeyinde yayımlanır.

### F14 — Son cihaz kabulü

- [ ] **[P1] F14.1 — Deck'in son paket ağ turu.** Son kaynakta Lenovo 18+16 ve gerçek SLR4 kol gezinmesi geçti; son Deck ağ turu erişim kaybıyla NOT-RUN kaldı. **Kapanır:** aynı paketin erken kopuş/aynı oturumla dönüş, süre aşımı/çevrimdışı dönüş, yeniden giriş ve temiz çıkış akışları kısa cihaz turunda kaydedilir; tura ait geçici süreçlerin temizliği doğrulanır. Eski paketin ağ sonucu yeniye taşınmaz.

## Kapatılanlar

- [x] F08.1 — Temiz 922a83dd kaynağından ayrı steamrt4 SDK builder ile AppDir/AppImage üretildi; 280 ELF GLIBC≤2.41, yasak sürücü kütüphanesi sıfır, 14 GStreamer eklentisi ve OGG/Vorbis çözümü PASS ([kanıt §28](docs/monorepo-audit.md)).
- [x] F13.4 — Backend araştırması kullanıcı kararıyla güncellendi: Colyseus, VOL.TEST ilk tüketici, resmî sunucu ve Windows/Linux/Android/Steam hedefi; web yayını yok. 20 dünya × 8–14 oyuncu karar verilmemiş senaryo, deneyler yerel kanıt; kalıcı entegrasyon F13.3'tür.
- [x] F13.2 — Colyseus lisans/Cloud/VPS/mini PC, çok oyunlu repo yerleşimi ve üretim kabul kapsamı çapraz kaynaklarla genişletildi; 12 sunucu kontrolü ×3, Phaser 4 iki motor/gecikme, kötüye kullanım ve encoder/fizik ölçümleri [raporda](docs/backend-research.md). WebKit temiz kabulü FAIL; test harness'ı üretim entegrasyonu veya tam dünya/cihaz kabulü değildir.
- [x] F13.1 — 24 oyunculu co-op/PvP otomasyon, RTS ve aksiyon backend araştırması kaynaklarla tamamlandı; Colyseus/Talo/Nakama/SpacetimeDB/özel taşıma ayrımı, repo sınırları ve gerçek Node + 24 istemcili simülasyon uyum deneyi [raporda](docs/backend-research.md). Üretim yükü, kalıcılık, prediction ve cihaz kabulü yapılmış sayılmaz; önerilen backend yerleşimi henüz uygulanmadı.
- [x] F12.1 — B31–B51 kalıcılık, olay/ömür, asset, native teslim ve kapı bütünlüğü kusurları başarısız→başarılı regresyonlarla kapatıldı; güncel sözleşmeler ile değişmeyen ağaçta taze `high` (13/13, 8,3 dk) ve `signoff` (18/18, 41,8 dk) geçti; fiziksel cihaz ve insan kabulleri kendi açık işlerinde kaldı.
- [x] F11.7 — Kapı girdileri Git işaretleri ve EOL filtresinden bağımsız ham baytla karmalanır; pre-commit öncesi/sonrası tüm indeks–çalışma ağacı eşitliği şarttır. Kısmi sahneleme, CRLF ve sahne dışı yeni bağımlılık negatifleri geçer; iki kontrolün ölçülen ek maliyeti yaklaşık 1,7 sn'dir. Yerel kancanın bilerek atlanabilmesi ve bulut CI olmaması belgelenmiş güven sınırıdır.
- [x] F11.0 — Ajan uyumu ve bayat sayılar: `CLAUDE.md` kökü `@AGENTS.md` ile içe aktarır (Claude Code `AGENTS.md`yi kendiliğinden okumaz; önceki salt bağlantı oturum bağlamına girmiyordu, tek kaynak `AGENTS.md` kalır); `docs/gates.md` süre ve atlama sayıları taze ölçümle düzeltildi (`high` 13,4 → 4,7 dk, vitrin `e2e` 343 → 1.355 sn, WebKit 2 → 18 atlama).
- [x] F11.3 — Aşama sayımı (`counts.mjs`, Playwright `countsReporter.mjs`) `--json`da ve aşama satırında görünür; `quality.json` → `skipBudget` atlama sayısını sınırlar (aşım, bütçesiz anahtar ve okunamayan sayım düşer; artış `ratchetExceptions` ister); motor boşlukları `docs/gates.md` "e2e motor boşlukları"nda; gerçek e2e koşusunda ölçüldü (vitrin WebKit 16+2, Chromium 1+1, VOL.TEST WebKit 1, node:test 2)
- [x] F11.4 — Kapsam eşikleri ölçümden en çok 2 puan aşağıda (CORE 94/92/86/93, vitrin dal 70, VOL.TEST dal 92, tauri-v2 97/95/91, pen.dev 98/98/95) ve `scripts/quality/thresholdRatchet.mjs` eşik, `floor`, muafiyet ve şekil gevşetmesini taban dala göre `contract`ta reddeder; gerekçeli gevşetme `quality.json` → `ratchetExceptions` (negatif fixture + gerçek ağaçta 94→60 kontrolü)
- [x] F11.8 — 12 bayat `chromium-linux` piksel temeli silindi (51 `win32` temeli kayıtlı kümedir; Linux makinede tam yenilenmeden Linux piksel kanıtı NOT-RUN); `snapshotPlatforms.mjs` bekçisi eksik platform kümesini `contract`ta düşürür (gerçek ağaçta 12/51 ile düştü)
- [x] F11.6 — Kapı kodu (`scripts/**`) `contract` node-test koşusunda Node'un yerleşik kapsamıyla ölçülür (satır %94,2 / dal %88,1 / işlev %95,8; eşik 92/86/94, ratchet'li); hiç yüklenmeyen 15 betik ve yarıdan az kapsanan ikisi `quality.json` → `scriptCoverage.acknowledged` içinde hangi kapının çalıştırdığıyla yazılı, bayat kayıt ve gerekçesiz yeni betik düşer (`scriptCoverage.mjs`)
- [x] F11.5 — `src/**/index.ts` yalnız yeniden dışa aktarım ve tip içerir: `scripts/quality/indexModules.mjs` çalıştırılabilir ifadeyi dosya:satırla reddeder (contract'ta, negatif fixture'lı); audio-synth'in `getPreset`/`callablePresetNames` mantığı `devtools/audio-synth/src/presets/registry.ts`e, `findPresets`/`PRESET_CATALOG` `devtools/audio-synth/src/presets/catalog/catalog.ts`e taşındı ve ölçülür
- [x] F10.1 — braces GHSA-vfj7-8cjw-p6xm için düzeltme yayımlanmadı (upstream durağan, stylelint zinciri başka sürüme geçemez): derinlik sınırı yaması `patches/` altında, `security-js` yama bağı + kurulu davranış sınaması + yayımlanmış düzeltme denetimini koşar, bayat kaydı reddeder. Yanked `yoke-derive` 0.8.4'e yükseltildi; Rust'ta yalnız kayıtlı `unsound`/`unmaintained` uyarı (8 kayıt: zincir, platform, etki alanı, sahip) geçer, zafiyet ve yanked geçmez. Gate seviyesi düşürülmedi; ayrıntı `docs/gates.md` → Güvenlik riski politikası.
- [x] F10.7 — Kare ölçüm aracı kontrollü build'de 2,3 KiB ayrıştırıldı; güncel app 182,4/120,4 KiB bilinçli kapsam gerekçesiyle bütçelendi; vendor/CSS/kapsam eşikleri korunarak bundle ve tam high geçti.
- [x] F10.8 — Vitrin README/DESIGN, headless ve O(N) uzamsal tarama açıklaması güncel; özel kanıt atıfları ve zorunlu beğeni şartı düzeltildi, kullanıcı değişiklikleri korunarak belge/biçim/contract kapıları geçti.
- [x] F10.11 — Kapı hızı: `typecheck`/`lint`/`rust`/`contract` girdisi değişen birimle sınırlı (paket, crate, takım) ve içerik makbuzlu, betik bağımlılığı kaynaktan türer ve bekçilidir; vitrin e2e motor başına 2 işçi (456 → ~340 sn, determinism sekme başına ayrıldı). `coverage --no-sort`, `test` eşzamanlılığı, vol-test 2 işçi, audio-test alt kümesi ve paket başına kapsam makbuzu ölçüldü ve reddedildi (`docs/gates.md` → Ölçülüp benimsenmeyenler).

- [x] F04.6 — Bekleyen native toggle flush kuyruğunda; destroy/generation ve görüntü→ayar son snapshot sırası controller/tüketici regresyonlarıyla kapalı (B22).
- [x] F05.7 — Manifest dışı staging korunur; örtüşme/symlink/junction preflight reddi ve ardışık export gerçek geçici disk testleriyle kapalı (B21).
- [x] F06.5 — İlk dünya çıkışı ortak segment parametresidir; bağımsız konum, duvar ön/arka hedef ve gerçek tank atışı regresyonları kapalı (B27).
- [x] F08.7 — Native Result/reporter reddi ve ölçüm kaybı görünür; eksik/sayaçsız Deck/Android kanıtı fail-closed, gerçek disk ve tüketici bileşimi testli (B23).
- [x] F10.9 — TAP failing blok paket/başlık/yol teşhisi ve belirsizde null; gerçek JSON CLI exit/raw log regresyonu kapalı (B29).
- [x] F10.10 — Preview doğrudan sahip Node çocuğu; gerçek Windows PID/port kapanışı, dolu port korunumu ve erken çıkış testli (B30).

<a id="f01"></a>

- [x] F01.1 — Zorunlu ses dinleme kabulü, API/CLI/rapor bağları ve review dosyaları kaldırıldı; üretim kabulü güncel teknik QA ve gerçek verify'a bağlı.
- [x] F01.2 — V2 rapor geçişi ve eski/bozuk/mutasyona uğramış kabul negatifleri testli; isteğe bağlı dinleme ve mevcut PCM/asset yüzeyi korundu.
- [x] F02.1 — Standart pnpm shim'iyle temiz Unicode/boşluklu klonda install/doctor/quick/high geçti; gerçek MSVC link probu ve Android araç profili doğrulandı.
- [x] F02.2 — Native argv ve cmd/bat adaptörü gerçek yol/argüman/PATH fixture'larıyla testli; audio CLI Node+JS girişini kullanıyor.
- [x] F02.3 — File URL, separator ve gerçek disk/rollback regresyonları Windows'ta; aynı commitFiles kaynakları ayrı WSL Linux ağacında 8/8 geçti.
- [x] F02.4 — Tam audio 129 dosya/2.221 test ve güncel LCOV/shape geçti; süre kusurları eşik/timeout/skip gevşetmeden düzeltildi.
- [x] F03.1 — README/agent rol bütçesi, bağlantı/başlık/komut ve bayat istisna denetimleri mevcut quality/contract'a bağlandı.
- [x] F03.2 — 43 kaynak belgenin sahiplik kararı uygulandı; agent girişleri ve README'ler kısaldı, hukuk/üretilmiş izin kaynakları korundu.
- [x] F03.3 — UI COVERAGE/RESEARCH sahiplerine birleştirilip silindi; 63 açık UI görevi ve kapanış ölçütleri korundu.
- [x] F03.4 — Platform araç/kapı/native/cihaz sınırları ve tek sahipli belge düzeni doğrulandı; yapılmayan cihaz kabulü açık bırakıldı.
- [x] F04.1 — Son telafisiz yazım reddi flush/flushAndDispose ve failed ACK'ye ulaşır; reentrant son snapshot ve başarılı telafi regresyonları ile tam high geçti.
- [x] F04.2 — Geç load/destroy/abort/generation/gerçek dış odak eski kaynak ve commit'i açamaz; Input/TextArea ve Steam oturum regresyonları ile tam high geçti.
- [x] F04.3 — Windows yerel ürün turu 15/15: eski depodan göç (kaynak korunur), ayarın IPC→store→diske yazımı, sert öldürme sonrası geri gelme, ikinci jenerasyonun `.bak` olması, bozuk ana kayıtta yedekten geri yükleme, iki jenerasyon bozukken karantina + korunan eski depodan yeniden göç, oyuncuya görünür kurtarma/sıfırlama bildirimi (önceden yalnız konsola yazılıyordu), WM_CLOSE temiz çıkış ve son değer; atomik yazım Rust regresyonlarıyla.
- [x] F04.5 — Tüketicisiz `core:window:allow-close` izni (hiçbir JS `Window.close/destroy` çağırmaz; kapanış `exit_application` komutundan) VOL.TEST ve vitrin yeteneklerinden kaldırıldı; yerel tur izinsiz sürümde geçti. Kalan tauri-v2 export/komutlarının hepsinin tüketicisi var; fiziksel SD8 sonucu F08.6'dadır.
- [x] F05.1 — Yayın, job kilidinden sonra asset+manifest hedef kilidini sabit sırayla alır; iki gerçek süreç yarışında tek kazanan, kaybeden `locked`/`overwrite`, bayat kilit devralınır.
- [x] F05.2 — Manifest her alanı tip/enum/aralıkta doğrular; PCM betimi kayıt, kodlanmış rapor, yerleşim ve brief ile çelişemez; verify bayt boyutu, bağımsız render ve çözülmüş dosyayı karşılaştırır.
- [x] F05.3 — Pencil düzenleyici parça ve önizlemeyi tek planda doğrular, çakışan düğümü yazımdan önce reddeder, hedef+metadata'yı geri alınabilir yerleştirir; kaynak en son silinir.
- [x] F05.4 — `validateManifest` 20/22/165 (siklomatik/bilişsel/satır) iken 6/5/23'e bölündü; ortak PCM alt şeması render kaydıyla paylaşılır, 69 gerçek manifest ve isteğe bağlı eski alanlar kabul edilir.
- [x] F05.5 — 17 emekli `vt-*` iş kaydı (36 render) kaldırıldı; hedefleri `65d0b1f3`'te silinmiş, yerlerini `vt-hardsteel-*` almıştı. İş envanteri 69/69; 84 seçilmeyen render aktif işlerin aday geçmişi olarak kaldı.
- [x] F05.6 — Atıfsız iki araştırma fit'i (`fit-experiment` yeniden üretir) ve yerel eski vol-ui kalıntısı kaldırıldı; `reference-shell` ve `semantic-demo` arama kayıtları fixture gerekçeli kaldı.
- [x] F06.1 — Mermi, adımın süpürdüğü parçayı gövdenin yönlü ayak iziyle keser (segment–OBB ilk temas); olay/itki/önizleme temas noktasını görür, en erken hedef ve sahip dışlaması deterministik.
- [x] F06.2 — Duvar sert sınırdır: araç teması sonrası duvar yeniden çözülür (en çok 4 geçiş); 4×4000 adım ve köşe yığınında hiçbir gövde köşesi dünya dışında kalmaz, kalan örtüşme ≈0,05 birim.
- [x] F06.3 — Saf simülasyon CORE'a yalnız alt yüzeylerle bağlanır; beş senaryo Node'da DOM/CSS yükleyicisi olmadan seedli koşar ve vitest sonucuyla birebir aynıdır.
- [x] F06.4 — `093e4c8d` commitinde alınan cihaz referansı: Deck host AppImage 10 dk çoklu tank/kar/yüksek + sanal kolla sürekli ateş ve dönüş = 60 FPS medyan, p95 19 ms (hedef 18 ms'nin 1 ms üstünde), 5 kare >34 ms; Lenovo tablet 10 dk boş jank %0,04 / çoklu tank jank %3,97, bellek büyümesi yok (`docs/steam-deck.md`, `docs/android.md`).
- [x] Monorepo denetim raporu docs'a yerleştirildi; 20 bulgu, 43 belge kararı ve bütün açık işler F01–F10'a eşlendi.
- [x] Visual Studio C++ Build Tools kuruldu; güncel doctor/bootstrap doğruluğu F02.1 ile tamamlandı.
- [x] Just kabuğu Git kurulumundan seçilir; WSL gölgesi ortam teşhisinde ayrılır.
- [x] Üretilmiş Android eklenti API ağacı ignore sözleşmesine bağlandı.
- [x] Steam Cloud ad ve decoded boyut sınırı regresyonla korundu.
- [x] Audio yükleme iptal/birleşme ve geç decode yaşam döngüsü testli.
- [x] VOL.TEST tanısı kalite/senaryo/seed/hava ve CPU aşamalarını kaydeder.
- [x] Native ses uyanışı kaynak testleri var; fiziksel Deck kabulü F08'de açık.
- [x] Çoklu araç çizimi, namlu ışığı ve yayıcı görünürlüğü sınırlandı.
- [x] Ölçüm seçimleri kalıcı cihaz tercihlerinden ayrıldı.
- [x] E1 — Girdi sunumu tek kol yoklamasını ve kip hakemini tüketir.
- [x] VT6 — Windows NSIS kimlik/ikon/yetenek yapılandırması testli; native kabul F09'da.
- [x] VT-R1 — Kimlikli araç/mermi/olay ve SAT teması var; B17/B18 F06.1/F06.2, B27 ilk duvar teması F06.5 ile kapandı.
- [x] VT-R2 — Fren/sürtünme/drift/aktarma modeli ve hissiyat zarfı testli.
- [x] VT-R3 — Joystick/fren/hızlanma/minimap ve mobil örtüşme E2E'si var.
- [x] VT-R4 — Mermi/patlama/palet izi ve kalite kademeli efektler uygulandı.
- [x] VT-R5 — Önceki oyun ses setinin kullanıcı dinleme beyanı kaydedildi; yeni üretim şartı değildir.
- [x] VT-R6 — VOL.TEST araç sesleri (pervane, yay atışı, atılım, parça kopması ve önceki set) ile Goliath/Manta görsel ve denge beğenisi 2026-10-14'te kullanıcı tarafından onaylandı (kullanıcı beyanı; ajan dinleme ya da beğeni testi yapmadı). Teknik kabul audio-synth kapılarındadır; bot düellosu dengesi insan oyun testi değildir.
- [x] VT-H2 alt kabulü — Kullanıcı dizüstünde görünür pencere ve ekran kilidi sonrası girdi turunu eliyle onayladı; Deck/haptik kalanları F08/F09'da açık.
- [x] VT4 alt kabulü — İki Android cihazda kurulum/açılış/yatay/tam ekran/joystick/ateş/duraklatma/arka plan/kapanış turu kaydedildi; görünür panel, kısa Samsung dokunuşu ve uzun oturum F09'da açık.
- [x] VT-C — Genel camera/math/input/physics/pose mekanizmaları CORE'a taşındı.
- [x] VT-H — Fizik/süspansiyon/renk/ayar/haptik ve oyun sertleştirme uygulandı.
- [x] VT0/VT1 — VOL.TEST kapsamı, ikon ve oyun çekirdeği kuruldu.
- [x] B6 — Push audio seçimi diff/import grafiğiyle; belirsizlikte tam takım.
- [x] Kod yorumu bağlam bekçisi ve bütün kaynaklarda 1000 satır sınırı var.
- [x] Kök girdileri gerekçeli rootEntries sözleşmesiyle kilitli.
- [x] Tek Cargo workspace/kilit/hedef; Rust push kapısında.
- [x] CORE, scripts ve devtools sorumluluk hiyerarşisi kuruldu.
- [x] Audio-synth kernel/kanonik yayın, kaynak aynası test ve veri ayrımı kuruldu.
- [x] Deneysel ürünler freeze etiketleriyle emekliye ayrıldı; mekanizmalar korundu.
- [x] Deck araçları devtools/deck'e taşındı; eski cihaz dağıtım kalıntıları temizlendi.
- [x] Katalog bekçisi, public yüzey ve büyük/düşük kapsamlı kaynak koruması var.
- [x] Ürün kimliği/ikon/port ve native plugin sahipliği kapılara bağlandı.
- [x] Kayıt/kapanış/asset transaction mekanizmaları kuruldu; yeni güvence kusurları F04/F05'te açık.
- [x] Deck girdi/glif/metin/görüntü/Steamworks katmanları var; gerçek kabul F08'de açık.
- [x] Önceki kalite kapanışları kaydedildi; güncel güvenlik/signoff engeli raporda ve F10'da açık.
