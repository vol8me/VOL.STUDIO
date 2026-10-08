# UI doğrulama ve kabul sözleşmesi

Bu belge planlanan testin geçtiğini söylemez. PASS/FAIL/NOT-RUN ve
uygulanamaz (gerekçeli N/A) ayrı sonuçlardır. Native taklit, emülasyon ve
gerçek cihaz aynı kabul hücresi değildir. Eşik yalnız ölçüm zor diye
gevşetilmez; eksik yetenek/cihaz/kanıt açık kabul olur.

Teknik hazırlık ile gerçek release kabulü ayrı durumdur. Açık cihaz/insan
kabulü bağımsız sonraki kod fazını kilitlemez, nihai release'i engeller.
UI-00 başlangıç bulgularını exact rule/selector/fixture/görev/owner phase
olarak kaydeder; bunlar PASS/N/A değildir. Ratchet yeni/kayıtsız ihlali ve
teknik hazır ilan edilen fazın kalan bulgusunu reddeder. Applicable state
kanıtı owner phase sonunda zorunludur; UI-13'te ertelenmiş state ve açık
uygulanabilir AA bulgusu sıfırdır. Blanket veya süresiz snapshot waiver yoktur.

UI-00.6 çalışan browser probe ve native ölçülebilirlik araştırmasının
sahibidir; UI-06.4/UI-11.4/UI-12.4 native profile bağlama/kalibrasyonu yapar.
UI-13 yeni araç icat etmez, aynı doğrulanmış probun tam örneklemini alır.

## Mevcut kapılar ve planlanan genişleme

Kapı bileşiminin tek kaynağı `justfile`; `quality.json` bütçe ve kapsamı
geriletmeme eşiklerinin kaynağıdır.

| Mevcut kapı                                     | Mevcut kapsam                                                                        | UI planında eklenecek kanıt                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `contract`                                      | Katman/dışa aktarım/katalog/kimlik/ikon/satır/i18n/yerel ihlal örnekleri ve belgeler | Native araç keşfi; kayıtlı durum/test örneği bağlantısı; tema/hareket ihlal örnekleri                    |
| `format-check`, `typecheck`, `lint`, `lint-css` | Kod/biçim/tip/stil                                                                   | Tipli tema/olay, UI hareketindeki sabit değerlerin kapsamı, yeni public alt yol                          |
| `test` / `coverage` / `coverage-shape`          | Aktif paket testleri ve kapsamı geriletmeme eşikleri                                 | Kaynak ağacını yansıtan yeni davranış/yaşam döngüsü testleri; eşikler ölçülmüş kapsam artışıyla yükselir |
| `audio-test`                                    | Audio-synth hızlı alt test takımı                                                    | Yeni UI işi/varlığı/olayı regresyonları; tam yayın doğrulamasının yerine geçmez                          |
| `build` / `bundle`                              | Üretim çıktısı ve gzip app/vendor/css boyutu                                         | Vitrin göçünde bütçe korunur; ayrı ses/UI dışa aktarım yolları Phaser çekmez                             |
| `scaling`                                       | CORE uzamsal arama ve VOL.TEST mermi ölçekleme oranı                                 | UI kare maliyeti bu kapıyla geçti sayılmaz; büyük veri/sanal liste davranışı ayrıca ölçülür              |
| `e2e`                                           | Aktif paketlerin Playwright testleri                                                 | Vitrinde iki motorda bütün davranış dosyaları; axe/durum/tema/niyet/uzun metin                           |
| `rust`                                          | Aktif crate fmt/clippy/test                                                          | Native vitrin crate/eklenti yaşam döngüsü ve politika testleri                                           |
| `signoff`                                       | high + tam ses kapsamı/doğrulaması + JS/Rust güvenlik                                | Yayınlanan UI sesleri ve nihai kilometre taşı; gerçek cihaz/insan kabulü ayrıca                          |

