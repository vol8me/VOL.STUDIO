# Arayüz tasarım dili ve sunum sözleşmesi

Bu sözleşme onaylı hedef davranıştır ve **oyun arayüzü kimliğini** tarif eder: web paneli
değil, katmanlı malzeme, tok ses, imleç ve hareket hissi. Henüz mevcut olmayan mekanizmalar
[iş listesinde](TODO.md) uygulanır; mevcut yüzey [katalogda](CATALOG.md), karar gerekçeleri
bu belgede, kanıt yöntemi [doğrulamada](VERIFICATION.md) bulunur. Sayısal sanat/ses presetleri
başlangıç tasarım kararıdır; ölçülmüş optimum veya WCAG gereği değildir ve gerekçesiyle bu tek
kaynakta değiştirilir; kimlik kararlarında sahibi uygulayıcıdır. WCAG 2.2 AA tüm uygulanabilir
A/AA ölçütlerini kapsar.

## Sözlük

**Ton basamağı:** page < well < panel < plate. **Tier-1:** aktif ürünün
tükettiği veya ortak temel olarak belirlenen öncelikli bileşen. **Tier-2:**
katalogda bekleyen bileşen. **Semantik olay:** kabul edilmiş UI niyeti veya
durum sonucu. **Density:** compact/comfy/touch. **Skin:** tema + malzeme + ses paleti + imleç aksanı + ikon plakası. **Anchor:** özgün üretime
yön veren esin. **CLS:** standart layout-shift ölçütü; tüm geometri testi
değildir. **Kalıntı:** artık geçerli olmayan canlı referans.

## 1. Amaç, kapsam ve tüketim

CORE UI görünüm, etkileşim, ergonomi ve geri bildirimi tek dilde sunar.
Hiçbir katalog bileşeni bu çalışma nedeniyle silinmez. CORE generic kalır;
SHOWCASE örnekleri gösterir; VOL.TEST gerçek tüketici entegrasyonudur.
Aktif kullanım, dolaylı kullanım, katalog kullanımı ve arşiv ayrılır.

Canlı yüzey, tüketici ve tier sahipliği [CATALOG](CATALOG.md) içindedir.

## 2. Platform, ölçü ve ergonomi

| Alan             | PC                                       | Steam Deck                                                                        | Android                                                                    |
| ---------------- | ---------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Metin politikası | Normal UI computed font-size ≥12 CSS px  | Ayrıca çizilmiş glyph yüksekliği ölçülür; ≥9 ekran px Valve alt sınırı, ≥12 hedef | ≥12 CSS px başlangıç; %200 web metin/zoom ve sistem font ölçeği ayrı kabul |
| Hedef politikası | ≥24×24 CSS px; WCAG istisnası belgelenir | Kol veya trackpad akışında ≥44×44 CSS px                                          | ≥44×44 CSS px; platformun 48dp önerisi ayrı fiziksel ölçüm                 |
| Girdi            | Mouse + klavye                           | Kol-only + trackpad; aktif action glifi/fallback                                  | Dokunma + sistem geri; donanım klavye değişimi                             |
| Odak             | Görünür ring                             | Ring + hale; uzamsal ve bileşik widget navigasyonu                                | Dokunmada gereksiz hover yok; klavye/AT odağı görünür                      |

Yoğunluk `data-vol-density` ile açık seçilir. Pointer coarse yalnız otomatik
varsayılan girdidir; Deck mouse modunda küçük hedefe düşmez. Density,
erişilebilir metin ölçeği ve mevcut layout-zoom ayrı politikalardır.
Tek LIFO geri yığını: en üst katman önce tüketir. OS'nin kapattığı IME/seçim
aynı geriyle paneli kapatmaz. Klavye-only ve kol-only her işlevin eşdeğeridir.
320 CSS px panel reflow'u, portre/yatay, 21:9, çentik ve system-bar güvenli
alanları sınanır; zorunlu iki boyutlu canvas WCAG istisnası tekil gerekçelenir.

## 3. Görsel dil ve malzeme

CORE UI bir **oyun arayüzüdür**: düz kutu, ince çizgi ve gri şerit değil; katmanlı malzeme,
derinlik, kalın silüet ve tok geri bildirim. Hedef oyun türleri bullet hell ve RTS'tir: HUD
bakışı kesmeden okunur, sayılar büyük ve yüksek kontrastlıdır, komut yüzeyleri
dokunsal bir ağırlık taşır. Bileşenler jenerik kalır; kimlik skin'den gelir (bkz. 6).

**Yüzey ailesi.** Page < well < panel < plate. Her basamak ton farkı + iç gölge + rim
ışığı + ince grain ile ayrılır; ışık yönü tektir (üstten). Gövde metni karmaşık malzeme
üstünde backplate olmadan durmaz. Etkileşim radyusu 2–4 px, sunum radyusu 6–10 px
başlangıç presetidir.

**Çerçeve.** Dış boşluk, iç hairline, köşe aksanı, başlık şeridi, ayraç, çentik/perçin;
CSS-öncelikli, gerekirse SVG 9-dilim. Tek `--vol-frame-*` ailesi ve aynı durum grameri.

