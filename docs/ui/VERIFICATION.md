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

| Runtime                                       | Resmi kare/izleme yolu                                                                                                                        | Bu oturumda                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Eksik araç / sahip                                                                                                                                    |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android 14 WebView (Lenovo tablet, VOL.TEST)  | `dumpsys gfxinfo <paket> framestats`: `DisplayPresentTime` (sunum), `GpuCompleted`, `InputEventId`/`HandleInputStart`, `FrameTimelineVsyncId` | **Denendi, çalışıyor**: 530 kare, 120 Hz, sunum p50 32,2 ms, işleme p95 8,8 ms, girdi işleme→sunum p50 31,4 ms (7 örnek). Araç: `scripts/android/frame-stats.mjs`                                                                                                                                                                                                                                                                                                                                                                                             | Çekirdek girdi zamanı ve sürücü gecikmesi dahil değil; WebView içi JS/DOM atfı için uzak CDP izi (adb) ve Perfetto FrameTimeline eksik; sahip UI-11.4 |
| Android 16 (Samsung Galaxy S21 FE, VOL.TEST)  | aynı yol                                                                                                                                      | **Denendi, çalışıyor**: 354 kare, 60 Hz, sunum p50 33,4 / p95 50,1 ms, işleme p95 11,3 ms; girdi karesi bu örneklemde yakalanmadı (8 dokunuşta da), girdi kapsamı **NOT-RUN**. Sonraki tur (2026-10-08, `scripts/android/device-benchmark.mjs 90`, boş dünya, dokunma yok): dikey 5280 kare jank %0,44, yatay 5312 kare jank %0,36                                                                                                                                                                                                                            | Samsung'da girdi satırı için başka bir girdi yolu (gerçek dokunuş/Perfetto) ve uzak CDP izi; UI-11.4                                                  |
| Windows WebView2 (Tauri)                      | WebView2 DevTools Protocol `Tracing`/`Performance` (aynı Chromium izi); sunum için ETW/PresentMon                                             | **Yerel vitrin açılır** (2026-10-08, `devtools/vol-showcase/src-tauri`, `pnpm --filter @volstudio/vol-showcase tauri build`): pencere çizilir, ekran görüntüsü alındı. Kare/sunum ölçümü **denenmedi**: PresentMon kurulu değil                                                                                                                                                                                                                                                                                                                               | PresentMon ya da ETW ayrıştırıcısı; UI-06.4                                                                                                           |
| Steam Deck (SteamOS 3, Gamescope + WebKitGTK) | WebKitGTK uzak inspector; sunum için Gamescope/MangoHud                                                                                       | **Yerel vitrin çalışır** (2026-10-08, Game Mode, 1280×800; HOST derlemesi: WSL Ubuntu 24.04 WebKitGTK 4.1 AppImage, SLR4 kabı DEĞİL): 14 sekme, iki skin, ekran klavyesi, modal/sheet/onay/toast/diyalog/seviye seçici gerçek cihazda `gamescopectl` ekran görüntüsüyle incelendi. Sunulan kare **ölçüldü** (vitrin kare ölçeri, `Shift+B`; rAF aralığı, sekme kaydırılırken): 14 sekme 57,3–60,6 FPS, ortanca 60,2; kök neden ve düzeltme `docs/steam-deck.md`'de. MangoHud/gamescope kare kaydı ayrıştırıcısı **yok**, tek HUD sekmesinde ≈130 ms kare açık | MangoHud kare kaydını ayrıştıran araç; SLR4 derlemesiyle yeniden koşu (ölçüm yalnız host derlemesidir); UI-12.4                                       |

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
UI Audio, CC0; yalnız yerel ölçüm, depoya girmez) bant dağılımı, yükseklik ve gövde/vurgu
oranı karşılaştırmasıyla doğrulanır. Ölçüm karar vermez, kulak verir. **Dinleme notları**
kullanıcıdan tarihli olarak aşağıya işlenir; reddedilen ses yeniden tasarlanır; dinleme notu
UI-02.9 teknik kapanışının zorunlu şartı değildir.

_Yöntem (2026-10-10, `devtools/audio-synth/scripts/ui-reference-compare.ts`)._ Hepsi gönderilen
biçimde (OGG, FFmpeg çözümü) ölçülür: 151 referans dosyası (Interface Sounds 100, UI Audio 51;
paketlerin `Audio` klasörleri) ve gönderilen 150 UI sesi (2 palet × 25 olay × 3 varyant).
Yükseklik BS.1770 tepe anlık (400 ms) LUFS ve 4× true peak. Bant düzeyi: 2048 örneklik Hann
pencereli Welch gücü, sesin etkin karelerinin (en güçlü karenin 40 dB altına inmeyenler)
ortalaması, dBFS; bantlar sub 20–80, low 80–250, mid 250–2500, high 2500–16000 Hz.
Gövde/vurgu = (sub+low) gücünün high gücüne oranı (dB; pozitif = gövde ağırlıklı). Hücre:
ortanca (p10…p90). Referanslar `kenney.nl/assets/interface-sounds` ve `kenney.nl/assets/ui-audio`
paketleridir; komuta klasör olarak verilir. Bu paragrafın önceki sürümündeki örnek sayılar
(sub −17…−40, low −14…−30 …) tekrarlanamayan bir örnek ölçümdü ve farklı normalizasyon
kullanıyordu; bu betik ve tablo onların yerini alır.

| Set                     | Ses | Tepe anlık LUFS     | True peak dBTP   | sub dBFS            | low dBFS            | mid dBFS            | high dBFS           | Gövde/vurgu dB      | Merkez Hz        | Süre ms      |
| ----------------------- | --: | ------------------- | ---------------- | ------------------- | ------------------- | ------------------- | ------------------- | ------------------- | ---------------- | ------------ |
| Kenney Interface Sounds | 100 | −18,1 (−25,2…−11,7) | −0,9 (−1,0…+0,3) | −56,2 (−84,7…−30,8) | −51,4 (−84,8…−28,0) | −25,2 (−40,1…−13,0) | −30,6 (−80,7…−15,9) | −15,6 (−54,4…+29,3) | 2156 (345…9403)  | 225 (40…608) |
| Kenney UI Audio         |  51 | −24,0 (−26,6…−19,4) | −0,8 (−1,7…+1,2) | −54,9 (−97,9…−42,2) | −53,1 (−90,9…−39,3) | −29,7 (−39,4…−22,8) | −28,7 (−33,0…−24,0) | −21,8 (−64,6…−6,1)  | 3767 (1733…7000) | 304 (53…421) |
| VOL aurum (gönderilen)  |  75 | −26,2 (−37,3…−17,6) | −5,0 (−8,9…−2,9) | −43,6 (−63,3…−30,2) | −29,5 (−44,7…−24,1) | −27,0 (−69,4…−19,1) | −52,8 (−70,0…−42,4) | +26,8 (+9,2…+40,9)  | 333 (172…1367)   | 220 (87…587) |
| VOL steel (gönderilen)  |  75 | −25,7 (−34,0…−20,8) | −5,0 (−8,9…−2,9) | −45,3 (−53,8…−29,1) | −24,1 (−38,2…−19,8) | −31,1 (−53,2…−20,5) | −65,8 (−74,7…−45,3) | +36,8 (+24,3…+48,9) | 207 (142…886)    | 194 (87…340) |

_Bulgular (ölçüm; kulak değil)._

1. **Gövde referanstan çok fazla, vurgu çok az.** low bandı referanstan ortancada 22–29 dB
   yüksek (−24…−30 dBFS; referans −51…−53); mid bandı referansla aynı aralıkta (−27…−31;
   referans −25…−30); high bandı 22–37 dB düşük (−53…−66; referans −29…−31). Gövde/vurgu
   +27…+37 dB, referans −16…−22 dB: yön ters. Ağırlık merkezi 207–333 Hz, referans 2,2–3,8 kHz.
   Silinen önceki set orta bant ağırlıklıydı (TODO "Dürüst başlangıç": sub/low −45…−75 dB) ve
   reddedildi ("tok değil"); yeni set gövdeyi ekledi, ancak bu ölçüm temas/vurgu katmanının
   referans düzeyinin çok altında kaldığını da gösteriyor.
2. **Olay bazında:** en parlak olaylar `alert` (high −25/−27 dBFS), `purchase` aurum (−35) ve
   `panel-open` (−42/−45); en koyular `key-delete` (−76/−81), `slider-tick`, `hover`, `focus`,
   `denied`, `select` steel, `drag-drop` steel, `press`, `toggle*`, `release` (−57…−73; merkez
   125–680 Hz). En sık duyulan olayların çoğu koyu uçtadır.
