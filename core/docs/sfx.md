# Olay sesleri ve mekanik döngüler

`@volstudio/core/audio/sfx` mevcut Web Audio bağlamı ve hedef düğümüyle
çalışır; bağlamı oluşturmak, kilidini açmak ve kapatmak tüketicinindir.
`createVolGame` sesi varsayılan olarak kapatır. `audio: { noAudio: false,
disableWebAudio: false }` seçen oyun, Phaser `WebAudioSoundManager` bağlamını
ve hedefini CORE sesine geçirir; mobil kilit açma ve bağlam ömrü Phaser’da kalır.

`SoundFamilyBank.parse` üretilmiş `SoundFamilyBankV1` JSON'unu doğrular.
`variant` tam anahtarı, `filter` rol ve etiketleri arar; `choose` UTF-8 token
üzerindeki FNV-1a özetiyle sıralı adaylardan deterministik seçim yapar.
Dosya yolları paket köküne görelidir; URL'ye dönüşümü tüketici yapar.

`SoundBank.register` bir olay kimliğini varyant URL'lerine bağlar;
`load` ve `loadAll` bunları çözer. Aynı kimlik için eşzamanlı yüklemeler
birleşir; varyant istekleri aynı partide başlar ve kayıt sırası korunur.
Yüklenmemiş ses oynanışı durdurmadan atlanır. Banka toplam ve
olay başına ses bütçesini uygular, gerekirse en eski sesi durdurur.
`PlayOptions.pan` stereo konumu, `gain` seviyeyi ve `rate` çalma hızını
belirler. Mesafe, olay eşlemesi ve varyant seçimi için verilen RNG
tüketicinin sorumluluğundadır. `stopAll` çalan sesleri durdurur;
`dispose` düğümleri söker ve bekleyen indirmeleri iptal eder.

`LoopBlend` katmanları birlikte döndürür. Eşzamanlı `load` çağrıları birleşir;
bütün istekler başlangıçta açılır, düğümler yükleme sonunda kurulur. `setLevel` iki komşuyu eşit güçle
karıştırır; kazanç, pan ve hız değişimleri yumuşar. Katmanın `pitch` değeri
üretildiği perdeyi belirtir; `setPitch` hedefi aynı birimde alır ve her
katmanın hızını hedef/üretim oranıyla 0.5–2 aralığında tutar. Perdesiz
katman son ortak hızı korur. `setRate` perde takibini bırakıp bütün
katmanlara 0.25–4 aralığında ortak çarpanı uygular. Yüklenemeyen katman
atlanır; kalanlarla karışım sürer. `stop` sonrası `start` son ayarları
korur. Sahne kapanırken her banka ve döngü için `dispose` çağrılır;
bekleyen indirmeler iptal edilir, yeni katman isteği ve düğüm kurulumu durur.

## Düğüm kurulumu hata sözleşmesi

Ses düğümleri bir bağlam üzerinde kurulur; kurulumun hangi adımda kırıldığı
düğümün kime ait olduğunu belirlememelidir. `SoundBank.play` ve `LoopBlend`
düğümleri **edinildikleri anda** sahipliğe alır: `createBufferSource`,
`createGain`, `createStereoPanner` ve `connect` adımlarından biri fırlatırsa
kurulmuş zincirin tamamı sökülür ve hata çağırana aynen iletilir. Ses yalnız
`source.start()` geçtiğinde çalma sahipliğine (`SoundBank` voice, `LoopBlend`
katman kaynağı) geçer; `start()` reddedilirse bütçe ve katman listesi eski
durumunda kalır.

Söküm de aynı sözleşmeyi paylaşır: bir düğümün `disconnect()` ya da `stop()`
çağrısı fırlatırsa kalan düğümler yine sökülür (`DisposableScope` sırası ters
çalışır ve hatayı yutar). Bu yüzden `stopAll`, `LoopBlend.stop` ve `dispose`
çağrıları tek bir bozuk düğüm yüzünden yarım kalmaz; `dispose` ikinci kez
çağrıldığında da ek düğüm bırakmaz.

`LoopBlend.load` bir katman düğümü kurulamadığında **reddedilir**: çözülen
katmanlara sahipsiz düğüm bırakmadan zinciri geri alır, `loaded` false kalır
ve çağıran yeniden deneyebilir. Yalnız indirme/çözme hataları katman atlanarak
telafi edilir; bağlam hatası sessizce yutulmaz. `SoundBank` da aynı ayrımı
korur: çözemeyen varyant uyarıyla atlanır, düğüm kurulamayan ses hataya
dönüşür.

## UI geri bildirim sesi

`@volstudio/core/audio/ui` Phaser taşımayan alt yoldur; kök barrel de aynı adları
ihraç eder. `SoundBank` bütçesini ve `SidechainDucker`ı tüketir, UI için ayrı bir
mixer ya da müzik motoru kurmaz.

### `UiSoundKit`

Anlamsal UI niyetlerinin (`UiIntentBus`) ve host'un bildirdiği ürün sonuçlarının
sesi. Toplam en çok 4 eşzamanlı UI sesi çalar; kritik olaylar (`error`, `warning`)
`normal` sesleri düşürerek çalar, `normal` ses kritiği düşüremez. Mikro olaylar
(`tick`) 120 ms aralıkla sınırlıdır. Her olayın en çok 3 varyantı sırayla seçilir
ve perde ±%5 değişir; seçim ve değişim kitin kendi tohumlu RNG akışından gelir,
simülasyon RNG'sine dokunmaz. Gecikmeli çalma yoktur: bağlam kilitliyse, sayfa
gizliyse, sessizse ya da bağlam yoksa ses atlanır ve geri dönüşte biriken sesler
topluca çalmaz. Bağlam ilk kullanıcı jestinde (ilk niyet) oluşturulup açılır.
Bir Promise'in çözülmesi başarı sesi değildir; başarıyı host `reportOutcome` ile
bildirir.

### `uiSoundAssets`

CORE'un gönderdiği varsayılan UI ses setinin URL'lerini verir: 12 olay × 3 varyant
(`press-a.ogg`…), `core/public/assets/audio/ui` altında, `audio-synth` ile özgün üretilmiş
mono 48 kHz kısa OGG'ler (kütüphane hedefi). Set mekanik QA'dan geçmiştir (kodlama sonrası
tepe ≤ −1 dBTP, yükseklik −28…−14 LUFS, DC, kırpma, süre; PCM yeniden render özdeş;
küçük hoparlör için sub bandı ve alçak enerji süzülmüş); **insan dinlemesi yapılmamıştır**.

### `channelGain`

Ana, UI, SFX, müzik ve konuşma seviyeleri ile sessizlik cihaz kapsamlıdır
(`device.volui:audio`). Kit yalnız UI yolunu (`master × ui`) uygular; ürün diğer
kanalları `channelGain` ile kendi otobüslerine bağlar. Bozuk kayıt sessizce
varsayılana iner.