**Düğme.** Yükseltilmiş yüzey: üst ışık, alt kenar gölgesi, 2–4 px basış yolu; basış bevel'i
ters çevirir; primary'de skin renginde glow. **Bar.** Dolu hissi: segment çentikleri, parlak
üst bant, dolgu kenarı parıltısı, hasar gecikme şeridi; azalma/artış farklı hızda (bkz. 4).

**Renk rolleri:** brand, semantic, accent, rarity, emissive. Rarity × normal/hover/selected/
disabled dört durumuyla sınanır; locked/error ayrı anlam taşır; rarity renkleri kimliktir
ve temayla değişmez. CardTile ve SlotGrid rarity tipleri otomatik birleştirilmez; rarity
bağımsız nötr kart mevcut Panel/Text/Button bileşimi ve ortak card skin'iyle sunulur,
CardTile aynı yüzeye rarity katmanı ekler. Renk tek taşıyıcı değildir: metin/ikon/desen/
seçim işareti birlikte kullanılır.

**Metin.** Rol ölçeği, tabular sayılar, HUD backplate, uzun label; başlık ve sayı yazı tipi
oyun hissine göre seçilir (UI-07.3), Türkçe glif kapsamı zorunludur.

**İkon.** Tek stil: dolu, kalın, yuvarlak köşeli tek renk siluet, ikon plakası üstünde;
16/24/32/48 ölçülerinde; oyun rig/sprite'ından ayrı. Kaynak kürate setlerdir (bkz. 13).
İkon-only eylemin erişilebilir adı bulunur.

**İmleç.** Skin parçasıdır ve üç settir: **ui**, **rts**, **shooter** (bkz. 14). Sistem
metin imleci ve OS seçim tutamakları taklit edilmez. Tema geçişi animasyonsuzdur; odağı,
scroll'u, seçimi ve kutu ölçülerini korur.

## 4. Hareket, juice ve kaynak yaşam döngüsü

Temel duration tokenları fast/base/slow/cinematic=120/200/320/480 ms; easing ailesi
standard/decelerate/accelerate tek kaynakta tanımlanır. Özel koreografi adlandırılmış
preset'tir: scrim/dialog giriş 120/200, modal çıkış 140, kart stagger 40, HUD artış/azalış
200/80, sekme 160 + 6 px, sahne çıkış/giriş 200/320 ms. Loading minimum görünür süre 500 ms
opt-in tarif kararıdır; bloklamayan hazır içerik animasyon için bekletilmez.

**Juice ilkelleri** (başlangıç presetleri, ölçülerek ayarlanır): basma yolu + hafif squash,
hover kaldırma 1.02 + parıltı süpürmesi, odak nabzı, değer tween'i (overshoot), sayı pop,
hasar/ödül flaşı, panel girişi (ölçek + stagger), sınırlı UI sarsıntısı, kart seçimi 1.04

- parıltı. Ring/selected bilgi hareketsiz de kalır. `<100 ms` olaydan ilk görünür cevabın
  başlamasıdır; toplam animasyon süresi değildir. Asenkron iş hemen busy/ack gösterir.

UI root başına en çok 3 eşzamanlı semantik geçiş grubu, toplam 64 dekor parçacığı ve 1 etkin
blur yüzeyi vardır; bir grubun sınırsız alt animasyonla sınırı delmesi yasaktır. Öncelik
kritik/odak > kullanıcı eylemi > dekor; burst'te dekor düşürülür. Blur için performans
yedeği düz scrim'dir. Sürekli dikkat dağıtan parıltı ve kontrolsüz flash yoktur; WCAG flash
sınırı tüm sahnede korunur.

Reduced-motion dekor sürelerini 0 yapar; anlam opacity/etiket/ring ile korunur. Hold/charge/
oyun sayacı gibi işlev süresi sıfırlanmaz. Cancel, interruption, destroy, dil/tema değişimi ve
hidden/suspend son durumu deterministik verir; animasyon olayı gelmese de temizlik tamamlanır.
İki bağımsız kaynak varsa DisposableScope; listener/timer/abonelik/voice sahipsiz kalmaz.
Lint yalnız UI hareket süreleri içindir; domain timeout, rate-limit ve genel animateValue
yanlışlıkla yasaklanmaz.

## 5. Ses, semantik niyet ve haptik

Primitive ses motorunu kurmaz; kabul edilmiş niyeti bir kez bildirir. Uygulama kökündeki tek
UiSoundKit/geri bildirim sahibi seti çalar (UIRoot düzeyi); shared UIRoot aynı parent'ta ikinci
listener kurmaz. Programatik sessiz setter ses/commit üretmez; iptal rollback'i başarı sayılmaz.
Promise'in çözülmesi tek başına oyun/ürün başarısı değildir; sonucu host bildirir. Mevcut
primitive haptik yolu korunuyorsa merkezi sağlayıcı ikinci darbe üretmez.