Yerel UI doğrulama tarifi `ui-check`tir (UI-00.3): yüzey kaydı ve vitrinin iki
motorlu tam E2E'si (axe, durum fixture'ları, dokunma hedefi geometrisi, glif
yüksekliği, gecikme/performans rapor düzeneği); `high` aynı E2E'yi zaten içerir.
Geometri ve glif bulguları `geometryExceptions.json`da sahip görevle izlenir;
rapor vitrin paketinin git dışı records alanına yazılır ve
ekrana sunulan kare ölçülmedikçe PASS olamaz. Tam durum matrisi ve gerçek UI
maliyeti sonraki UI görevlerinde bu tarife bağlanır. Hızlı contract/tip/token kontrolleri
quick zincirine, tarayıcı axe/durum/geometri/niyet kontrolleri e2e'ye; uzun
gerçek cihaz performans ölçümü sürüm kabulüne bağlanır. Yeni tarifin ihlal
örneği, bileşim testi ve docs/gates güncellemesi aynı değişiklikte yapılır.

Bundle bütçelerinin tek kaynağı quality.json içindeki bundles kaydıdır. İsim göçü bütçe artışı gerekçesi değildir. Gönderilen
seslerin indirme/ön yükleme baytları ayrıca ölçülür; gzip JS bütçesi ses
yükünü içeriyor gibi raporlanmaz. Frozen paket/global CI yaratılmaz.

## Doğrulama sahibi

Modül testi ve görevin ilgili tekil kapısı teknik teslimi doğrular.
Repo kapıları/komutlar [gates](../gates.md), ortam desteği
[Windows](../windows.md) sahibindedir. UI-02 yayın ve UI-13 sürüm adayı
signoff ister; native kilometre taşı ayrıca kendi rust/build/cihaz kanıtını taşır.

## Durum matrisi ve test örneği kaydı

Her public sınıf/yardımcı için sahibi olan faz, tier, uygulanabilir durum,
test örneği kimliği, gerçek doğrulama ve modül testi yolu gerekir. Durum
örneği DOM'da adının geçmesi yerine erişilebilir ad/rol/anlamsal sonuç/beklenen
geometriyi sınar. En az normal, hover, basılma, görünür odak, devre dışı,
yükleme, hata, boş durum, klavye, oyun kolu, dokunma, azaltılmış hareket,
%30 uzunluk ve 6 hane eksenleri; görsel olmayan mekanizmada gerekçeli N/A ve
yaşam döngüsü testi gerekir.

Tier-1 için uygulanabilir matrisin bütünü; tier-2 için uygulanabilir
normal/etkileşim/hata/kaynak temizliği kapsamı gerekir. Kart/form/HUD “6 hane”
örneği **999999**; fiyat/seviye/sayaç ayrı biçimlendirilmiş örneklerle sınanır.
NaN/Infinity yapılandırmasının reddi var olan primitif sözleşmesine bağlıdır.
Yalnız ekran görüntüsü başarılı diye geri çağrı, odak, iptal veya canlı
bölge duyurusu kanıtı kapanmaz.

Negatif örnekler: adsız yerel giriş alanı, katman altında kalan odak, eksik
durum, tema anahtarı eksikliği, alfa birleşimi üzerinde yetersiz kontrast,
ham UI süresi, geç asenkron sonuç, yinelenen kabul edilmiş niyet, 24/44
sınırının altında saydam giriş hedefi, destroy sonrası kalan dinleyici ve
sağlayıcı sahipliği yarışması. Her kapı ilgili ihlalde düşer.

## Erişilebilirlik kabulü

