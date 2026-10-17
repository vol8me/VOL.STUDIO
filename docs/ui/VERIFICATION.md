# UI doğrulama sözleşmesi

Bu belge kabul yöntemini tutar; eski oturum/test sonuçları Git geçmişindedir.
Davranış [CONTRACT](CONTRACT.md), canlı yüzey/durum bağı [CATALOG](CATALOG.md),
kalan iş [TODO](TODO.md), platform desteği ilgili platform rehberi sahibindedir.
PASS, FAIL, NOT-RUN, mevcut SKIP ve gerekçeli N/A birbirinden ayrılır.

## Kapılar ve kanıt sahipliği

Kapı bileşimi [gates](../gates.md), eşik/bütçe `quality.json` sahibindedir.
`contract` public yüzey, gerçek durum/test bağları, i18n, tema, geometri
istisnaları ve yaşam döngüsü sınırlarını denetler. Bir öğenin görünmesi
callback, odak, iptal, tek niyet veya kaynak temizliğinin kanıtı değildir.

UI değişikliği `pnpm exec just ui-check` ile yüzey + vitrin build'i + iki
motorlu E2E'yi doğrular. `high` E2E içermez; `signoff` içerir. Kaynak/audio
yayını tam teknik kapıyla doğrulanır. Monorepo kaynak sürümü ile gerçek
platform dağıtımının kabulü ayrıdır; ölçülmeyen profil destek kabulü alamaz.

Registry'nin her sınıf/yardımcısı tier, sahip faz, arketip ve davranış kanıtı
taşır. Tier-1 uygulanabilir bütün eksenlere, tier-2 kendi davranış/lifecycle
matrisine bağlıdır. Fixture ve assertion bağları
[stateFixtures](../../devtools/vol-showcase/tests/e2e/support/stateFixtures.json)
ile registry'dedir; bu belgede ikinci test listesi yoktur.

## İşlev ve durum matrisi

Her uygulanabilir eksende normal/hover/press/focusVisible/disabled/loading/
error/empty, klavye/kol/dokunma, reduced-motion, %30 uzun etiket ve altı
hane sınanır. Altı hane örneği 999999'dur; fiyat/seviye/sayaç biçimlendirmesi
ayrıdır. Görsel olmayan mekanizma kaynak ömrü ve girdi sahipliğiyle sınanır.

| Alan           | Gerekli regresyon                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| Niyet          | Kabul edilmiş eylem başına tek değişiklik/ses; programatik setter sessiz; iptal başarı değildir                |
| Odak           | Tab/ShiftTab/Enter/Space/Escape/yön/Home/End; inert, gizli ve disabled öğe; LIFO katman ve sahip geri dönüşü   |
| Async yaşam    | Beklerken kapatma/destroy/tema/dil; eski sonuç yeni isteği, odağı veya snapshot'ı değiştirmez                  |
| Değer editörü  | Taslak/commit/geri alma; readOnly/invalid/empty; min/max/step; slider pointer sahipliği                        |
| Kart ve veri   | Seçim/sürükleme eşdeğeri, uzun fiyat/metin, klavye niyeti, boş/yükleme/hata, sanal liste sınırı                |
| Katman ve OSK  | İç içe modal→Select→OSK, tek geri sahibi, bekleyen isteğin iptali, odağın güncel hedefe dönmesi                |
| Girdi geçişi   | Çoklu dokunma, sanal kol/hotplug, touch↔pad, remap ve pointer kilidinin tek sahibi                             |
| HUD            | Son hedef değer/duyuru, havuz sınırı/geri dönüş, renk dışı işaret, salt sunumun tuval hit-test'ini kapatmaması |
| Native adaptör | Sağlayıcı var/yok/hata, seçili metin ve clipboard; görünür native kabul ayrı                                   |

Başarısız senaryo eşik/timeout artırılarak veya piksel temeli koşulsuz
silinerek kapatılmaz. Yeni kusur anlamlı regresyon bırakır; test ağacı
kaynak modülünü izler, eski toplu dosyalar büyütülmez.

## Erişilebilirlik, geometri ve tema

- Uygulanabilir WCAG 2.2 A/AA ve ARIA davranışları axe + gerçek girdi/geometri
  ile sınanır. Gerekçeli istisna kapsamı ve sahibi bellidir; süresiz blanket waiver yoktur.
- Normal metin 4.5:1, büyük metin ve metin dışı öğe 3:1 kontrastı son alfa
  birleşimi üzerinden ölçülür. Renk tek bilgi değildir; gri ton/sentetik
  renk görme profili fiziksel insan kabulünün yerine geçmez.
- Hedefler sözleşmedeki 24/44 CSS px ve Android 48dp kapsamıyla ölçülür;
  görünmez native input'un gerçek hit-test alanı ve komşu örtüşmesi dahildir.
- %200 web ölçeği/320 CSS px reflow, Türkçe glif, font fallback ve %30
  uzun etiket ayrı sınanır. Android sistem font ölçeği CSS ölçeğiyle aynı değildir.