**Karakter.** UI sesi **gövdeli, malzemeli ve tok** olmalıdır; ince "bip"ler ve genel
çalışma-zamanı klikleri değil. Her ses üç katmandan kurulur: _vurgu_ (2–6 ms transient, 2–5 kHz
tık), _gövde_ (90–250 Hz temel + harmonikler, 40–140 ms düşüş; küçük hoparlörde bu harmonikler
ağırlığı taşır) ve _malzeme/kuyruk_ (metal, cam, lake, ahşap partilleri; 30–400 ms). Büyük
olaylarda masaüstü/kulaklık için isteğe bağlı sub katmanı (50–90 Hz) eklenir; küçük hoparlörün
çalamadığı enerji "olmadığı" varsayılıp gövde kesilmez. Her skin bir **ses paleti** taşır:
`default` çelik donanım (metalik vuruş, kalın gövde, kısa mekanik kuyruk), `aurum` yaldızlı cam
ve lake (çan/kristal partiller + yumuşak gövde). Olay sözlüğü paletler arasında aynıdır.

**Olay sözlüğü v2** (UI-02.6): hover, focus, press, release, back, confirm, toggleOn/toggleOff,
select, tabSwitch, sliderTick (değere bağlı perde), valueCommit, panelOpen/panelClose,
dragPick/dragDrop, equip, purchase, reward, levelUp, notify, denied ("yapılamaz": kuru ve kısa),
alert (kritik). Yön dili: yukarı perde evet/ileri, aşağı perde hayır/geri, düz ve kuru ton
reddedilmiş; confirm yükselir, back/cancel düşer. Hover çoğu bağlamda neredeyse sessizdir ve
yalnız gerçek farede çalar; yüzüncü tekrarda da hoş olmayan ses yayınlanmaz.

| Olay sınıfı | Başlangıç süre (ms) | Başlangıç lineer gain |
| ----------- | ------------------- | --------------------- |
| Mikro       | 40–120              | 0.2–0.35              |
| Tık         | 80–200              | 0.3–0.45              |
| Onay        | 150–400             | 0.35–0.55             |
| Uyarı/alert | 200–500             | 0.4–0.6               |
| Kilometre   | 400–900             | 0.5–0.7               |
| Büyük sonuç | 600–1400            | 0.6–0.85              |

Sayılar başlangıç tasarım kararıdır; LUFS/dBTP hedefi değildir. **Ölçüt:** UI sınıfı politikası
referans setlere (Kenney Interface Sounds/UI Audio; yalnız yerel ölçüm, depoya girmez) göre
bant dağılımı ve yükseklikle belirlenir: gövde bandı zorunlu, kısa tıkta bile geniş bantlı;
yüksek geçiren sınırı ve sub bastırma kuralı yoktur; true peak ≤ −1 dBTP; DC/kırpılma/sonluluk
ölçülür. Kulakla karar kullanıcıya aittir (UI-02.9); reddedilen ses yeniden tasarlanır. Yayın
hattı job → yayın kapısı → manifest → tüketici'dir; CORE runtime audio-synth'e bağlanmaz.

**Slider ve değer sesi.** Sürüklemede değer detent'lere bölünür; her detent bir tık çalar,
perde değerle birlikte yükselir (örn. ±7 yarım ton aralığı), taşma/üst-alt sınırda farklı tık.
Mikro olaylar 60–80 ms'den sık çalmaz; commit ayrı ve daha dolu bir sestir.

**Ducking ve yarışma.** UI, VO/müzikle yarışmaz: yalnız kritik olayın opt-in duck'ı −6 dB,
attack/hold/release 120/80/450 ms; mevcut SidechainDucker; müzik/VO yoksa bus yaratılmaz.
Olay başına 3 varyant sırayla ve ±%5 rate; UI toplam voice sınırı genel SoundBank varsayılanını
değiştirmez; varyant/RNG simülasyon akışını tüketmez. Kullanıcı jestiyle audio açılır; arka
planda bekleyen ses kuyruğu yoktur. Master/UI/SFX/music/VO ayarları mevcut kalıcılık arkasındadır.
Görsel/semantik geri bildirim garantidir; ses ve haptik mute, sürücü yokluğu, autoplay veya
bütçe nedeniyle best-effort'tür. Haptik opt-in/default kapalı kalır; desen/anahtar/şiddet tavanı/
rate-limit; tek backend; blur/sleep/unplug/destroy darbeyi durdurur. Ses/haptik tek bilgi
kanalı olamaz.

## 6. Skin: tema, malzeme, palet, density

**Skin = tema + malzeme parametresi + ses paleti + imleç aksanı + ikon plakası.** İki skin
vardır ve bir bakışta ve bir dinlemede ayrılır:

- `default`: bugünkü `VOL_COLORS` değerleri **aynen** (çelik gri zemin, kor turuncusu marka,
  camgöbeği destek, indigo vurgu). Public renk uyumu korunur.
- `aurum`: premium, bambaşka kimlik. Mor-siyah mürekkep yüzeyler (zemin tonu ~290°), fildişi
  metin, şampanya altını marka (koyu mürekkep `onBrand`), yeşim destek, ametist vurgu, yakut
  tehlike. Renkler OKLCH'de tasarlanır ve ölçülerek ayarlanır; `default`'a ΔE eşiğiyle uzaktır.

