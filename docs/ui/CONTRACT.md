# Arayüz tasarım dili ve sunum sözleşmesi — v6 FINAL

Bu sözleşme onaylı hedef davranıştır. Henüz mevcut olmayan mekanizmalar
[iş listesinde](TODO.md) uygulanır; mevcut gerçek ve gerekçe
[araştırmada](RESEARCH.md), kanıt yöntemi [doğrulamada](VERIFICATION.md) bulunur.
Sayısal sanat/ses presetleri başlangıç tasarım kararıdır; ölçülmüş optimum
veya WCAG gereği değildir. Kalibrasyon değişikliği gerekçesiyle bu tek
kaynakta yapılır. WCAG 2.2 AA tüm uygulanabilir A/AA ölçütlerini kapsar.

## Sözlük

**Ton basamağı:** page < well < panel < plate. **Tier-1:** aktif ürünün
tükettiği veya ortak temel olarak belirlenen öncelikli bileşen. **Tier-2:**
katalogda bekleyen bileşen. **Semantik olay:** kabul edilmiş UI niyeti veya
durum sonucu. **Density:** compact/comfy/touch. **Skin:** görsel/ses
tercihlerinin uygulama tarafından bağlanan seti. **Anchor:** özgün üretime
yön veren esin. **CLS:** standart layout-shift ölçütü; tüm geometri testi
değildir. **Kalıntı:** artık geçerli olmayan canlı referans.

## 1. Amaç, kapsam ve tüketim

CORE UI görünüm, etkileşim, ergonomi ve geri bildirimi tek dilde sunar.
Hiçbir katalog bileşeni bu çalışma nedeniyle silinmez. CORE generic kalır;
SHOWCASE örnekleri gösterir; VOL.TEST gerçek tüketici entegrasyonudur.
Aktif kullanım, dolaylı kullanım, katalog kullanımı ve arşiv ayrılır.

Tier-1 tabanı Button, IconButton, Text, Panel, Select, Checkbox, Slider,
HoldButton, Bar/XPBar, ScrollView ve picker'lardır; aktif tüketimdeki diğer
sınıflar da tier-1'dir. [Katalog](CATALOG.md) yetkili başlangıç listesidir.
Tüketilen tier-2 aynı değişiklikte tier-1 durum matrisine terfi eder.
Button boyutları tüketim sayısından bağımsız vitrin eksenidir; tarihsel
VOL.HELL sayımı canlı öncelik veya test kanıtı değildir.

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

## 3. Görsel dil

Page/well/panel/plate, ton farkı + iç gölge + hairline + üst ışık ile ayrılır.
Gövde metni karmaşık malzeme üstünde backplate olmadan durmaz. Etkileşim
radyusu 2–4 px, sunum radyusu 6–10 px presetidir. Basış bevel'i ters çevirir.
Çerçeve dış boşluk, iç hairline, köşe vurgusu, başlık şeridi ve ayraçtan oluşur;
tek `--vol-frame-*` ailesi, SVG/9-slice üretimi ve aynı state grameri kullanılır.

Renk rolleri brand, semantic, accent, rarity ve emissive'dir. Rarity ×
normal/hover/selected/disabled dört durumuyla sınanır; locked/error ayrı
anlam taşır. CardTile ve SlotGrid rarity tipleri otomatik birleştirilmez.
Rarity bağımsız nötr kart yüzeyi mevcut Panel/Text/Button bileşimi ve ortak
CORE card skin'iyle sunulur; CardTile aynı yüzeye rarity katmanı ekler.
Bu nedenle bütün kartların oyun nadirliği taşımaya zorlanması veya ikinci
kart uygulamasının vitrinde icat edilmesi gerekmez.
Renk tek taşıyıcı değildir: metin/ikon/desen/seçim işareti birlikte kullanılır.
Text rol ölçeği, tabular sayılar, HUD backplate ve uzun label tasarlanır.
UI ikonları oyun rig/sprite'ından ayrı 16/24/32/48 ölçülerde, uygun plakayla
sunulur; ikon-only eylemin erişilebilir adı bulunur. İmleç tema parçasıdır;
sistem metin imleci ve OS seçim tutamaçları taklit edilmez.
Tema geçişi animasyonsuzdur; odağı, scroll'u, seçimi ve kutu ölçülerini korur.

