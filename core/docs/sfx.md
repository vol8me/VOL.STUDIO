# Tek atışlar ve döngüler

`@volstudio/core/audio/sfx` mevcut Web Audio bağlamı ve hedef düğümüyle
çalışır; bağlamı oluşturmak, kilidini açmak ve kapatmak tüketicinindir.

`SoundFamilyBank.parse` üretilmiş `SoundFamilyBankV1` JSON'unu doğrular.
`variant` tam anahtarı, `filter` rol ve etiketleri arar; `choose` UTF-8 token
üzerindeki FNV-1a özetiyle sıralı adaylardan deterministik seçim yapar.
Dosya yolları paket köküne görelidir; URL'ye dönüşümü tüketici yapar.

`SoundBank` tek atışları yükler, eşzamanlı ses sayısını sınırlar ve en eski
sesi düşürür. `PlayOptions.pan` stereo konumu, `gain` seviyesi ve `rate`
çalma hızıdır; mesafe ve olay eşlemesi tüketicinindir. `stopAll` çalan
sesleri durdurur, `dispose` düğümleri söker.

`LoopBlend` katmanları birlikte döndürür. `setLevel` iki komşuyu eşit güçle
karıştırır; kazanç, pan ve hız değişimleri yumuşar. Katmanın `pitch` değeri
üretildiği perdeyi belirtir; `setPitch` hedefi aynı birimde alır ve her
katmanın hızını hedef/üretim oranıyla 0.5–2 aralığında tutar. Perdesiz
katman son ortak hızı korur. `setRate` perde takibini bırakıp bütün
katmanlara ortak çarpanı uygular. `stop` sonrası `start` son ayarları korur;
sahne kapanırken `dispose` çağrılır.