| Kontrol      | Otomatik kanıt                                                                                                                         | Elle/native kanıt                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| WCAG/ARIA    | axe için 5 etiket; ihlal sayısı 0 veya kapsamı tam belirli, gerekçeli açık kayıt; eksik değerlendirmelerin incelenmesi                 | Gerçek AT ad/değer/meşgul/hata/durum duyurusu                               |
| Klavye       | Tab/ShiftTab/Enter/Space/Esc/yön tuşları/Home/End; inert/devre dışı/gizli durumlar                                                     | Fare olmadan bütün ekran ve açık katman                                     |
| Kol          | Birincil eylem/geri/sekme/kaydırma; bileşik denetimde düzenleme sahipliği                                                              | Steam Deck yalnız kol; gerçek eylem kaynağı glifi/yeniden bağlama/yedek     |
| Hedef        | Gerçek tıklanabilir 24/44 geometrisi, komşu örtüşmesi ve opacity:0 yerel giriş alanı                                                   | Android 48dp/Deck trackpad fiziksel ergonomisi ayrı                         |
| Metin        | %30 uzatma örneği, 200%/320px yeniden akış, 6 hane, Türkçe glifler ve kırpılmama                                                       | Ekran üstünde glif sınırları/okuma mesafesi; Android sistem fontu 200%      |
| Odak         | Halka/metin dışı kontrast, odağın örtülmemesi ve modal yığınından geri yükleme                                                         | Zoom/IME/AT/gamescope gerçek katman akışı                                   |
| Sürükleme    | Dokunma/tıklama/klavyeyle eşdeğer niyet; eşik/iptal                                                                                    | Dokunma ve TalkBack'te tek işaretçi alternatifi                             |
| Renk         | AA kontrastı son birleşimde: uygulanabilir normal metin 4.5:1/büyük metin 3:1/metin dışı 3:1; gri tonlama/renk görme farklılığı örneği | Renk dışı işaretin gerçek okunurluğu; simülasyon uygunluk sertifikası değil |
| Süre/hareket | Azaltılmış harekette bilgi ve kaynak temizliği; yanıp sönme riski envanteri; kalıcı tooltip ve odakta duran bildirim                   | Dikkat/vestibüler etkilerin insan kontrolü; işlev süresi korunur            |

Gerçek AT seçimi kayda girer: Linux'ta erişilebilir WebView yolu ve Orca
desteği sınanır; Android TalkBack; Windows NVDA/Narrator. Bir yol erişilebilirlik
ağacı sunmuyorsa diğer tarayıcıdaki axe PASS'ı bu native hücreyi kapatmaz.
Kimlik doğrulama/tekrar giriş/izin akışı yoksa gerekçeli N/A uygulanır; plan
yeni kimlik doğrulama sistemi eklemez.

## Tema, yerleşim ve piksel

Default/aurum × TR/EN/sentetik RTL × compact/comfy/touch kapsamında genel
tarama ikili kombinasyonlarla yapılır; kritik etkileşimler tam çaprazdır.
Her tema/durum kontrastı hesaplanan son renk/alfa/kenarlık/glif/Canvas üzerinden
ölçülür; kapsamlı portallar ve Canvas yeniden çizimi kontrol edilir. Ekran
görüntüsü motor/font/DPR/görüntü alanı sabittir.

Vitrinin varsayılan 12 mevcut piksel temeli başlangıçtır; sonunda 16 sekmenin
varsayılan temeli aynı geriletmeme politikasıyla korunur; kimlik değişimi (malzeme,
ikon, ikinci tema) temelleri bilinçli yeniler ve her yenileme tek tek incelenir. Açık OSK/Modal/Popup/
seçici ve seçili/devre dışı/hata durumları ayrı görüntülerdir. Chromium mevcut
temeli, WebKit davranış/geometriyi korur. WebKit için piksel temeli ancak
bilinçli olarak ayrıca kalibre edilen örnekle kurulur; motorlar arasında aynı
PNG eşitliği beklenmez. Aurum için bütün durumların stili/yerleşimi/kontrastı/
etkileşimi ve seçilmiş kanonik görseller incelenir; ikinci temanın tam PNG
matrisi otomatik kapsam şişirmesi değildir.

Tema geçişinde fonts.ready ile ısınmış font ve soğuk font koşulları ayrıdır;
her çizim karesinde kritik kutuların x/y/width/height, odak, kaydırma ve seçim
kaydı alınır. Yapısal değişim 0; ölçüm yuvarlaması gerekçeyle en çok 1 fiziksel
piksel olabilir. Chromium standart CLS 0 yanında hadRecentInput filtresi
uygulanmamış kayıtlar da alınır. WebKit'te özelliğin bulunmaması NOT-SUPPORTED;
geometri sondası yine zorunlu. Etkileşim sonrası CLS 0, kutu sabitliği geçti
demek değildir.

