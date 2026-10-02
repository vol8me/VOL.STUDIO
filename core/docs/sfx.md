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
birleşir; yüklenmemiş ses oynanışı durdurmadan atlanır. Banka toplam ve
olay başına ses bütçesini uygular, gerekirse en eski sesi durdurur.
`PlayOptions.pan` stereo konumu, `gain` seviyeyi ve `rate` çalma hızını
belirler. Mesafe, olay eşlemesi ve varyant seçimi için verilen RNG
tüketicinin sorumluluğundadır. `stopAll` çalan sesleri durdurur;
`dispose` düğümleri söker ve bekleyen indirmeleri iptal eder.

`LoopBlend` katmanları birlikte döndürür. `setLevel` iki komşuyu eşit güçle
karıştırır; kazanç, pan ve hız değişimleri yumuşar. Katmanın `pitch` değeri
üretildiği perdeyi belirtir; `setPitch` hedefi aynı birimde alır ve her
katmanın hızını hedef/üretim oranıyla 0.5–2 aralığında tutar. Perdesiz
katman son ortak hızı korur. `setRate` perde takibini bırakıp bütün
katmanlara 0.25–4 aralığında ortak çarpanı uygular. Yüklenemeyen katman
atlanır; kalanlarla karışım sürer. `stop` sonrası `start` son ayarları
korur. Sahne kapanırken her banka ve döngü için `dispose` çağrılır;
bekleyen indirmeler iptal edilir, yeni katman isteği ve düğüm kurulumu durur.