TS renk tanımları → `gen:theme` → `:root` ve `:root[data-vol-theme='aurum']` üretir. Tema renk,
malzeme parametresi (bevel, grain, glow, köşe aksanı), edge yoğunluğu ve scrim'i değiştirir;
font/geometri tokenlarını tema bazında değiştirmez. Tip/anahtar paritesi ve deterministik
sıralama gerekir. Scoped preview aynı token sözleşmesini kullanır; body overlay yanlış kökten
tema almaz; canvas okuyucusu değişimi gözler, literal renk sızıntısı kalmaz.

İki skin için gerçek final foreground/background üzerinde AA kontrast, durum/focus/non-text
kontrolleri vardır. Piksel ratchet'i bilinçli kimlik değişiminde yenilenir (D6). Switch CLS hedefi
0 ve bütün motorlarda kutu sabitliğidir; unsupported CLS "0" sayılmaz. Üst barda canlı
tema/dil seçici; tercih device; bilinmeyen/kaldırılmış tema (`ember` dahil) default'a döner.
Skin seçimi ses paletini ve imleç aksanını da değiştirir.

Yoğunluk `data-vol-density` ile açık seçilir (bkz. 2).

## 7. i18n ve font

“Sıfırdan” görünür UI metni/anahtar sağlığıdır; çalışan i18next,
depolama ve dil motoru yeniden yazılmaz. Anahtar parçaları camelCase; TR tek ürün dili,
EN aynı key kümesi; AST kapısı (`i18nSurface`) pariteyi, ölü anahtarı, eksik anahtarı, modül
düzeyi çeviriyi ve kodlanmış metni denetler. JSON key listesi kaynak, ikinci
elle key defteri yoktur. i18next JSON çoğul `count` ve Intl sayı/ölçü/tarih
biçimleme kullanılır; mevcut olmayan ICU eklentisi varmış sayılmaz.

Modül düzeyinde t() yok; açık overlay/OSK dahil dil değişimi günceldir ve abonelik
sökülünce bırakılır. Sentetik %30 genişleme testi vardır. Eksik anahtar vitrin/testte görünür hatadır;
üretimde kontrollü fallback ve tanı uygulanır. `lang` ve `dir` güncellenir;
RTL sentetik fixture'la logical layout/caret/navigasyon sınanır, henüz
olmayan Arapça çeviri veya bütün RTL dilleri destekleniyor denmez.
TR glyph (ı/İ/ş/ğ/ç/ö/ü), font subset ve deterministik fallback ölçülür.
Font hazır/cold-load ve %200 senaryosu ayrı; alt küme metni kaybetmez.
UI Intl.Collator tercihi asset/manifest/replay deterministik sırasına sızmaz.

## 8. Bileşen sağlığı ve durum matrisi

Normal/hover/press/focus-visible/disabled/loading/error/empty;
keyboard/gamepad/touch/reduced-motion; %30 uzunluk ve 6 haneli sayı temel
matristir. Her satırın applicable/fixture/assertion bağı veya gerekçeli
N/A'sı vardır. Text'e sahte loading, UIRoot'a sahte görsel varyant eklenmez.
Tier-1 tam matris, tier-2 kendi uygulanabilir durum/lifecycle matrisi;
89 public sınıf ve public yardımcılar kayıt dışı kalmaz.

Select açıkken disabled/recommit, Slider adı/saydam hit alanı, Checkbox
semantiği, PauseResume sayaç sahipliği, DualAxis child jestleri, OSK abort ve
ToolButton ayrı örneği açık görevlerdir.
Normal vitrin kartında adının bulunması durumların sınandığı anlamına gelmez.

## 9. Erişilebilirlik

Axe tag'leri `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`;
violations fail, incomplete gerekçeli elle inceleme. İstisna exact
rule+selector+gerekçe+owner+yeniden inceleme ölçütü taşır; blanket snapshot
waiver yoktur. Axe tek başına AA uygunluğunu veya gerçek AT deneyimini kanıtlamaz.
Her sürüm adayında klavye-only, ekran okuyucu, %200/reflow ve kol-only
gerçek akış yapılır. Focus örtülmez, drag tek alternatifi olmaz;
auth varsa tekrar giriş/yapıştırma/parola yöneticisi ölçütleri geçerlidir.
Renk körlüğü/grayscale fixture'ı ve renk dışı anlam kontrolü bulunur;
simülasyonun geçmesi otomatik WCAG renk körlüğü sertifikası değildir.

## 10. UI yüzey ailesi

Diyaloglar yıkıcı onay, çıkış, izin, fatal ve save conflict sunumudur.
Ad, modal containment, inert arka plan, tek geri, uygun initial focus ve
restore gerekir. Save conflict local/remote özeti ve intent'ini çizer;
Steam istemcisinin Auto-Cloud dialog'unu ele geçirmez. Cloud servis/revision/
merge motoru ayrı ürün işidir, bu planla sahte gerçek Cloud entegrasyonu eklenmez.