## UI CPU, GPU, ekrana sunum ve gecikme deneyi

UI `%5` kabulünün paydası **hedef kare süresi F=1000/Hz**. UI CPU p95 için
%95 üst güven sınırı + pozitif A/A gürültü payı `<0.05F` olmalıdır.
60Hz<0.833333ms, 90Hz<0.555556ms, 120Hz<0.416667ms. UI JS ile stil/yerleşim/
çizim aynı karede atfedilebiliyorsa tek örnek toplamıdır; farklı ölçülerin
p95'leri toplanmaz. Atıf yoksa yalnız UI JS kapsamı ve A/B toplam CPU regresyonu
raporlanır; tam UI CPU hedefi ölçülmedi kalır. Diagnostics render+idle, GPU
ölçüsü değildir.

1. Üretim build'i/tohum/girdi tekrarı/dünya kalitesi/sahne/görüntü alanı/DPR/Hz/
   güç/oturum/OS/WebView profili sabittir. Cihaz adresi/seri numarası/kullanıcı
   adı kayda girmez.
2. En az 30s ön yükleme/ısınma ve termal kararlılık; 10 eşli A/B 60s pencere.
   A oyun+aynı geometrili statik UI; B aynı dünya+tam UI davranışı/hareketidir.
   Boş/statik HUD/olay salkımlı UI yükleri ayrıdır; oyun geometrisi/fiziği
   değişmez. Sıra ABBA/sabit tohumla dengelenir; soğuk açılış ve 10dk termal
   oturum ayrı deneydir.
3. Aynı karedeki UI JS işi/aşaması, iz kaydında UI stil/yerleşim/çizim ayrı
   atfedilir; p50/p95/p99/örnek sayısı ve eşli pencere/blok bootstrap güven
   sınırı raporlanır. A/A gürültü payı eşiği aşarsa ölçüm yetersizdir;
   tolerans yükseltilmez.
4. GPU/birleştirici ayrıdır; native iz/zamanlayıcı varsa kapsamı açıktır.
   WebGL GPU zamanlayıcısı DOM birleştiricisini kapsamaz; disjoint örnekler
   atılır. Destek yoksa GPU yüzdesi uydurulmaz. Bulanıklık alanı/katmanlar/
   üst üste çizim/DPR bütçesi gözlenir.
5. Gerçek ekrana sunulan kare p95/p99, kaçırılan/düşürülen/yinelenen kareler
   ve Hz ölçülür. Ortalama FPS tek kabul değildir. VOL.TEST Deck≥59FPS/
   p95≤18ms işi kendi sahibiyle açık/kapalı kalır; UI %5 onun yerine geçmez.
6. Girdi zaman damgası→ilk görünür geri bildirim p95<100ms; en yüksek değer
   ayrıca raporlanır. İşaretçi, klavye, AT ve kol yoklaması ayrı kapsamlardır.
   EventTiming güvenilir olay kaydının kapsamı/eşiği/yuvarlama sınırı açıklanır;
   kol/sürekli sürükleme için ayrıca ölçüm eklenmiş olay/kare sondası ve gerçek
   ekran kaydı gerekir.

10 pencere tekrarı pahalıysa ilk temel sınama daha kısa olabilir; kısa sonuç
tam cihaz kabulü değildir. İzleyici/başsız tarayıcı emülasyonu fiziksel panel
kabulünün yerine koyulmaz. GPU ve sunumun CPU ile örtüşen paralel süreleri
toplanarak sahte tek “UI%” sayısı üretilmez.

### Ölçüm sondası ve profil uygulanabilirliği (UI-00.6)

