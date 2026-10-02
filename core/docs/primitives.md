# CORE primitifleri

Primitifler işiyle tanımlanır; tüketicinin oyun kuralını bilmez. Mekanizma
sunumdan bağımsızdır, sunum durumu çizer ve niyet bildirir, yaygın kurallar
opt-in tarifte yaşar. Public yüzey paket `exports` haritasıdır.

## Sayı, ad ve yokluk sözleşmesi

Yapılandırmanın sonlu olmayan sayısı sınırda reddedilir; akışın bozuk delta
örneği durumu kirletmeden yoksayılır. `requireFinite` ve `finiteOr` bu iki
politikanın karşılığıdır. Sessiz düzeltme yapılandırma hatasını gizlemez.

`get` durumu okur, `create` değer üretir, `is`/`has`/`should` boolean sorudur.
Manager kaynak kümesini, Controller tek davranışı koordine eder. Kısaltma
aynı yüzeyde tek yazım taşır.

`undefined` arama ya da seçim yokluğudur; `null` hesaplanmış sonuç yokluğudur.
Örneğin boş kap `undefined`, aranan yolun bulunamaması `null` döndürür.
Çağıran yokluk anlamını kendiliğinden değiştirmez.

## Simülasyon ve rastgelelik

`SimulationClock` render delta'sını sabit adımlara böler. Varsayılan
`partialStep: 'simulate'` artık süreyi değişken adım olarak işler; hızlı
tepki sağlar, sonuç render temposundan bağımsız değildir. `'defer'` yalnız
bütün adımı işler, artığı biriktirir; replay ve headless simülasyon için
seçilir. `getInterpolationAlpha()` iki simülasyon durumu arasında render
ara değerini sağlar. Frame raporu gerçek partial step miktarını taşır.

### `createStatefulRandom`

`createRandom` ile aynı diziyi üretir; `getState` ve `setState` ile 32-bit
akış yakalanıp geri yüklenir. Sıfır geçerli durumdur, sonlu olmayan durum
reddedilir. Snapshot sınırını ve isimli oyun akışlarını tüketici belirler.

## Kalıcılık

### `AutosaveCoordinator`

Anlık görüntüyü periyodik ve arka plan tetiklerinde seri yazıma toplar.
Yazım sürerken ara snapshotlar birikmez; bekleyen en güncel değer yazılır.
`capture` ve `save` tüketicinindir. `null` geçerli generic değerdir; capture
başarısızlığı exception ile bildirilir. `stop` yeni tetikleri kapatır;
terminal dayanıklılık için `flushAndDispose` beklenir.

### `PersistedObservableState`

Yükleme, abonelik, debounce ve seri son-değer-kazanır yazım sağlar. Parse,
clone, varsayılan ve eşitlik politikası tüketicinindir. `set` değeri,
`update` fonksiyonu ayrı alır; fonksiyon geçerli state olduğunda belirsizlik
oluşmaz. Bellek ve dinleyiciler eşzamanlı, kalıcılık Promise ile güncellenir.

`dispose` senkron ve idempotenttir; debounce değerini writer'a verir,
Promise'leri açıkta bırakmaz fakat disk dayanıklılığı vaat etmez. `get`
son snapshot'ı okumaya devam eder. `flushAndDispose` kuyruğun boşalmasını
bekleyen terminal bariyerdir.

## Zaman

Bu mekanizmalar delta ile ilerler; `update` çağrılmadan zaman akmaz.
Duraklatma tüketicinin güncelleme akışını durdurmasıyla uygulanabilir.

### `Scheduler`

Gecikmeli ve tekrarlı işleri aynı delta dizisinde aynı sırayla yürütür.
Callback içinden yeniden `update` reddedilir. Uzun karede catch-up sınırlıdır;
`maxCatchUp` aşılınca kalan borç düşer ve `onCatchUpLimit` bildirilir. Yayın
sırasında eklenen iş aynı turda çalışmaz.

### `Cooldown`

Yeniden kullanılabilirliğe kalan süreyi ve ilerlemeyi tutar. `tryTrigger`
kontrol ile tetiklemeyi tek çağrıda yapar. `setDuration` devam eden beklemeyi
kısaltabilir; ilerleme 0–1 aralığındadır.

### `RoundLoop`

Ardışık tur ve aradaki molayı yürütür. İlk tur `start` ile hemen başlar;
`totalRounds` yoksa sürer, `skipBreak` aradaki molayı geçer. Turun ürün
anlamı ve bitiş işlemi callback üzerinden tüketicidedir.