Toast görünür yığın ≤3, kritik > ödül > bilgi; rutin 2–5 s. Hover/focus
zamanı durdurur; aksiyonlu/kritik bildirim erişim kaybedecek biçimde silinmez.
Queue/history ve preemption kararları testlidir. Routine status/polite,
acil `alert` sınırlıdır; savaş HUD/odak alanı ezilmez.
Tooltip mouse hover 400 ms; focus'ta gecikmesiz, hover/focus sürerken kalır,
Esc ile dismiss ve tooltip üstüne geçiş mümkündür. 3 s yalnız koşulsuz
olmayan isteğe bağlı yardım süresidir; controller/touch açık yardım eylemi
vardır. İnteraktif içeriğe Tooltip değil Popover kullanılır.

Tablo hizalama/zebra/sort/pagination; sanal veri semantiği; Kanban drag+
tıkla-taşı; temalı scrollbar; coach-mark skip/back/focus; kredi/legal
okuma yüzeyi; bölüm/satır/reset/apply/undo/açıklamalı ayar deseni gerekir.
Sunum veri defteri, izin motoru, oyun ilerlemesi veya legal politika tutmaz.

## 11. Metin girişi ve native eş

Native DOM editörü korunur. Cut/copy/paste/select-all önce mevcut Android
ActionMode serbest bırakılarak denenir. Gerekli özel native callback dar
bridge'dir; saf JS sahte seçim çubuğu veya generated Activity edit'i değildir.
ReadOnly/disabled/password kuralları ve kullanıcı başlatmalı pano erişimi
vardır. Input composition Enter submit üretmez; caret/selection, Unicode,
maxLength, multiline ve geç async sonuçlar sahipli TextEntry oturumudur.

Insets önce mevcut WebView forwarding ile ölçülür. Android OS/API35 tek
başına visualViewport yetersizliği kanıtı değildir. Native WindowInsets
sağlayıcısı gerçekten gereken profilde fallback olur; JS geometry yedeği,
CSS px dönüşümü ve tek padding sahibi vardır. Docked/floating/split IME,
rotation, çentik, sistem barları ve predictive-back ayrı gerçek probe'lardır.
Deck native dialog/floating/OSK yolları capability'ye göre seçilir;
password mask, multiline, abort, timeout, owner destroy ve overlay yokluğu
sınanır. Sağlayıcı/probe lifecycle var olan mekanizmalara eklenir.

## 12. VOL.SHOWCASE uygulaması

Eski vol-ui tek atomik göçle devtools/vol-showcase oldu; web dev bakışı korunur, ikinci vitrin
kurulmaz. Aktif paket, benzersiz `studio.vol.showcase`, ortak Tauri kabuğunu kullanan kendi
crate'i/ikonu/device ayarı/ölçeği vardır. Windows geliştirme ve ilk native referans önce gelir;
Linux/Deck ve Android ürün kabulü ayrı gerçek ortamlardadır; tool, oyun şablonunun Game
kategorisini kopyalamaz. 12 sekme korunur; onaylı eklemeler **Ses** (var), **Tema**,
**Metin Girişi** ve **Kimlik** (malzeme, ikon, imleç bölümleri) = 16. Üst bar dil/tema/density
ve capability görünürlüğü; keyfi sekme yoktur. Kart örneği rarity, frame/plate, stagger/seçim,
uzun sayı/metin ve her girdi yolunu kapsar.

## 13. Varlık kaynağı ve üretim hattı

**Önce kaynak, sonra icat.** Glif setimiz Kenney Input Prompts'tur (CC0). Aynı yazarın ve
stilin ürünleri ikon ve imleç için temel alınır: Game Icons (CC0), Cursor Pack (CC0, ~180 imleç,
vektör), Crosshair Pack (CC0, ~200 nişangâh, vektör). Oyun ikonu zenginliği için game-icons.net
(CC BY 3.0, 4 binden fazla tek renk siluet, yazar atfı gerekli) kürate edilir. Stile uymayan
yer aynı dille özgün çizilir; çizgi (outline) web ikon setleri kullanılmaz. Kullanılmayan
varlık gönderilmez.

**Kayıt.** Her varlık dizininde kaynak kaydı: URL, sürüm, lisans, tarih, alt küme listesi ve
(CC BY için) ikon başına yazar. CC BY atıfı depodaki atıf dosyasında, manifestte ve uygulama
içi kredi yüzeyinde bulunur; CC0 atıf istemez ama kaydedilir. Kürasyon deterministiktir
(liste → çıktı); elle düzenlenen/çizilen varlık kaynağını ve yazarını belirtir.

**Gönderim.** Yalnız kullanılan alt küme sprite/atlas olarak gönderilir; ikon ve imleç
ihtiyaç anında yüklenir; bundle bütçeleri korunur. Deterministik ara çıktı commit edilmez;
build yalnız tüketicideki shipped asset'i kullanır.

**Ses.** UI sesleri job → yayın kapısı → manifest → tüketici hattıyla teslim edilir; CORE
runtime audio-synth'e bağımlı olmaz. Referans setler yalnız yerel ölçüm içindir.

