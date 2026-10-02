# VOL.STUDIO UI — uygulamaya hazır tasarım sözleşmesi

**v6 FINAL.** v1–v5 yerine geçer. Bu belge kümesi onaylı tasarım niyetini,
uygulanacak işi ve kabul yöntemini tanımlar; henüz uygulanmış özellik listesi
değildir. Bu turun teslimi yalnız belgelerdir. Üretim kodu, bağımlılık,
asset, cihaz kurulumu ve native proje değişikliği sonraki uygulama fazındadır.

| Okuma sırası | Kaynak                                  | Tek sorumluluk                                             |
| ------------ | --------------------------------------- | ---------------------------------------------------------- |
| 1            | [Sözleşme](CONTRACT.md)                 | Görünüm, etkileşim, platform ve mimari değişmezler         |
| 2            | [Araştırma ve düzeltmeler](RESEARCH.md) | Kod bulgusu, birincil kaynak, v5 düzeltmesinin gerekçesi   |
| 3            | [Katalog](CATALOG.md)                   | Bütün public UI sınıfları ve yardımcıların sahip fazı      |
| 4            | [İş listesi](TODO.md)                   | Sıralı görevler, dosya hedefleri, bağımlılıklar ve kapanış |
| 5            | [Doğrulama](VERIFICATION.md)            | Mevcut/planlanan kapılar, test ve gerçek cihaz kabulü      |
| 6            | [Kapsam eşlemesi](COVERAGE.md)          | v5'in bütün maddelerinin nihai karşılığı                   |

Çelişkide kök [çalışma sözleşmesi](../../AGENTS.md) geçerlidir. UI kararı
CONTRACT'ta, açık iş yalnız TODO'da tutulur; aynı görev farklı dosyalarda
bağımsız checkbox'a dönüşmez. Kaynak ve araştırma tarihi RESEARCH'tedir;
karar tarihçesi git'tir. Sürekli büyüyen karar günlüğü tutulmaz.

## Başlangıç gerçeği ve hedef

Mevcut vitrin `devtools/vol-ui`, web uygulamasıdır. 12 sekme ve CORE UI
yüzeyinde 89 public sınıf vardır. VOL.TEST aktif tüketicidir; emekli
VOL.HELL ve VOL.ARACHNID tüketim önceliği belirlemez. Mevcut vitrin E2E'si
Chromium'da okunabilirlik dışındaki testleri, WebKit'te yalnız okunabilirliği
çalıştırır. Yeni axe, tema, durum matrisi ve UI performans kapıları henüz yoktur.

Hedef tek katalogdur: CORE mekanizma/sunum/tarif sınırı korunur; vitrin
devtools/vol-showcase / `@volstudio/vol-showcase` / `studio.vol.showcase`
olarak web + native laboratuvara dönüşür. VOL.TEST gerçek oyun HUD/ayar/girdi
entegrasyonunu doğrular; bu çalışmada oyun menüsü tasarlanmaz. SHOWCASE
oyunu veya oyun kaynaklarını import etmez.

## Faz akışı

Varsayılan uygulama sırası **UI-00 → UI-01 → UI-02 → UI-03 → UI-04 → UI-05 →
UI-06 → UI-07 → UI-08 → UI-09 → UI-10 → UI-11 → UI-12 → UI-13**.
Görev ayrıntıları [TODO](TODO.md)'dadır. M1 buton pilotu UI-03, M2 kartlar
UI-04, M3 tam tier-1 UI-13, M4 ilk native platform UI-06, M5 i18n UI-07,
M6 tema tamamlanması UI-07, M7 metin laboratuvarı UI-11/UI-12 sonunda kapanır.
UI-05/UI-08 form/HUD alt kapsamını tamamlar; daha geç ele alınan aktif
metin/joystick/modal/glif satırları bitmeden M3 kapanmaz. M numaraları
kapsam kimliğidir; yeni bağımlılık sırası yukarıdaki UI fazlarıdır.

Fazların ön koşulu önceki fazın **teknik teslimidir**: API/kod/test/yerel
kapı ve gereken fixture hazırdır. Eksik gerçek cihaz veya insan kabulü
açık release blocker olarak kalır; henüz üretilecek native kabuğun
dinlemesini önceki kod fazına ön koşul yaparak döngü kurulmaz. Sonraki
bağımsız teknik iş ilerleyebilir. Platform kabul sırası ve nihai release
kapanışı yalnız gerçek kabul kanıtlarıyla tamamlanır.

V5'in geç bıraktığı tema, hareket ve ses **altyapısı** UI-01/UI-02'de kurulur;
tam dil/tema yayılımı UI-07'de yapılır. İlk Linux/Deck laboratuvarı UI-06'da
kurularak kalan görsel çalışmalar gerçek WebView'da erken sınanır.
Android UI-11, Windows UI-12'dir; Linux → Android → Windows ürün sırası korunur.

| Faz   | Teslim odağı                                            |
| ----- | ------------------------------------------------------- |
| UI-00 | Başlangıç ölçümü, fixture kayıtları, doğru test kapsamı |
| UI-01 | Ton, çerçeve, tema, density, hareket ve asset altyapısı |
| UI-02 | Semantik geri bildirim, kanonik UI ses seti, haptik     |
| UI-03 | Buton pilotu ve gerçek VOL.TEST regresyonları           |
| UI-04 | Kart ailesi, picker, rarity ve seçim koreografisi       |
| UI-05 | Paneller, formlar, ayarlar ve temel erişilebilirlik     |
| UI-06 | Atomik VOL.SHOWCASE göçü ve Linux/Deck native kabuk     |
| UI-07 | Bütün görünür metin, font ve iki tema yayılımı          |
| UI-08 | HUD, geri bildirim ve erken tier-1 kapsam kontrolü      |
| UI-09 | Overlay, bildirim, veri, onboarding ve legal yüzeyler   |
| UI-10 | Dokunma, yükleme, kaydırma, çalışma alanı ve kamera     |
| UI-11 | Android seçim/IME/pano ve sahipli metin oturumları      |
| UI-12 | Deck metin/glif sağlayıcıları ve Windows kabulü         |
| UI-13 | Katalog bütünü, stres, cihaz ve sürüm adayı kabulü      |