## 4. Hareket ve kaynak yaşam döngüsü

Temel duration tokenları fast/base/slow/cinematic=120/200/320/480 ms;
easing ailesi standard/decelerate/accelerate olarak tek kaynakta tanımlanır.
Özel koreografi de adlandırılmış preset'tir: scrim/dialog giriş 120/200,
modal çıkış 140, kart stagger 40, HUD artış/azalış 200/80, sekme 160 +6 px,
sahne çıkış/giriş 200/320 ms. Böylece dört temel tokenla çelişen gizli
sayısal istisna kalmaz. Loading minimum görünür süre 500 ms opt-in tarif
kararıdır; bloklamayan hazır içerik sırf animasyon için bekletilmez.

Mouse hover scale 1.02 + emissive, press 0.96 + ters bevel, kart seçim
1.04 + parıltı başlangıç presetidir. Ring/selected bilgi hareketsiz de kalır.
`<100 ms` olaydan ilk görünür cevabın başlamasıdır; toplam animasyon süresi
değildir. Asenkron iş hemen busy/ack gösterir, sonuç ayrıca bildirilir.

UI root başına en çok 3 eşzamanlı **semantik geçiş grubu**, toplam 64 UI
dekor parçacığı ve 1 etkin blur yüzeyi vardır. Bir grubun sınırsız alt
animasyonla sınırı delmesi yasaktır; child/layer/pixel alanı probu da tutulur.
Öncelik kritik/odak > kullanıcının eylemi > dekor; burst'te dekor düşürülür.
Blur performans/capability yedeği düz scrim'dir. Sürekli dikkat dağıtan
parıltı ve kontrolsüz flash yoktur; tüm sahnede WCAG flash sınırı korunur.

Reduced-motion dekor sürelerini 0 yapar; anlam opacity/etiket/ring ile
korunur. Hold/charge/oyun sayacı gibi işlev süresi sıfırlanmaz. Cancel,
interruption, destroy, dil/tema değişimi ve hidden/suspend son durumunu
deterministik verir. Animasyon olayı gelmese de temizlik tamamlanır.
İki bağımsız kaynak varsa DisposableScope; listener/timer/abonelik/voice
sahipsiz kalmaz. Lint yalnız UI hareket süreleri içindir; domain timeout,
rate-limit ve genel animateValue numeric API'si yanlışlıkla yasaklanmaz.

## 5. Ses, semantik niyet ve haptik

Primitive ses motorunu kurmaz; kabul edilmiş niyeti bir kez bildirir.
Uygulamanın tek UiSoundKit/geri bildirim sahibi seti çalar. Shared UIRoot
aynı parent'ta ikinci feedback listener kurmaz. Örnek olay ailesi
`ui.press`, `ui.value.commit`, `ui.select`, `ui.open`, `ui.close`,
`ui.success`, `ui.warning`, `ui.error`dir; final typed olaylar UI-02'de kilitlenir.
Programatik sessiz setter ses/commit üretmez; iptal rollback'i başarı sayılmaz.
Promise'in çözülmesi tek başına oyun/ürün başarısı değildir; başarı/uyarı
sonucunu host bildirir. Primitive yalnız kendi accepted intent ve busy
durumunu bilir. Mevcut primitive haptik yolu korunuyorsa merkezi provider
ikinci darbe üretmez; olay ve driver sahipliği tekildir.

UiSoundKit için Phaser taşımayan dedicated public audio/UI subpath
tanımlanır; SHOWCASE CORE kök barrel'ını açmak zorunda kalmaz. Mevcut
SidechainDucker yalnız kökte export edilir; yeni kit iç modülden kullanır,
dış tüketim gerekiyorsa ilgili subpath bilinçli public surface değişimidir.

UI ses tercihi varsayılan açık, **gerçek kullanıcı jestiyle** audio açılır.
Master/UI/SFX/music/VO device ayarları mevcut kalıcılık arkasındadır.
Görsel/semantik geri bildirim garantidir; ses ve haptik mute, sürücü yokluğu,
autoplay veya bütçe nedeniyle best-effort'tür. Haptik mevcut opt-in/default
kapalı davranışını korur. VOL.TEST'te müzik/ambiyans eklenmez.