**Tarayıcı probu (çalışıyor).** `devtools/vol-showcase/tests/e2e/support/frameProbe.ts`
sayfa katmanında (iki motor) girdi `timeStamp`ini, her girdiden sonraki ilk karenin
rAF başlangıcını ve çizim sonrası turunu; Chromium'da CDP izinden her ana iş
parçacığı karesini `BeginMainThreadFrame.frameId` ile kimliklenmiş olarak, JS
(olay/rAF/zamanlayıcı), stil, yerleşim, boyama ve commit sürelerini önceki
commit sonu ile bu karenin commit sonu arasındaki pencerede AYNI kareye atfeder.
Iz saati sayfa saatine `performance.mark` ile hizalanır ve girdi, işlendiği iz
karesine bağlanır; JS içinde zorlanan yerleşim ayrıca (`forcedMs`) görünür.
Playwright'ın kendi araç olayları JS'e girmez. WebKit'te iz API'si yoktur: iz
kapsamı `unsupported`, sayfa katmanı çalışır. Kalibrasyon (`probe.spec.ts`,
bilinen 5 ms ve 25 ms yük): izden okunan JS 5 ms yükü 5–9 ms aralığında verir,
boşta karelerin medyanı 1 ms altındadır, 20 ms iş farkı A/A gürültü ve iz maliyeti
payı içinde ayrılır; A/A gürültü ve iz maliyeti her koşuda `ui-perf` kaydına
yazılır. Başsız ortam gerçek panele sunum yapmaz: `PipelineReporter` sayacı
yalnız gözlemdir, sunum kanıtı değildir. UI-03 pilotu bu probun uygulama
programlama yüzüne (`attributeFrames`, `linkInputs`, `startTrace`) dayanır.

**Native uygulanabilirlik.** Her runtime için resmi yol, bu oturumda denenip
denenmediği ve eksik olan açıkça yazılır; denenmeyen hücre ölçülmüş sayılmaz.

| Runtime                                       | Resmi kare/izleme yolu                                                                                                                        | Bu oturumda                                                                                                                                                                                                                                                                                                                                       | Eksik araç / sahip                                                                                                                                    |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android 14 WebView (Lenovo tablet, VOL.TEST)  | `dumpsys gfxinfo <paket> framestats`: `DisplayPresentTime` (sunum), `GpuCompleted`, `InputEventId`/`HandleInputStart`, `FrameTimelineVsyncId` | **Denendi, çalışıyor**: 530 kare, 120 Hz, sunum p50 32,2 ms, işleme p95 8,8 ms, girdi işleme→sunum p50 31,4 ms (7 örnek). Araç: `scripts/android/frame-stats.mjs`                                                                                                                                                                                 | Çekirdek girdi zamanı ve sürücü gecikmesi dahil değil; WebView içi JS/DOM atfı için uzak CDP izi (adb) ve Perfetto FrameTimeline eksik; sahip UI-11.4 |
| Android 16 (Samsung Galaxy S21 FE, VOL.TEST)  | aynı yol                                                                                                                                      | **Denendi, çalışıyor**: 354 kare, 60 Hz, sunum p50 33,4 / p95 50,1 ms, işleme p95 11,3 ms; girdi karesi bu örneklemde yakalanmadı (8 dokunuşta da), girdi kapsamı **NOT-RUN**                                                                                                                                                                     | Samsung'da girdi satırı için başka bir girdi yolu (gerçek dokunuş/Perfetto) ve uzak CDP izi; UI-11.4                                                  |
| Windows WebView2 (Tauri)                      | WebView2 DevTools Protocol `Tracing`/`Performance` (aynı Chromium izi); sunum için ETW/PresentMon                                             | **Yerel vitrin açılır** (2026-10-08, `devtools/vol-showcase/src-tauri`, `pnpm --filter @volstudio/vol-showcase tauri build`): pencere çizilir, ekran görüntüsü alındı. Kare/sunum ölçümü **denenmedi**: PresentMon kurulu değil                                                                                                                   | PresentMon ya da ETW ayrıştırıcısı; UI-06.4                                                                                                           |
| Steam Deck (SteamOS 3, Gamescope + WebKitGTK) | WebKitGTK uzak inspector; sunum için Gamescope/MangoHud                                                                                       | **Yerel vitrin çalışır** (2026-10-08, Game Mode, 1280×800; HOST derlemesi: WSL Ubuntu 24.04 WebKitGTK 4.1 AppImage, SLR4 kabı DEĞİL): 14 sekme, iki skin, ekran klavyesi, modal/sheet/onay/toast/diyalog/seviye seçici gerçek cihazda `gamescopectl` ekran görüntüsüyle incelendi. Sunulan kare ölçümü **denenmedi** (MangoHud ayrıştırıcısı yok) | MangoHud kare kaydını ayrıştıran araç; SLR4 derlemesiyle yeniden koşu; UI-12.4                                                                        |