- default/aurum × TR/EN/sentetik RTL × compact/comfy/touch taraması yapılır;
  kritik etkileşimler tam çaprazdır. Sentetik RTL yeni dil desteği ilan etmez.
- Piksel temeli yalnız bilinçli görsel değişiklikte güncellenir. Chromium
  platform kümeleri eşittir; bir motorun ekran görüntüsü diğeri yerine geçmez.
- CLS 0 bütün geometri sabittir demek değildir. Kritik kutu, scroll, focus
  ve seçim her karede izlenir; gerekçeli yuvarlama en çok bir fiziksel pikseldir.
- Azaltılmış hareket dekoru keser; işlevsel hold/charge/timer süresi korunur.
  Gizli/destroy edilmiş öğede sonsuz animasyon veya sahipsiz rAF/listener kalmaz.

## CPU, GPU, sunum ve yanıt ölçümü

UI CPU hedefinin paydası hedef kare süresi F=1000/Hz'dir. Aynı kareye
atfedilmiş UI CPU p95 %95 güven üst sınırı + pozitif A/A payı <0.05F:
60 Hz'de 0.833333 ms, 90 Hz'de 0.555556 ms, 120 Hz'de 0.416667 ms.
Farklı kapsamların p95'leri toplanmaz. Atıf yoksa yalnız ölçülen UI JS ve
A/B toplam CPU kapsamı raporlanır; tam UI CPU kabulü yapılmış sayılmaz.

Üretim build'i, seed/girdi, sahne, kalite, viewport/DPR/Hz, güç ve runtime
sabittir. A aynı geometrili statik UI, B tam UI davranışıdır. Sıra dengeli
ve tekrarlanabilirdir; ısınma/termal kararlılık ile soğuk açılış ayrılır.
Tam cihaz CPU profilinde en az 30 sn ısınma ve 10 eşli 60 sn pencere alınır;
kısa ön kontrol bu profilin kabulü değildir. Eşik gürültüyü aşmıyorsa sonuç
yetersizdir; tolerans büyütülmez.

[frameProbe](../../devtools/vol-showcase/tests/e2e/support/frameProbe.ts)
sayfa olay saatini/rAF'ı ve Chromium CDP izini ayrı tutar. İz, performance
mark ile sayfa saatine hizalanır; JS/stil/layout/paint/commit aynı frame
kimliğiyle atfedilir. WebKit iz yeteneği yoksa unsupported kalır.
Bilinen yük, saat okuma maliyeti, A/A gürültüsü ve iz maliyeti kalibre edilir.

DOM event→commit, sonraki rAF, native iz ve fiziksel sunum ayrı metriklerdir.
İlk görünür yanıt p95 hedefi 100 ms'dir; pointer/touch/klavye ve sanal pad
ayrı kapsamlardır. Yanıt diliminde her girdi için 30 örnek ve üç ısınma örneği
alınır; güven üst sınırı/gürültü payı ile p95 ve en yüksek değer raporlanır.
Sanal pad fiziksel kol gecikmesi, başsız rAF ekrana sunulan kare değildir.

GPU/kompozitör ölçüsü CPU ile örtüşebilir; tek bir yüzdeye toplanmaz.
WebGL timer DOM birleştiricisini ölçmez, disjoint örnek kabul edilmez.
Android gfxinfo/Perfetto, WebView2 CDP/ETW ve Deck gamescope/MangoHud yolları
kendi gerçek profilleriyle kalibre edilir. Destek yokluğu sıfır/PASS değildir.

## Ses ve haptik

Kaynak/program/render/PCM/manifest, codec sonrası QA, varyant/olay paritesi
ve gönderilen dosya doğrulanır; runtime üretici import etmez. Olay salkımı,
kırpılma/DC/sonluluk, duck/iptal/devam ve sessiz/sağlayıcısız akış sınanır.
İptal edilen yüklemede tamamlandı sesi çıkmaz; arka plandaki kuyruk öne
getirilince patlamaz. Haptik sıfır/kapalı/odak kaybı/çıkışta tek driver ile durur.

Teknik yayın [audio tasarımına](../../devtools/audio-synth/DESIGN.md) bağlıdır.
Kulakla beğeni isteğe bağlıdır; codec/decode/gerçek hoparlör kabulü yerine geçmez.

## Gerçek platform ve kayıt

Tarayıcı, native taklit ve fiziksel cihaz ayrı hücredir. Windows NSIS/WebView2/
DPI/font/input/clipboard, Deck fiziksel kol/Steam/uyku ve Android APK/font/
yön/çoklu pencere kabullerinin kalan sahibi UI TODO ve platform rehberleridir.
Erişilmeyen cihaz NOT-RUN kalır; başka cihazın sonucu taşınmaz.

Kanıt kaynak commit'i, build/artefact karması, profil, komut/çıkış kodu,
örnek sayısı ve kapsamı taşır. Cihaz adresi/seri/kullanıcı/oturum kimliği
paylaşılmaz. Raporlar vitrinin git dışı records alanında, performans denemeleri
UUID başına ayrı kayıttadır; retry başarısız örneği silemez.