### `Clock`

Duraklatılabilir ve ölçeklenebilir geçen süreyi tutar. Ölçek sıfırsa donar.
Simülasyon içindeki süre bu sayaçtan, duvar saati ayrı kaynaktan alınır.

## Durum ve olay

### `StateMachine`

Tipli geçiş kümesi kullanır. Geçiş listesi yoksa bütün geçişler serbest,
boş liste ise terminaldir. Sıra `onExit`, durum değişimi, `onEnter`dir;
onEnter yeni durumu okur. Kanca fırlarsa state kaynağa döner fakat dış
etkiler geri alınamaz. İstisna güvenliği ve `onTransitionError` kurtarması
tüketicinindir.

### `ResourcePool`

Tüketicinin tanımladığı kaynak kümesinde toplu harcama atomiktir. Bir kalem
yetersiz ise hiçbir kalem düşmez; kapasite ve kaynak adları oyun kuralı olarak
CORE'a gömülmez.

### `EventBus`

Tipli olay ve payload taşır. Bir dinleyicinin hatası kalanlarını durdurmaz.
Yayın sırasında abonelik değişimi mevcut yayını bozmaz. Aboneliğin kaldırma
fonksiyonu tüketicinin yaşam döngüsüne bağlanır.

## Izgara ve uzam

### `Grid`

Ayrık 2B hücre kapıdır. Sınır dışı yazım `false`, okuma `undefined`
döndürür. Komşu dizi üreten yol tahsis yapar; `forEachNeighbour` sıcak yol
alternatifidir. `toWorld` hücre merkezine dönüştürür.

### `findPath`

A* geçilebilirlik ve maliyeti tüketiciden alır. Tek arama için fonksiyon,
tekrarlanan arama için tamponları yeniden kullanan `PathFinder` seçilir.
Sezgisel gerçek maliyeti aşmadığında en kısa yol garantisi vardır. Komşuluk
ve çapraz adım maliyeti aynı modelle seçilir.

### `FlowField`

Çok birimin aynı hedefe yönelmesi için hedeften geriye Dijkstra alanı kurar.
`getNext` ulaşılamaz hücrede `null`, `getCost` sonsuz maliyet verir.
`compute` tam yeniden hesaplar; incremental dirty repair yüzeyi yoktur.
Hedef değişince bütün alan geçersizdir. Az birim ve sık hedef değişiminde
A* farklı maliyet/iş modeli sunar.

Doğru ve görüş `bresenhamLine` ile `hasLineOfSight` üzerindedir. Hücre uçları
ve engel sayma politikası açık parametreyle seçilir.

### `SpatialIndex`

Sürekli uzayda hücre bazlı yakını sorgular. `rebuild` kümeyi baştan kurar,
`refresh` aynı kümenin konumlarını günceller, `update` tek nesneyi taşır.
Listeden tamamen çıkan nesne yalnız konum yenilemesiyle temizlenmez;
doğum/geri dönüşüm sınırında rebuild gerekir.

`query` sabit 3×3 hücre penceresidir; yarıçap cellSize'ı aşarsa uygun değildir.
`queryRadius` ve `queryBounds` açık bölgeyi tarar. `findNearest` hesaplanmış
yokluğu `null` ile bildirir.

Sorgu sonucu dört girişli yeniden kullanılan tampon halkasındandır;
sonraki sorgular eski sonucu değiştirebilir. Saklanan sonuç için çağıranın
dizisine yazan `queryInto`/`queryRadiusInto` kullanılır. `queryStamp` ve
`assertQueryValid` geçerlilik denetimi sağlar.

## Koleksiyonlar

### `RingBuffer`

Sabit kapasiteli kayan pencere. Ekleme ve düşürme sabit işlidir; `push`
taşan öğeyi döndürür, çağıran kayan toplamı buna göre günceller.

### `Deck`

Sonlu yığından tekrarsız çekme, iskarta ve yeniden karma sağlar. Fisher-Yates
karması enjekte edilmiş RNG kullanır; bağımsız ağırlıklı seçimle aynı garanti
değildir. Boş çekiş yokluk döndürür.

### `SlotContainer`

Sabit slot, opt-in yığın, taşıma ve takas sağlar. `add` kısmi ekler ve kalanı
döndürür. Aynı yığınlanabilir öğenin takası birleştirebilir. Varsayılan
maxStack birdir; benzerlik ve kapasite tüketicinindir.

### `WeightedPicker`