Desteksiz toplam CPU/GPU/sunum hücresi açık bir SÜRÜM ENGELİDİR; sıfır ya da
tahmini PASS değildir.

## Ses ve haptik kabulü

Kanonik iş/program/render/PCM özeti/manifest ve kodlama/gönderilen varlık
kayıtları; varyant/olay paritesi ve deterministik yeniden render gerekir.
Çalışma zamanında üretici içe aktarılmaz. Kısa tıklama kazancı, süre ve kodlama
sonrası tepe/gerçek tepe ayrı; dört ses+oda kuyruğunun olay salkımı karışımı,
DC/sonluluk/kırpılma ölçülür. UI ses kanalı düşürmesinde en güçlü örtüşme/
bekletme/geri yükseltme/iptal/devam; boşta ambiyans yokluğu sınanır. Anlamsal
sonda eylem başına tek olay; sessiz/sürücü yok/bağlam yok durumlarında aynı
işlev; yükleme iptalinde tamamlandı sesi üretmeme kanıtı gerekir. Ses erişimi
kullanıcı jestiyle açılır; arka planda beklemiş kuyruk yoktur; yük/yeniden
tetikleme kritik sonucu susturmaz. Haptik kapalı/sıfır şiddet ve odak kaybı/
cihaz çıkarma/çıkışta durma gerçek sondada sınanır.

**Referans ölçümü ve kulak.** Gövde ve karakter, referans setlerle (Kenney Interface Sounds ve
UI Audio; yalnız yerel ölçüm) bant dağılımı, yükseklik ve gövde/vurgu oranı karşılaştırmasıyla
doğrulanır: örnek ölçümde referansın iyi seslerinde sub −17…−40, low −14…−30, mid −15…−30,
high −20…−35 dB iken önceki setimizde low/sub −45…−75 dB idi (gövde yok) ve yükseklik −20 LUFS
iken referans −10…−25 LUFS idi. Yeni set bu aralıkla karşılaştırılır; ölçüm karar vermez, kulak
verir. **Dinleme notları** kullanıcıdan tarihli olarak aşağıya işlenir; reddedilen ses yeniden
tasarlanır, kabul edilen UI-02.9'da kapanır.