## Sonraki ajan/model için çalışma protokolü

“**UI fazlarına başlıyoruz**” ilk açık fazı başlatır. “UI-XX uygula” yalnız
adı verilen ve ön koşulları kapanmış fazı başlatır. Bir çalışma turu tek
fazı taşır; faz büyükse aşağıdaki görev kimliğiyle sınırlandırılır. Bir sonraki
“devam et” ilk açık bağımlı göreve devam eder. Bu belgelerin push edilmesi
tek başına üretim kodunu değiştirme talimatı değildir.

1. AGENTS, bu giriş, sözleşme, atanmış görev ve ilgili alt dizin sözleşmesini
   oku. `git status`, dal, HEAD ve gerçek dosyaları yeniden doğrula. Yol
   UI-06'dan sonra taşınmışsa eski vitrin yolunu mekanik olarak geri yaratma.
2. Başlangıçtaki varsayımı bir test/ölçümle doğrula; düzeltmede önce hatayı
   yeniden üreten regresyon yaz ve düştüğünü gör. Yeni davranışta anlamlı
   kabul testi önce gelir. Sadece kodun aynası olan test yazma.
3. API/sahiplik kararını tek sorumlu uygular. CORE'a oyun kuralı/native import,
   monolit vitrin dosyası, gereksiz bağımlılık veya yeni global singleton ekleme.
   Yaklaşan 1000 satır sınırını davranış eklemeden önce böl.
4. Bağımsız ajanlar ancak çakışmayan dosya/sözleşme alanlarında çalışır.
   Katmanlar arası API, katalog manifesti ve lock değişimi seri koordine edilir.
   Uygulayıcıdan bağımsız inceleyen, diff'i görevin kabul ölçütüyle karşılaştırır.
5. Hedef test → ilgili tekil kapı → commit öncesi quick → push öncesi high.
   Kancalar atlanmaz. Düşen tek kapıyı düzeltip yeniden koş; ilgisiz pahalı
   doğrulamayı sebepsiz tekrarlama. Kilometre taşı kapsamı VERIFICATION'dadır.
6. Belgeyi bugünkü gerçekle güncelle. Görevi yalnız bütün kapanış kanıtı varsa
   `[x]` yapıp `Kapatılanlar`a tek satır taşı. Kod bitti/cihaz yoksa görev
   “tamamlandı” olmaz; kalan gerçek kabul açık alt madde olarak ayrılır.
7. Tek konulu Conventional Commit; İngilizce başlık, Türkçe neden gövdesi.
   Ara tamamlanmış konuları commit'le; kırık test/yarım API ile sahte checkpoint
   oluşturma. Limit yaklaşınca biten konuyu kaydet, kalan görevi açık yaz.
8. Teslim: değişen davranış, test/kapı sonucu, build kimliği, kanıt yolu,
   kalan risk/NOT-RUN, commit ve çalışma ağacı. Push/merge/etiket yetkisi kök
   sözleşmeye tabidir; bu turun açık yetkisi belgelerin commit ve push'udur.

Önceki test sayısı, eski modelin “geçti” beyanı veya arşivdeki tüketim sayısı
yeni fazın kanıtı değildir. İnsan beğenisi, ses dinleme ve titreşim hissi
gerçek beyan olmadan üretilmez. Yeni modelin okuyacağı kapsam bu dosyalar ve
açık TODO kimlikleridir; sohbet geçmişini bilmesi gerekmez.

## Ajan devri için görev zarfı

Uygulayıcı veya bağımsız inceleyen aynı zarfla başlar. Model adı sabit
belgeye gömülmez; kaynak/API okuma, web araştırma, native araç veya görsel
kanıt ihtiyacı rolün gerektirdiği yetenektir. UI-01 / UI-02 / UI-11 / UI-12 katmanlar arası
kararlarda sorumlu tek uygulayıcı, inceleyen ayrı context'tedir. UI-03 / UI-04
görsel kanıt üretir; UI-00 / UI-13 bağımsız kapsam/ölçüm doğrulaması taşır.

```text
Rol: uygulayıcı veya bağımsız inceleyen
Faz / alt görev: UI-XX / UI-XX.N
Başlangıç: dal + HEAD; önce git durumunu doğrula
Oku: AGENTS + docs/ui/README + CONTRACT + TODO görevi + VERIFICATION
İzinli dosyalar: görevin alanı; ortak public API/lock sahibi ayrıca belirtilir
Ön koşul: teknik teslimler ve açık gerçek kabul engelleri ayrı listelenir
Kanıt: red/green test, ilgili kapı, build/fixture kimliği ve gerçek cihaz scope'u
Teslim: diff, kabul satırları, açık risk, tek konu commit; kapsam dışını değiştirme
Sonraki iş: ilk açık bağımlı UI görev kimliği; geçmiş sohbeti varsayma
```

Fazın başlangıç commit'i ve sonuçları private records veya git'ten gelir;
bu kalıcı belgede oturum tarihçesi biriktirilmez. İnceleyen “testler yeşil”
ile yetinmez: source/fixture, görev kapanışı, public uyum ve tüketici
örneğini çapraz okur. İlgisiz model/ajanın açık çalışmasına müdahale edilmez.