| Olay sınıfı | Başlangıç süre (ms) | Başlangıç lineer gain |
| ----------- | ------------------- | --------------------- |
| Mikro       | 50–120              | 0.2–0.3               |
| Tık         | 100–180             | 0.25–0.35             |
| Başarı      | 200–400             | 0.3–0.5               |
| Uyarı       | 250–500             | 0.4–0.5               |
| Kilometre   | 400–800             | 0.5–0.6               |
| Büyük sonuç | 600–1200            | 0.6–0.8               |

Bu gain tablosu LUFS/dBTP hedefi değildir. Kanonik yayın hattı süre,
finite/clipping/DC/peak/codec-sonrası true peak'i ölçer; kısa click için
broadcast LUFS standardı evrensel hedef ilan edilmez. Transient 5–15,
body 60–160 ms; büyükte isteğe bağlı 60–120 Hz bass. Ana body HPF 150–200
Hz uygulanırsa bass ayrı düşük-cutoff dalından geçer. Tiny-room presetinde
30–60 ms erken yansıma/tail tanımı ayrı yazılır, wet gain %8–12 başlangıçtır;
kuru yedek vardır. Final routing/level gerçek set dinlemesiyle kalibre edilir.

UI, VO/müzikle yarışmaz. Yalnız kritik olayın opt-in duck'ı −6 dB
(lineer ~0.501187), attack/hold/release=120/80/450 ms'dir; overlap, iptal,
suspend ve kaynak kapanışında müzik geri gelir. Mevcut SidechainDucker
kullanılır; uygulamada müzik/VO yoksa bus veya sahte içerik yaratılmaz.

Micro/hover tekrarı 120 ms throttle/drop, olay başına 3 varyant
round-robin ve ±%5 playback-rate tasarım presetidir; kritik sonuç ayrı
önceliklidir, aynı throttle onu yutmaz. UI toplam voice ≤4; genel SoundBank
varsayılanları değiştirilmez. Varyant/RNG simülasyon akışını tüketmez.
Press tok, primary isteğe bağlı alt gövde, danger çatlak, icon kısa/parlak;
disabled sessiz. Hover yalnız gerçek mouse. Boyuta bağlı ±1–2 dB değişim
varsayılan kapalıdır. Loading başlangıç/bitiş birer olay; sürekli loop genel
varsayılan değildir. Skin `default`; oyun skin'i gelecekte opt-in'dir.

Haptik press/onay/hata/kritik eşlemesi mevcut desenlerin üzerindedir;
yeni desen gerekiyorsa public sözleşme bilinçli genişler. Anahtar, şiddet
tavanı ve rate-limit vardır. Tek backend seçilir; blur/sleep/unplug/destroy
darbenin sahibini durdurur. Ekran üzerinde ses/haptik tek bilgi kanalı olmaz.

## 6. Tema, density ve seçici

Default VOL_COLORS public uyumu korunur. TS renk tanımları → `gen:theme`
→ default `:root` ve `:root[data-vol-theme='ember']` üretir. Tema renk,
doku, edge intensity ve scrim'i değiştirir; font/geometri tokenlarını
tema bazında değiştirmez. Registry ve üretici regex'e bağımlı genişletilmez;
tip/anahtar paritesi ve deterministik sıralama gerekir.
Scoped preview aynı token sözleşmesini kullanır; body overlay yanlış
kökten tema almaz. Canvas okuyucusu değişimi gözler, literal renk sızıntısı
kalmaz. Default CSS renkleriyle uyum geriye dönük korunur.

Default + `ember` için gerçek final foreground/background üzerinde AA
kontrast, durum/focus/non-text kontrolleri vardır. Default piksel ratchet'i
korunur; ember computed-style + geometri + etkileşim + kontrast ve seçilmiş
kanonik görsel insan kontrolüyle kabul edilir. Switch standard CLS hedefi
0 ve bütün motorlarda kutu sabitliğidir; unsupported CLS “0” sayılmaz.
Üst barda canlı tema/dil seçici; tercih device, bilinmeyen tema default'a döner.

## 7. i18n ve font

“Sıfırdan” görünür UI metni/anahtar sağlığıdır; çalışan i18next,
depolama ve dil motoru yeniden yazılmaz. `<alan>.<bileşen>.<öğe>` adlandırma;
TR tek ürün dili, EN aynı key kümesi. JSON key listesi kaynak, ikinci
elle key defteri yoktur. i18next JSON çoğul `count` ve Intl sayı/ölçü/tarih
biçimleme kullanılır; mevcut olmayan ICU eklentisi varmış sayılmaz.

