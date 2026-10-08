# VOL.STUDIO — iş listesi

Repo geneli işlerin tek kaydıdır. Karar, kanıt ve kapsam
[monorepo denetiminde](docs/monorepo-audit.md); UI alt görevleri
[UI TODO](docs/ui/TODO.md), audio ayrıntıları
[audio TODO](devtools/audio-synth/TODO.md) içindedir. Sahip görev burada
tekrar kopyalanmaz. Açık iş `[ ]`; biten iş tek satırla `## Kapatılanlar`a
taşınır. Eksik kapanış yeni görevdir.

Kullanıcı mimari, kök, belge ve gerekçeli silme/taşıma/birleştirme kararlarını
yetkilendirdi. F01–F03 sonuçları rapor §18, F04 kaynak uygulaması ve açık native kabul rapor §19, F05–F06 kaynak
uygulaması ve kalan işler rapor §20'dedir.
**F01–F03, F05 ve F06 tamamlandı; F04 (yalnız F04.4) ve F07–F10 açıktır.** Faz numarası bağımsız işleri gereksiz seri bekletmez;
gerçek ön koşul ve kaynak çakışması korunur. Cihaz bağlılığı kabul değildir.
Yapılmayan insan/görsel/hissiyat değerlendirmesi uydurulmaz.

## Açık

### F04 — Kalıcılık, async sahiplik ve native yaşam döngüsü

Ön koşul: F02 doğrulama zemini; UI yeniden tasarımı beklenmez. VT3/SD8/D2
servis borçları ilgili cihaz kabulüyle birlikte kalır.

- [ ] **[P1] F04.4 — Kapanış protokolü ve Steam callback sahibi.** Gerçek SDK guard/pump/drop ve ACK yarışı düzeltildi; Windows yerel turunda pencere kapatma isteği (WM_CLOSE) sonrası son değer ve temiz çıkış, yazım ortasında sert öldürme (5 tur, onaylanan her yazım kalıcı) kanıtlandı (`games/vol-test/scripts/native-store-tour.mjs`). Kapanır: fiziksel Steam popup/overlay ve text callback yaşamı + drop testi (Steam istemcisi ve cihaz gerekir, F08.6); timedOut kök nedeni/süre gerekçesi (Deck SIGTERM turu, F08.6).

### F07 — UI oyun arayüzü kimliği ve tek VOL.SHOWCASE

Ön koşul: F01/F02 ve ilgili F04 düzeltmesi. Bütün açık alt işin sahibi
[UI TODO](docs/ui/TODO.md) (2026-10-07'de yeniden yazıldı: tema çifti, malzeme, ikon, imleç ve
ses sıfırdan; kimlik önce, aileler sonra); ayrıntı burada tekrar checkbox'a çevrilmez.
Windows geliştirme/ilk native referans önce; Linux/Deck kabulü F08'dir. **F07 kapanır:** UI-13.5.

Aşağıdaki satırlar indekstir; kapanış checkbox'ı ve ölçütleri yalnız UI TODO'dadır.

- **F07.1 — Dalga 0, zemin ve kanıt (tamam):** UI-06.1, UI-00.1–00.7; registry, iki motor, axe, ölçüm, boyut payı, browser probu.
- **F07.2 — Dalga 1, kimlik:** UI-01.6–01.9 tema çifti/malzeme/ikon/imleç, UI-02.6–02.8 yeni ses, UI-07.2–07.3 i18n/font, UI-06.2–06.4 Windows native vitrin; paralel.
- **F07.3 — Dalga 2, dikey dilim ve aileler:** UI-01.10 + UI-02.9 → UI-03 (Button) → UI-04/05/08/09/10 fan-out, UI-07.4, UI-11.1–11.2, UI-12.2–12.3.
- **F07.4 — Dalga 3, platform ve tam kabul:** UI-11.3–11.4, UI-12.1, UI-12.4, UI-13; cihaz/insan kabulleri ayrı PASS/FAIL/NOT-RUN.

### F08 — Linux builder ve Deck kabulünü yeniden kur