WAAPI/CSS önceliklidir; video/Rive yeni bağımlılık ancak ölçülen ihtiyaca ve bütçeye dayanır.
SHOWCASE ikonu mevcut `docs/assets/mark/` marka varlığından özgün türetilir. Pencil kaynağı
gerekirse özel AGENTS ve MCP uygulanır; bu plan `.pen` erişimi gerektirmez.

## 14. İmleç sistemi

Üç set ve bağlamsal durumlar:

- **ui:** ok, el (tıklanabilir), metin, meşgul, yasak, yardım, yeniden boyutlandır, sürükle.
- **rts:** seç/kutu seç, taşı, saldır, inşa et, onar, topla/kaz, toplanma noktası, devriye,
  geçersiz hedef, ekran kenarı kaydırma okları. Renk anlamı: düşman kırmızı, dost
  yeşilimsi-mavi, belirsiz sarı, nötr gri; imleç durumu hedef türünden gelir.
- **shooter:** nokta/artı/halka/açılan halka nişangâhları, yakın/uzak, vurgu/parlama, vuruş
  işareti; açılım ve parıltı oyun durumundan beslenir.

**Mekanizma.** Küçük imleçler CSS `cursor` ile verilir: hotspot görsel sınırları içindedir,
32×32 piksel önerilir (tarayıcılar 128×128 üstünü yok sayar), SVG doğal boyut taşır, yüksek
yoğunlukta `image-set`. Büyük, animasyonlu veya dinamik açılımlı nişangâh çizilen **yazılım
imleçtir**: yerel imleç gizlenir, ≤1 kare gecikmeyle işaretçiyi izler, pointer lock ile uyumludur.
Dokunmatik girdide imleç yoktur. Kol işaretçisi (mevcut) ile tek sahip vardır. İmleç skin
aksanını taşır, hareket azaltılmışta animasyonsuz durağan kalır, tek bilgi kanalı olamaz.
WebView2/WebKitGTK/Android'de davranış ölçülür; ölçülemeyen hücre NOT-RUN yazılır.

## Yayılım ve kabul sahipliği

[TODO](TODO.md) uygulama bağımlılıkları ve görev kapanışlarını;
[VERIFICATION](VERIFICATION.md) kanıt profili ve sayısal kabulü taşır.
Buton dikey dilimi malzeme/ikon/imleç/ses/juice temelini uçtan uca tüketir; sonraki
aileler aynı grameri kendi davranışlarına uygular. Teknik başlangıç
Windows önceliklidir; Linux/Deck ve Android gerçek kabulü ayrı kalır.

Yeni mekanizma kapı bileşimine girmeden mevcut kapıymış gibi raporlanmaz.
Piksel temeli yalnız bilinçli değişen sahne/state için yenilenir; rename
veya yeşil test uğruna bütün temel değiştirilmez. Ses yayını teknik QA ile
doğrulanır ve kullanıcının dinleme kararıyla kabul edilir. Görsel, imleç,
erişilebilirlik ve haptik insan yargısı kendi kanıtına bağlıdır. Kök fizik/hava/slalom/çoklu tank işleri UI ile kapanmaz.

## Özgün üretim

Her bileşen [katalogdaki](CATALOG.md) ailesinin anchor gerekçesini tüketir.
Anchor sayısal performans, AA veya ses seviyesi kanıtı değildir.
Somut görsel örnek ve özgün VOL farkı uygulama kabulünde kaydedilir;
asset kopyalanmaz. Kaynakların kanıt sınırları aşağıdadır.

## Public uyum ve katalog

Mark → uyarı → geçiş notu → kaldırma yalnız açık ayrı API işiyle yapılır.
Bu UI kapsamıyla mevcut public sınıf/helper silinmez. Public type lock ve
doc symbol kapıları korunur. Sessiz setter düzeltmesi gibi davranış
değişiminde tüketici taraması/test ve uyum yolu gerekir. Tier-2 vitrinde
kalır; sırf üretim tüketicisi yok diye ölmez. Yeni public bileşen kendi
modül adlı testi, vitrin ve README sekme kaydıyla aynı commit'te eklenir.

PauseResumeButton'ın mevcut `setRunning` callback sözleşmesi sessizce
değiştirilmez: yeni additive sessiz senkronizasyon yolu sunulur, eski
metot geçiş notuyla callback davranışını korur. Eski setter callback'i
kullanıcı niyeti diye seslendirilmez. Breaking kaldırma ayrı API işi olur.

## Sahiplik sınırı

Canlı games glob'u ve oyun bundle/scaling bütçeleri VOL.TEST için gereklidir.
Eski ürünler arşiv etiketindedir; bu UI işi onları diriltmez. Oyun fiziği,
Steam App ID/hesap açma, gerçek Cloud revision/merge motoru ve yeni auth
ürünü kapsam dışıdır. Paket göçünün kalıntı taraması UI-06/UI-13'tedir.
Kök F08/F09 cihaz işleri UI laboratuvarının kabulüyle kapanmaz.

## Birincil kaynaklar ve kanıt sınırları

### Erişilebilirlik ve widget davranışı