Modül düzeyinde t() yok; açık overlay/OSK dahil dil değişimi günceldir.
TR/EN parite + ölü anahtar + hardcoded görünen metin kontrolü + sentetik
%30 genişleme testi vardır. Eksik anahtar vitrin/testte görünür hatadır;
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
semantiği, XPBar Lv etiketi, PauseResume sayaç sahipliği, DualAxis child
jestleri, OSK abort/locale ve ToolButton ayrı örneği açık görevlerdir.
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

Mevcut vol-ui tek atomik göçle devtools/vol-showcase olur; web dev bakışı
korunur, ikinci vitrin kurulmaz. Aktif paket, benzersiz `studio.vol.showcase`,
ortak Tauri kabuğunu kullanan kendi crate'i/ikonu/device ayarı/ölçeği vardır.
Linux/Deck → Android → Windows; tool, oyun şablonunun Game kategorisini
kopyalamaz. Native ikon keşif kapısı tools'u da kapsayacak şekilde geliştirilir.
12 sekme korunur + onaylı Ses/Tema/Metin Girişi=15. Üst bar dil/tema/density
ve capability görünürlüğü; yeni keyfi sekme yoktur. Kart örneği rarity,
frame/plate, stagger/seçim, uzun sayı/metin ve her girdi yolunu kapsar.

## 13. Asset ve üretim hattı

SVG/9-slice frame/plaka, token renkli özgün UI ikonları, deterministik doku
üreticisi ve source→producer→shipped kaydı gerekir. Deterministik ara çıktı
commit edilmez; build yalnız tüketicideki shipped asset'i kullanır.
UI sesleri job → yayın kapısı → manifest → consumer hattıyla teslim edilir;
CORE runtime audio-synth'e bağımlı olmaz. WAAPI/CSS önceliklidir;
video/Rive yeni bağımlılık ancak ölçülen ihtiyaca ve bütçeye dayanır.
SHOWCASE ikonu mevcut `docs/assets/mark/` marka varlığından özgün türetilir;
eski .github/assets/ yolu yoktur. Pencil kaynağı gerekirse özel AGENTS
ve MCP uygulanır; bu plan `.pen` erişimi gerektirmez.

## 14. Yayılım ve kilometre taşları