Ön koşul: F02/F04/F06'nın ilgili teknik teslimi. Genel controller/Steam/
kalıcılık mekanizmaları silinmez; frozen lifecycle ile askıya alma taklit edilmez.

- [ ] **[P1] F08.1 — Linux üretim profili ve fail-closed ELF.** Windows'tan ayrı bağımlılık ağacı/builder; AppDir/steamrt4/GStreamer. Kapanır: B08 readelf eksik/okunamayan ELF açık red; doğru GLIBC/ABI pozitif fixture ve gerçek paket.
- [ ] **[P2] F08.2 — Paylaşılabilir doğru kanıt.** B09 outcome/requestId/normalize reason ve B10 runtime ortamı korunur. Kapanır: sanitizer roundtrip success/failed/timedOut ayrımı; host/SLR4 yanlış etiketlenmez; gizli adres/seri/kullanıcı yok; schema/runId/stamp zinciri.
- [ ] **[P1] F08.3 — Host ve SLR4 gerçek açılış.** VOL.TEST Linux görünür pencere/screenshot, ayrı SLR4 kısayolu/OGG. Kapanır: VT2/VT5 ve eski D1-codec gerçek paket/commit/runtime kaydı; host kabulü SLR4 yerine sayılmaz.
- [ ] **[P1] F08.4 — Windows'tan devkit uçtan uca.** Keşif/DNS/SSH/transfer/builder açık preflight. Kapanır: eski D1-deck zinciri gerçek build→yükleme→launch→ölçüm→screenshot; mevcut shell-kapalı SSH quoting korunur.
- [ ] **[P1] F08.5 — Gamescope ve ürün yük bütçesi.** Sonda kontrol grubu, UI laboratuvarı ve VOL.TEST ayrı. Kapanır: host/SLR4 1280×800 bütün yüklerde ≥59 FPS/p95≤18 ms; sunum/CPU kök nedeni ve eşli önce/sonra profil; sıcak tek pencere tüm kabul sayılmaz.
- [ ] **[P1] F08.6 — Gerçek Steam/kayıt/uyku ve açık cihaz işleri.** Overlay/QAM/kol/metin/haptik, SD3/SD8/D0/VT-H2 ve terminate/SIGKILL. Kapanır: gerçek olay/son değer/saat/ses/uyanış; libmanette nedeni dump/tekrar veya karşıt kanıtla ayrılır; yapılmayan his/elle işlem açık kalır.

### F09 — Windows/Android ürün kabulü ve yeni oyun

Ön koşul: F04/F06 ve gerekli UI teknik yüzeyi. Bağlı tablet/Deck hazır
erişim sağlar; kurulu uygulamanın mevcut commit olması ayrıca doğrulanır.

- [ ] **[P1] F09.1 — Windows gerçek ürün.** NSIS/WebView2 kurulum/açılış/kaldırma, DPI125/150/200, klavye/kol/metin/clipboard/ekran kipi/ses/kayıt/kapanış. Kapanır: installer ve paketli native profil; B01/K4/store sonuçları gerçek örnekte; konfigürasyon testi fiziksel kabul yerine sayılmaz.
- [ ] **[P1] F09.2 — Android görünür/native profil.** Windows toolchain'den APK, tablet Activity/ActionMode/insets/yön/arka plan dönüşü/geri/titreşim. Kapanır: Lenovo gerçek panel ve sistem screenshot siyah-kare kök nedeni; Android 16/600dp yön iddiası uygun cihaz/emülatörde; Android14 tablet buna eşdeğer sayılmaz.
- [ ] **[P1] F09.3 — Oyun hissi ve uzun oturum.** VT-H3/VT-W/VT-Q/VT4/VT-H2 ve Samsung kısa dış dokunma. Kapanır: gerçek nişan/ateş eşiği/iç-dış bölge/hareket/kar-çoklu tank-atış bütçesi; ses olay/oynatma/uyanış teknik doğrulaması; insan beyanı nişan/dokunma/haptik hissi içindir, ses dinleme kabulü değildir; Samsung olmadan onun kabulü yazılmaz.
- [ ] **[P1] F09.4 — VT7 ilk ürün doğrulaması.** Yeni oyun rehberi/template üretimi. Kapanır: temiz alanda üretilen özgün kimlikli paket ilk signoff'u geçer; Cargo/lifecycle/quality/ikon/port/i18n ve devtools'suz build sözleşmesi; mevcut advisory redi atlanmaz.