Enjekte edilmiş RNG ile ağırlıklı seçim yapar. Sıfır ve negatif ağırlık aday
olmaz; `pickUnique` tekrarsız seçimdir. Kaynağın adı ve oyun karşılığı generic
value içinde tüketiciye aittir.

### `ObjectPool`

Kısa ömürlü nesnenin tahsis ve çöp toplama yükünü azaltır. Sahipliği izler;
yabancı ya da iki kez iade edilen nesneyi reddeder. `reset` içinde tutulmuş
referansları bırakmak tüketicinindir. `maxIdle` tepe yükünün kalıcı havuz
boyutuna dönüşmesini önler.

## Geometri ve hareket

Geometri saf sayılar ve yapısal verilerle çalışır. `circlesOverlap`,
`circleRectOverlap`, `pointInRect` ve `raycastCircles` renderer gerektirmez;
raycast en yakın ileri isabeti seçer. Süpürülmüş temas için
`segmentCircleEntryT` ilk 0–1 temasını verir. Birden çok adayda en küçük t
seçilir; liste sırası sonucu değiştirmez.

`lerp` t değerini kelepçelemez; ekstrapolasyon geçerlidir. `approach` sabit
adımla hedefe ulaşır, `damp` delta ile üstel yumuşatır. `wrap` üst sınırı
dışlar. Kare başına sabit lerp oranı frame hızından bağımsız değildir.

### `Spring1D`

Hız taşıyan yay-damperdır; hedefi aşabilir. Uzun delta sınırlanır, hızın
sayısal taşması duruma yayılmaz. Hafızasız `damp` ile aynı mekanizma değildir.

### `solveTwoBoneIk`

Düzlemsel iki kemikli ters kinematik. Erişilemeyen mesafe erişim aralığına
kelepçelenir; `bendSign` ayna uzuvların yönünü seçer.

### `RigMotionModel`

Ham hareket niyetinden render sinyalleri üretir: hareket oranı, idle fazı,
yay-sönümlü bakış yönü ve dönüş hızı. Simülasyon state'ini değiştirmez.

### `LegGait`

Basılı ayağı dünya konumunda tutar, strain eşiğinde adımı başlatır. Hiç ayak
adımda değilken en gergin grup sırayı alır; sıra bitmeden grup değişmez.
`maxStrainPx` erişimi koruyan acil eşiktir. `setLegHome` duruşu canlı değiştirir,
basılı ayağı kaydırmaz; `justPlanted` yalnız temasın bittiği kareyi bildirir.

### `GazeDriver`

Duraklamalı bakış hedefleri üretir; yarıçap içinde kalır ve enjekte RNG ile
tekrarlanabilir. Verilen odak yönü hedef dağılımını ağırlıklandırır.

### `samplePose`

Görünür poz ağacını dünya uzayına düzleştirir; görünmez alt ağacı atlar,
`out` verilirse tamponu yeniden kullanır. `GhostTrail` örneklenen gerçek
pozdan art görüntü, `PoseShadow` aynı pozdan gölge üretir. Yapısal yüzeyleri
Phaser nesnesi olmadan sınanabilir.

## UI ve yaşam döngüsü

Web araçları kök oyun barrel'ı yerine `@volstudio/core/ui`, i18n, lifecycle
ve fonts alt yollarını kullanır. `Sheet` Modal geri/odak sözleşmesini ve dış
ScrollView'ı birleştirir; iç popup önce kendi Escape'ini tüketir. `StatsPanel`
kimlikli grupları DOM'u yıkmadan günceller; stat hesabı tüketicinindir.

`SplitPane` tercih edilen boyutu dar ekrandaki geçici kısıttan ayrı tutar.
Toolbar aksiyon düğmesi `toggle: false` ile seçim kümesinden ayrılır.
Popover dış tıklamayla kapanınca yeni odağı çalmaz. SettingsForm yalnız
etiket/kontrol düzenidir. `KeyedVirtualList` satırda kurulan bileşeni
`destroyItem` ile kapatır.

`CanvasViewportController` çizim sol sürüklemesini tüketiciye bırakır;
kamera orta tuş veya Space+sol ile kayar, tekerlek imleçteki belge noktasını
korur. `CommandHistory` byte bütçeli transaction/undo/redo mekanizmasıdır.
Bütçeye tek başına sığmayan komut uygulanabilir fakat saklanmaz ve geçersiz
undo geçmişi bırakılmaz.