[Faz akışı](README.md#faz-akışı) ve TODO tek uygulama sırasıdır. Buton
pilotunda ses/hareket/frame/focus bütünleşir, sonra kart ve panel/form
yayılımı gelir. HUD → advanced → touch/loading → text/scroll/workbench/
palette kapsamı görevlerle tamamlanır; laboratuvarlar native geri bildirim
için erkene alınabilir. Her kilometre taşında yalnız **bilinçli değişen**
görsel temel yenilenir; rename veya yeşil test uğruna bütün snapshot yenilenmez.

## 15. Kapılar ve ölçülebilir kabul

Parite/kontrast, tema geometri smoke, axe, durum kayıt bütünlüğü, motion
token lint, i18n/uzunluk, semantik ses probu, UI perf, glyph okunabilirlik,
determinizm ve default piksel temeli kabul paketidir. Var olan ile gelecekte
eklenecek kapılar VERIFICATION'da ayrıdır; justfile tek kapı kaynağıdır.
İlk görünür cevap p95 <100 ms; max ayrıca raporlanır. UI CPU p95 üst güven
sınırı + noise guard < hedef frame süresinin %5'i; GPU/presentation ayrıca
ölçülür. UI %5 CPU geçişi bütün oyun performansı geçti demek değildir.

Reduced-motion işlev tam; odak görünür; uygulanabilir AA; uzun metin/
6 hane kırpılmaz; kol-only erişim tam; tema kutuları sabit; ses/haptik
kapalıyken aynı işlev vardır. Pilot önce/sonra, hareket kaydı ve kanonik
ses örneği taşır. Gerçek cihaz/dinleme kabulü NOT-RUN bırakılmazsa ancak
gerçek kanıtla PASS olur; cihaz yokluğu sınırı gevşetmez.

## 16. Riskler ve kök neden sınırı

Zevk drifti anchor+görsel incelemeyle; efekt obezitesi bütçe+fallback ile;
AA regresyonu state/AT matrisiyle; asset borcu üretici kaydıyla;
native ActionMode/IME riskleri pinli kaynak+cihaz probe'uyla yönetilir.
Tema sayısı ikiyle sınırlıdır. Font kapsaması, renk dışı anlam, WebGL+DOM
shared GPU, autoplay, async owner ve sleep/resume gerçek test kapsamındadır.
Deck/VOL.TEST'in açık fizik/hava/slalom/çoklu tank sunum sorunları UI
çalışmasında susturulmaz; kök TODO'daki kendi ölçüm işleri korunur.

## 17. Kesinleşmiş kararlar

UI audio tercih default açık; autoplay gesture koşullu. Haptik mevcut
opt-in davranışında. İkinci tema ember; default korunur. Platform sırası
Linux/Deck, Android, Windows. Hedef WCAG 2.2 AA; AAA focus appearance ve
motion ölçütleri ilhamdır. TR birincil, EN parite, deterministik %30 fixture.
Default UI sound skin ve gelecekte opt-in game skin. Marka kaynağı
docs/assets/mark. ICU yerine mevcut i18next JSON plural + Intl.
Onaylı 15 sekme, bir vitrin, bir native kabuk sahibi; yeni oyun menüsü yoktur.

## 18. Anchor ve özgün üretim

Nex Machina HUD; Hades/Dead Cells seçim; Streets of Rage 4 plaka/bevel;
Control/Diablo IV katman/emissive; Mindustry az renkle okunabilir araç
yüzeyi; Celeste kısa ses paleti. Her bileşen [katalogdaki](CATALOG.md)
ailesinin en az bir anchor'ına **işlev gerekçesiyle** bağlıdır. Uygulayıcı
somut örnek ve özgün VOL farkını görsel/ses incelemesinde kaydeder.
Anchor sayısal performans/AA/ses seviyesi kanıtı değildir; bu araştırma
bütün oyun görüntülerini veya seslerini incelemiş olduğu iddiasını taşımaz.
Asset kopyalanmaz; özgün kaynak üretilir.

## 19. Deprecation ve katalog

Mark → uyarı → geçiş notu → kaldırma yalnız açık ayrı API işiyle yapılır.
Bu UI turunda mevcut public sınıf/helper silinmez. Public type lock ve
doc symbol kapıları korunur. Sessiz setter düzeltmesi gibi davranış
değişiminde tüketici taraması/test ve uyum yolu gerekir. Tier-2 vitrinde
kalır; sırf üretim tüketicisi yok diye ölmez. Yeni public bileşen kendi
modül adlı testi, vitrin ve README sekme kaydıyla aynı commit'te eklenir.

PauseResumeButton'ın mevcut `setRunning` callback sözleşmesi sessizce
değiştirilmez: yeni additive sessiz senkronizasyon yolu sunulur, eski
metot geçiş notuyla callback davranışını korur. Eski setter callback'i
kullanıcı niyeti diye seslendirilmez. Breaking kaldırma ayrı API işi olur.

## 20. Kalıntı sicili ve dürüst kapanış

| v5 kaydı                         | Nihai değerlendirme                                          |
| -------------------------------- | ------------------------------------------------------------ |
| R1 games glob                    | Gerekli; VOL.TEST aktif. Silme görevi yok.                   |
| R2 aktif oyun bütçesi açıklaması | Gerekli; VOL.TEST bundle/scaling var. Stale iddiası kapalı.  |
| R3 D0/D1/D2                      | Gerçek ürün kabul işleri açık; bu UI planı bunları kapatmaz. |
| R4 AGENTS oyun yolları           | Güncel mimari ve yeni oyun sözleşmesi.                       |
| R5 .idea                         | Ignored; tracked veya güncel untracked commit adayı değil.   |

VOL.HELL/VOL.ARACHNID kaynakları canlı ağaçta yoktur, annotated arşiv
etiketlerinde korunur. VOL.TEST canlıdır. Sonraki gerçek kalıntı taraması
UI-06 paket rename referansları ve UI-13 bütünlük kontrolüdür.
Planın tamamlanması uygulamanın tamamlanması değildir. Her fazın mevcut
durumu yalnız TODO ve gerçek kanıtla belirlenir; kanıt geçmişi git/private
records'tadır, kaynak yorumlarında veya sürekli karar günlüğünde değildir.
