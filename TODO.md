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
**F01–F03 tamamlandı; F04–F10 açıktır (F05/F06'da yalnız aşağıdaki kalanlar).** Faz numarası bağımsız işleri gereksiz seri bekletmez;
gerçek ön koşul ve kaynak çakışması korunur. Cihaz bağlılığı kabul değildir.
Yapılmayan insan/görsel/hissiyat değerlendirmesi uydurulmaz.

## Açık

### F04 — Kalıcılık, async sahiplik ve native yaşam döngüsü

Ön koşul: F02 doğrulama zemini; UI yeniden tasarımı beklenmez. VT3/SD8/D2
servis borçları ilgili cihaz kabulüyle birlikte kalır.

- [ ] **[P1] F04.3 — Store kapsamı ve Windows writer.** Göç/durable cache/compiler ve gerçek Rust disk regresyonları uygulandı; ürün IPC turu açık. Kapanır: kapsamsız anahtar derlenmez; disk migration/bozuk ana kayıt/backup/atomik yazım/hata geri bildirimi Windows native kabulüyle testli.
- [ ] **[P1] F04.4 — Kapanış protokolü ve Steam callback sahibi.** Gerçek SDK guard/pump/drop ve ACK yarışı düzeltildi; fiziksel popup, tarihsel timeout ve kill turları açık. Kapanır: B07 gerçek feature harness, overlay/text callback yaşamı ve drop testi; timedOut kök nedeni/süre gerekçesi; üretim SIGTERM son değer, yazım ortası SIGKILL toparlanması.
- [ ] **[P1] F04.5 — Uyku/uyanış ve servis tüketimi.** Saat/input/audio/haptik ve export tüketicileri denetlendi; clock-jump/geç decode/tekrarlı suspend testli, ilgili gerçek cihaz turu açık. Kapanır: tüketicisiz tauri-v2 export/config/izin bağları kaldırılır (VT3/K4); high + Chromium/WebKit; SD8 fiziksel sonucu F08.6'da.

### F05 — Asset yayını, metadata ve kalıntı temizliği

Ön koşul: F01/F02. Sırf insan sistemini kaldırmak için mevcut sesler yeniden
yayımlanmaz; her temizlik erişilebilirlik kanıtıyla yapılır.

- [ ] **[P2] F05.5 — Eski yayın ve ölü bağı temizliği.** Envanter denetimi (`audio:production-check` iş taraması) eklendi ve 86 işten 17 emekli `vt-*` işi buldu: hedefleri `65d0b1f3`'te silinmiş, yerlerini yayımlanmış `vt-hardsteel-*` işleri almış, repoda sıfır atıf. Kapanır: bu 17 iş kaydı (36 render) kaldırılır ve `audio-verify` yeşile döner; 84 seçilmeyen render aktif işlerin aday geçmişidir, silinmez.
- [ ] **[P2] F05.6 — Araştırma/kanonik ve yerel çıktı ayrımı.** İzlenen `reference-shell` (yayımlanmış ailenin kökeni) ve `semantic-demo` (`audio-verify` yeniden üretir) aramaları fixture gerekçelidir; `hidden-tone-660` ve `hidden-tone-wrong-topology` fit'lerinin test/kapı/belge tüketicisi yoktur. Eski vol-ui workspace'inden yerel kalan `node_modules` dizini sahip temizliğinin dışındadır. Kapanır: iki fit kaldırılır ya da bir tüketiciye bağlanır; kalıntı temizlenir; oyun build'i devtools bağı olmadan yeşil.

### F06 — CORE/Phaser sınırı ve VOL.TEST doğruluğu

Ön koşul: F02. Önce fizik doğruluğu; ölçümsüz optimizasyon yok.

- [ ] **[P2] F06.4 — Gerçek birleşik yük ölçümü.** CPU simülasyon yükü ölçüldü: 13 araç + kar + sürekli ateşte `Simulation.step` medyan ≈0,23 ms, p95 ≈0,48 ms, 10 dakikada büyüme yok; geniş faz gerekmez. Çizim/GPU ve cihaz kare süresi yeni kodla ölçülmedi. Kapanır: VT-Q/W cihaz profili güncel commit ile (tablet ve Deck kare süresi, uzun oturum); scaling dar mermi döngüsü tüm oyun kabulü sayılmaz.

### F07 — UI'nin 14 fazı ve tek VOL.SHOWCASE

Ön koşul: F01/F02 ve ilgili F04 düzeltmesi. Bütün 63 açık alt işin sahibi
[UI TODO](docs/ui/TODO.md); ayrıntı burada tekrar checkbox'a çevrilmez.
Windows geliştirme/ilk native referans önce; Linux/Deck kabulü F08'dir.

Aşağıdaki satırlar indekstir; kapanış checkbox'ı ve ölçütleri yalnız UI TODO'dadır.

- **F07.1 — Kanıt zemini ve temel dil:** UI-00–UI-02; ölçüm/durum, tema/hareket ve teknik ses kabulü.
- **F07.2 — Pilot ve atomik native vitrin:** UI-03–UI-06; buton/kart/form ve SHOWCASE göçü, Linux/Deck kabulü F08.
- **F07.3 — Katalog ve platform oturumu:** UI-07–UI-12; i18n/font/HUD/overlay/touch/IME/Android/Steam/Windows.
- **F07.4 — Tam ve gerçek kabul:** UI-13; bütün durumlar, erişilebilirlik/stres/gerçek cihaz ve sürüm teslimi.

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
- [x] F05.1 — Yayın, job kilidinden sonra asset+manifest hedef kilidini sabit sırayla alır; iki gerçek süreç yarışında tek kazanan, kaybeden `locked`/`overwrite`, bayat kilit devralınır.
- [x] F05.2 — Manifest her alanı tip/enum/aralıkta doğrular; PCM betimi kayıt, kodlanmış rapor, yerleşim ve brief ile çelişemez; verify bayt boyutu, bağımsız render ve çözülmüş dosyayı karşılaştırır.
- [x] F05.3 — Pencil düzenleyici parça ve önizlemeyi tek planda doğrular, çakışan düğümü yazımdan önce reddeder, hedef+metadata'yı geri alınabilir yerleştirir; kaynak en son silinir.
- [x] F05.4 — `validateManifest` 20/22/165 (siklomatik/bilişsel/satır) iken 6/5/23'e bölündü; ortak PCM alt şeması render kaydıyla paylaşılır, 69 gerçek manifest ve isteğe bağlı eski alanlar kabul edilir.
- [x] F06.1 — Mermi, adımın süpürdüğü parçayı gövdenin yönlü ayak iziyle keser (segment–OBB ilk temas); olay/itki/önizleme temas noktasını görür, en erken hedef ve sahip dışlaması deterministik.
- [x] F06.2 — Duvar sert sınırdır: araç teması sonrası duvar yeniden çözülür (en çok 4 geçiş); 4×4000 adım ve köşe yığınında hiçbir gövde köşesi dünya dışında kalmaz, kalan örtüşme ≈0,05 birim.
- [x] F06.3 — Saf simülasyon CORE'a yalnız alt yüzeylerle bağlanır; beş senaryo Node'da DOM/CSS yükleyicisi olmadan seedli koşar ve vitest sonucuyla birebir aynıdır.
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