3. **Yükseklik:** tepe anlık ortanca −26 LUFS (referans −18…−24); UI politikası aralığında
   (−42…−8). Mikro olaylar (`hover`, `focus`, `key-tap`, `slider-tick`: 77–107 ms) −33…−39 LUFS
   okur; 400 ms'lik anlık pencerede bu kısa sesler seyrelir (≈ −6…−7 LU), yani ölçü onları
   olduğundan sessiz gösterir. True peak −5 dBTP: −1 dBTP tavanının 4 dB altında ve referansın
   (−0,9; p90'ı 0 dBTP üstü) altında; seviye kazancı için payımız var.
4. **Cihaz hoparlörü uyarısı (varsayım, ölçülmedi):** küçük tablet/el konsolu hoparlörleri
   150–200 Hz altını zayıf çalar. Ses gövde ağırlıklı olduğundan cihazda duyulan kısım
   ağırlıkla mid bandı olur (referansla aynı aralıkta) ve hava çok azdır: "tok ama donuk"
   duyulma riski vardır; kulaklıkta gövde duyulur. Bu oturumda cihaz hoparlör çıkışı
   kaydedilmedi; karar kullanıcının kulağındadır.

_Karar._ Ölçümle körlemesine yeniden ayar yapılmadı: set insan tarafından henüz dinlenmedi, bir
önceki ret gövde eksikliği yüzündendi ve parlaklığı yalnız ölçümle artırmak o kararı geri
alabilir. Dinleme sonucunda "boğuk/donuk" notu gelirse hedef ölçülebilirdir: sık olaylarda
(`press`, `toggle*`, `select`, `tabSwitch`, `sliderTick`, `valueCommit`) high bandı ortancada
≥ −45 dBFS (şimdi −50…−73), gövde (low) bandı korunur, UI politikası ve `audio-verify` yeniden
geçer. Dinleme paketi (`pnpm --filter @volstudio/audio-synth audio:listen`, audio-synth paketinin git dışı `export/listening` klasörü)
150 gönderilen UI sesini olay başına palet × varyant grubu olarak sunar; ses laboratuvarındaki
"Palet A/B" düğmesi aynı olay ve varyantı iki paletle art arda çalar. "Eski/yeni A/B"
uygulanamaz: eski 12 olaylık set D2 ile silindi ve yeniden üretilemez; yerine referans
karşılaştırması (tablo) ve palet A/B vardır.

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

| Katman                           | Yol                                                                                                     | Sonuç                                                                                                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anlamsal olay sondası            | `ses.spec.ts` (Chromium + WebKit) ve birim testleri                                                     | Düğme tıklaması, Enter ve Space eylem başına TEK niyet; onay kutusu tek `toggle`; olay düğmeleri doğrudan çalar ve niyet sayımını çoğaltmaz                                                                                                   |
| Ses zinciri (Chromium)           | jest → bağlam `running` → örnekler yüklenir → `played > 0`; sessizlikte `played` sabit, `dropped` artar | Geçti                                                                                                                                                                                                                                         |
| WebKit (Playwright/Win)          | aynı spec                                                                                               | Bu derlemede Web Audio ve Ogg Vorbis YOK: zincir testleri SKIP (gerekçeli), laboratuvarın dürüst "ses desteklenmiyor" durumu ve niyet sondası geçti                                                                                           |
| Gerçek Safari/iOS Ogg            | —                                                                                                       | **NOT-RUN**: UI sesleri OGG; Safari/WKWebView çözümü ve çıkışı bu makinede doğrulanamadı (açık risk, sahip UI-12.4/F09)                                                                                                                       |
| Üretim doğrulaması               | `just audio-verify`                                                                                     | 36 UI manifestinin PCM kimliği `identical`, kodek sonrası politika ihlali 0/33 dosya (core ağacı), bütünlük diff'siz                                                                                                                          |
| Cihaz çıkışı (Android 14 tablet) | Chrome 154 + vitrin; CDP dokunuşu; `scripts/android/audio-players.mjs`                                  | Bağlam `running` 48 kHz, gecikme 32 ms, 7 ses çalındı; AAudio oynatıcısı `started` (USAGE_MEDIA); `mutedState: streamVolume` (cihaz medya seviyesi 0, değiştirilmedi): çıkışa ulaşma KANITLI, duyulabilirlik DEĞİL                            |
| Samsung / Deck / titreşim        | —                                                                                                       | **NOT-RUN**: Samsung ses çıkışı sürülmedi (sonraki turda cihaz bağlıydı ama yalnız görüntü/kare ölçüldü); Deck çıkışı (hoparlör) ve titreşim cihaz sürücüsü bu oturumda sürülmedi (Deck'te yerel vitrin artık çalışır, ses çıkışı dinlenmedi) |

İnsan dinleme onayı üretim şartı değildir ve bu tabloda iddia edilmez.

## Kart ailesi kaydı (UI-04)

Ölçüldü (Chromium + WebKit Playwright, vitrin `cards`/`touch` sekmeleri; piksel temeli Chromium/win32):

| Eksen                       | Kanıt                                                                                                                                                                                                                                                     | Sonuç                |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Durum matrisi               | `cardMatrix.spec.ts`: nadirlik × normal/devre dışı/kilitli, salt sunum/kompakt/ikincil/sürüklenebilir/sürüklenen, uzun başlık+açıklama+`999999 Flux` stresi; iki skin × 1280×800/360×740 × metin ×1/×2 (kartın dışına taşma, kırpılma, eylem görünürlüğü) | 17 kart, hepsi geçti |
| Renk dışı nadirlik          | Baklava sayısı 1/2/3 (SVG, `aria-hidden`), etiket olmasa da var; kilitli kart kesikli çerçeve                                                                                                                                                             | Geçti                |
| Erişilebilir ad             | Kart `group` + başlık; düğmeler "etiket + kart adı" (aynı "BUY"lar ayrışır); seçici paneli başlığıyla adlı                                                                                                                                                | Geçti                |
| Seçici durumları            | `CardPicker.setNotice`: yükleniyor (`status` + `aria-busy`) / hata (`alert`); eski bildirim yeni sunuma ve kapanışa sızmaz; son seçimin tek niyeti (kapanış sırasında ikinci tıklama/geri `onSelect`/`onClose`u tekrarlamaz)                              | Geçti                |
| Deste (SwipeableCardStack)  | Düğmesiz modda odaklanabilir yığın + sol/sağ ok; fiziksel yön (RTL'de de ret solda); opt-in odaktan bağımsız duyuru; yakalama kaybı/ikinci parmak/ek fare düğmesi; azaltılmış harekette aynı son durum                                                    | Geçti                |
| Niyet ve ses                | Kart eylemi `select`, sürükleme `pick`, deste kabul `confirm` / ret `cancel`; programatik karar sessiz; kök düğme yedeği yinelenmez                                                                                                                       | Geçti (birim)        |
| axe                         | `cards` sekmesi + seviye atlama, hata bildirimli seviye atlama, dükkan katmanları: ihlal 0, yeni kayıt yok                                                                                                                                                | Geçti                |
| Sahte dil +%30 / RTL / %200 | `pseudoLocale.spec.ts` (kart sekmesi dahil) ve matrisin ×2 geçişi                                                                                                                                                                                         | Geçti                |
| Piksel                      | `cards`, `aurum-cards` ve 6 kart katmanı (iki skin × seviye atlama/hata/dükkan)                                                                                                                                                                           | Yenilendi, incelendi |

Gerçek kusurlar (ölçüm bulduktan sonra düzeltildi): uçuş sırasında düğmenin `disabled` yapılması klavye/kol odağını her kararda kaybettiriyordu (jsdom yakalamaz, tarayıcı yakalar; artık `aria-disabled`); kapanış animasyonunda ikinci tıklama ikinci seçim üretiyordu; kesilen sürükleme (yakalama kaybı) sürüklemeyi takılı bırakıyordu; deste uçuş zamanlayıcısı (180 ms) CSS geçişinden (350 ms) kısaydı ve kartı yarı yolda siliyordu (240 ms ortak, `cssConstantSync` bağlar).

**NOT-RUN** (PASS sayılmaz): kullanıcının kart görsel/ses değerlendirmesi ve "referans ile özgün fark" insan incelemesi (UI-13.4); Steam Deck kol-only kart seçimi ve fiziksel düğmeler (F08); TalkBack/NVDA gerçek duyuru (UI-13.4/F09); WebKit piksel temeli (yalnız davranış/geometri iki motorda).

## Değer editörü kaydı (UI-05.1)

Ölçüldü (jsdom birim + Chromium/WebKit Playwright, vitrin `forms` sekmesi):

| Eksen                 | Kanıt                                                                                                                                                                                                                                                                   | Sonuç                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| IME bileşimi          | `Input`: `isComposing`/`keyCode 229` Enter'ı gönderme ve kalıcı değişiklik saymaz; bileşim bitince Enter çalışır. `TextArea` Enter satır sonudur, bileşimde Escape geri alma yok                                                                                        | Geçti (birim)            |
| İptalde geri alma     | `Input`/`TextArea`/`NumberStepper`: kaydedilmemiş taslakta ilk Escape son kalıcı değere döner (önizleme geri bildirilir, kalıcı değişiklik yok, olay yayılmaz → katmanı kapatan ikinci Escape'tir); `Slider` sürükleme sürerken devre dışı kalırsa önizleme geri alınır | Geçti (birim)            |
| Geçersiz sayı         | `NumberStepper`: boş/sayı olmayan metin sessizce `0`a/en küçüğe düşmez, son geçerli değere döner; yazılan değer aralığa sığar ve `min + n·step` ızgarasına oturur, kayan nokta artığı yok                                                                               | Geçti (birim, iki motor) |
| readOnly / invalid    | Beş editörde `readOnly` (yerel özellik ya da `aria-readonly`; değer, niyet ve geri çağrım yok; düğmeler kilitli), `invalid` → `aria-invalid`, `ariaLabel`; disabled/readOnly birbirini açmaz                                                                            | Geçti (birim)            |
| Erişilebilir ad/değer | `RangeSlider` tutamak adları dilden (`core:rangeSlider.*`, sabit Türkçe metin kaldırıldı), dil değişiminde yenilenir; biçimlenmiş `aria-valuetext`; `aria-disabled`; PageUp/PageDown büyük adım. Dikey `Slider` `aria-orientation=vertical`                             | Geçti                    |
| Hit-test ve geometri  | `valueEditors.spec.ts`: saydam yerel girdi çubuğu kaplar, çubuğun ortasında en üstteki eleman girdidir; tıklanan yerde görünür tutamak (≤%8 sapma) — yatay LTR/RTL ve dikey                                                                                             | Geçti (iki motor)        |
| Niyet ve ses          | Düğme adımı `valuePreview` (değer perdesi tick) + `valueCommit`; yazılan değerde önizleme `input`ta; `TextArea` yazma/commit niyeti; sayı girdisi perdeyi aralıktan alır (`data-vol-pitch-*`); programatik atama ve geçersiz yazı sessiz                                | Geçti (birim)            |

Gerçek kusurlar (ölçüm bulduktan sonra düzeltildi): RTL'de yatay `Slider`'ın yerel girdisi aynalanıyor, çizilen tutamak/dolgu aynalanmıyordu — %25'e tıklayınca tutamak %77'ye atlıyordu (jsdom yakalamaz; kaydırıcı artık fiziksel, `direction: ltr`); `RangeSlider` tutamak adları sabit Türkçeydi; `NumberStepper` boş alanı `0`a çeviriyordu; `Input` IME onay Enter'ında `onEnter`/commit çağırıyordu; sürüklenirken devre dışı kalan `Slider` önizlemede takılı kalıyordu.

**NOT-RUN** (PASS sayılmaz): gerçek IME (Android klavye/Windows IME/Deck sanal klavye) ile bileşim ve ekran okuyucu duyurusu (UI-13.4/F09); yeni `readOnly`/`invalid` durumlarının piksel temeli (UI-05.5 durum matrisi ile).

## Seçim ve eğri denetimleri kaydı (UI-05.2)

Ölçüldü (jsdom birim + Chromium/WebKit Playwright, vitrin `forms` sekmesi; piksel temeli Chromium/win32):

| Eksen                   | Kanıt                                                                                                                                                                                                                                                                                                                                                      | Sonuç                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Select                  | Seçenek `disabled` (seçilemez, ok/Home/End/harf gezinmesi atlar), boş liste "Seçenek yok" satırı, `invalid`; aynı değer/açıkken devre dışı önceki işlerle                                                                                                                                                                                                  | Geçti (birim)            |
| Checkbox / switch       | Karar: çizim ikisinde de iz+başparmak; anlam `variant` ile — `checkbox` (seçim/onay, varsayılan), `switch` (anında etkili ayar, `role=switch`); adsız denetim `ariaLabel`                                                                                                                                                                                  | Geçti (birim)            |
| ColorPicker             | Hazır renk yokken kutucuk `inert` (etkin ama işlevsiz düğme Tab/AT'ye girmez); yarım hex `aria-invalid`; taslakta Escape geri alır ve katmanı kapatmaz; hex kalıcı değişikliği `valueCommit` niyeti                                                                                                                                                        | Geçti (birim)            |
| CurveEditor eşdeğerleri | Her nokta adlı gerçek düğme (`Nokta i / N: X, Y`), tuval `aria-hidden`; ok = taşı (Shift ×10, komşuyu/alanı geçmez), Delete = sil, Enter/A = tut/bırak (tutulu noktada oklar FocusNav'dan alınır), Escape geri alır; "Nokta ekle"/"Noktayı sil" düğmeleri; canlı bölge duyurusu; dokunmada geniş yakalama (24 px); ikinci işaretçi devralmaz; iptal sessiz | Geçti (birim, iki motor) |
| Bileşik denetim oku     | `data-vol-arrows` sözleşmesi: odaktaki denetim D-pad yönünü klavye olayı olarak alır (tüketirse gezinme olmaz); `RangeSlider` tutamağı yalnız yatay eksen — dikey D-pad çıkış yoludur; sentetik olay özyinelemez                                                                                                                                           | Geçti (birim)            |
| Piksel, axe, düzen      | `forms` + aurum + 6 kart katmanı temelleri yenilendi ve incelendi; axe/sahte dil/düzen/okunabilirlik/kontrast iki motorda geçti                                                                                                                                                                                                                            | Yenilendi, geçti         |

Gerçek kusurlar (ölçüm bulduktan sonra düzeltildi): `CurveEditor` yalnız çift tık/Alt+tıkla eklenip siliniyor ve klavye/kol/AT için hiçbir erişimi yoktu (dokunma ve D-pad ile eklemek/silmek/taşımak imkânsızdı); noktaları 10 px yarıçapla yakalıyordu (dokunmada 24 px); ikinci parmak sürüklemeyi devralıp başlangıç görüntüsünü eziyordu; çizim renkleri sabit ve skini izlemiyordu; kol D-pad'i `RangeSlider` tutamağını ayarlayamıyordu (yalnız yerel `range` girdisi ayarlanıyordu); `ColorPicker` kutucuğu işlevsiz ama etkin bir düğmeydi.

**NOT-RUN** (PASS sayılmaz): Steam Deck kolu ile tutma/taşıma/bırakma el hissi (F08); gerçek ekran okuyucu ile nokta/duyuru (UI-13.4/F09); çizimin skin değişince yeniden boyanması (tuval yalnız nokta değişiminde çizilir; UI-05.5 durum matrisi).

## Panel ve yerleşim kaydı (UI-05.3)

Ölçüldü (jsdom birim + Chromium/WebKit Playwright; vitrin `scroll`, `advanced`, `panels`, `forms` sekmeleri):

| Eksen                 | Kanıt                                                                                                                                                                                                           | Sonuç                    |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Yön sözleşmesi        | `direction.ts`: en yakın `dir` kazanır; okuma yönünü izleyen yapılarda sağ ok RTL’de geri gider (Tabs, Toolbar, SegmentedControl, Tree, Carousel, SlotGrid, Kanban); fiziksel denetimler aynalanmaz             | Geçti (birim, iki motor) |
| Carousel RTL          | Aktif slayt görünür alanın içinde, ileri/geri ok okuma yönünde, sol düğme “Sonraki”, kenar kilidi okuma yönüyle yer değiştirir; yön öğe eklenince okunur (yapıcıda kopuktur)                                    | Geçti (iki motor)        |
| Sekme çubuğu          | Yatay (dar) çubukta ok okuma yönünde, dikey (geniş) çubukta yukarı/aşağı yönden bağımsız; gizli panel `inert`                                                                                                   | Geçti (iki motor)        |
| Tree kapalı dal       | Kapalı dal `inert` + `visibility: hidden`; kapanan dalın odak/sekme durağı sahibi satıra taşınır; 393 px geometri kapısı kayıtsız geçer                                                                         | Geçti (birim, iki motor) |
| Accordion             | Tekli kipte birden çok `defaultOpen` yalnız ilk geçerli bölümü açar; bilinmeyen kimlik yok sayılır; çoklu kipte hepsi açılır                                                                                    | Geçti (birim)            |
| Odak örtülmez         | Modal, sheet ve ekran klavyesi içinde Tab ile gezilen her denetim görünür pencerede ve merkez noktasında kendisi vardır (1280×800, 360×740, 320×568); ekran klavyesi Tab’ı döndürür, arkadaki sayfaya sızdırmaz | Geçti (iki motor)        |
| Soluk metin kontrastı | `uiTextMuted` en açık yüzeyde (seçili dolgu) 3,72 → 4,71:1; üç bilinen kontrast kaydı silindi; `finalContrast.spec` piksel ölçümü iki motorda geçti                                                             | Geçti                    |

Gerçek kusurlar (ölçüm bulduktan sonra düzeltildi): RTL’de Carousel ikinci sayfası ekran dışında kalıyor ve “Sonraki” düğmesi ilk sayfada kilitli görünüyordu; kapalı Tree dalı satırları 98×0 px çizili kalıp AT ağacında ve Tab’da açıktı, kapanan dalın içindeki gezici sekme durağı ağacı klavyeden erişilmez bırakabiliyordu; `aria-modal` olan ekran klavyesi Tab’ı arkadaki sayfaya sızdırıyordu; soluk metin üç yüzeyde 4,5:1 altındaydı.

**NOT-RUN** (PASS sayılmaz): gerçek ekran okuyucu ile slayt/ağaç/sekme duyurusu (UI-13.4/F09); Android’de %200 yazı ölçeği (UI-07.3 cihaz ölçümü).

## Ayar formu kaydı (UI-05.4)

Ölçüldü (jsdom birim + Chromium/WebKit Playwright, vitrin `forms` sekmesi; piksel temeli Chromium/win32):

| Eksen                  | Kanıt                                                                                                                                                                                                                               | Sonuç                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Model                  | Taslak/kayıtlı ayrımı; kayıtlı değere dönmek kirliği kaldırır; geçersiz alan hiçbir kapsama yazılmaz; bozuk/uyumsuz/geçersiz kayıt varsayılana iner                                                                                 | Geçti (birim)            |
| Atomik kalıcılık       | Kapsam başına tek yazım (belge kapsamın bütün alanlarını ve bilinmeyen alanları taşır); bir kapsam başarısızsa yalnız o kapsamın taslağı kirli kalır, yeniden deneme tamamlar                                                       | Geçti (birim)            |
| Meşgul / tekrar commit | Kaydedilirken ikinci uygulama `busy` döner ve ikinci yazım olmaz; form `aria-busy`; yazım sürerken yapılan düzenleme kirli kalır                                                                                                    | Geçti (birim, iki motor) |
| Kapanış kararı         | Kirli yokken karar sorulmaz; `stay`/`discard`/`apply` tüketicidedir, `apply` yalnız başarıda kapatır, kaydedilirken kapanma yok                                                                                                     | Geçti (birim)            |
| Form sunumu            | Eylem çubuğu sonda; temizken Uygula/Geri al kapalı; sayaç/Kaydediliyor/Kaydedildi/hata `role=status`; satırda `role=alert` hata + `aria-invalid`; "Varsayılan" yalnız sapmada; yeniden yüklemede kalıcılık; klavyeyle Enter uygular | Geçti (iki motor)        |
| Ses satırları          | Beş seviye + sessize alma (`switch`) ses sistemine canlı yazar; ad satır etiketine bağlı; `refresh` sessiz                                                                                                                          | Geçti (birim, iki motor) |
| Piksel, axe, düzen     | `forms` + aurum temelleri yenilendi ve incelendi; axe/sahte dil/düzen/okunabilirlik/kontrast iki motorda geçti (228 test)                                                                                                           | Yenilendi, geçti         |

Gerçek kusur (ölçüm bulduktan sonra düzeltildi): ayar satırında etiketsiz kaydırıcı `max-content` denetim sütununda tutamağa çöküyor ve değer yazmıyordu; eylem düğmeleri tam genişlikte alt alta diziliyordu.

**NOT-RUN** (PASS sayılmaz): gerçek ekran okuyucu ile durum duyurusu (UI-13.4/F09); Tauri diskte gerçek yazım hatası ve `synced` kapsamın Steam Cloud'a gitmesi (F08/F09, native); Deck kol ile satır gezintisi (F08).

## Form kabul kaydı (UI-05.5)

Ölçüldü (Chromium + WebKit Playwright, vitrin `forms` sekmesi; sanal standart kol `navigator.getGamepads` ile sürülür; piksel temeli Chromium/win32):

| Eksen               | Kanıt                                                                                                                                                                           | Sonuç                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Yalnız klavye       | Tab ile panelin bütün denetimleri tekrarsız sırayla gezilir; her durak görünür pencerede, üstü örtülmemiş ve odak göstergeli                                                    | Geçti (iki motor)         |
| Yalnız kol          | Her denetimden dört yönde gerçek kol basışı: her denetime ulaşılır, ilk denetime dönülür (ölü uç yok), halka tek ve görünür; A onay kutusunu değiştirir, seçimi açar, B kapatır | Geçti (iki motor)         |
| Dokunma             | Onay kutusu, bölümlü denetim, artır düğmesi, kaydırıcı ve seçim parmak dokunuşuyla çalışır (393 px, dokunmatik bağlam)                                                          | Geçti (iki motor)         |
| Altı hane           | 999 999 adım girdisi, kaydırıcı değeri ve 100 000–999 999 aralığı 1280/360/320 px'te kırpılmaz, karttan taşmaz                                                                  | Geçti (iki motor)         |
| %30 uzun metin      | `?lang=pseudo` taraması her sekmede (forms dahil) kırpılma/taşma bulmaz                                                                                                         | Geçti (mevcut, iki motor) |
| Durum, axe, örtüşme | `stateMatrix`, `accessibility`, `focusVisible` forms/katman taramaları                                                                                                          | Geçti (mevcut, iki motor) |
| Piksel              | `forms` + aurum temelleri yenilendi ve incelendi (yeni kart, genişleyen adım girdisi)                                                                                           | Yenilendi, geçti          |

Gerçek kusur (ölçüm bulduktan sonra düzeltildi): NumberStepper girdisi 56 px sabit genişlikteydi; 6 haneli değer 84 px içerik üretip 54 px görünür alana sığmıyordu. Genişlik artık aralığın en geniş yazımından gelir (`--vol-stepper-chars`), küçük aralıklarda eski genişlik korunur.

**NOT-RUN** (PASS sayılmaz): gerçek Steam Deck kolunda gezinti hissi ve halka okunurluğu (F08); gerçek ekran okuyucuyla form duyuruları (UI-13.4/F09); isteğe bağlı kullanıcı değerlendirmesi (UI-13.4).

## Platform bağı kaydı (UI-06.3)

Ölçüldü: jsdom birim, Chromium/WebKit Playwright (web yedeği) ve **Windows yerel WebView2** (`native-platform-tour.mjs`, CDP; debug derleme, Windows 11, 1536×864 kullanılabilir alan):

| Eksen           | Kanıt                                                                                                                                                                          | Sonuç                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| Kabuk ve oturum | Kök `data-vol-platform=desktop`, `data-vol-session=desktop`; ayar kartı gerçek özeti yazar; oturum satırı seçilemez; dört satır sunulur                                        | Geçti (yerel)        |
| Gerçek pencere  | Başlık düğmesi native pencereyi tam ekran yapar (`window_fullscreen_state`), `aria-pressed` ve ayar satırı yansıtır; ikinci basış pencereli kipe döner                         | Geçti (yerel)        |
| Kalıcılık       | Tercih diske yazılır (`volui-device.json`); `TerminateProcess` sonrası yeniden açılışta tercih geri gelir ve pencere tam ekran açılır                                          | Geçti (yerel)        |
| Temiz çıkış     | `WM_CLOSE` sonrası süreç 0 koduyla çıkar; kullanıcı verisi tur öncesi yedeklenir, sonra geri konur                                                                             | Geçti (yerel)        |
| İzin kusuru     | İlk koşuda `window.center not allowed` (izin hiçbir uygulamada yoktu) → izin eklendi, yeniden koşuda uyarı yok; kapı `validateWindowPermissions` eksik izni derlemeden yakalar | Düzeltildi, geçti    |
| Web yedeği      | `pnpm dev`/tarayıcı: web oturumu, localStorage, native pencere yok, simülasyon seçici; `displaySettings` (iki motor)                                                           | Geçti (iki motor)    |
| Yaşam döngüsü   | Dil değişiminde tercih aboneliği sayısı sabit, `destroy` sonrası sıfır ve pencere denetleyicisi bir kez sökülür; Android gözlemcileri bir kez kurulur ve sökülür               | Geçti (birim)        |
| Eklenti yüzeyi  | Android yeteneği/Rust kaydı/bağımlılık yalnız JS tüketicisi olan `vol-haptics`; tüketicisiz yön eklentisi çıkarıldı                                                            | Geçti (birim + kapı) |

**NOT-RUN** (PASS sayılmaz): Deck gamescope oturumunda pencere satırlarının gizlenmesi ve Linux titreşim gözlemcisi (Deck oturumu, UI-06.4/F08); Android APK'da titreşim sürücüsü (UI-12.3/F09.2); 1920×1080 çözünürlük uygulaması (bu ekran 1536×864, tur satırı NOT-RUN yazar); `appearance: slider-vertical` WebView2 konsol uyarısı (WebKit için gerekli, Chromium'da yalnız uyarı; engelleyici değil).

## Windows yerel kare ve CPU kaydı (UI-06.4)

Araç: `devtools/vol-showcase/scripts/native-frame-probe.mjs <VOL.UI.exe> [--runs 2] [--idle-only]` — vitrinin kendi kare ölçerini (`Shift+B`, sekme başına 3 sn, 900 px/sn kaydırma) WebView2 içinde CDP ile sürer, uygulama + `msedgewebview2` süreç ağacının işlemci süresini okur; `--runs 2` A/A'dır, `--idle-only` boşta CPU'yu kime ait olduğuna ayırır. Çıktı vitrin paketinin git dışı records alanına yazılır.

Ortam: Windows 11 (10.0.26300), WebView2 `Edg/154`, pencere 1280×800 CSS px, DPR 1,25, 8 mantıksal çekirdek, **debug derleme** (`VOL.UI.exe`, yerel `tauri build --debug`), uzak hata ayıklama bağlı, 60 Hz panel (kare süresi vsync tavanındadır).

| Ölçüm                          | Koşu 1 (düzeltme öncesi) | Koşu 2 (düzeltme öncesi) | Koşu 1 (son derleme) | Koşu 2 (son derleme) | A/A farkı |
| ------------------------------ | ------------------------ | ------------------------ | -------------------- | -------------------- | --------- |
| Medyan sekme FPS (14 sekme)    | 60,0                     | 60,0                     | 60,0                 | 60,0                 | 0         |
| En düşük sekme FPS             | 59,7 (`cards`)           | 59,7 (`cards`)           | 59,7 (`cards`)       | 59,7 (`cards`)       | 0         |
| Ölçüm sırasında CPU (çekirdek) | 0,58                     | 0,58                     | 0,55                 | 0,54                 | 0,00–0,01 |
| Boşta CPU (sn / 5 sn)          | 1,36                     | 1,30                     | 1,47                 | 0,92                 | **±0,3**  |

13 sekme 60,0 FPS'te (p95 16,9–17,3 ms, en kötü kare 17,4–18,0 ms, yavaş kare 0). `cards` sekmesi dört koşuda da tek bir 33 ms kare gösterir (yavaş pay %0,56, p95 17 ms) — tekrarlanabilir, tek kare; kök neden incelenmedi. Hiçbir sekme 50 FPS altına inmedi, kare ölçerin kart kart ayrıştırması hiç tetiklenmedi.

**Boşta CPU kime ait** (`--idle-only`, süreç ağacı CPU sn / 5 sn; A: olduğu gibi, B: rAF döngüleri öldürülmüş, C: ayrıca CSS animasyonları durdurulmuş):

| Derleme                  | A           | B           | C           |
| ------------------------ | ----------- | ----------- | ----------- |
| Düzeltme öncesi (2 koşu) | 1,20 / 1,33 | 0,94 / 0,78 | 0,23 / 0,28 |
| Son derleme (2 koşu)     | 0,92 / 1,38 | 0,78 / 0,91 | 0,28 / 0,16 |

Okuma: boştaki işin ≈%80'i **ekranda görünen sonsuz CSS animasyonudur** (Düğmeler sekmesindeki yükleme döndürücüsü); animasyon durunca 1,0–1,3 → 0,2–0,3. Bu, platformun görünür animasyon bedelidir (60 Hz kare üretimi), kusur değil; Deck'te ayrıca ölçülecek. rAF gövdeleri payı gürültüyle iç içedir (0,1–0,5 sn). **A/A boşta CPU gürültüsü ±0,3 sn/5 sn'dir: bu tabanın altındaki farklar (ör. aşağıdaki JS düzeltmeleri) native CPU'dan değil CPU profilinden gösterilir.**

**CPU profili** (Chromium + Vite geliştirme, 5 sn boşta, `Profiler` 100 µs): ana iş parçacığı %91 boş; tek anlamlı JS maliyeti `querySelectorAll` **162 ms / 5 sn** (≈0,5 ms/kare; Deck/telefonda kat kat): `InputPresentationController.poll` her karede (oyunda `Hud.ts` her HUD karesinde) belgeyi `[data-vol-input-glyph]` için tarıyor, `GamepadPointerController` kol yokken bile her karede modal arıyordu. Düzeltme sonrası aynı profilde `querySelectorAll` <2 ms, boşta %95; native ölçüm CPU'su 0,58 → 0,55 çekirdek (A/A 0,01). Bulunan ve kapanan: `InputPresentationController` glifleri yalnız sunum girdisi (kip, kol, bağlam) değişince ya da 30 çağrıda bir tarar; `GamepadPointerController` modali yalnız standart bir kol bağlıyken arar; kapalı bir `DialogueBox`'ın saydam devam okunun sonsuz zıplaması yalnız görünürken oynar (`idleCost.spec.ts` görünmez sonsuz animasyonu 14 sekmede iki motorda tarar). Kapanmayan: boşta 8 rAF döngüsü (FocusNav kol yoklaması, InputPresentation, GamepadPointer, 3 TimerBar, FpsMeter, kol demosu) — gizli sekmelerdeki demoların döngüsü vitrine özgüdür, JS maliyetleri profilde <8 ms/5 sn.

**NOT-RUN** (PASS sayılmaz): release derleme ölçümü ve NSIS yükleyicisi (UI-12.4); DPI 125/150/200 ölçekli koşular (bu makine tek DPR 1,25); Deck/Android cihaz ölçümleri aşağıdaki kayıtlarda ve UI-13.3'te.

## Çoğul, yerel harf kuralı ve boşta maliyet kaydı (UI-07.2 / UI-06.4)

| Eksen                   | Kanıt                                                                                                                                                                                                                                                                                                         | Sonuç                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Çoğul sözleşmesi        | Sayıya bağlı cümle `anahtar_one`/`anahtar_other`; çeviri kapısı grubu tek anahtar sayar, her dilin `Intl.PluralRules` kategorilerini ve elle çoğul çiftini (`xOne`/`xMany`) denetler (`i18nSurface.test.mjs`, 9 yeni test)                                                                                    | Geçti (birim + kapı) |
| 0 / 1 / çok, 6 hane     | `plurals.test.ts`: TR ve EN, "1 marker / 2 markers", `123.456` / `123,456`; ayar formu ve mini harita bileşen düzeyinde (`settingsModel.test.ts`, `minimapPanel.test.ts`)                                                                                                                                     | Geçti (birim)        |
| Türkçe ı / İ            | `Select` harfle gezinme arayüz diliyle küçültür; sistem yerelinde `'I'.toLocaleLowerCase()` `i` verir, `'tr'` ile `ı` (bu makinede doğrulandı). Test düzeltme olmadan KIRILIR                                                                                                                                 | Düzeltildi, geçti    |
| Boşta animasyon         | `idleCost.spec.ts` (iki motor, 14 sekme): görünmeyen sonsuz animasyon yok; tarama animasyon GÖRDÜĞÜNÜ ve saydam öğedeki animasyonu yakaladığını ayrıca kanıtlar. Eski CSS ile KIRILIR (`vol-dialogue-bounce`)                                                                                                 | Düzeltildi, geçti    |
| Boşta JS taraması       | `InputPresentationController` glifleri yalnız sunum girdisi değişince tarar, `GamepadPointerController` kol yokken modal aramaz; her ikisinin testi düzeltme olmadan KIRILIR; CPU profilinde `querySelectorAll` 162 ms → <2 ms                                                                                | Düzeltildi, geçti    |
| Tarih / birim / yüzde   | `formats.test.ts` (i18next `datetime`, `number(unit)`, `number(percent)`; beklenen açık dil koduyla `Intl`den, iki dil farklı) ve `localeFormats.spec.ts` (iki motor, tr-TR/en-US yerel; olay günlüğü saati, commit anı, Zoom yüzdesi, saniye birimi). İngilizce saat testi eski elle 24 saat koduyla KIRILIR | Düzeltildi, geçti    |
| %200 yakınlaştırma      | `pseudoLocale.spec.ts` 640×400 görünüm (1280×800 pencerenin %200'ü): 14 sekme × LTR/RTL ve altı açık katman, iki motor; kırpılma/taşma yok                                                                                                                                                                    | Geçti (iki motor)    |
| RTL açılır pencere yönü | `popupDirection.test.ts` (düzeltme olmadan 1 test KIRILIR) ve `inlineDirection.spec.ts` Select + Popover (ColorPicker/ContextMenu aynı `Popup`u kullanır), iki motor × LTR/RTL: başlangıç kenarı tetikleyiciyle aynı hizada, görünür alandan taşmaz                                                           | Düzeltildi, geçti    |

Bu dilimde ELDEN DÜŞEN iki doğrulama hatası kayda geçer: (1) `openShowcase` animasyonları kapatır (`STILL_CSS`); boşta animasyon taraması ilk yazımda bu yüzden boşuna geçiyordu, düzenek testi yakaladı ve tarama dondurulmamış sayfaya taşındı; (2) kapalı diyalog okunun düzeltmesi boşta CPU'yu ölçülebilir azaltmadı (görünür yükleme döndürücüsü zaten 60 Hz kare üretir) — düzeltme doğruluk/hijyen düzeltmesi olarak kaldı, tasarruf iddia edilmez.

**NOT-RUN** (PASS sayılmaz): gerçek çeviriyle uzunluk (TR/EN dışında çeviri yok; %30 sahte dil gerçek çeviri iddiası taşımaz) — UI-07.2 bu kalemi üçüncü dil getiren ilk ürüne (F09.4 VT7) devreder.

## Yazı tipi boyutu ve yedek kaydı (UI-07.3)

| Eksen                                            | Kanıt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Sonuç                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Boyut / alt küme kararı                          | fonttools ölçümü (Latin + Latin-Ext + Türkçe alt kümesi): TTF 865 KB → WOFF2 295 KB (−%66) → alt kümeli WOFF2 144 KB (−%83). Karar: **alt kümeleme ve WOFF2 yok** — hedefler (Tauri, Android) varlığı yerel ve sıkıştırılmış paketler, alt küme Kiril/Yunan/Vietnam kapsamını sessizce düşürür. `fontCoverage.test.mjs` bütçesi: toplam ≤ 900 KB, dosya başına ≤ 320 KB                                                                                                                                                                          | Geçti (birim)                                                                 |
| Glif kapsamı                                     | Gönderilen her yazı tipi Türkçe harfleri, rakamları ve ₺ € $ taşır; ok/üçgen glifleri (→ ← ↑ ↓ ▸ ▾ ▲ ▼) yazı tiplerinde YOKTUR, bu yüzden yerel metinde kullanılamaz; yerel dosyalardaki her karakter gönderilen bir yazı tipinde vardır (sistem yedeğine düşmez); Exo 2 Kiril, Jura Yunan harfi taşır; denetimin sahte dosyada bulgu verdiği ayrıca sınanır                                                                                                                                                                                     | Geçti (birim)                                                                 |
| Yavaş yazı tipi                                  | `fontLoad.spec.ts`: yazı tipi istekleri 1,2 sn geciktirilir; kök kurulurken tüm yazı tipi yüzleri `loaded`; 800 ms sonra 15 sekmenin panel yükseklikleri BİREBİR aynı; Chromium'da toplam CLS tam 0 (WebKit `layout-shift` sunmaz, orada kanıt kök kurulumundaki yüz durumudur)                                                                                                                                                                                                                                                                  | Geçti (iki motor)                                                             |
| Yazı tipi yüklenemez                             | İstekler iptal: "Font yüklenemedi" uyarısı yazılır, başarısız yüz `document.fonts` içinde kalmaz, 15 sekmede 1280×800 taşma/kırpılma taraması (`devtools/vol-showcase/tests/e2e/support/textFit.ts`) bulgusuz, 500 ms sonra yükseklikler aynı                                                                                                                                                                                                                                                                                                    | Geçti (iki motor)                                                             |
| Yedek / yüklü yükseklik farkı                    | Tarayıcıda eşik %10 (`fontLoad.spec.ts`), cihazda %15 (`tablet.spec.ts`). Ölçülen: tarayıcıda 15 sekme, iki motorda aynı, en fazla −%3,8 (`ses`), çoğu −%0,4…−%1,2; Lenovo (15 sekme) dikeyde en fazla −%1,6 (`cards`), yatayda −%3,5 (`theme`). Yedek yazı tipi hep biraz KISA                                                                                                                                                                                                                                                                  | Geçti (tarayıcı + Lenovo)                                                     |
| Cihaz yazı ölçeği taraması                       | Lenovo TB350FU (Android 14, Chrome): `device-ui.mjs --font-scale 2.0 --orientation both` — 14 sekmede taşma/kırpılma bulgusu 0 (dikey 856×1317, yatay 1427×747 CSS px, DPR 1,40); ölçek 1,0 dikey koşusu da 0. **Bu koşu %200 kanıtı DEĞİLDİR:** Chrome sistem `font_scale`ini CSS px'e uygulamadı (düğme 44 px, yazı 16 px, kök 16 px — ölçek 2,0'da da aynı)                                                                                                                                                                                   | Koştu; %200 kanıtı değil                                                      |
| Çizilmiş glif yüksekliği                         | `readability.spec.ts` (iki motor, 1280×800): büyük harf mürekkep yüksekliği ölçülür (`actualBoundingBoxAscent`): Jura 12 px = 8, 13 px = 9, 14 px = 9–10 ekran px; Exo 2 12 px = 9. `geometryExceptions.json`daki üç bilinen kusur (Jura 12 px w400/w600, WebKit genel `monospace` 14 px) kapandı: Jura'lı `micro`/`label` rolleri 12 → 13 px, tek aralıklı yazı açık yığınla (`--vol-font-family-mono`: Cascadia Mono, Consolas, DejaVu Sans Mono, Liberation Mono). `glyphHeights` kayıt listesi BOŞ; kayıtsız ya da bayat kayıt testi düşürür | Düzeltildi, geçti (iki motor)                                                 |
| Deck glif yüksekliği (düzeltme ÖNCESİ derleme)   | Deck ekran görüntüsünden büyük harf mürekkep yüksekliği (7 inç / 1280×800 varsayımıyla ≈216 ppi, 1 px ≈ 0,118 mm): gövde Exo 2 16 px **11 px = 1,30 mm**; soluk gövde 10 px = 1,18 mm; başlık Jura 17 px = 2,00 mm; büyük başlık 44 px = 5,18 mm; gezinme etiketi Jura 9 px = 1,06 mm; kart başlığı etiketi 8 px = 0,94 mm                                                                                                                                                                                                                       | **Ölçüldü**; okunabilirlik kabulü insan                                       |
| Deck glif yüksekliği (düzeltme SONRASI, SLR4 #4) | Aynı yöntem ve aynı konumlar (`devtools/deck/records/2026-10-10/shot-slr4d-open-*`): kart başlığı etiketi Jura 13 px **9 px = 1,06 mm** (önce 8 px); gezinme etiketi 9 px = 1,06 mm; gövde Exo 2 16 px 11 px = 1,30 mm (değişmedi). Kare ölçeri (`Shift+B`) aynı derlemede 15 sekme, ortanca **59,8 FPS**, en düşük FORMS 58,4 (13 px etiket performansı bozmadı)                                                                                                                                                                                | **Ölçüldü**; Valve alt sınırına (≥ 9 px) ulaşıldı; okunabilirlik kabulü insan |

Bulunan ve düzeltilen gerçek kusur: Jura 12 px etiketlerin büyük harf yüksekliği **8 ekran px**'ti (Valve alt sınırı 9); Deck'te kart başlığı etiketi 0,94 mm (8 px) ölçüldü. Bu, `geometryExceptions.json`da UI-07.3'e bağlı bilinen kusurdu; `font-size ≥ 12` tek başına alt sınırı garanti etmez (Jura'nın büyük harf oranı 0,633, Exo 2'ninki 0,69). Düzeltme tipografi tokenıdır: `--vol-text-micro` ve `--vol-text-label` 13 px (Jura'lı sabit 12 px kurallar tokena bağlandı, `SkillTree` ölçüm sabiti `NODE_LABEL_FONT` 13 px'e eşlendi). Etkisi: tüm sekmelerde etiket 1 px büyür, sayfa 3–65 px uzar (en çok Palet), 42 Chromium/win32 görsel taban çizgisi bilerek yeniden üretildi, Tema sekmesi için 1 yeni eklendi (fark yalnız etiket boyutu ve yükseklik; sayısal tarama ve örnek görüntü incelemesi: yer değiştirme yok, genişlik aynı). Linux taban çizgileri bu makinede üretilemez ve bu dilimde yenilenmedi. Düzeltmelerden sonra tam e2e (iki motor, `node scripts/e2e.mjs`): 345 geçti, 15 motora özgü atlama, 0 başarısız; `pnpm quick` yeşil, core ve vitrin vitest yeşil.

Karar (kusur değil): palet kartındaki token adı artık kırpılıp üç nokta konmaz, dar sütunda satır kırar (`overflow-wrap: anywhere`); dokunmatikte `title` yoktur, adı okuyamayan kullanıcı teknik etiketi öğrenemez.

**NOT-RUN** (PASS sayılmaz): Android'de **gerçek %200 yazı/WebView ölçeği** — yukarıdaki sistem `font_scale` koşusu CSS px'i ölçeklemediği için kanıt sayılmaz; APK içindeki WebView ile koşu UI-11.3'e ve F09.2'ye bağlıdır (masaüstündeki %200 kanıtı UI-07.2 `pseudoLocale.spec.ts` 640×400 görünümüdür). Samsung SM-G990B2 yazı ölçeği koşusu. Deck glif yüksekliğinin ve yazı tipi okunabilirliğinin **insan kabulü** UI-13.4'tedir; piksel ölçümü kabul yerine geçmez.

## Tema laboratuvarı ve skin × yoğunluk kaydı (UI-07.4)

Vitrinde **Tema** sekmesi (`devtools/vol-showcase/src/sections/themeTab.ts`): küresel seçiciler (skin, yoğunluk, dil) tek `ThemeController`a ve i18next'e bağlıdır; durum satırı seçimi, oturum satırı platformu, oturum sınıfını ve tam ekran kontrolünün gerçek karşılığını söyler. Üç önizleme kapsamı: küreseli izleyen, kendi denetleyicili A (aurum) ve B (çelik). Kapsamdaki `Select` listesi `container` ile kutuya bağlanır ve kutunun kaplamasını giyer.

| Eksen                    | Kanıt                                                                                                                                                                                                                                                                                      | Sonuç             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| Geçiş anlık, durum sabit | `themeLab.spec.ts`: skin ok tuşuyla değişir, renk tokenı aynı çerçevede döner, odak aynı skin düğmesinin kardeşine geçer; sekme düğümü, yazılan metin, seçim aralığı aynı kalır; skin'de kaydırma BİREBİR aynı; yoğunlukta odak seçicide kalır, kaydırma sıfırlanmaz ve en çok 60 px kayar | Geçti (iki motor) |
| Seçim kalıcı             | Yoğunluk ve skin yeniden yüklemede korunur; üst çubuk skin düğmesi seçicilere ve durum satırına yansır                                                                                                                                                                                     | Geçti (iki motor) |
| Kapsam yalıtımı          | A aurum, B çelik, küresel kutu köke uyar; küresel skin değişince B değişmez; B'nin kendi seçicisi yalnız B'yi çevirir                                                                                                                                                                      | Geçti (iki motor) |
| Katman kaplaması         | Kapsamdaki `Select` listesi kutunun kaplamasını giyer, tetikleyicinin hemen altında açılır (yatay ≤ 8 px, dikey ≤ 12 px sapma; `position: fixed` kaymaz); küresel kutunun listesi `<body>`ye iner ve küresel kaplamayı giyer                                                               | Geçti (iki motor) |
| Canvas sabit renkleri    | `CurveEditor` ve `MinimapPanel` kaplamayı `watchTheme` ile izler: A ile B aynı veriyi farklı piksellerle çizer; B aurum olunca A ile piksel piksel aynı olur; küresel kutu üst çubuk düğmesiyle yeniden çizilir                                                                            | Geçti (iki motor) |
| Palette bayatlamaz       | Skin değişince token değeri yazısı ve renk çipi güncel değere döner (çip `var(--token)`, yazı `watchTheme`)                                                                                                                                                                                | Geçti (iki motor) |
| Dil değişimi             | Sekme, kaydırma (±2 px) ve odak (yeni DOM'da aynı sıradaki, seçili dil radyosu) korunur                                                                                                                                                                                                    | Geçti (iki motor) |
| Oturum bilgisi           | Tarayıcıda `web · web · fullscreen: browser`; Fullscreen API yoksa "not offered"                                                                                                                                                                                                           | Geçti (iki motor) |
| Axe (WCAG 2.0–2.2 AA)    | `themeMatrix.spec.ts`: 2 skin × 3 yoğunluktan 5 kombinasyon (varsayılan + rahat `accessibility.spec.ts`te) × 15 sekme: ihlal 0, `incomplete` yalnız kayıtlı hesaplanamayan kontrastlar                                                                                                     | Geçti (Chromium)  |
| Odak göstergesi          | 5 kombinasyon × 3 sekme (düğmeler, formlar, tema) × 8 Tab adımı: görünür gösterge (≥ 2 px kontur ya da gölge ya da metin alanı; gizli onay/radyoda kardeş iz) ve örtülmez. Odak halkası iki skinde `bg`/`surface-1`/`surface-2` üstünde ≥ 3:1                                              | Geçti (iki motor) |
| Geometri                 | Skin değişince 15 sekmede her görünür kutu, font ve radyus BİREBİR aynı; yoğunluk değişince font ve radyus sabit, 100'den fazla kutunun konumu değişir (sınama boş geçmez). Kayan segment vurgusu seçimi izlediği için kapsam dışıdır                                                      | Geçti (iki motor) |
| Yerleşim kayması         | Skin geçişi 5 sekmede (düğmeler, formlar, tema, hud, kartlar; Chromium `layout-shift`): toplam < 0,0001; ölçülen tek kayma ≈ 6e-7, bir `::before` sözde öğesinde piksel altı yuvarlama                                                                                                     | Geçti (Chromium)  |

Bu dilimde bulunan ve düzeltilen çekirdek kusurları:

1. `CurveEditor` çizgi, ızgara ve nokta renklerini çizim anında token'dan okuyup bir daha bakmıyordu; kaplama değişince eski renkte kalıyordu. Ortak `watchTheme` (`core/src/ui/themes/themeWatch.ts`): kaplama değişimini, öğenin başka kapsama taşınmasını ve ilk bağlanmayı izler. `MinimapPanel`in kendi, çok daha uzun MutationObserver düzeneği aynı yardımcıya indirildi.
2. `SettingsRow` yalnız görünüm penceresi medya sorgusuyla (`≤ 400px`) yığılıyordu; pencere geniş olsa bile dar bir kapsayıcıda (kart, bölme, önizleme) etiket sütunu sıfıra sıkışıyordu. Additive `@container (width <= 400px)` kuralı eklendi (kapsayıcı yoksa eşleşmez). `container-type` yerleşim sınırlaması getirir, içindeki `position: fixed` katmanların konumunu değiştirir: katmanların bağlandığı elemana değil, ayrı bir sarmalayıcıya verilir.
3. `Select` yeni değer seçilince listeyi kapatıp odağı tetikleyiciye geri vermiyordu (odak gövdeye düşüyordu, WCAG 2.4.3). Odak listedeyken kapanışta tetikleyiciye döner; programatik (sessiz) ayar odağa dokunmaz. Test düzeltme olmadan KIRILIR.
4. `SegmentedControl` ok tuşunda önce değeri işleyip sonra odağı taşıyordu; değişimde arayüzü yeniden kuran tüketicide (dil seçimi) odak yeni segmente değil eskisine düşüyordu. Odak artık önce taşınır. Test düzeltme olmadan KIRILIR.
5. Palette sekmesi token değerini yalnız kurulumda okuyordu; skin değişince eski değeri gösteriyordu.
6. Dil değişimi kabuğu yeniden kurduğundan sekme içi kaydırma ve odak kaybolurdu; kabuk artık yeniden kurmadan önce kaydırma konumunu ve odak sırasını alıp sonra geri yükler.
7. **Açık katman altında sekme değişimi (Deck'te gözlendi):** Tema sekmesinde `Select` listesi A ile açıkken LB/RB sekmeyi değiştiriyor, tetikleyici gizlenen sekmeyle birlikte ölçüsüz kalıyor ve liste sayfanın sol üst köşesinde sahipsiz asılı kalıyordu. İki katmanlı düzeltme: (a) `ShowcaseApp.stepTab` geri yığınında açık katman varsa (`getBackHandlerCount() > 0`; Popup, Modal, CardPicker, OSK kayıt olur) omuz düğmelerini yutar, altındaki sekme değişmez; (b) `Popup` tetikleyicisini `ResizeObserver` ile izler ve tetikleyici belgeden kalkarsa ya da ölçüsü sıfırlanırsa (`getClientRects().length === 0`) sessizce kapanır, böylece başka bir yoldan gizlenen bir tetikleyici de sahipsiz liste bırakmaz. Kanıt: `core/tests/ui/overlays/popupTargetGone.test.ts` (4 test, düzeltme olmadan 3'ü KIRILIR) ve `devtools/vol-showcase/tests/e2e/gamepad.spec.ts` iki yeni test (açık liste ve açık iletişim kutusu varken RB sekmeyi değiştirmez, B kapatır, ardından RB yine çalışır; iki motor 20/20; `ShowcaseApp.ts` düzeltmesi geri alınınca 4 koşu KIRILIR). **Gerçek Deck'te doğrulandı** (SLR4 AppDir #4, gamescope, 1280×800; fareyle açılan Formlar sekmesi `Select` listesi + sanal kol): liste açıkken LB sekmeyi değiştirmedi (FORMS kaldı, liste tetikleyicisine bağlı yerinde), B listeyi kapattı, ardından RB sekmeyi ilerletti (WORKBENCH). Kayıt: `devtools/deck/records/2026-10-10/shot-sel-b-{1,2,3}-*` (git dışı). Bu tur LB/B/RB ile koşuldu: D-pad ile sekme listesinden `Select`e yürüyüş Deck'te tekrarlanabilir sonuç vermedi (her `virtual-pad.py` çağrısı yeni bir sanal kol açar; bazı D-pad basışlarının etkisi görülmedi, nedeni incelenmedi; aynı yürüyüş iki motorda yeşil). Bu yürüyüşün Deck'te fiziksel kolla kanıtı NOT-RUN (UI-13.4, F08.6).

**Bilinen sınırlar (kusur değil, belgeli):** (a) Yoğunluk boşluk ölçeğini değiştirir; WebKit'te kaydırma çapası olmadığı için görünen içerik birkaç on piksel kayar (konum sıfırlanmaz ya da atlamaz; Chromium çapayla sabit tutar). (b) Dil değişiminde vitrin sekme içerikleri yeniden kurulur: açık sekme, kaydırma ve odak korunur, **diğer sekmelere girilmiş metin/form durumu korunmaz**. (c) Dokunma sekmesindeki dünya kamerası tuvali sahne renklerini sabit kullanır — oyun dünyası resmidir, arayüz kaplaması değildir.

**Gerçek cihaz oturumları (2026-10-10, Tema sekmesi dahil 15 sekme):**

| Cihaz                                              | Koşu                                                                                                                                                                                                                                                         | Sonuç                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Steam Deck (LCD, gamescope, SLR4 AppDir, 1280×800) | Uygulama içi kare ölçeri: Tema sekmesi 60,0 FPS (15 sekme 57,8–60,6, ortanca 59,5). Ekran görüntüsü: Tema sekmesinin oturum satırı "desktop · gamescope · fullscreen: not offered"; üç kapsamın Curve Editor ve Minimap tuvalleri kendi kaplamasında çizilir | Ölçüldü + ekran görüntüsüyle incelendi                 |
| Lenovo TB350FU (Android 14, Chrome 154)            | `device-ui.mjs --orientation both`: dikey (856×1317) ve yatay (1427×747) 8/8 — her sekme çizilir (yazı ≥ 12 px, taşma yok, dokunma hedefleri ölçülür), OSK, katmanlar, ses zinciri, dokunma gecikmesi p95 34,4 / 28,0 ms (eşik 100), yedek yazı tipi         | Geçti; oturum satırı "web · web · tam ekran: tarayıcı" |
| Samsung SM-G990B2 (Android 16, Chrome 154)         | Aynı koşu: dikey (384×725) ve yatay (796×283, Chrome arayüzü alanı yiyor) 8/8; gecikme p95 35,4 / 35,9 ms; sistem yazı ölçeği kullanıcının ayarı 0,9, taşma bulgusu 0                                                                                        | Geçti                                                  |

Kayıtlar git dışıdır (`devtools/vol-showcase/records/ui-device/2026-10-10-{lenovo,samsung}-theme-*`; Deck: `devtools/deck/records/2026-10-10/shot-slr4b-*`). Bu koşular tarayıcı (Chrome) içindedir; APK WebView'i değildir (UI-11.4).

**NOT-RUN** (PASS sayılmaz): aurum skininin gerçek ekranda insan göz kabulü (UI-13.4); Deck'te dokunma sekmesinin dünya kamerası tuvali ve Tema sekmesinde skin'i Deck'te değiştirme (yalnız çelik kaplama gözlendi, aurum Deck'te yalnız kapsam A'da görüldü); APK WebView'inde Tema sekmesi (UI-11.4).

## Düzenleme menüsü ve pano kaydı (UI-11.2)

`installEditMenu` yerel WebView menüsü yerine çekirdeğin `ContextMenu`'sünü açar; pano erişimi `ClipboardAdapter` ardındadır.

| Kural                        | Kanıt                                                                                                                                                                                                | Sonuç                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Alan durumuna göre öğeler    | `planEditMenu` (saf): devre dışı → menü yok; salt okunur → Kopyala + Tümünü Seç; parola → Kes/Kopyala kapalı; seçim/yetenek yoksa kapalı (`editMenu.test.ts`; vitrinde iki motor `editMenu.spec.ts`) | Geçti                                     |
| Yapıştırma kullanıcı eylemi  | Pano yalnız menü öğesi tıklanınca okunur (`reads` menü açılınca 0); denetimli test                                                                                                                   | Geçti                                     |
| Kes güvenli                  | Pano yazması reddedilirse metin silinmez; yazma sürerken alan değişirse silme uygulanmaz                                                                                                             | Geçti                                     |
| İzin reddi / yetenek yokluğu | Alan, odak ve menü akışı bozulmaz; sonuç `onResult` ile bildirilir, vitrin uyarı bildirimi gösterir (iki motor, bellekte reddeden pano)                                                              | Geçti                                     |
| Eski sonuç                   | Menü açıldıktan sonra değer değişmiş ya da alan sökülmüşse eylem uygulanmaz (`stale`)                                                                                                                | Geçti                                     |
| Sınırlar                     | `maxLength` aşılmaz, vekil çiftin yarısı bırakılmaz; tek satırlı alanda satır sonu boşluk; `type=number/email` kapsam dışı (seçim arayüzü yok)                                                       | Geçti                                     |
| İçerik günlüğü yok           | Pano içeriği konsola yazılmaz (bağdaştırıcı ve menü testleri konsolu izler); sonuç nesnesi içerik taşımaz                                                                                            | Geçti                                     |
| Gerçek sistem panosu         | Chromium: izin verilmiş bağlamda Kes sonra Yapıştır gerçek `navigator.clipboard`'dan döner. WebKit: Playwright pano izni veremez, test atlanır; aynı akış bellekte panoyla iki motorda koşar         | Chromium geçti, WebKit atlandı            |
| Yerel pencerede pano         | WebView2, WebKitGTK ve Android WebView'de `navigator.clipboard` izin davranışı ölçülmedi; yerel eklenti eklenmedi                                                                                    | **NOT-RUN** (UI-12.4/F09.1, F08.6, F09.2) |

Dokunma kaynaklı `contextmenu` olayına dokunulmaz: Android'de yerel seçim tutamakları ve eylem çubuğu UI-11.3'ün konusudur.

## Steam metin sağlayıcısı: diyalog ve yüzen klavye (UI-12.1)

İki ayrı giriş vardır; sonuç yolları karışmaz. Diyalog tek seferlik metin döndürür (`TextEntryProvider`); yüzen klavye tuşları doğrudan odaklı
alana yazar ve yalnız durum bildirir.

| Kural                        | Kanıt                                                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parola → Password kipi       | Diyalog: `purpose: 'password'` → `mode: 'password'` (`steamworks.test.ts`); Rust IPC yalnız `normal`/`password` kabul eder (`text_input.rs`)                |
| Parola yüzen klavyeye gitmez | `showSteamFloatingKeyboard(…, {password:true})` ve `type=password` alan native çağrısız `unavailable`; yüzen klavyenin maskesi yoktur                       |
| Tek/çok satır                | `singleLine`/`multiLine`; Rust IPC başka kipi reddeder; SDK eşlemesi `steamworks` özelliğiyle testli                                                        |
| Sonuç yolları ayrı           | Yüzen klavye `text-input` olayına abone olmaz; kapanış yükündeki metin sonucu belirlemez; sonuç `dismissed`/`unavailable`/`busy`/`canceled`                 |
| Sahibin iptali               | `AbortSignal` → `cancel_text_input` (aynı kimlik) → Rust `DismissFloatingGamepadTextInput`; show yanıtı gecikirse geç açılış yine kapatılır; üst süre 10 dk |
| Geçersiz alan                | Sıfır/negatif boyut ve sonlu olmayan değer native çağrısız `unavailable` (JS), Rust IPC sınırında da reddedilir                                             |
| OSK yedeği                   | Diyalog açılamazsa core `OnScreenKeyboard`'a düşer; kayan klavye `unavailable` döndüğünde çağıran aynı yedeğe düşer                                         |
| Gerçek Steam runtime         | **NOT-RUN** → F08.6/F04.4: yüzen klavyenin alanı örtmemesi, `devicePixelRatio` çarpanının Steam koordinatıyla uyumu, kapanış geri çağrısı                   |

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

| Tarih      | Kapsam                                                                                                                                | Karar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-07 | Görsel kimlik: iki skin (çelik, aurum), malzeme dili (düğme, bar, çerçeve), ikon seti (Phosphor Fill), imleç                          | **Kabul** (ekran görüntüleriyle, "çok hoşuma gitti, tam onay"). Cihazda canlı his, dokunma/kol ve native WebView ayrı kalır.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-10-07 | UI sesleri (ilk 23 olay, iki palet)                                                                                                   | **Kabul** (kullanıcı kulakla: "ses deneyimi benim tarafımdan geçti"; yalnız o günkü sesler). Cihaz hoparlörü ayrı kayıt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-10-07 | Yeni sesler: `keyTap`, `keyDelete` (ekran klavyesi; iki palet)                                                                        | **Açık**: ölçüt (UI sınıfı) geçti, kulakla karar henüz yok; ses ekran görüntüsüyle kabul edilemez.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-10-08 | Katman ve ekran klavyesi tasarımı (diyalog, toast, komut paleti, sheet, modal, OSK, vitrin kabuğu)                                    | **Açık**: kullanıcı ekran görüntüsüyle inceleyecek; paket hazırdır (son satır). Cihazda (Deck, tablet, telefon) canlı his ayrı kayıt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-10-08 | Vitrin kabuğu ve ekran klavyesi, Lenovo TB350FU (Android 14, 1200×2000, Chrome; adb ile yerel sunucu), yatay ve dikey                 | **Otomatik/ekran görüntüsü PASS** (2026-10-08 yeniden koşu: 12/12, iki yönde de; dokunma→ilk görünür geri bildirim p50 22/27 ms, p95 39/41 ms): kabuk sığar, sekmeler ve kartlar çizilir; klavye iki yönde ekrana sığar (Vazgeç·Bitti görünür), dokunmayla yazma, sembol katmanı, TR⇄EN tuşu çalışır, sekmede ses simgesi (tuş sesi çalıyor). İnsan hissi/ses kulakla ayrı kayıt; yerel (APK) vitrin ve Samsung NOT-RUN.                                                                                                                                                                                                                                                                                    |
| 2026-10-08 | Ekran klavyesi ve katmanlar Steam Deck'te (yerel vitrin, Game Mode, fare/dokunmatik girdi `xdotool`)                                  | **Kısmi PASS (ekran görüntüsü)**: klavye tam genişlikte temaya uygun çizilir, harf/sembol/TR katmanı ve Vazgeç·Bitti çalışır; modal/sheet/onay Escape ile kapanır, odak geri döner; seçici ve diyalog zorunlu seçimde Escape ile kapanmaz (tasarım). **Kol (OS düzeyi sanal Xbox kolu, `/dev/uinput`, Steam Input üzerinden) PASS**: D-pad odak halkasını taşır, RB sekmeyi değiştirir (Panels→Forms), A ile klavyede harf yazılır, odak halkası tuşta görünür. Glif geçişi: kol girdisi `Input mode: gamepad` ve RT/A glifini getirir, fare hareketi `pc` glifine döndürür; eylemli/kritik bildirimler 5 sn sonra da kalır. **NOT-RUN**: fiziksel Deck düğmeleri/arka tuşlar, Steam Input yeniden bağlama. |
| 2026-10-08 | Vitrin 14 sekme, Samsung Galaxy S21 FE (Android 16, Chrome 137), dikey 384×725 ve yatay 796×283, sekme sekme inceleme                 | **Otomatik + ekran görüntüsü**: 14/14 sekme iki yönde 59,9–60 FPS, 0 yavaş kare. İnceleme dört gerçek kusur buldu ve düzeltti: yatayda ekran klavyesi Vazgeç/Bitti kırpılması, Workbench görüntü çubuğu, Kimlik ikon ızgarası, SlotGrid telefon dikeyi (UI-13.3). Dokunma hissi/ses insan kaydı ayrı; Samsung'da VOL.TEST APK dokunma ve çoklu tank **NOT-RUN**.                                                                                                                                                                                                                                                                                                                                            |
| 2026-10-08 | Kare ölçümü: Steam Deck host AppImage (WebKitGTK, CPU boyama), Samsung ve Lenovo Chrome, VOL.TEST debug APK native kare               | **Ölçüm** (`docs/steam-deck.md`, `docs/android.md`): Deck 14 sekme 57,3–60,6 FPS (ortanca 60,2), motor-kapsamlı kart katmanı terfisinden önce Forms 42,9 / Touch 46,5; APK jank Samsung %0,36–0,44, Lenovo %1,9–2,3 (Lenovo farkı açıklanmadı). SLR4 derlemesi, APK dokunma yükü ve 10 dk termal **NOT-RUN**.                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-10-08 | F07 görsel onay paketi: kart şeritleri, açık katmanlar, gerçek cihaz görüntüleri                                                      | **Hazır, kullanıcı incelemesi AÇIK**: yerel f07-review alanındaki INDEX kaydı (git dışı): 294 kart şeridi (iki skin, dört etkileşim durumu), 58 katman, Deck çelik + aurum, Samsung ve Lenovo dikey + yatay. Deck gezinmesi `xdotool` tuşlarıyla (kol sanal girdisi için parola yok); fiziksel kol turu pakette yok.                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-10-10 | Kart ailesi (UI-04): nadirlik/durum matrisi, seçici durumları, deste alternatifleri                                                   | **Otomatik PASS, kullanıcı incelemesi AÇIK**: bkz. "Kart ailesi kaydı"; görsel/ses hissi ve Deck kol hücresi NOT-RUN.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-10-10 | Değer editörleri (UI-05.1): IME, taslak iptali, geçersiz sayı, readOnly/invalid, erişilebilir ad, RTL/dikey hit-test                  | **Otomatik PASS**: bkz. "Değer editörü kaydı"; gerçek IME ve AT duyurusu NOT-RUN (UI-13.4/F09).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-10 | Seçim ve eğri denetimleri (UI-05.2): Select/Checkbox/ColorPicker durumları, eğri düzenleyici klavye-dokunma-kol, bileşik ok sahipliği | **Otomatik PASS**: bkz. "Seçim ve eğri denetimleri kaydı"; Deck kol hissi ve gerçek AT NOT-RUN.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-10 | Panel/yerleşim (UI-05.3): yön sözleşmesi, Carousel RTL, Tree kapalı dal, Accordion, ekran klavyesi Tab tuzağı, soluk metin kontrastı  | **Otomatik PASS**: bkz. "Panel ve yerleşim kaydı"; gerçek AT ve Android %200 NOT-RUN.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-10-10 | Ayar formu (UI-05.4): SettingsModel, kapsam başına atomik yazım, taslak/Uygula/Geri al/Varsayılan, kapanış kararı, ses satırları      | **Otomatik PASS**: bkz. "Ayar formu kaydı"; gerçek AT, Tauri yazım hatası ve Steam Cloud NOT-RUN.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-10-10 | Form kabulü (UI-05.5): yalnız klavye, yalnız kol, dokunma, altı hane, %30 metin                                                       | **Otomatik PASS**: bkz. "Form kabul kaydı"; gerçek Deck kolu, gerçek AT ve kullanıcı değerlendirmesi NOT-RUN.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-10-10 | Platform bağı (UI-06.3): kabuk/oturum, native pencere, kalıcılık, web yedeği, eklenti yüzeyi                                          | **Yerel PASS** (Windows WebView2 15/15) + otomatik PASS: bkz. "Platform bağı kaydı"; Deck gamescope ve Android APK NOT-RUN.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-10-10 | Windows yerel kare/CPU (UI-06.4): 14 sekme, A/A, boşta atfı, CPU profili                                                              | **Yerel PASS** (debug derleme, 60 Hz): medyan 60 FPS, A/A farkı 0; boşta CPU gürültüsü ±0,3 sn/5 sn: bkz. "Windows yerel kare ve CPU kaydı"; release, DPI 125/150/200 ve Deck/Android NOT-RUN.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-10-10 | Çoğul/ı-İ/boşta maliyet (UI-07.2, UI-06.4): çeviri kapısı çoğul kuralı, Select Türkçe harf kuralı, boşta animasyon ve JS taraması     | **Otomatik PASS** (düzeltme olmadan kırılan 5 test): bkz. "Çoğul, yerel harf kuralı ve boşta maliyet kaydı"; tarih/birim/yüzde, %200 ve RTL açılır pencere yönü de ikinci dilimde kapandı (bkz. aynı bölüm).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