Dinleme notları: 2026-10-07 — kullanıcı ilk seti reddetti ("tok değil, hissiyat kötü, kullanım
alanları yanlış, slider'da ses yok"); set sıfırdan yeniden yapılır (UI-02.6–02.9).

Ses yayını güncel kaynak/PCM/manifest ve codec sonrası teknik QA ile doğrulanır;
runtime decode/çıkış gerçek hedefte doğrulanır. İsteğe bağlı dinleme
paketi kulaklık veya cihaz hoparlörü karşılaştırmasına hizmet eder; insan
beyanı üretim şartı değildir. Dinlenmediği hâlde beğeni iddiası yazılmaz.

**Ses laboratuvarı kanıtı (UI-02.5).** Vitrin Ses sekmesi olay düğmelerini, gerçek
bileşenleri (düğme, onay kutusu, seçici, kaydırıcı, ürün sonucu bildirimi), kanal/sessizleştirme/
titreşim ayarlarını, ses sayısı/düşen istek/yetenek durumunu, niyet sondasını ve kuru/kit kıyası
ile örnek dışa aktarımını taşır; makine okunur değerler `data-value`dadır.

| Katman                           | Yol                                                                                                     | Sonuç                                                                                                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Anlamsal olay sondası            | `ses.spec.ts` (Chromium + WebKit) ve birim testleri                                                     | Düğme tıklaması, Enter ve Space eylem başına TEK niyet; onay kutusu tek `toggle`; olay düğmeleri doğrudan çalar ve niyet sayımını çoğaltmaz                                                                        |
| Ses zinciri (Chromium)           | jest → bağlam `running` → örnekler yüklenir → `played > 0`; sessizlikte `played` sabit, `dropped` artar | Geçti                                                                                                                                                                                                              |
| WebKit (Playwright/Win)          | aynı spec                                                                                               | Bu derlemede Web Audio ve Ogg Vorbis YOK: zincir testleri SKIP (gerekçeli), laboratuvarın dürüst "ses desteklenmiyor" durumu ve niyet sondası geçti                                                                |
| Gerçek Safari/iOS Ogg            | —                                                                                                       | **NOT-RUN**: UI sesleri OGG; Safari/WKWebView çözümü ve çıkışı bu makinede doğrulanamadı (açık risk, sahip UI-12.4/F09)                                                                                            |
| Üretim doğrulaması               | `just audio-verify`                                                                                     | 36 UI manifestinin PCM kimliği `identical`, kodek sonrası politika ihlali 0/33 dosya (core ağacı), bütünlük diff'siz                                                                                               |
| Cihaz çıkışı (Android 14 tablet) | Chrome 154 + vitrin; CDP dokunuşu; `scripts/android/audio-players.mjs`                                  | Bağlam `running` 48 kHz, gecikme 32 ms, 7 ses çalındı; AAudio oynatıcısı `started` (USAGE_MEDIA); `mutedState: streamVolume` (cihaz medya seviyesi 0, değiştirilmedi): çıkışa ulaşma KANITLI, duyulabilirlik DEĞİL |
| Samsung / Deck / titreşim        | —                                                                                                       | **NOT-RUN**: Samsung o anda bağlı değildi; Deck çıkışı (hoparlör) ve titreşim cihaz sürücüsü bu oturumda sürülmedi (Deck'te yerel vitrin artık çalışır, ses çıkışı dinlenmedi)                                     |

İnsan dinleme onayı üretim şartı değildir ve bu tabloda iddia edilmez.

## Gerçek platform matrisi

| Profil                                 | Görüntü/girdi                                                     | Zorunlu örnek                                                                                       |
| -------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Linux dizüstü native + web             | Mevcut ekran çözünürlüğü; klavye/fare, UI 200%                    | Görünür pencere, açık modal/ayarlar/metin, soğuk/ısınmış/askıya alınmış koşul                       |
| Steam Deck host + SLR4                 | 1280×800, gerçek cihaz Hz; kol/trackpad                           | Native vitrin laboratuvarı; glif yüksekliği, diyalog/yedek, ses/haptik ve ekrana sunulan kare       |
| Android fiziksel                       | Cihazın yatay/dikey yönü/DPR/WebView/OS; sabit/bölünmüş/yüzen IME | Vitrinin son APK'sı; en altta giriş alanı, sistem çubukları/ekran kesiti/dönüş/seçim/geri/font 200% |
| Windows fiziksel/gerçek Windows ortamı | DPI 125/150/200%; klavye/fare/AT                                  | Yükleyici/WebView2/native pano/giriş alanı, depolama ve açık katman                                 |
| Tarayıcı ek görüntü alanı              | 1440×900,1280×800,844×390,390×844,2560×1080,320 CSS px            | İki motor, uzun etiket/RTL/200%; taklit güvenli alan örneği açık etiketli                           |

LCD 60Hz kanıtı OLED 90Hz/başka Android modeli için genellenmez. Samsung
erişilemiyorsa Samsung NOT-RUN; Lenovo ölçümü onun yerine geçmez. Cihaz
kurulumuna ait gerçek build özeti görüntü/sondayla ilişkilendirilir.

## Kapanış kaydı ve risk

Git dışı özel kayıtlar: görev kimliği, build özeti, platform/runtime/test
örneği, beklenen/gerçek, zaman damgası, komut sonucu, PASS/FAIL/NOT-RUN/N/A,
kanıt dosyası, örnek/ölçü kapsamı ve insan beyanı. Public belge yalnız güncel
karar/kabul durumu ve anonim ölçüm özeti taşır; kişisel tanımlayıcı veya sürekli
oturum/ölçüm günlüğü yoktur.

Piksel temelini güncellemek insan kabulü değildir. Native kaynak temizliği,
özel geri çağrı ve wasm/GPU ayırıcı gibi yollar yalnız JS testinden çıkmaz.
Sonraki faz, doğrudan kapısı düşen ön koşulu atlamaz. Kapanış şartı yetkili
TODO görevinin her kabul satırıdır; kapı yeşilliği kapsam eksikliğini örtmez.
Kalan VT/SD işleri yanlışlıkla UI başarısı üzerinden kapatılmaz.

## İnsan kabul kayıtları

Yalnız güncel karar durumu; kişisel tanımlayıcı yok.

| Tarih      | Kapsam                                                                                                                | Karar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-07 | Görsel kimlik: iki skin (çelik, aurum), malzeme dili (düğme, bar, çerçeve), ikon seti (Phosphor Fill), imleç          | **Kabul** (ekran görüntüleriyle, "çok hoşuma gitti, tam onay"). Cihazda canlı his, dokunma/kol ve native WebView ayrı kalır.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-10-07 | UI sesleri (ilk 23 olay, iki palet)                                                                                   | **Kabul** (kullanıcı kulakla: "ses deneyimi benim tarafımdan geçti"; yalnız o günkü sesler). Cihaz hoparlörü ayrı kayıt.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-10-07 | Yeni sesler: `keyTap`, `keyDelete` (ekran klavyesi; iki palet)                                                        | **Açık**: ölçüt (UI sınıfı) geçti, kulakla karar henüz yok; ses ekran görüntüsüyle kabul edilemez.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-10-08 | Katman ve ekran klavyesi tasarımı (diyalog, toast, komut paleti, sheet, modal, OSK, vitrin kabuğu)                    | **Açık**: kullanıcı ekran görüntüsüyle inceleyecek; cihazda (Deck, tablet, telefon) canlı his ayrı kayıt.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-10-08 | Vitrin kabuğu ve ekran klavyesi, Lenovo TB350FU (Android 14, 1200×2000, Chrome; adb ile yerel sunucu), yatay ve dikey | **Otomatik/ekran görüntüsü PASS** (2026-10-08 yeniden koşu: 12/12, iki yönde de; dokunma→ilk görünür geri bildirim p50 22/27 ms, p95 39/41 ms): kabuk sığar, sekmeler ve kartlar çizilir; klavye iki yönde ekrana sığar (Vazgeç·Bitti görünür), dokunmayla yazma, sembol katmanı, TR⇄EN tuşu çalışır, sekmede ses simgesi (tuş sesi çalıyor). İnsan hissi/ses kulakla ayrı kayıt; yerel (APK) vitrin ve Samsung NOT-RUN.                                                                                                                        |
| 2026-10-08 | Ekran klavyesi ve katmanlar Steam Deck'te (yerel vitrin, Game Mode, fare/dokunmatik girdi `xdotool`)                  | **Kısmi PASS (ekran görüntüsü)**: klavye tam genişlikte temaya uygun çizilir, harf/sembol/TR katmanı ve Vazgeç·Bitti çalışır; modal/sheet/onay Escape ile kapanır, odak geri döner; seçici ve diyalog zorunlu seçimde Escape ile kapanmaz (tasarım). **Kol (OS düzeyi sanal Xbox kolu, `/dev/uinput`, Steam Input üzerinden) PASS**: D-pad odak halkasını taşır, RB sekmeyi değiştirir (Panels→Forms), A ile klavyede harf yazılır, odak halkası tuşta görünür. **NOT-RUN**: fiziksel Deck düğmeleri/arka tuşlar, eylem glifi geçişi (UI-12.2). |