### F10 — Güvenlik, ratchet ve koşullu bakım

Güvenlik F02'den itibaren bağımsız erken yürütülür; bu fazın son sıra numarası
release redini ertelemek için gerekçe değildir.

- [ ] **[P2] F10.1 — JS/Rust bağımlılık riski.** braces yayımlanmış düzeltmesi/uyumlu zincir veya gerçek güvenli alternatif; glib unsound, yanked ve unmaintained sahipliği/erişilebilirlik. Kapanır: yok sürüme override yok; security-js ve gerekçeli Rust risk politikası doğrulanır; gate seviyesi düşürülmez.
- [ ] **[P3] F10.2 — S7 majör geçişler.** ESLint/stylelint/jsdom/Vitest/TypeScript hedefleri gerçekten yayımlanmış destek matrisiyle tek tek. Kapanır: her geçiş ilgili paket/test/kapıyla; toplu latest ve ilgisiz mimari göç yok.
- [ ] **[P3] F10.3 — Sıkı indeks ve teknik ratchet.** CORE noUncheckedIndexedAccess varsayımları daraltılır; kalite eşiklerinin geçmiş base-ref ve gerekçeli istisna denetimi; scaling ortak şemalı okuyucu. Kapanır: tip kapısı, eşik düşürme/bozuk config negatif fixture'ı; ölçülen kapsam korunur.
- [ ] **[P3] F10.4 — A20 haptik yürütme kararı.** Mevcut scheduler/driver gecikme, eşzamanlılık ve iptal ölçülür. Kapanır: worker gerekliyse tek scheduler geçişi regresyon+önce/sonra ölçüm; gerekmiyorsa kanıtlı koruma kararı; sırf önerilmiş diye worker eklenmez.
- [ ] **[P3] F10.5 — Yeni donanım kapsamı.** OLED Deck/Steam Machine. Kapanır: ilgili donanım bulunduğunda ayrı frame/runtime profili; eldeki cihaz kabulü bu işi sahte kapatmaz, Windows devamını bloke etmez.
- [ ] **F10.6 — K3/K5 dal bakımı.** Birleştirme hedefleri ve eski yerel/uzak dalların erişilebilir işi ayrı git operasyonu olarak ele alınır. Kapanır: kayıp commit/çalışma sıfır, açık hedef ve test/snapshot kanıtı; rapor teslimi merge/branch silme yapılmış sayılmaz.

## Kapatılanlar

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
- [x] F06.4 — Güncel commit (`093e4c8d`) ile cihaz profili: Deck host AppImage 10 dk çoklu tank/kar/yüksek + sanal kolla sürekli ateş ve dönüş = 60 FPS medyan, p95 19 ms (hedef 18 ms'nin 1 ms üstünde, F08.5'e devredildi), 5 kare >34 ms; Lenovo tablet 10 dk boş jank %0,04 / çoklu tank jank %3,97, bellek büyümesi yok (`docs/steam-deck.md`, `docs/android.md`).
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
- [x] VT-R1 — Kimlikli araç/mermi/olay ve SAT teması var; yeni B17/B18 F06'da açık.
- [x] VT-R2 — Fren/sürtünme/drift/aktarma modeli ve hissiyat zarfı testli.
- [x] VT-R3 — Joystick/fren/hızlanma/minimap ve mobil örtüşme E2E'si var.
- [x] VT-R4 — Mermi/patlama/palet izi ve kalite kademeli efektler uygulandı.
- [x] VT-R5 — Önceki oyun ses setinin kullanıcı dinleme beyanı kaydedildi; yeni üretim şartı değildir.
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