- [WCAG 2.2 normatif metin](https://www.w3.org/TR/WCAG22/): hedef bütün
  uygulanabilir A/AA; Understanding ve APG yardımcı açıklamadır.
- [Target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html):
  24×24 CSS px AA ve istisnalar. 44 CSS px ürün kararı;
  [Android dokunma önerisi](https://developer.android.com/guide/topics/ui/accessibility/apps)
  48dp ayrı platform ölçüsüdür; eşit piksel sayılmaz.
- [Resize text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)
  ve [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html):
  %200 ve dar panel kabulü; Android sistem font ölçeğiyle aynı test değildir.
- [Hover/focus content](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html):
  kullanıcı tetik sürerken okuyabilir/hover edebilir/kapatabilir;
  zorunlu3s timeout uygun bir kural değildir.
- [Focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html),
  [dragging](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html),
  [status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html):
  sırasıyla katman örtüşmesi, drag dışı tek pointer alternatifi ve odaksız
  duyuru; bütün bildirimleri alert yapmak çözüm değildir.
- [Animation from interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)
  AAA'dır; reduced-motion ayrıca ürün gereğidir.
  [Flash sınırı](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html)
  yalnız reduced-motion'la otomatik karşılanmaz.
- [APG modal](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/),
  [klavye arayüzü](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/),
  [slider](https://www.w3.org/WAI/ARIA/apg/patterns/slider/),
  [combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/): focus,
  roving/edit mode ve ARIA pattern rehberi; görsel grid'e otomatik role=grid yoktur.
- [axe-core](https://github.com/dequelabs/axe-core): otomasyon sınırlıdır;
  incomplete manuel yargı ister, jsdom gerçek kontrast ölçmez.
- [Valve uyumluluk incelemesi](https://partner.steamgames.com/doc/steamhardware/compat):
  çizilmiş glyph yüksekliği ≥9 px, ≥12 px önerisi; computed font-size bunu
  tek başına garanti etmez. Kol/klavye akışı native cihazda da sınanır.

### Tema, performans ve ses

- [CLS](https://web.dev/articles/cls) yakın input shift istisnasını,
  [Layout Instability](https://wicg.github.io/layout-instability/) entry
  modelini açıklar. [WebKit PerformanceObserver kaynak kodu](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/page/PerformanceObserver.cpp)
  incelenen sürümde layout-shift destek listesi taşımaz. Runtime feature detect
  zorunludur; undefined0'a çevrilmez.
- [RenderingNG](https://developer.chrome.com/docs/chromium/renderingng-architecture)
  style/layout/paint/compositor ayrımını açıklar; transform/opacity kesin
  GPU hızlanması garantisi değildir. [Event Timing](https://www.w3.org/TR/event-timing/)
  her gamepad/continuous gesture olayı için evrensel ölçüm sağlamaz.
- [Web Audio GainNode](https://www.w3.org/TR/webaudio/#GainNode) lineer
  amplitude'dür; [EBU R128](https://tech.ebu.ch/loudness/) broadcast program
  ölçüsüdür, evrensel kısa game click hedefi değildir. Uygulanan mixing
  örneğinin gerçek peak ve burst ölçümü gerekir.
- [Web Audio highpass](https://www.w3.org/TR/webaudio/#dom-biquadfiltertype-highpass)
  cutoff altını azaltır; UI seslerinde gövde bandı kesilmez, sub ayrı isteğe bağlı dalıdır.
  [Chrome autoplay](https://developer.chrome.com/blog/autoplay/) ve
  [Web Audio uygulama önerileri](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)
  jest ve kullanıcı kontrolü gerektirir; preference açık diye duyulan ses garantisi verilmez.
- [i18next plurals](https://www.i18next.com/translation-function/plurals) ve
  [formatting](https://www.i18next.com/translation-function/formatting):
  JSON `count`/CLDR ve Intl mevcut çözümü yeterlidir; ICU ayrı plugin tercihidir.

### Varlık, imleç ve oyun arayüzü kaynakları

- [Kenney Input Prompts](https://kenney.nl/assets/input-prompts), [Game Icons](https://kenney.nl/assets/game-icons),
  [Cursor Pack](https://kenney.nl/assets/cursor-pack), [Crosshair Pack](https://kenney.nl/assets/crosshair-pack),
  [Interface Sounds](https://kenney.nl/assets/interface-sounds), [UI Audio](https://kenney.nl/assets/ui-audio):
  CC0; atıf istenmez. Paket içerikleri (180 imleç, 200 nişangâh, 105 ikon, 100/50 ses) indirilip
  incelendi; ses paketleri yalnız yerel ölçüm referansıdır.
- [game-icons.net](https://game-icons.net/about.html): CC BY 3.0; ticari kullanım serbest, yazar
  atfı zorunlu. Atıf kaydı varlıkla birlikte tutulur.
- [MDN cursor](https://developer.mozilla.org/en-US/docs/Web/CSS/cursor): görsel imleç boyut
  sınırı (128×128 üstü yok sayılır, 32×32 önerilir), hotspot ve biçim kuralları.
- [Audiokinetic UI ses rehberi](https://www.audiokinetic.com/en/approaching-ui-audio-ui-design-perspective-2):
  basma/bırakma/iptal ayrımı, durum başına varlık. Perde yönü ve hover ölçülülüğü gibi ilkeler
  tasarım rehberidir; sayısal hedef değildir.
- RTS imleç durumları (Age of Empires, Command & Conquer, StarCraft) ve Spring RTS kavram
  çalışması bağlamsal imleç sözlüğünün kaynağıdır; renk anlamı (düşman/dost/belirsiz) oradandır.

### Native sınırlar

- [Android WebView insets](https://developer.android.com/develop/ui/views/layout/webapps/understand-window-insets):
  fullscreen safe-area M136, tüm WebView IME visualViewport M139, tüm
  WebView system/cutout M144 destek geçişleri. Belge sürüm davranışını
  açıklar; cihazdaki uygulama bayrakları/forwarding ayrıca ölçülür.
- [Tauri #10631](https://github.com/tauri-apps/tauri/issues/10631) eski
  beta.25 visualViewport bug raporudur; güncel sürüm düzeltme garantisi
  veya ActionMode gerekçesi değildir.
- [Tauri mobil plugin rehberi](https://v2.tauri.app/develop/plugins/develop-mobile/),
  [Tauri2.11.5 Plugin.kt](https://raw.githubusercontent.com/tauri-apps/tauri/tauri-v2.11.5/crates/tauri/mobile/android/src/main/java/app/tauri/plugin/Plugin.kt),
  [Wry0.55.1 Activity](https://raw.githubusercontent.com/tauri-apps/wry/wry-v0.55.1/src/android/kotlin/WryActivity.kt):
  `load(webView)`, `onDestroy(activity)` ve `onWebViewCreate` gerçek pinli
  API'lerdir; Kotlin Plugin'de hayali `dispose` hook'u kullanılmaz.
- [ActionMode.Callback](https://developer.android.com/reference/android/view/ActionMode.Callback):
  create/prepare/click/destroy lifecycle; WebView'a TextView selection API'si
  uydurulmaz. Önce standart editör davranışı doğrulanır.
- [Tauri clipboard](https://v2.tauri.app/plugin/clipboard/) setup ve
  capability ister; [Android sensitive clipboard](https://developer.android.com/privacy-and-security/risks/secure-clipboard-handling)
  bayrağı upstream'in her sürümünde otomatik uygulanmış sayılmaz.
- [ISteamUtils](https://partner.steamgames.com/doc/api/ISteamUtils):
  dialog Normal/Password ve floating field key event yolları farklıdır.
  [ISteamInput](https://partner.steamgames.com/doc/api/ISteamInput)
  action-origin glifi/cihaz capability'sidir; Gamepad.id gerçek remap değildir.
- [Linux FF](https://docs.kernel.org/input/ff.html) fd/effect/stop lifecycle
  tanımlar; donanım izin/destek garantisi vermez.
- [Steam Cloud](https://partner.steamgames.com/doc/features/cloud):
  Auto-Cloud istemci eşitlemesi ve RemoteStorage API ayrı yollar;
  gösterim widget'ı revision/merge servisi değildir.
- [Windows installer](https://v2.tauri.app/distribute/windows-installer/):
  NSIS/MSI/WebView2 seçenekleri; Linux'ta derlenmiş olması Windows kabulü değildir.

## Anchor araştırmasının sınırı

Nex Machina, Hades/Dead Cells, Streets of Rage4, Control/DiabloIV,
Mindustry ve Celeste onaylı **estetik esin** seçimidir. Buradaki timing,
voice/gain, partikül ve blur sayıları bu oyunlardan ölçülmedi.
[Mindustry Styles kaynağı](https://github.com/Anuken/Mindustry/blob/master/core/src/mindustry/ui/Styles.java)
ve [Hades geliştirici notları](https://www.supergiantgames.com/blog/hades-updates/)
ürün örnekleridir; kendi renderer/AA bütçemizi doğrulamaz.
[Diablo IV erişilebilirlik yazısı](https://news.blizzard.com/en-gb/article/23954932/combatting-demons-with-accessibility-in-diablo-iv)
font/ikon/okuma kararlarına birincil örnektir, depth/blur maliyeti kanıtı değildir.
[Dotemu Streets of Rage 4 sayfası](https://www.dotemu.com/games/streets-of-rage-4/)
ve [Remedy Control sayfası](https://www.remedygames.com/games/control)
resmi ürün/görsel kaynaklarıdır; bevel/depth seçimi bizim estetik yorumumuzdur.
[FMOD Celeste proje rehberi](https://www.fmod.com/docs/2.03/studio/appendix-a-celeste.html)
geliştirici event açıklamalarının bulunduğu eğitim projesini doğrular.
Bu kaynaklardan UI süre/gain ölçümü türetilmez; ürün adı dinleme kanıtı değildir.
Her ailenin anchor gerekçesi CATALOG'dadır; özgün görsel örnek incelemesi
uygulamanın kabulüdür, ses yayını teknik QA ile tamamlanır. Eksik kanıtın yerine oyun adı koyulmaz.