Programatik `setValue` ve `setChecked` sessizdir. Kullanıcı canlı değişimi
`onInput`, tamamlanan değişimi `onCommit` bildirir; özel programatik bildirim
`setValueAndNotify`/`setCheckedAndNotify` ile yapılır. Seçim/aksiyon bileşeni
onChange kullanabilir. Semantik haptik niyet primitive'dedir, platform çağrısı
ve süre değildir; `haptic: false` çift bildirimi önler.

Listener, timer, observer, pointer capture ve dil aboneliği kapanışta bırakılır.
Birden çok kaynak `DisposableScope` kullanır. Animasyon bitişine bağlı
kapanış azaltılmış hareket altında da tamamlanır.

## Grafik ve platform yeteneği

`GraphicsQuality` generic kademe ve profile sahiptir; profil knobları ve
kalıcılık tüketicinindir. `ViewportManager.renderScale` DPR'den bağımsız
raster ölçüsüdür. Resize stratejisinde kamera zoom'u görünür dünya alanını
CSS pikseline sabitler; sahne `applyVolViewport` kullanır. Backing store
boyutu zoom ve input koordinatlarıyla aynı viewport'a bağlanır.

`scrollFactor: 0` kamera ölçeğinden muafiyet değildir. İşaretçi gerektiğinde
kamera uzayına dönüştürülür. Dokunma joystick ölçüsü CSS pikselinde korunur.
TouchStickState sıcak yol sonuçları yeniden kullanılan tamponlardır;
senkron okunur, saklanmaz; base ile current ayrı nesnedir.

`Counter` değişim yönünü vurgular; her kare güncellenen HUD `change: 'none'`
seçebilir. `FullscreenController` native/web yetenek ve red callback'iyle
çalışır, destroy bütün abonelikleri kapatır.

Haptik `vibrate` niyetini kullanılabilir sürücüye yönlendirir; native,
uygun mobil tarayıcı ve gamepad yolları ayrı yeteneklerdir. Masaüstünde
API'nin mevcut olması motor bulunduğunu kanıtlamaz.
`getHapticsCapability` snapshot, `observeHapticsCapability` hot-plug değişimini
verir. Platform red ve izin hatası oyun akışını kesmez.

Phaser köprüleri ve renderer geri düşüşü
[Phaser sınırı](phaser-boundary.md), metin kaynakları [i18n](i18n.md),
ses bağlamı [tek atışlar](sfx.md) ve [müzik](music-engine.md) belgelerindedir.
Yeni oyun kuralı sunum bileşenine eklenmez; test, katalog ve public yüzey
aynı değişiklikte güncellenir.

### Durağan nişan politikası

`InputManager` varsayılan olarak etkin olmayan fare sağlayıcısının nişanını
diğer kiplerle birleştirir. `restingAimPolicy: 'owner'` yalnız fare kipi
sahipken bu yedeği kullanır; çubuk bırakılınca başka sağlayıcının eski nişanı
dönmez. Eylemler etkin sağlayıcılar üzerinden birleşmeye devam eder.

### Sabit tick'e girdi taşıma

Render karesi ile sabit tick aynı hızda değildir. Bir basış ya da eksen
değeri, kendisini bildiren karede tick üretilmemişse kaybolmamalıdır.
`InputStepBuffer` bunu iki yerde taşır:

- **Eylem kenarı.** Karede görülen `pressedActions` ya da yeni basılan
  `heldActions`, ilk tüketilen tickte bir kez `actions` olur. Basılı düzey
  catch-up boyunca her tickte okunur; basış tek tick yaşar.
- **Veksel kenar.** Sıfırdan sıfıra düşen kanalın son değeri, kendisini
  bildiren karede tick üretilmemişse bir sonraki tickte bir kez daha okunur.
  Basılı kanal darbasız her tickte güncel değerini taşır.

Çubuk eylemi (`aimStickAction`) için ayrıca `aimStickGate` vardır: ham sapma
oranı `enter`/`exit` eşikleriyle karşılaştırılır ve karar **çubuğun kendi
durumunda** tutulur. Eşiği çağıranın karesinde örneklemek aynı kayıp
sorununu üretirdi; ayrıca `aimStickActivatesOnTouch` ve deadzone eşiği bu
durumda geçersiz sayılır. `reset` histerezisi düşürür, böylece duraklatma
sonrası ilk basış yine `enter` eşiğinden geçmek zorundadır.

CORE bu eşikleri oyun kelimesi bilmeden taşır: "ateş", "nişan" ya da "savaş"
dediği bir kural yoktur, yalnız çubuk → eylem bağlantısı ve iki oran vardır.
