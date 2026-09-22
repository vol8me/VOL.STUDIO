# Sound Synth Motoru

`@volstudio/audio-synth` prosedürel ses sentezi üretir. Oyunlar build zamanında OGG çıktı alır; dış ses kütüphanesi veya DAW gerektirmez. Motor saf matematikle yazılmıştır; hem Node hem tarayıcıda çalışır. `writeWav`/`writeOgg` Node-only'dır ve `writeOgg` FFmpeg ister.

## Determinizm ve seviye kontrolü

- **Üretim tekrarlanabilirdir.** Gürültü kaynakları `Math.random()` değil,
  seed'lenebilir bir PRNG kullanır. Aynı parametreler + aynı `seed` her zaman
  birebir aynı örnekleri verir; `seed` verilmezse sabit bir varsayılan kullanılır.
  Aynı script her zaman aynı sesi verir; bu yüzden üretilen dosyalar repoda
  tutulmaz (asset akışı için bkz. `music-engine.md`).
- **`normalize` opsiyoneldir** (varsayılan `true`). `true` iken sonuç tepe
  değerine göre `0.95 × gain`e ölçeklenir. Bir mix içinde birden çok ses
  üretiliyorsa her birini ayrı ayrı normalize etmek aralarındaki dinamik farkı
  yok eder — o durumda `normalize: false` geçilip seviye yalnız final mix'e
  bir kez verilir. `compose()` bunu kendisi yapar (bkz. "Düzenleme katmanı").
- **`writeWav()` ek kazanç uygulamaz** (varsayılan `targetGain: 1`). Headroom
  kararı tek yerde, normalize adımındadır.
- **16-bit dönüşümde TPDF dither** uygulanır; dither de deterministiktir.

## Mimari — katmanlar ve soruları

| Katman         | Soru                                 | İçinde ne var                                            |
| -------------- | ------------------------------------ | -------------------------------------------------------- |
| `guard/`       | Bu istek RENDER EDİLEBİLİR mi?       | parametre doğrulama/çözümleme, kaynak bütçesi, hatalar   |
| `synthesis/`   | Örnek NASIL üretilir?                | osilatör, gürültü, zarf, filtre, örnek kaynağı, resample |
| `engine/`      | Parametreler nasıl BİRLEŞTİRİLİR?    | `SynthParams` → örnek; decimator; tek master çekirdeği   |
| `instruments/` | Bir enstrüman ailesi NASIL DAVRANIR? | fiziksel modeller                                        |
| `presets/`     | Bu sesin ADI ne?                     | parametre kümeleri + katalog                             |
| `arrange/`     | Sesler ZAMANDA nasıl dizilir?        | perde, mix veriyolu, `Timeline`, `compose`               |
| `analysis/`    | Çıkan ses NE ÖLÇÜYOR?                | BS.1770 yükseklik, true peak, spektrum, FM alias riski   |
| `program/`     | Agent'ın yazdığı KANONİK program ne? | `AudioBriefV1`, `AcousticProgramV1`, registry, render    |
| `protocol/`    | İş nerede, üretim nasıl KANITLANIR?  | `AudioJobV1`, özet zinciri, manifest, TEK publish kapısı |

Ayrıca `effects/` (bus zinciri), `types.ts` ve Node-only `writer.ts` (WAV +
OGG; OGG için FFmpeg). `program/` saftır (dosya/süreç/kripto yok) ve kök
yüzeye tek ad (`Acoustic`) ile girer; `protocol/` Node-only'dır ve
`@volstudio/audio-synth/protocol` alt yolundadır. `guard/` yapraktır: her katman onu kullanır, o hiçbirini
kullanmaz. Dosya dökümü `src/` ağacının kendisidir; burada tekrarlanmaz.

### `instrument ≠ preset`

Bu ayrım bu paketin büyüme biçimidir ve bulanıklaşırsa katalog motoru yutar.

- **Model** (`instruments/`), `SynthParams` ile ifade EDİLEMEYEN yapı taşır:
  gecikme hattı, rezonatör, uyarım, inharmonik kısmi ton bankası, modal
  rezonatör, yay-sürtünme gürültüsü, hava-sütunu rezonatörü, dudak-reed
  uyarımı, formant bandpass filtresi. Çıktısı doğrudan `SynthesisResult`tır.
  Bugün altı model var: `pluck` (Karplus-Strong), `piano` (modal sentez),
  `bowedString` (yaylı tel), `airColumn` (açık/kapalı boru), `brass`
  (lip-reed), `formant` (vokal formant).
- **Preset** (`presets/`), ad verilmiş bir parametre kümesidir ve **yeni DSP
  taşımaz**. Ya `engine`e ya bir modele biner.

Sonuç: `guitar` bir presettir, `PluckedString` bir modeldir. On enstrüman on
motor değil, bir modelin on presetidir.

Bugün `presets/acoustic.ts` altında beş akustik preset, `presets/plucked.ts`
altında dört telli çalgı, `presets/piano.ts` altında dört piyano,
`presets/bowed.ts` altında dört yaylı, `presets/airColumn.ts` altında dört
ahşap üflemeli, `presets/brass.ts` altında dört bakır ve
`presets/choir.ts` altında dört koro sesi var; hepsi yeni DSP taşımaz:
`drawbarOrgan`, `harpsichord`, `marimba`, `vibraphone`, `glockenspiel`,
`guitar`, `bassGuitar`, `harp`, `mandolin`,
`grandPiano`, `uprightPiano`, `honkyTonkPiano`, `preparedPiano`,
`violin`, `viola`, `cello`, `doubleBass`,
`flute`, `clarinet`, `oboe`, `bassoon`,
`trumpet`, `trombone`, `frenchHorn`, `tuba`,
`soprano`, `alto`, `tenor`, `bassChoir`.

Değerler kodda değil ORANLARDADIR — Hammond ayak uzunlukları,
oyulmuş çubuğun 4:1 akordu, oyulmamış çubuğun harmonik OLMAYAN
1 : 2,76 : 5,40 : 8,93 modları, koparma noktasının 7. harmonikte açtığı çukur,
piyanonun inharmonik `n * sqrt(1 + B * n^2)` kısmi ton serisi,
sert çekiç oranı ve gövde rezonansı.

### Bir preset ölçülerek doğrulanır

Uydurulmuş bir harmonik dizisi de hatasız sentezlenir; "çalışıyor" bir kalite
ölçüsü değildir. `tests/acousticSpectrum.test.ts` akustik presetleri,
`tests/pianoSpectrum.test.ts` piyano presetlerini,
`tests/bowedSpectrum.test.ts` yaylı presetleri,
`tests/airColumnSpectrum.test.ts` ahşap üflemeli presetleri,
`tests/brassSpectrum.test.ts` bakır presetlerini ve
`tests/choirSpectrum.test.ts` koro presetlerini sesin kendisinde arar.
Her dosya aynı yaklaşımı izler: belgelenmiş fiziksel karakter spektrumda
ölçülür, bir DSP parametresi tek başına değiştirildiğinde beklenen mutasyon
görülür.

`tests/bowed.test.ts`, `tests/airColumn.test.ts`, `tests/brass.test.ts` ve
`tests/formant.test.ts` fiziksel modelleri doğrudan sınar: determinizm,
seed farkı, geçersiz parametre güvenliği, sürdürülebilirlik, kaynak-seçici
mutasyonlar.

İki ölçüm aracı, iki ayrı soru:

- **Goertzel** — tek hedef frekanstaki enerji. FFT değil, çünkü kısmi tonların
  çoğu tam sayı katı değildir ve bir FFT kutusuna oturmaz.
- **Periyot içi tepe-dip** — LFO derinliği. Zarf spektrumu burada işe yaramaz:
  sönüm ve reverb kabarması düşük frekansları doldurup LFO'yu gömer. Analiz
  penceresi en pes kısmi tonun periyodundan UZUN, LFO periyodundan KISA
  olmalıdır; ikisini karıştırmak bir tur ölçümü çöpe attı.

**Kapı:** `tests/governance/publicSurface.test.ts` kök yüzeydeki isimleri
kilitler. Yeni bir enstrüman `Presets` altında bir kalem olarak gelir ve
yüzeyi BÜYÜTMEZ; yüzey ancak yeni bir sentez tekniği, yeni bir MODEL ya da
render sınırının hata sözleşmesi (`AudioParamError`, `RenderBudgetError`)
girdiğinde büyür; ölçüm çekirdeği tek ad (`Analysis`) altındadır. Kilit
olmadan bu ayrım bir niyettir; kilitle bir kapıdır.

### Düzenleme katmanı — tek aktif yol

Birden çok sesi zamanda birleştirip seviye veren TEK bir uygulama vardır:

- **Mix veriyolu** (`arrange/mix.ts`: `createMix`, `addVoice`, `masterMix`,
  `stableJitter`). Ölçümle kanıtlanmış üç kural burada yaşar: veriyolu
  sesleri normalize etmez (seviye mix'in sonunda bir kez verilir); loop
  mix'inde sonu aşan kuyruk başa sarılır (`wrap`); insanlaştırma durumsuzdur
  — sapma `(tohum, olay)` karmasından gelir, üreteç akışından değil. Pan'sız
  mono ses çift-mono yerleşir (normalize edilmiş bir sesin `pan: 0` render'ı
  da kanal başına birim seviyededir); açık pan eşit güç yasasıyla.
- **Master çekirdeği** (`engine/master.ts: masterChannels`). Sıra sabittir:
  DC → ölçüm → kazanç (tepe | RMS | yok) → yumuşak sınırlayıcı → tavan → kenar
  sönümü. Ölçüm yalnız TUTULACAK aralıkta yapılır. Tek sesin çıkışı
  (`applyGlobalEffects`), `compose` ve `Timeline` seviyelerini buradan alır.
- **`Timeline`** — ölçü/vuruş zamanlı, çok sesli, stereo ön yüz. Bozuk olayı
  EKLENİRKEN reddeder. `render()` önce tutulacak aralığı bulur (sessiz kuyruk
  kırpılır), yüksekliği yalnız onun üstünde ölçer, 20 Hz DC temizliği ve RMS
  eşitleme + sınırlayıcı + tavan uygular. Aynı nesnede ardışık `render()`
  birebir aynı örnekleri verir. `loopBars` ile dikişsiz loop üretir.
- **`compose`** — art arda notalar için ince uyumluluk adaptörü: notalar
  `normalize: false` ile render edilip mono veriyoluna toplanır; bus
  efektleri, kazanç ve normalizasyon diziye BİR KEZ uygulanır. Bus efekt
  anahtarları tek listeden (`BUS_EFFECT_KEYS`) ayıklanır; nota başına bus
  efekti sessizce silinmez, adıyla reddedilir.
- **Perde sözlüğü** — `noteToHz`, `transposeNote`, `SCALES`, `scaleDegree`,
  `scaleChord`. Akor dizinin RENGİNİ alır.
- **`matchLoudness`** — master çekirdeğinin RMS modu. Tepeye göre normalize
  etmek parçaları eşit YÜKSEKLİKTE yapmaz (vurmalı ve sürekli doku aynı tepede
  10 dB farkla çalar, ölçüldü). `targetRms: 0` "dokunma" demektir.

Kök yüzeye `Arrange` ve `compose` olarak girer.

**Tarihî not.** Frozen VOL.HELL kendi `scripts/audio/lib/mix.ts` kopyasıyla
üretildi; bu kopya freeze etiketinde değişmez bir tarihsel kayıttır, aktif
paralel bir yol DEĞİLDİR. Yukarıdaki üç kural oradan kanıtlanmış olarak
taşındı; oyun kavramı taşınmadı.

### Zaman sınırı

Modeller BUILD zamanında yaşar. Hat şudur ve öyle kalır:

```
kod → offline render → OGG → MusicEngine
```

Çalışma zamanı hazır tampon çalar. Canlı sentez istenirse bu pakete ya da
MusicEngine'in içine değil, ayrı bir çalışma zamanı katmanına gider.

### Boru hattı

1. Osilatör / gürültü / sample / harmonik serisi sesi üretir.
2. Zarf, filtre, vibrato, tremolo ve LFO'lar şekillendirir.
3. `distortion` per-voice uygulanır.
4. Master zinciri sırayla: `delay` → `flanger` → `phaser` → `chorus` → `pan`
   → `reverb` → `stereoWidth`.
5. Normalize ile çıkış hazırlanır; son ~10 ms yükselen-kosinüs de-click
   sönümü uygulanır. Tampon `duration` sınırında kesilir — efekt kuyruğu
   uzatılmaz ama kesim yumuşak iner, dikişsiz dizi için zorunludur.

## Authoring protokolü

Bir ses işi sohbet bağlamında değil repo dosyalarında yaşar. Kanonik gerçek
TypeScript şemaları, registry, validator'lar, `audio:job` CLI'ı ve publish
kapısıdır; bu bölüm onların GEREKÇESİNİ anlatır, kataloğunu değil — katalog
`audio:job context --json` çıktısıdır.

### Program ve registry

`AcousticProgramV1` sınırlı, JSON'a dökülebilir bir topolojidir: katmanlar
(kaynak/exciter → rezonatör dizisi, seri ya da paralel → artikülasyon →
kazanç/pan/başlangıç), bus efektleri ve master. Her yapı taşı registry
kimliği + sürümüyle anılır (`{ primitive, version, params }`). Bilinmeyen
alan, kimlik, sürüm ya da tür render'dan ÖNCE `AudioParamError` verir; yeni
yetenek yeni bir registry kaydıdır, şema değişikliği değildir. Program bir
`SynthParams` kabı DEĞİLDİR: agent monolitik bir sentez nesnesi yazmaz,
adlandırılmış yapı taşlarını birleştirir.

Registry kaydı; birim/aralık/varsayılan/otomasyon izni, parametre başına yön
ilişkisi (`causal`), determinizm (alt akış etiketleri), maliyet modeli ve
yetenek etiketleri taşır. `tests/governance/registry.test.ts` eksik
metadata'yı ve implementasyona BAĞLI OLMAYAN parametreyi (değiştirince PCM'i
değiştirmeyen) düşürür.

**Determinizm sözleşmesi.** Aynı program + tohum + `PROGRAM_RENDERER_VERSION`

- düğüm sürümleri aynı PCM özetini verir. Stokastik düğüm kök tohumdan
  `deriveSeed(tohum, "layer:<ad>/<düğüm>/<etiket>")` ile türeyen bağımsız alt
  akış kullanır: etiket bir ADDIR, sıra değil — katman eklemek ya da yeniden
  sıralamak mevcut akışları kaydırmaz. V8'in `Math` fonksiyonları fdlibm
  portudur; farklı bir Node ana sürümünde bit eşitliği ölçülmeden varsayılmaz,
  manifest runtime sürümünü kaydeder.

**Kaynak bütçesi.** `estimateProgramCost` her düğümün `workPerFrame`/
`stateBytes` modelinden ve otomasyon tamponlarından toplar; tahmin Dalga 0'ın
ortak `assertRenderBudget` kapısından ayırmadan ÖNCE geçer. `program` komutu
aynı kapıyı kayıt anında da uygular — bütçeyi aşan program job'a giremez.
Ölçüm (referans makine, üç koşunun en iyisi): referans iş, altı archetype
(6 sn) ve üç vokal aile 0.7–9.2 ns/birim çıktı — hepsi ~10 ns kalibrasyonunun
ALTINDA, yani program tahmini gerçek maliyeti küçümsemez (en muhafazakâr:
tık olaylı `chitin-clicker`, 0.7 ns/birim).

### Job, özet zinciri ve bayatlık

`AudioJobV1` aşamaları: `created → briefed → programmed → rendered → analyzed
→ selected → published`. Kayıtlı aşama bilgi amaçlıdır; `audio:job status`
etkin aşamayı ve `next.action`ı YALNIZ dosyalardan hesaplar. Özetler kanonik
JSON'un SHA-256'sıdır (sıralı anahtar, `-0 → 0`, NaN/undefined/typed array
reddedilir); zaman damgası hiçbir belgeye girmez.

| Kenar                 | Taşıyan                                         | Bozulunca                         |
| --------------------- | ----------------------------------------------- | --------------------------------- |
| brief → program       | job kaydı (`program.brief`)                     | program `stale`                   |
| program → render      | render kaydı `programHash`                      | render `stale`                    |
| render → analiz       | analiz kaydı `renderHash`                       | analiz `stale`                    |
| render/analiz → seçim | seçim kaydı (iki özet)                          | seçim `stale`, publish reddedilir |
| seçim/program → yayın | manifest (program özeti, renderId, asset baytı) | yayın `stale`                     |
| program → köken       | `origin.json` `programHash`                     | köken `stale`, publish reddedilir |

Protokol dışında düzenlenen dosya `modified`, okunamayan/yarım yazılmış
dosya `corrupt` görünür; geçerli sayılmaz. Yazımlar atomiktir (aynı dizinde
`wx` geçici dosya + fsync + rename); tek yazıcı kilidi pid taşır, ölü
sürecin kilidi devralınır.

**Yol güvenliği.** Belgelerdeki her yol repo-göreli, `/` ayraçlı ve
normalizedir; mutlak yol, sürücü harfi, `..` ve sembolik bağ reddedilir.
Publish yalnız `surveyTargets`in verdiği köklere yazar: audio-synth'in kendi
referans kökü ve `AudioTargetV1` (`audio-target.json`) ile çalışma zamanı
kabiliyetini beyan eden AKTİF oyunlar. Frozen workspace hedef olamaz.

### Analiz raporu ve manifest

`analyzeAudio()` kanonik ölçüm çekirdeğidir; `audio-qa`, publish kapısı,
`audio:job verify` ve testler aynı fonksiyonu çağırır. Yükseklik/tepe/kırpma
alanları `measureAsset`in kendi sonucudur (tek çekirdek). Rapor ölçümün
kaynağını söyler: `source-pcm` (job analizi) ya da `decoded-encoded`
(publish/verify — gönderilen dosyanın FFmpeg ile çözülmüş hâli). Tık sayacı
bir ADAY dedektörüdür: ikinci fark yerel RMS'in 8 katını ve −60 dBFS'i aşıp
±10 ms içinde eşdeğer bir tepeyle eşlik etmiyorsa sayılır (periyodik
kenarlar elenir); frozen VOL.HELL kataloğunda 46 dosyada toplam 9 aday.

`AudioAssetManifestV1` provenance'ın kanonik sözleşmesidir ve KENDİ BAŞINA
yeterlidir: brief ve program belgeleri gömülüdür; tohum, renderId, render
sürümü, kanonik PCM özeti (kodlayıcıya giden kelepçeli float32), kodlanmış
bayt özeti, araç zinciri (FFmpeg sürüm satırı, libav\* sürümleri, kodlayıcı
argümanları, parmak izi), analizör sürümü + kodek sonrası rapor, sınıf
politikası sürümü ve entegrasyon bilgisi taşır. `verify` farkı sınıflar:
`identical`, `encoder-only` (PCM aynı, araç zinciri farklı — ses değişmedi),
`encoder-nondeterministic` (PCM ve parmak izi aynı, bayt farklı — hata;
libvorbis sürümü FFmpeg tarafından raporlanmaz ve bu körlük manifest'te
`unreported` olarak yazılıdır), `pcm-changed` (ses değişti).

### Publish kapısı

`publishJob` TEK kanonik yoldur: özet zinciri → belgeler → hedef/yol/sınıf →
yeniden render + PCM kimliği → aynı dizinde staging kodlama → çözme +
kodek sonrası analiz + sınıf politikası → manifest doğrulaması → iki atomik
rename → job kaydı. Politika düşerse hiçbir dosya yazılmaz; true-peak
sınırlayıcı yoktur ve kapı ihlali DÜZELTMEZ. Manifest'siz ya da başka işe ait
bir dosyanın üzerine yazılmaz. `tests/governance/publishPath.test.ts` aktif
ağaçlarda yazıcıyı çağıran her dosyayı gerekçesiyle listeler; yeni bir
sahipsiz publish yolu testi düşürür.

**Üretim-referans fixture'ı.** Aktif bir oyun yok; kapıyı gerçek kodek
QA'sıyla uçtan uca çalıştırmak için audio-synth'in KENDİ işi
`audio-jobs/platform-reference` vardır (hiçbir oyun onu çalmaz).
`just audio-verify` her koşuda `audio:production-check` ile manifest'i
yalnız kendisinden doğrular: gömülü program yeniden render edilir, dosya
çözülüp politikaya tabi tutulur, güncel araç zinciriyle yeniden kodlanıp fark
sınıflanır. Bu fixture aynı zamanda program render yolunun regresyon
kilididir: render çıktısını değiştiren bir değişiklik `pcm-changed` verir.

## Organiklik çekirdeği

Dalga 2 yapı taşları Dalga 1 program sözleşmesinin İÇİNDE yaşar: yeni
yetenek yeni registry kaydıdır. `AcousticProgramV1`e eklenen alanlar
(`modulators`, `controls`, parametre bağında `value`/`modulate`) isteğe
bağlıdır ve mevcut programların PCM'ini değiştirmez — üretim-referans
fixture'ı bu dalga boyunca `identical` doğrulandı. V1 bu dal merge
edilene dek yayımlanmamış kabul edilir; merge sonrası alan ekleme V2 ister.

### Gesture ve bağlama dilbilgisi

Eğriler: `curve.linear` (C0), `curve.cosine` (noktalarda eğimsiz, C1),
`curve.exponential` (geometrik; frekansta oktav/sn doğrusal, iki uç aynı
işaretli ve sıfırdan farklı olmalı) ve `curve.spline` (PCHIP —
Fritsch–Carlson/Butland teğetli monoton kübik Hermite). Spline'ın gerekçesi
ölçülebilir: üç ve daha çok noktadan C1 geçer ve AŞIM YAPMAZ, bu yüzden
parametre aralığı denetimi noktalarda yeterlidir (Catmull-Rom aralığı
delebilirdi). Örnekleme `i / oran` ile yapılır (birikimli toplam yok),
ilk noktadan önce/son noktadan sonra değer tutulur, eşit zamanlı iki nokta
basamaktır; eğri örnek başına ayırma yapmaz.

Bir sayısal parametre `sayı`, `{ gesture }` ya da
`{ value?, gesture?, modulate: [{ by, depth }] }` alır; gesture/modülasyon
yalnız `automatable` alanda. Çözüm sırası sabittir: taban → makro çarpanları
→ modülasyon → aralık kırpma (Nyquist altı alanlarda 0.49·fs). Modülasyon
dB alanında EKLENEN dB, diğer alanlarda göreli orandır (p·(1 + d·m)).
Gesture zamanı katman başlangıcına, modülatör zamanı programa göredir.

### Stokastik modülasyon

`modulator.drift` (smoothstep düğüm gürültüsü, C1), `modulator.walk`
(Ornstein–Uhlenbeck, Euler–Maruyama; tanh ile sınırlı), `modulator.sample-glide`
(rastgele hedef + üstel yaklaşma), `modulator.jitter` / `modulator.shimmer`
(döngü eşzamanlı N(0,1)/3 sapması; `cycleRate` perde gesture'ına
bağlanabilir). Hepsi [−1, 1] normalize çıkar. Her modülatör programda ADIYLA
tanımlanır ve `modulator:<ad>/<etiket>` alt akışını kullanır: yeni bir
modülatör ya da stokastik katman eklemek mevcut akışları kaydırmaz
(`tests/program/stochastic.test.ts`: perde katmanı, alfabetik olarak ÖNCE
gelen bir bubble akışı eklendiğinde bit-eşit). Aynı modülatöre bağlanan
parametreler aynı sinyali görür — korelasyon bilinçlidir.

### Exciter → Rezonatör → Artikülatör

Exciter enerjiyi, rezonatör rengi verir: `exciter.impact` (yükselen-kosinüs
temas darbesi + pürüz), `exciter.membrane` (burkulan zar tık dizisi —
timbal benzeri), `exciter.turbulence` (basınç^1.5 ölçekli akış gürültüsü);
`resonator.modal`, `resonator.cavity` (Helmholtz), `resonator.formant`
(dört paralel formant, `tract` ölçekli); `articulation.amplitude`
(gesture/shimmer ile sürülen dB). Dokuz exciter×rezonatör birleşiminin her
biri aynı program yüzeyinde render edilir ve rezonans tepesi beklenen
frekansın ±%8'indedir. Eski enstrüman modelleri yeniden yazılmadı.

**Zamanla değişen modal banka.** Her mod karmaşık tek kutuplu faz
döndürücüdür: s ← r·e^{iω}·s + g·x, çıkış Im(s). Direkt-form biquad'da
katsayı değişimi durum değişkenlerinin anlamını değiştirir ve otomasyonda
enerji sıçraması (tık) verir; faz döndürücüde durum vektörünün BÜYÜKLÜĞÜ
korunur, frekans ve T60 örnek başına değişebilir, r = 10^(−3/(T60·fs)) < 1
olduğu için kararlıdır. Nyquist'e yaklaşan mod 0.40–0.46·fs arasında
kosinüsle susar (tarama sınırı geçerken tık yok). Modal banka darbe-normalize
(g = 1: vuruşun genliği sönümden bağımsız), boşluk/formant bant geçiren
normalize (tepe kazancı ≈ 1). Kanıt: gövde küçülürken (body-size gesture)
ölçülen mod frekansı 220 → 440 Hz monoton yükselir; gürültü uyarımında üç
eğriyle de tık adayı sıfırdır; 20 Hz↔11 kHz ve T60 5 ms↔30 sn sıçrayan
tarama sonlu ve sınırlı kalır. Zar yerleşimi ilk 32 Bessel sıfırını (sayısal
olarak doğrulandı), çubuk yerleşimi Euler–Bernoulli β_n·L değerlerini kullanır.
Helmholtz: f = (c/2π)·√(A/(V·L_eff)), L_eff = L + 1.7·a — tek mod
yaklaşımıdır, boşluğun duran-dalga modları modellenmez.

### Makro kontroller

`control.body-size`, `tension`, `pressure`, `wetness`, `viscosity`,
`roughness`, `cavity-size`, `airiness`, `instability`: değer c ∈ [0, 1],
0.5 nötr (makrosuz programla bit-eşit). Her makro registry'de hedeflerini
(`primitive.param`, `octaves`|`linear` yasası, açıklık) ve yön ilişkisini
taşır; `context` bunları açar. Hiçbir hedefi programda olmayan makro,
tekrarlanan makro ve gesture ile otomasyonsuz hedefe uygulanan makro
render'dan önce reddedilir. Yön ilişkileri beş konumda KESİN monoton
property testleriyle kilitlidir (perde: spektral tepe; parlaklık: ağırlık
merkezi; sönüm: −40 dB süresi; gürültülülük: spektral düzlük; kararsızlık:
perde sapması).

### PolyBLEP bağımlılık denetimi

Dalga 2/3 ilkelleri kenarlı osilatöre dayanmaz (faz döndürücü rezonatörler,
gürültü/türbülans, zar tık dizisi; Dalga 3'ün ses kaynağı bant sınırlı
darbe dizisidir). Kabul testleri PolyBLEP'in riskli bölgesini kullanmadığı
için P3 maddesi açık kalır; sınır `audio:job context` içinde
`polyblep-alias` sınırlaması olarak agent'a açıktır.

## Biyolojik yapı taşları

Dalga 3 ilkelleri de Dalga 1 program sözleşmesinin içindedir; her biri
registry kaydıdır ve governance testi her parametresinin PCM'i gerçekten
değiştirdiğini sınar. Hiçbiri "gerçek bir hayvan gibi" iddiası taşımaz:
doğrulama ölçülen fiziksel/spektral özelliklerledir, insan dinlemesi
yapılmadı (`audio:job context` → `no-listening-validation`).

### Mikro-olay motoru

`scheduleEvents` zaman-yeniden-ölçekleme kullanır: birikimli oran
Λ(t) = ∫ rate dt her örnekte toplanır, Λ bir sonraki eşiği geçince olay
doğar; eşik aralığı r + (1 − r)·Exp(1)'dir. Böylece zamanla değişen oranlı
süreç örnek-doğru ve O(kare) üretilir; `regularity` Poisson (0) ile tam
periyodik (1) arasında SÜREKLİ bir eksendir, `clustering` olay başına ortalama
8·c küme olayı ekler (4–24 ms arayla). İlk tasarımdaki "dağılım seçeneği +
yalnız bir seçenekte etkili parametre" governance testinde düştü (seçeneğe
bağlı parametre süs metadata'dır) ve sürekli eksenlerle değiştirildi.
Zamanlama ve varyasyon ayrı alt akışlardır. Kenarlar: sıfır oran olay
üretmez, tampon dışına düşen olay yazılmaz, katman başına en çok 20000 olay
(deterministik kesme). Kanıt: 24 tohumluk korpusta sayım ortalaması λ =
oran·süre etrafında ve oranla kesin monoton; Poisson'da varyans/ortalama ≈ 1,
periyodikte ≈ 0.

### Akışkan/kabarcık ailesi

Minnaert rezonansı f₀ = (1/2πR)·√(3γp₀/ρ) (hava/su, deniz seviyesi →
f₀·R ≈ 3.29 m/sn; R = 1 mm ≈ 3.3 kHz). Yüzey gerilimi ve ısıl etkiler ihmal
edilir — geçerlik 0.1–20 mm. Sönüm ve yükselen perde van den Doel (2005,
"Physically based models for liquid sounds"): d = 0.13·f₀ + 0.0072·f₀^1.5,
f(t) = f₀(1 + ξ·d·t). `damping` d'yi ölçekler (viskozite benzeri). Genlik
∝ √R sezgiseldir (fiziksel iddia değil). Yapı taşları: `source.bubble` (tek),
`source.bubbles` (mikro-olay motoruyla nüfus, yarıçap 2^(±1.5·spread)),
`source.gurgle` (düzenliye yakın nabız + büyük "glug" + küçük küme). Kanıt:
R = 1/2/4/8 mm'de ölçülen tepe Minnaert'in ±%5'inde ve kesin azalan; sönüm
0.5→4 kat büyüdükçe −40 dB süresi kesin kısalır.

### Organik vokal kaynağı

`source.glottal`: BLIT darbe dizisi (Stilson & Smith 1996) — M = 2⌊P/2⌋+1
harmonikli Dirichlet çekirdeği, en yüksek harmonik Nyquist altında; saf
testere gibi katlanmaz (1234.5 Hz'te harmonik dışı taban < −60 dB ölçüldü).
Tek kutuplu eğim `tension` ile, döngü eşzamanlı jitter (periyot) ve
shimmer/alt-harmonik (yarım periyotta, darbeler arasında), açılma fazına
kilitli nefes gürültüsü. Formant AYRI düğümdür (`resonator.formant`). Bu bir
LF/Rosenberg modeli değildir (`glottal-not-lf`). Aynı kaynakla üç aile yalnız
program değiştirerek kurulur (`tests/fixtures/vocalFamilies.ts`): cat-like
(perde yükselip iner, formant bölgesi düşer), bark-like (≤ 30 ms atak,
alt-harmonik oranı cat-like'ın 5 katından fazla, daha düz spektrum), alien
air-sac (f₀ < 130 Hz, şişen kese boşluk rezonansını düşürür).

### Tüp dalga kılavuzu

`resonator.tube` tek döngülü dijital waveguide'dır (`airColumn`ın kopyası
değil, yeniden kullanılabilir rezonatör ilkeli): gidiş-dönüş gecikmesi
D = 2L·fs/c, uç yansıma çarpımı s (açık −1, kapalı +1), uç kaybı tek sıfırlı
alçak geçiren; kayıp süzgecinin DC grup gecikmesi D'den düşülür, kesirli
gecikme doğrusal ara değerle okunur (uzunluk örnek başına değişebilir, tık
yok). Açık/kapalı yalnız tek harmonikler ((2n−1)·c/4L), açık/açık bütün
harmonikler (n·c/2L) — ölçülen modlar ±%2'de, açık/kapalıda çift harmonik
konumları 20 dB'den fazla zayıf; uzunluk arttıkça temel kesin düşer.

**Modal yaklaşımla maliyet** (`pnpm --filter @volstudio/audio-synth
bench:resonators`, 110 Hz, 48 kHz, referans makine): tüp Nyquist'e kadar ~218
harmoniği 3.3 ms/sn ses maliyetiyle taşır; modal banka 8 modda 1.1, 32 modda
(registry tavanı) 3.8 ms/sn'dir — aynı 218 harmoniği modal banka ile taşımak
doğrusal ölçekle ≈ 26 ms/sn olurdu. Tüp yoğun harmonik rezonansta ~8× ucuzdur;
modal banka ise mod başına oran/sönüm/genlik ve harmonik olmayan yerleşim
(zar, çubuk) verir — ikisi rakip değil, farklı sorulara cevaptır.

### AcousticArchetype katmanı

`archetype.fluid-creature`, `membrane-creature`, `air-sac-creature`,
`chitin-clicker`, `resonant-shell`, `vocal-tube`. Archetype ham preset
değildir: topoloji (katman → yapı taşı zinciri), makro uzayı (normalize
parametreler → `control.*` ve düğüm parametreleri) ve varyasyon politikası
taşır. `Acoustic.expandArchetype(ArchetypeRequestV1)` saf ve deterministik
bir PROGRAM BELGESİ üretir; doğrulama ve render kanonik program yolundadır.
k. varyasyon `archetype:<id>/variation:<k>` alt akışından türeyen sınırlı
sapmalardır (perde konturu, oranlar, formant hedefleri, program tohumu);
topoloji ve makro kümesi değişmez. Parametre aralığı, yapısal kısıt (ör.
FluidCreature'da süre en düşük nabız hızında 1.5 nabız taşımalı) ve üretilen
program render'dan önce doğrulanır. Kanıt: her archetype için 8 varyasyon
geçerli, deterministik, topolojisi registry'deki sözleşmeyle aynı ve PCM
özetleri ikişer ikişer farklı; aile değişmezleri sekizinde de tutar; registry'deki
her archetype yön iddiası (27 iddia) ölçümle kesin monoton. Perde ölçülürken
glottal pürüz kaynakları sıfırlanır ve kontur sabitlenir — perde YOLU
(gesture + makro) değişmez, yalnız ölçümü bozan düzensizlik çıkar.
Dinleme paketi: `pnpm --filter @volstudio/audio-synth audio:audition` →
git-dışı `export/audition/` (48 archetype varyasyonu + 3 vokal aile, ölçüm
tablosu `audition.json`; öznel yargı içermez).

## Arama laboratuvarı

Agent tek bir "doğru" sayı tahmin etmek yerine bir programın anlamsal
ayarları için sınırlı aralıklar ve seçenekler verir; motor bu uzayı
deterministik olarak tarar, adayları render edip ölçer ve mekanik
filtrelerden geçirir. Seçim bir insan (ya da açıkça beyan eden agent)
kararıdır. Arama ikinci bir üretim hattı DEĞİLDİR: hiçbir aday doğrudan
yayımlanmaz; onaylı aday bir job'un programına terfi eder ve oradan kanonik
akıştan geçer.

### Arama yapıtları ve provenance

| Yapıt                    | Yer                                  | İçerik                                                                         |
| ------------------------ | ------------------------------------ | ------------------------------------------------------------------------------ |
| `AcousticSearchSpecV1`   | `audio-searches/<id>/spec.json`      | taban, tohum, strateji+sürüm, aday sayısı, boyutlar, dışlama, filtre, bütçe    |
| aday programı            | `audio-searches/<id>/candidates/c-…` | adayın kendi `AcousticProgramV1` belgesi (production kaydı değil)              |
| `AcousticSearchReportV1` | `audio-searches/<id>/report.json`    | ön-denetim özeti, sıra, kimlik, değerler, maliyet, risk, PCM, betimleyici, red |
| `SearchSelectionV1`      | `audio-searches/<id>/selection.json` | aday başına karar (`pending/approved/rejected`), beyan eden, etiket, not       |
| `ProgramOriginV1`        | `audio-jobs/<job>/origin.json`       | terfi eden adayın arama kimliği, spec/rapor özeti, sıra, strateji, PCM özeti   |

Spec normalize yazılır (boyutlar ADA göre sıralı): JSON anahtar sırası ve
boyut dizisi sırası spec özetini, planı ve raporu değiştirmez. Rapor
kanoniktir; zaman damgası, süre ölçümü ya da mutlak yol taşımaz — iki taze
süreçte bayt bayt aynıdır (`tests/search/crossProcess.test.ts`). Aday
kimliği `c-<16 hex>` = SHA-256(program özeti, arama tohumu, strateji
kimliği/sürümü, `PROGRAM_RENDERER_VERSION`, arama şeması); düğüm sürümleri
program özetinin içindedir. Registry açıklama özeti raporda BİLGİ olarak
durur: yalnız açıklama metni değişince kimlik ve PCM değişmez.

Aday durumu mekaniktir ve karar ondan ayrıdır:

| Durum      | Anlamı                                                           | Kanıt raporda                |
| ---------- | ---------------------------------------------------------------- | ---------------------------- |
| `invalid`  | render ÖNCESİ elendi: dışlama, materyalize, render bütçesi, ikiz | aşama + kod + yol + gerekçe  |
| `filtered` | render edildi, bir mekanik filtreyi geçmedi                      | PCM, betimleyici, denetimler |
| `error`    | render ya da analiz hata verdi                                   | aşama + hata adı + mesaj     |
| `passed`   | bütün filtreleri geçti; karar verilebilir                        | PCM, betimleyici, denetimler |

`report.json` en son yazılır; raporu olmayan dizin yarım koşudur ve aynı
spec ile yeniden koşulur (çıktı deterministik). Tamamlanmış aramanın üzerine
yazılmaz — kararlar o rapora bağlıdır; yeni tanım yeni `searchId` ister.
`audio:production-check` (`verify --all`) kayıtlı aramaları spec'ten bellekte
yeniden üretir ve sıra/kimlik/program/durum/PCM eşitliğini sınar.

### Boyut sözlüğü

Boyut bir programın ANLAMSAL ayarını adresler; keyfi JSON yolu, yama ya da
ifade dili yoktur (`src/program/dimensions.ts`, arama ve aile ortak):

- `archetype-param`: archetype makrosu (genişletmeden önce).
- `control`: `control.*` değeri; archetype'ın sahip olduğu makro burada
  aranamaz (archetype-param ile aranır), hedefi olmayan makro spec
  aşamasında reddedilir.
- `node-param`: `{ layer, slot, index?, primitive, param }`; primitive
  kimliği adreste yazılır ve eşleşmezse reddedilir; gesture/modülasyona bağlı
  değer aranamaz (eğriyi silerdi).

Aralık registry sınırları içinde olmalı, `unit` registry birimiyle aynı
olmalı; seçenekler registry'nin kabul ettiği değerlerdir. Uygulama sırası
sabittir: genişletme → makrolar → düğüm parametreleri. Dışlama kuralı
(`exclude`) bir bağlaçtır (`when` koşullarının hepsi), ifade dili değil.

### Strateji ve determinizm

`scrambled-halton` v1. Seçim gerekçesi: Latin hypercube N'ye bağlıdır — aday
sayısı değişince bütün noktalar değişir; Sobol yön sayısı tablosu ister ve
küçük N'de ilk boyutları eşler. Halton öneki kararlıdır (k. aday N'den
bağımsız, `tests/search/strategy.test.ts`), tablo istemez ve ≤ 8 boyutta
düşük uyumsuzluk verir. Yüksek tabanlardaki boyutlar-arası ilinti taban
başına tohum + boyut ADINDAN türeyen basamak permütasyonuyla (0 sabit) kırılır;
tohum ayrıca rastgele bir başlangıç indeksi seçer, böylece permütasyonu
olmayan taban 2 de tohuma bağlıdır. Ardışık her p^k indeks bütün kalıntıları
kapsadığından ilk p^k nokta her 1/p^k aralığına tek düşer (test kilitli).
İlk sürümde 0'ı da permüte eden karıştırma denendi; noktalar yarı açık
aralığın öbür ucuna kaydığı için tabakalama bozuldu ve bırakıldı. Strateji
sonucu okumaz: optimizasyon, Bayesçi arama, genetik algoritma ya da estetik
puan yoktur. Sürekli değer 6 anlamlı basamağa, tamsayı parametre tama
yuvarlanır; seçenek `floor(u·k)` ile seçilir.

### Ön-denetim bütçesi

Aşama 1 (plan) hiçbir adayı render etmez: noktalar üretilir, programlar
materyalize edilip doğrulanır, geçersizler sınıflanır, her geçerli adayın
render maliyeti Dalga 0 modeliyle (`estimateProgramCost`) ve kanonik analiz
maliyeti kanal-örneği başına 55 birimle (ölçülen 364–524 ns/örnek, en kötü
durum beyaz gürültü) tahmin edilir. `BatchBudget` (öğe, tek öğe tepe belleği,
toplam iş, tahmini süre = iş × 1e-8 sn) bütün plan üzerinden BİR kez sınanır;
aşım `BatchBudgetError` (`items|memory|work|time`) ile adıyla reddedilir ve
arama dizini, dinleme kökü dahil hiçbir dosya açılmaz. Duvar saati hiçbir
kararı etkilemez; CLI yalnız kanıt olarak raporlar. Yürütme seridir
(paralellik Dalga 13'ündür). Tek adayın render bütçesi aşımı o adayı
`render-budget` ile geçersiz kılar, plan yine bütçe içinde kalabilir.

Referans arama (`audio-searches/reference-shell`, ResonantShell; boyut,
sertlik, sönüm, modal yerleşim — 3 sürekli + 1 seçenek, 16 aday) ölçümü:
ön-denetim ≈ 14 ms, tahmin 1.26e8 birim ≈ 1.26 sn, gerçek yürütme ≈ 0.6 sn
(tahmin küçümsemiyor), 13 passed / 2 filtered / 1 invalid, rapor 33 KB, git'e
giren ağaç 57 KB, git-dışı dinleme kopyaları 1.7 MB. Aynı spec'e
`maxTotalWorkUnits: 1e7` verilince `BatchBudgetError(work)` ve sıfır dosya.

### Arama ↔ production sınırı: terfi

`promote <jobId> --search <id> --candidate <c-…>` tek giriştir. Sıra:
aday `passed` ve seçimde `approved` olmalı → aday program dosyası raporla
aynı → spec aynı strateji ile YENİDEN planlanır ve aynı sıradaki aday aynı
program özetini ve kimliği vermeli (motor/registry değişmişse `stale`) →
program yeniden render edilip PCM özeti rapordakiyle aynı olmalı → program
kanonik `storeProgram` yolundan (brief uyumu + render bütçesi) job'a yazılır
ve AYNI kilit altında `origin.json` yazılır. Job'un eski render/analiz/seçimi
özet zinciriyle bayatlar; sonraki adım normal `render → analyze → select →
publish`tir. Adaylar render kaydı gibi görünemez (`c-` ≠ `r-`), job ya da
manifest ağacına yazmaz; ikinci bir manifest yazıcısı yoktur.

`AudioJobV1`, `AudioSelectionV1`, `AudioAssetManifestV1` ve
`AcousticProgramV1` şemaları DEĞİŞMEDİ. Köken ayrı, sürümlü `ProgramOriginV1`
belgesidir; `status.artifacts.origin` onu job programıyla karşılaştırır.
Elle program kaydı kökeni siler (elle yazılmış program aramadan gelmiş gibi
görünemez); programla uyuşmayan köken `stale` olur, `next.action = program`
der ve publish reddeder. Böylece manifest'teki program özeti → job
`origin.json` → arama raporundaki aday zinciri özetlerle izlenir.

### Arama seçimi ≠ production seçimi

`SearchSelectionV1` bir aramanın adayları hakkındaki beyanlardır (onay/ret/
etiket/not, `by: human|agent`) ve hangi rapora ait olduğunu rapor özetiyle
bağlar; rapor değişirse seçim `stale` olur ve uygulanmaz. Yalnız `passed`
adaya karar yazılır — filtrelenmiş adayı onaylamak spec filtresini sessizce
delmek olurdu. `AudioSelectionV1` ise job içinde hangi RENDER'ın
yayımlanacağını seçer. İkisi ayrı belgedir ve biri ötekinin yerine geçmez.
`by` beyandır, kimlik doğrulaması değildir; agent insan dinlemesi uyduramaz.

### Mekanik betimleyiciler ve denetimler

`src/analysis/descriptors.ts` rapor şemasına GİRMEZ (analizör sürümü ve
yayımlanmış manifest'ler değişmez): perde `yin-v1` (de Cheveigné & Kawahara
2002, ~16 kHz, en çok 40 pencere; mutlak eşik 0.15, eşik altı dip yoksa
global minimuma 0.1 yakın en küçük gecikmeli yerel dip — oktav hatası önlemi;
üçten az aktif pencere ya da aktiflerin yarısından azı sesliyse `null`),
başlangıç `energy-jump-v1` (10 ms pencere, 2.5 ms adım, son 10 ms minimumunun
4 katı, 10 ms refrakter — ilk sürümdeki 2 ms pencere alçak perdeli sürekli
tonda periyot içi dalgalanmayı başlangıç sayıyordu, test kilitli) ve darbe
hızı `envelope-autocorrelation-v1`. Spektral tepe perde DEĞİLDİR; kabarcıkta
rezonans frekansı olarak açıkça öyle adlandırılır. `MechanicalCheckV1`
(`asset-policy`, `clipping`, `clicks`, `descriptor`, `onset-rate`,
`pulse-rate`, `pitch`, `pitch-contour`, `aperiodic`, `band-dominance`) arama
filtreleri ve canary beklentileri için tek bildirimsel dildir; ölçülen değeri
ve eşiği raporlar, birleşik kalite puanı üretmez.

### Aile kalite ölçüsü

`assessFamily` → `SoundFamilyQualityReportV1`. Çeşitlilik ve tutarlılık AYRI
raporlanır, tek bir skor yoktur:

- Çeşitlilik: exact duplicate PCM her zaman sert hata; `family-descriptors-v1`
  uzayında (log-frekans oktav, log-süre, seviye/6 dB, düzlük×4, başlangıç
  yoğunluğu) çift uzaklığı dağılımı; yakın-özdeş çift (< 0.02) ve çökmüş aile
  (medyan < 0.05). Kalibrasyon: aynı kabukta `size` 0.500 → 0.502 ≈ 0.017,
  0.51 ≈ 0.07; sağlıklı 8 üyeli ailede en yakın çift 0.08, medyan 0.28.
- Tutarlılık: aktif süre, centroid, maks. momentary LUFS ve (yalnız YIN
  güveni ≥ 0.5 ise) perde üzerinde medyan + MAD sağlam z-skoru (|z| > 4) ve
  politikada beyan edilmişse oran/yayılım sınırları.

Politika (`FamilyQualityPolicyV1`) sürümlü veridir; yakın-özdeş ve aykırı
bulguları `fail` ya da `report` olarak ailenin kendisi seçer. Uzaklık bir
ölçüm sözleşmesidir, algısal benzerlik iddiası değildir.

### Organik canary derlemi

`canaries/<id>.json` (`OrganicCanaryV1`): `breath`, `bubble`, `droplet`,
`membrane-pulse`, `wet-squish`, `insect-like-chirp`, `cat-like-gesture`,
`alien-fluid-call`. Her biri sürümlü kimlik, deterministik kaynak (program ya
da archetype isteği + tohum), ucuz mekanik beklentiler ve dinleme rehberi
taşır; mevcut yapı taşlarından kurulur, asset kütüphanesi değildir. Mekanik
beklentilerin dişi mutasyonla sınanır (nabız hızı, düz perde eğrisi, nefese
eklenen ton beklentiyi düşürür). İnsan dinleme durumu `canaries/reviews.json`
(`CanaryReviewsV1`) içindedir, sekizi de `pending-human`dır ve yalnız
`canary review … --by human` ile değişir; canary sürümü artınca inceleme
bayatlar. Mekanik geçiş sesin "organik" olduğunu kanıtlamaz.

### Dinleme aracı

`search audition <id>` adayları programlarından yeniden render eder (PCM
özeti raporla aynı olmalı) ve git-dışı `export/audio-searches/<id>/` altına
WAV + salt okunur statik sayfa yazar; `--serve` yerel sunucuyu açar.
Bağımlılıksız HTML/CSS/JS; veri DOM'a yalnız `textContent`/`setAttribute` ile
girer, gömülü durumda `<` kaçışlanır. Sunucu sınırı: yalnız loopback
(`127.0.0.1`/`::1`), `Host` başlığı kendi adı:portu (DNS rebinding), sıkı CSP,
tek yazma ucu `POST /api/decision` (yalnız JSON, `Origin` varsa kendisi,
16 KiB gövde, bilinmeyen alan reddi), ses yalnız raporda render edilmiş aday
kimliğiyle sabit export kökünden; yazılan tek dosya aramanın
`selection.json`ıdır. Kimlik doğrulama yoktur (yerel kullanıcıya güvenilir).
Karar taze bir süreçte `search status` ile dosyalardan yeniden kurulur.
Dinleme kopyası yazan TEK yol `src/protocol/audition.ts`dir ve yalnız
`export/` altına yazar (job render'ı, arama, canary).

## SoundFamily üretimi

Bir ses ailesi tek bir preset'in rastgele kopyaları değildir: ortak akustik
kimlikten (archetype isteği ya da program) türeyen, adı ve rolü olan
varyantlardır. Aile yalnız varyantları sıraya koyar; her varyant kanonik job
akışından geçer ve aile kendi yazıcısını taşımaz.

### SoundFamilyProgramV1

Alanlar: `familyId`, `version`, `title`, `description`, `base` (arama ile
aynı taban), `seed`, `variation.policy` (`role-subrange-v1`), `dimensions`
(arama boyut sözlüğü + `scope: all | role`), `roles`, `variants` (`key`,
`roles`, `tags`), `quality` (`FamilyQualityPolicyV1`), `budget`, `delivery`
(paket, paket-göreli asset dizini, alt tür, sınıf, süre aralığı) ve isteğe
bağlı `provenance` (aile bir arama adayından türediyse arama kimliği). Aramanın
spec'i ile ailenin programı ayrı belgelerdir; paylaşılan yalnız boyut
sözlüğüdür (`src/program/dimensions.ts`).

Roller KAPALI ve genel bir sözlükten gelir: `intensity`
(soft/medium/hard), `weight` (light/medium/heavy), `length` (short/long),
`speed` (slow/medium/fast), `wetness` (dry/wet), `rarity`
(common/alternate/rare), `onset` (soft/sharp). Bir rol değeri boyutların
alt aralığını ya da seçenek alt kümesini seçer; varyant rollerinin
kısıtları kesişir, boş kesişim render'dan önce adıyla reddedilir. Beyan
edilip hiçbir varyantın kullanmadığı rol değeri geçersiz rol kapsamıdır.

### Aile alt akışları ve varyant kimliği

Varyant `k` için boyut `d`nin değeri, `k`'nin rolleriyle daraltılmış aralıkta
`family:<familyId>/variant:<key>/<d>` alt akışının İLK çekilişidir (Dalga 1'in
`substream` şeması). Paylaşılan ardışık bir RNG yoktur; dizi sırası
rastgeleliği belirlemez. Sonuç (`tests/family/program.test.ts`): varyant
dizisini ters çevirmek, yeni bir varyant, yeni bir rol ve yalnız o rolle
kapsanan (`scope: role`) yeni bir boyut eklemek eski sekiz varyantın program
özetini, kimliğini ve PCM'ini DEĞİŞTİRMEZ; aile tohumu değişince değerler
değişir. Varyasyon tohum/perde/kazanç ezmesi değildir: bütün varyantlar aynı
program tohumunu ve master ayarını taşır, ayrım anlamsal boyutlardadır
(sertlik, boyut, sönüm, modal yerleşim; damla ailesinde olay hızı,
düzenlilik, perde çarpanı).

Üç kimlik ayrıdır: `key` yazarın kararlı adıdır (varyant işinin ve asset'in
adı); `variantId` = `v-<16 hex>` SHA-256(aile kimliği, anahtar, roller,
varyasyon politikası, aile tohumu, program özeti) içerik kimliğidir;
`pcmHash` ses kimliğidir. Manifest program ve PCM özetini, job `origin.json`
(`family-variant`) aile özetini, anahtarı ve `variantId`yi taşır.

### Aile kalite kapısı

Yayından ÖNCE bütün varyantlar bellekte render edilir, ölçülür ve Dalga 4
`assessFamily` ailenin beyan ettiği politikayla değerlendirilir: duplicate
PCM ve çökmüş aile her zaman düşer; yakın-özdeş ve aykırı bulgular
politikaya göre `fail` ya da `report` olur; beyan edilen oran/yayılım
sınırları sert kapıdır. Kapı düşerse hiçbir job, asset, manifest ya da bank
yazılmaz (`tests/family/publish.test.ts`). Referans ailede (`reference-shell-hits`)
yoğunluk rolü kaynak seviyesini doğal olarak yayar: `soft-light` −24.6 LUFS
ile sağlam z −4.6 aykırı olarak RAPORLANIR; aile bunu
`outliers: report` + `maxLoudnessSpreadDb: 12` (ölçülen 11.3 dB),
`maxCentroidRatio: 3`, `maxActiveRatio: 1.5` ile açıkça beyan eder. İlk
taslakta yumuşak sertlik aralığı (0.2–0.4) −29.7 LUFS'lik, sfx alt sınırına
dayanan bir varyant üretti ve kapı onu düşürdü; aralık 0.3–0.45'e taşındı.

### Yayın ve kurtarma garantileri

`family publish`: ön-denetim (genişletme, hedef ve sınıf, tek varyant render
bütçesi, toplu bütçe = 4 render + 3 analiz geçişi; FFmpeg kodlaması
modellenmez) → kalite kapısı → aile kilidi → kayıtlı aile içerikçe değiştiyse
`version` artmış olmalı → değişen ailenin eski bank'ı silinir → `family.json`
ve `quality.json` → her varyant için `audio-families/<id>/jobs/<key>` işinde
brief → program + `origin.json` → render → analyze → select → publish (aynı
`publishJob`; `writeOgg` çağıran yeni bir yol yok, `publishPath.test.ts`
değişmedi) → en son bank.

Çok varlıklı hata semantiği: bank YALNIZ bütün varyant manifest'leri okunup
aile genişletmesiyle (program ve PCM özeti) ve asset baytlarıyla
eşleştikten sonra yazılır. Yarıda kalan yayın bank'sızdır; `family status`
bunu `complete: false` ve varyant başına aşama ile gösterir. Aynı komut
tekrarlanınca yayımlanmış varyantlar `unchanged` geçer, kalanlar sürer;
tam yayının tekrarı idempotenttir (bank baytları aynı). Bank'ın TAMAM
sayılması (`family verify`, `verify --all`): şema, aile ve kalite özetleri,
yeniden genişletmede aynı anahtar/kimlik/program, her varyantın manifest ve
asset özetleri; PCM kimliği manifest doğrulamasında yeniden render ile ayrıca
sınanır. Aileden çıkarılan varyantın işi ve asset'i kendiliğinden silinmez
(yazar kararıdır); bank onu listelemez.

### Bank çalışma zamanı sözleşmesi

`SoundFamilyBankV1` hedefin `bankRoot`una yazılır (referans:
`reference/production/banks/<familyId>.json`; oyun: `audio-banks/`). Taşıdığı:
aile kimliği/sürüm/özet/tohum/politika, kalite raporu yolu ve özeti, motor
sürümleri, `ordering: key`, `choice: fnv1a32-mod-v1`, kullanılan rol
eksenleri ve varyant başına anahtar, `variantId`, roller, etiketler,
paket-göreli asset yolu/bayt/özet, manifest yolu/özeti, program ve PCM özeti,
süre, kodek sonrası seviye ve küçük bir betimleyici alt kümesi. Arama
sözleşmesi `sound-family-lookup-v1`: tam anahtar; rol + etiket süzmesi
(anahtara göre sıralı); deterministik seçim = FNV-1a 32(token UTF-8) mod n.
`tests/family/bankLookup.test.ts` audio-synth'in hiçbir modülünü import
etmeden yalnız bank ve asset baytlarıyla bu üç işlemi yapar. Referans aile:
8 varyant, ön-denetim ≈ 23 ms, tahmin 1.7e8 birim, yayın ≈ 4.4 sn, tekrar
≈ 0.2 sn; bank 11 KB, 8 OGG 47 KB, manifest'ler 56 KB, job kayıtları 64 KB.

### Alan bağımsızlığı

audio-synth düşman, organizma fenotipi, silah durum makinesi, boss evresi ya
da oyuncu sınıfı bilmez; domain nesnesini varyanta bağlayan çözücü tüketici
pakette yaşar. Kanıt yasak kelime listesi değildir: aile/arama/bank kodu
yalnız paketin `src/` ağacını, `node:` yerleşiklerini ve
`@volstudio/core/random`u import eder (`tests/governance/familyDomain.test.ts`);
rol sözlüğü kapalıdır ve alan ekseni (`enemyType`) şemada adıyla reddedilir;
bank şeması bilinmeyen alanı reddeder.

## Müzik authoring

Müzik tek seferlik bir ses değil, ZAMANDA yayılan ve çalışma zamanıyla
sözleşmesi olan bir varlıktır. Bu yüzden müzik yolu akustik yolun kopyası
değil, aynı kapıya bağlanan ikinci bir üretim zinciridir: brief → ThemeBook →
program → score → analiz → render → mastering → stem paketi → yayın.

### İstek ve kitap

`AudioBriefV1`in `kind: 'music'` dalı (`music/brief.ts`) müzik isteğini
taşır: kullanım, çalma modeli, duygulanım, tempo/ölçü, tonal sistem, melodik
öne çıkma, ritmik yoğunluk, form, uzunluk, kanal, SFX'e bırakılacak spektral
bant ve adaptive state'ler. **Çalma modeli, kullanım, form, tempo, ölçü ve
uzunluk ZORUNLU KARARDIR ve varsayılanı yoktur**; eksikse `MusicDecisionError`
hangi alanın beklendiğini ve seçeneklerini makine-okunur biçimde söyler.
Varsayılanla doldurmak "seamless menü loop'u" isteğini sessizce "tek seferlik
cue"ya çevirirdi.

`MusicThemeBookV1` proje başına tonal/ritmik dili, imza aralık ve motiflerini,
paleti, register ve spektral kimliği, bilinçli kaçınmaları taşır. Kaçınmalar
KAPALI bir kural sözlüğüdür (`forbid-interval`, `forbid-system`,
`forbid-instrument`, `forbid-role`, `max-density`, `max-polyphony`,
`register-limit`); palet ve register bantları da aynı kural listesine
katılır, böylece analizörün tek bir kural yüzeyi olur. `notes` alanı
bilerek DENETLENMEZ ve raporda "denetlenmedi" diye sayılır — "klişe olmasın"
cümlesini makine sınayamaz. Bir kuralı çiğnemek isteyen program
`themeOverrides` ile kuralın KİMLİĞİNE ve gerekçesine başvurur; override'sız
ihlal kapıyı düşürür.

### Program, score ve tek genişletme

`MusicProgramV1` (`music/program.ts`) sembolik kaynaktır: tempo, ölçü, tonal
sistem, şeritler (enstrüman `preset:<ad>` kimliğiyle), stem'ler, bölümler
(bar aralığı, rol, hedef enerji, aktif şeritler, armoni planı), motifler,
groove profilleri, otomasyon, işaretler, geçişler ve teslim beyanı. Program
JSON'dur; `Timeline`ın `InstrumentFn` fonksiyonu JSON'a yazılamaz, bu yüzden
enstrüman kayıttan ADIYLA çözülür.

`expandProgram` programı `MusicScoreV1`e açar: her nota mutlak vuruşta, kalıcı
bir olay kimliğiyle (`<bölüm>/<şerit>/<n>`) ve provenance'ıyla (akor sesi |
motif + dönüşüm zinciri | açık nota) durur. Sembolik analiz de render de
YALNIZ score okur; "ses üretmeden analiz edilebilir" sözü böylece yapıyla
garanti edilir. İnsanlaştırma genişletmede uygulanır ve rastgelelik olayın
KİMLİĞİNE bağlıdır (`music:<id>/groove/<eventId>`), dizi sırasına değil —
dizine bağlı bir jitter stem'ler ayrı render edilince her stem'de başka bir
sapma üretir ve stem toplamı referans mix'ten ayrılırdı.

Tek tempo, tek ölçü: hem düzenleme ızgarası hem çalışma zamanı zamanlayıcısı
tek ızgara varsayar (`music-single-tempo`).

### Armoni, motif, groove

Armoni derece + nitelik (triad/seventh/sus2/sus4/fifth) ve voicing
(ses sayısı, yayılım, register, en büyük hareket) taşır; kromatik ses `alter`
ile AÇIKÇA istenir. Yerleşim register'a sığmıyorsa ya da hareket sınırı
aşılıyorsa akorun indeksiyle hata verilir — sessizce transpoze edilmiş bir
akor duyulana kadar fark edilmezdi. Motif dönüşümleri kapalı bir kümedir
(transpose, register-shift, rotate, fragment, sequence, augment, diminish,
invert) ve her örnek `variationId` ile kaynağına izlenir. Groove profili
swing, zamanlama/hız sapması ve vurgu tablosudur; sıfır sapmada çıktı tam
ızgaradır.

### Sembolik analiz

`MusicSymbolicReportV1` şunları ölçer: nota/ölçü yoğunluğu, ANLIK polifoni
(uzun bir akor sesi art arda gelen kısa notalarla "aynı anda çalıyor"
sayılmaz), şerit register'ları, perde sınıfı dağılımı ve sistem dışı oran,
motif tekrarı, bölüm enerjisi ile hedef enerjinin SIRA uyumu, armonik ritim,
kural ihlalleri ve brief uyumu. Eşikler veri dosyasındadır
(`music/policy.ts`): "sparse" 0–4, "moderate" 3–10, "dense" 8+ nota/ölçü;
melodik öne çıkma toleransı 0.35; bölüm kontrastı için sıra uyumu ≥ 0.75.
Ezgisel şerit ölçüsü bindirme SÜRESİNE bakar (≤ %15), sayıya değil: swing'le
birkaç milisaniye taşan bir sekizlik ezgiyi akor yapmaz.

### Render ve mastering yolları

Render `arrange/render.ts`teki TEK ham yolu kullanır (`renderVoices`);
`Timeline` de aynı yolu çağırır, ikinci bir toplama gerçeği yoktur. Mastering
kararı çalma modelinden türetilir ve müzik için `masterMix`i çağıran tek yer
`music/mastering.ts`tir:

| Çalma modeli      | Yol                | Ne yapar                                                             |
| ----------------- | ------------------ | -------------------------------------------------------------------- |
| `loop`            | `loop-cyclic`      | kuyruk başa sarılır, sönüm ve kırpma yok, yükseklik DÖNGÜSEL ölçülür |
| `playlistOneShot` | `one-shot-limited` | kuyruk payı, sessizlik kırpma, kenar sönümü, sınırlayıcı             |
| `adaptiveLoop`    | `stem-linear`      | yalnız ORTAK doğrusal kazanç; sınırlayıcı ve tavan YOK               |

Döngüsel ölçüm tamponu iki kez arka arkaya koyup ikinci turu ölçer:
K-ağırlık filtresi ilk yüz milisaniyede ısınır ve tek turda loop'un başı
sistematik olarak kısık görünür. Stem yolunda sınırlayıcı yoktur çünkü
sınırlayıcı doğrusal değildir; stem başına uygulanınca "stem'lerin toplamı =
referans mix" garantisi ölür. Tepe payı orada kazancı DÜŞÜREREK açılır.
Sınırlayıcılı yollarda pay ölçülerek bulunur (`refineForTruePeak`): kaynağın
tepe değerine göre peşinen kısmak sınırlayıcının açtığı payı geri verirdi
(ölçüldü: referans cue −18.9 LUFS'e kadar iniyordu). Ölçüm: libvorbis dönüşü
true peak'i ~0.2 dB yükseltiyor (kaynakta −1.086 dBTP olan cue kodek sonrası
−0.88 çıktı ve kapı onu reddetti); hedef pay 2 dB, bağlayıcı olan kodek
sonrası −1 dBTP politikasıdır. True-peak sınırlayıcı EKLENMEDİ.

### Stem paketi ve adaptive QA

Stem'ler aynı score'dan, aynı ızgarada ve aynı kare sayısıyla render edilir.
İki ölçüm bağlayıcıdır:

1. **Parite**: stem toplamı referans mix'ten en çok −90 dBFS sapabilir
   (ölçülen: referans adaptive'de −148.6 dBFS, yalnız kayan nokta gürültüsü).
2. **Kombinasyon QA'sı**: beyan edilen state'ler VE gain haritası eşiklerinin
   köşeleri tek tek karıştırılıp ölçülür. Gain'ler runtime'ın kullandığı
   `resolveStemGain` ile hesaplanır — ikinci bir gain gerçeği yazılmaz. Her
   kombinasyon için tepe, true peak ve yükseklik sınanır; en kısık state
   duyulur kalmalı, en yüksek state politika aralığında olmalıdır.

Stem'in KENDİ yükseklik aralığı mix'inkinden farklıdır (`music-stem` sınıfı,
[−45, −8] LUFS): yalnız ezgi katmanı doğal olarak kısıktır ve mix aralığına
zorlanırsa toplamları tavanı aşar.

### Çalışma zamanı sözleşmesi

`MusicAssetSpecV1` core'dadır (`core/src/audio/music/spec.ts`) çünkü hem
üretim aracı hem çalışma zamanı ondan türetir. `barsToFrames` TEK
dönüşümdür: bpm × örnek oranı tam bölünmediğinde üretimin ve runtime'ın
farklı yuvarlaması loop dikişinde duyulur bir tık bırakır. `toMusicTrack`
spec'i motorun çaldığı `MusicTrack`e çevirir (loop noktaları SANİYE olarak).
Spec kompresörsüz ölçülür; `assertEngineCompatible` motor kompresörü açıkken
kurulmuşsa hata verir — core'un varsayılan kompresörü (−24 dB eşik, 12 oran)
−14 LUFS'e getirilmiş bir parçayı ezer ve offline ölçüm duyulanı temsil etmez.

Geçiş sözleşmesi `MUSIC_RUNTIME_CAPABILITIES` listesine bakar: bar hizalı
crossfade, sönümlü durdurma ve playlist boşluğu VARDIR; stinger, parça içi
bölüm atlama ve farklı tempolar arası bar hizası YOKTUR ve
`unsupported-by-runtime` ile reddedilir. Tonal ilişki beyan edilebilir ama
motor ton bilmez; rapor bunu "motor uygulamıyor" diye işaretler.

### Yayın ve doğrulama

`music publish`: sembolik kapı → kombinasyon QA kapısı → müzik kilidi →
yayımlanmış bundle'ın programı değiştiyse `version` artmış olmalı → rapor ve
QA belgeleri → her asset için `audio-music/<id>/jobs/<stem>` işinde brief →
program → render → analyze → select → publish (AYNI `publishJob`; müziğe özel
bir yazıcı yok) → kodlanmış hiza denetimi → en son bundle.

Job türü (`AudioJobV1.kind`) `acoustic | music`tir; render/doğrulama
dağıtıcısı `protocol/kinds.ts`tedir. Müzik işinin programı
`MusicStemProgramV1`dir: bir stem (ya da referans mix), mastering kararı ve
müziğin tamamı. Mastering kazancı belgede yazılıdır — her stem için bütün
parçayı yeniden ölçmek yayın maliyetini stem sayısıyla çarpardı; kararın
doğruluğu ön denetimde bir kez ölçülür, kodek sonrası sınıf politikası zaten
her asset'te ayrıca sınanır. Belgede beyan edilen mastering yolu çalma
modeliyle uyuşmazsa program şema düzeyinde reddedilir.

Kodlanmış hiza: her asset çözülüp kaynak PCM ile çapraz korelasyona sokulur;
gecikme 0 ve kare farkı 0 olmalıdır (`cross-correlation-v1`). Bir örneklik
kayma kulakta faz olarak duyulur ve hiçbir yükseklik ölçüsü onu yakalamaz.

`music verify` / `verify --all`: program, brief, rapor ve QA özetleri,
yeniden genişletmede aynı rapor özeti, spec'in ölçü→kare sözleşmesi, her
asset'in manifest ve bayt özeti, hiza kaydı.

### Hiyerarşik arama

`MusicSearchSpecV1` beyan edilmiş bir varyasyon uzayı tanımlar (şerit
kazancı, groove swing/hız sapması, register kaydırma, voicing yayılımı,
yoğunluk inceltme, motif ötelemesi). Bütün adaylar SEMBOLİK açılır, süzülür
ve hedeflere uzaklığa göre sıralanır; yalnız finalistler render edilir.
Strateji akustik aramayla aynıdır (scrambled-halton v1) ve aynı tohum aynı
sırayı verir. Terfi, aday programını `music.json`a sürüm artırarak ve
`provenance` (searchId, candidateId, rapor özeti) ile yazar.

**Arama beste YAPMAZ**: beyan edilmiş bir uzayı tarar. Müzikal fikir temel
programdan ve ThemeBook'tan gelir.

### Referans fixture'lar (ölçüldü)

| Fixture              | Çalma           | Kare             | Kazanç   | LUFS   | dBTP  | Asset                |
| -------------------- | --------------- | ---------------- | -------- | ------ | ----- | -------------------- |
| `reference-loop`     | loop            | 441000 (10 sn)   | −3.25 dB | −16.26 | −1.96 | 68 KB                |
| `reference-cue`      | playlistOneShot | 355512 (8.06 sn) | +0.78 dB | −18.08 | −1.91 | 53 KB                |
| `reference-adaptive` | adaptiveLoop    | 378000 (8.57 sn) | +0.71 dB | −16.02 | −4.19 | 3 stem + mix, 141 KB |

Referans arama (`reference-loop/search.json`): 24 aday sembolik açıldı, 12'si
süzgeci geçti, 3'ü render edildi.

### Bilinen sınırlar

Perküsyon rolü enstrüman kaydında yalnız 3 preset taşır; ritim bölümü
melodik enstrümanlarla kurulur (parametrik davul ailesi Dalga 11). Müzik yolu
yalnız ÖLÇÜLEN değerlerle doğrulandı — sembolik uygunluk, yükseklik, true
peak, stem paritesi, kodlanmış hiza; insan dinlemesi yapılmadı ve "iyi müzik"
iddiası yoktur (`music-no-listening-validation`).

## Hızlı Başlangıç

### 1. Generate scripti

```typescript
import { Presets, synth } from '@volstudio/audio-synth';
import { writeOgg } from '@volstudio/audio-synth/writer';

const result = Presets.laser(880, 0.15);
const sound = synth(result.duration, result);
writeOgg('public/assets/audio/sfx/combat/laser.ogg', sound);
```

### 2. Paket scripti

```json
"generate:audio": "pnpm run generate:sounds && pnpm run generate:music"
```

### 3. Çalıştırma

```bash
pnpm --filter @volstudio/<game> generate:sounds
```

### 4. Oyun içinde çalma

```typescript
gameAudio.playSfx('fire', { volume: 0.3 });
```

## Parametre yüzeyi

`SynthParams` ve alt tipleri (`FmParams`, `EnvelopeParams`, `SampleParams`, …)
`src/types.ts` içinde JSDoc'larıyla birlikte durur. **Tek kaynak odur**; bu
belge onları tekrarlamaz — tekrarlanan tablo bir kez bayatladı ve
`stereoWidth`in sayı da kabul ettiğini söylemiyordu.

Belge yalnız tipten okunamayacak şeyi taşır: hangi parametrenin neden var
olduğunu ve hangi bileşimin kötü ses ürettiğini (bkz. "Cızırtı ve ucuz sesten
kaçınma").

### Sınır politikası (`src/guard/`)

Her render girişi (`synthesize`, efekt ve filtre kurucuları, zarf, sample
işleme, fiziksel modeller) parametreyi TEK bir çözümleme katmanından geçirir.
Bozuk veri DSP'ye girmez ve tampon ayrılmadan `AudioParamError` ile
reddedilir; hata alanın tam yolunu taşır (`reverb.decay`, `lfos[1].rate`,
`lowpass.envelope.release`, `sample.data[3]`, `piano.frequency`) ve türünü
(`issue`) ayrı bir alanda verir.

| Girdi                                              | Davranış                                   |
| -------------------------------------------------- | ------------------------------------------ |
| NaN / ±Infinity                                    | `non-finite` — her yerde reddedilir        |
| Yanlış tip, bilinmeyen seçenek, tamsayı olmayan    | `type`                                     |
| Bilinmeyen alan (`decy`, `cuttoff`)                | `unknown-key` — yazım hatası sessiz kalmaz |
| Eksik zorunlu alan (`delay.time`, `filter.cutoff`) | `required`                                 |
| Belgelenmiş aralığın dışı (sonlu)                  | `range`                                    |
| Tek başına geçerli, birlikte anlamsız alanlar      | `combination` (ör. 1 kutup + `bandpass`)   |

NaN aralığın tabanına SABİTLENMEZ: bu, bozuk girdiyi geçerli bir sese
çevirir ve hangi alanın bozuk olduğunu siler. Kelepçe yalnız belgelenmiş
dört durumda kalır: örnek oranına bağlı Nyquist tavanları (anlık frekans,
filtre kesimi, phaser `maxFreq` — modülasyon onları oraya itebilir),
kararlılık tavanları (delay feedback 0.99, `pulseWidth` [0.01, 0.99]),
`BiquadFilter` Q tabanı 0.1 ve fiziksel modellerin şekillendirme alanları.
Aralıklar `src/types.ts` JSDoc'larında yazılıdır.

**Fiziksel modeller.** Temel nicelikler `synthesize` ile aynı kurala
tabidir — örnek oranı [8000, 384000] tamsayı, süre ≥ 50 ms, temel frekans
modelin tabanı ile Nyquist arası; dışı reddedilir, sessizce uzatılmaz ya da
kaydırılmaz. Şekillendirme alanlarında (sertlik, sönüm, gürültü…) sonlu
olmayan değer reddedilir, sonlu değer modelin fiziksel aralığına kelepçelenir.

**Süre sınırı yoktur, bütçe vardır.** Eski 600 sn kelepçesi `repeat`
toplamını da sessizce kesiyordu; artık tampon tam `duration + (repeat − 1) ×
repeatTime` sürer ve aşırı istek kaynak bütçesinde reddedilir (aşağıda).

### Reverb: `decay` RT60'tır

`decay` saniye cinsinden RT60'tır: alçak frekans kuyruğunun 60 dB düşme
süresi. Her comb kendi gecikmesinden Schroeder bağıntısıyla kazanç alır:
`g = 10^(−3·D/T60)` (Schroeder 1962, Denk. 15; J.O. Smith, _Physical Audio
Signal Processing_, "Achieving Desired Reverberation Times"). Damping
filtresinin DC kazancı 1 olduğu için RT60 alçak frekansta tam tutar; `damp`
yalnız tizleri hızlı söndürür. `roomSize` yalnız yankı yoğunluğunu (comb
gecikmelerini) ölçekler, süreyi değiştirmez.

Üç ek düzeltme aynı turda ölçümle geldi:

- **Difüzörler gerçek allpass.** Freeverb'ün `y = w[n−N] − g·x` biçimi
  allpass değildir (g = 0.5'te kademe başına ~+2 dB enerji; dört kademe
  ölçülen +7.95 dB). Kafes biçimi `|H| = 1` verir.
- **Wet enerji normalize.** Comb'un beyaz gürültü enerji kazancı
  `⟨1/(1 − g²|H(ω)|²)⟩` analitik hesaplanır; wet yol ona göre ölçeklenir.
  Ölçülen: 0.8…3.5 sn ve damp 0…0.45 aralığında gürültü wet kazancı
  0.00 ± 0.07 dB. `amount` böylece bir karışım oranıdır, `decay` seviyeyi
  değil süreyi değiştirir.
- **Wet yol DC taşımaz.** Comb'un DC kazancı `1/(1 − g)` uzun RT60'ta ~10×
  olur (ölçülen: crystalBell DC 0.0005 → 0.0144); wet çıkış 20 Hz tek kutuplu
  DC engelleyiciden geçer.

**Ölçüm** (`tests/reverbDecay.test.ts`): impuls yanıtının Schroeder
geri entegrasyonu (EDC), ISO 3382-1 T30 (−5…−35 dB regresyonu, −60 dB'ye
uzatma). damp = 0'da istenen 0.8 / 1.4 / 2.2 / 3.5 sn → ölçülen 0.799 /
1.399 / 2.201 / 3.515 sn; roomSize 0.2 ile 0.8 arasında fark < %0.5.
`tailSeconds` (ön gecikme + en uzun comb + allpass zinciri + RT60)
noktasında kalan enerji ≤ −60.1 dB.

**Bilinen sınır.** Paralel comb topolojisi tonal, sürekli girdide tek tek
comb rezonanslarını uyarır: saf sinüste wet seviyesi frekansa bağlı ±4 dB
oynar ve uzun RT60'ta L/R dengesi tonal bir pad'de ~2–3 dB ayrışabilir.
Geniş bant enerji normalizedir; bu renklenme topolojinin kendisidir.

**Preset göçü.** Eski kod `decay`i [0,1]'e kelepçeleyip normalize bir
geri beslemeye çeviriyordu: paket presetlerinin yazdığı 1.7 / 1.8 / 1.9 /
2.0 sn'lik yaylı reverb'lerinin HEPSİ gerçekte aynı 0.629 sn'yi çalıyordu.
Presetler duyulmuş ve test edilmiş kimlikleriyle korunmak üzere, eski
uygulamanın GERÇEKTE ürettiği RT60'a mekanik olarak taşındı (0.46–0.80 sn).
Daha uzun bir salon isteyen preset değişikliği dinleme (audition) ister.

## Kaynak bütçesi

`synthesize`, fiziksel modeller ve writer, tampon ayırmadan önce maliyeti
tahmin eder ve `RenderBudgetError` ile reddeder (`src/guard/budget.ts`).
İki eksen ayrı sayılır:

- **Bellek** — aynı anda canlı kalabilen tamponların üst sınırı: 2×
  oversample iç tampon, decimate edilmiş çıkış, efekt zincirinin kopyası
  (stereoda +1 kanal), sample katmanı ve efekt durum tamponları. GC'nin ara
  tamponu erken bırakacağı varsayılmaz.
- **İş** — deterministik birim sayısı: iç örnek başına sabit yük + osilatör
  / filtre / LFO sayısı, çıkış örneği başına bus efektleri. Birim referans
  makinede ≈ 10 ns'ye kalibre edilmiştir; kapı saati değil sayımı sınar.

Varsayılan bütçe: **1.5 GiB** bellek tahmini, **6e9** iş birimi.

Referans ölçüm — `pnpm --filter @volstudio/audio-synth bench:budget` (her
senaryo ayrı süreç, tepe RSS `/usr/bin/time -f %M`; AMD Ryzen 5 7235HS,
Node 22.23.1, Linux 7.2):

| Senaryo                                  | Tahmin (MiB) | Tepe RSS (MiB) | İş birimi | Süre (sn) |
| ---------------------------------------- | -----------: | -------------: | --------: | --------: |
| sine 10 sn, 44.1 kHz, mono               |          6.7 |             96 |    1.72e7 |      0.17 |
| 16 harmonik + detune, 60 sn, 48 kHz, rvb |         55.1 |            137 |    5.88e8 |      4.93 |
| 600 sn, 48 kHz, stereo + reverb          |        549.5 |            632 |    1.41e9 |      13.3 |
| aynısı + sample katmanı                  |        880.9 |            743 |    1.47e9 |      13.8 |
| aynısı + `writeOgg`                      |        549.5 |            631 |    1.41e9 |  13.4+8.5 |

Karşılaştırma: aynı 600 sn senaryosu başlangıç commit'inde (600 sn
kelepçesi ve iki geçişli decimation ile) 740 MiB tepe RSS ölçüyordu; ara
"filtrelenmiş" tam boy tampon ve stereo ayrımındaki fazladan kopya
kalkınca 632 MiB (−%15).

Tepe RSS ~90 MiB'lık Node tabanını içerir; tahmin gerçek tampon tepesini
izler, sample katmanında (üç tamponun hepsi aynı anda canlı kalmadığı için)
üstten sınırlar. 1.5 GiB tavanı, desteklenen en büyük senaryoyu taşıyıp
16 GiB'lık referans makinede dört eşzamanlı render'a yer bırakır; 600 sn'lik
192 kHz stereo (≈ 2.3 GiB tahmin) reddedilir. 6e9 birim referans makinede
~60 sn'dir — aynı senaryonun dört katı; bin tekrarlı üst üste binen uzun bir
`repeat` ise ayırmadan önce düşer. `processSample`, kaynak çözüldükten
sonra yeniden örnekleme çekirdeğinin gerçek uzunluğuyla (tap ≈ 3.6 ns
ölçüldü) kendi denetimini yapar.

**`writeOgg` tek parça PCM tamponu tutar, akış gerekmez.** Yazıcının
ek tamponu çıkışın 1 katıdır (interleaved f32); render'ın kendi tepesi ise
2× oversample iç tampon yüzünden daha yüksektir ve iç tampon yazıcıdan önce
serbest kalır. Ölçülen: 600 sn / 48 kHz stereo render + `writeOgg` tepe
RSS'i render'ın tek başına tepesiyle aynı (629 MiB). Yazıcı yine de kendi
tamponunu aynı bütçeyle ayırmadan önce denetler.

## Örnekleme ve alias

**2× decimator.** İç oran 2× oversample'dır; çıkışa sıfır fazlı, Kaiser
pencereli halfband FIR ile inilir (`engine/render.ts`): geçiş bandı çıkış
oranının %45.35'ine (44.1 kHz'te 20 kHz) kadar ±0.01 dB içinde düz,
durdurma bandı katlanması tam 20 kHz'e düşen 24.1 kHz'te başlar ve ≥ 96 dB
söndürür. Önceki 4. derece Butterworth 19.9 kHz'te −3 dB'ydi ve 30 kHz'i
yalnız ~14.5 dB söndürüyordu; FM index koruması yan bantlara iç Nyquist'e
(39.7 kHz) kadar izin verdiği için o bant işitilir banda katlanıyordu.

**Yeniden örnekleme (`resample`).** Sample katmanı Kaiser pencereli sinc ile
yeniden örneklenir (J.O. Smith, _Digital Audio Resampling_): kesim kaynak ve
çıkış Nyquist'inin küçüğüne göre ölçeklenir, geçiş bandı etkin Nyquist'in
%90–100'ü, durdurma bandı 96 dB (β = 0.1102(A − 8.7), mertebe
(A − 7.95)/(2.285·Δω)). Ölçülen (`tests/resample.test.ts`):

| Durum                                   | Eski (kayan ortalama + doğrusal) | Yeni      |
| --------------------------------------- | -------------------------------- | --------- |
| 2× aşağı, 11.5 / 13 / 16 / 20 kHz alias | −3.3 / −4.4 / −7.6 / −16.7 dB    | ≤ −101 dB |
| 2× aşağı, 9.9 kHz geçiş bandı           | −2.4 dB                          | 0.0 dB    |
| 48 → 44.1 kHz, 23 kHz alias             | −28.4 dB                         | −101 dB   |
| 2× yukarı, 17.05 kHz görüntü            | −18.3 dB                         | −115 dB   |

Bütçe: alias ≤ −90 dB. Çıkış `maxLength` ile hedef uzunlukta kesilir;
atılacak örnek hesaplanmaz.

**WAV girişi.** `WAVE_FORMAT_EXTENSIBLE` Microsoft sözleşmesiyle okunur:
cbSize ≥ 22, tam 16 baytlık alt biçim GUID'i (`…-0000-0010-8000-00aa00389b71`,
yalnız PCM ve IEEE float), `wValidBitsPerSample` (kabın en anlamlı bitleri;
dolgu bitleri maskelenir, ölçek kabın tam ölçeğidir) ve `dwChannelMask`.
Çözücü mono'ya indirdiği için yalnız indirgemesi belirsiz olmayan düzenler
kabul edilir: tek kanal ya da ön sol + ön sağ. Maske fazla bit taşıyorsa üst
bitler yok sayılır (sözleşme); eksik bit, çok kanallı düzen (ör. 5.1, LFE'li
çiftler) ve konumsuz 2+ kanallı düz PCM reddedilir.

**Loop crossfade.** Geçiş ağırlıkları kuyruk–baş ilintisine göre güç
tamamlayıcıdır (Fink, Holters, Zölzer, "Signal-matched power-complementary
cross-fading", DAFx-16): ilintisizde eşit güç, tam ilintilide eşit kazanç.
Sınırdan sonra çıktı `samples[F]`ten sürer (dönem L − F). Ölçülen: eski
doğrusal geçişte ilintisiz içerikte geçiş ortası −2.82 dB çukur ve her
turda `head[F−1] → head[0]` sıçraması (220 Hz'te 0.996); yeni −0.07 dB ve
en büyük örnek farkı 0.043.

### FM alias

Ölçü kafes yöntemidir (`analysis/fmAlias.ts`): periyodik modülatörlü faz
modülasyonu yalnız `fc + k·fm` çizgilerinde enerji taşır; işitilir bantta
kafes dışında kalan güç / kafes gücü = alias (ölçülmüş alt sınır). Izgara
(`pnpm --filter @volstudio/audio-synth exec tsx scripts/fm-alias-report.ts`,
1200 nokta, taşıyıcı sinüs, 44.1 kHz) risk sınıflarını ve eşiklerini
`FM_ALIAS_LIMITS`e (makine-okunur) yazar; `Analysis.assessFmAlias()` bir
ayarı render etmeden değerlendirir. Seviye: güvenli ≤ −60 dB, dikkat ≤ −30 dB
alias/sinyal.

| Modülatör                   | Güvenli Δf (= I·fm) < | Dikkat Δf < | Izgaradaki en kötü |
| --------------------------- | --------------------: | ----------: | -----------------: |
| sinüs, feedback 0           |              sınırsız |    sınırsız |           −82.2 dB |
| sinüs, 0 < feedback ≤ 0.1   |              10000 Hz |    24690 Hz |           −11.4 dB |
| sinüs, feedback > 0.1       |               27.5 Hz |      275 Hz |            −1.9 dB |
| üçgen                       |               1250 Hz |    24690 Hz |           −19.2 dB |
| üçgen + feedback            |               27.5 Hz |      440 Hz |            −3.4 dB |
| testere / kare / pulse      |                110 Hz |      550 Hz |            −4.7 dB |
| testere / kare / pulse + fb |               27.5 Hz |     27.5 Hz |            +3.4 dB |

Motorun index koruması yan bantları (Carson) iç Nyquist'in altında tutar;
yeni decimator'la sinüs modülatör + feedback 0 bütün ızgarada −82 dB'nin
altındadır (eski decimator'da fc 917 Hz / I 25 → −20.8 dB, fc 3572 Hz / I 8 →
−22.4 dB). Risk sinüs olmayan modülatörde (sonsuz harmonik; koruma yalnız
temeli sayar) ve feedback'te (modülatör harmonik kazanır; ≳ 0.3 döngüde
periyodikliği kaybeder, kafes dışı enerji kaosu da içerir) kalır.
Oversampling'i körlemesine artırmak bu iki kaynağı çözmez; kural onları
görünür ve deterministik yapar. `tests/fmAlias.test.ts` her koşuda sınıf
sınırlarını ölçer ve tahminin ölçümden iyimser olmadığını doğrular
(tam ızgarada yanlış "güvenli" 0, iyimser "dikkat" 0).

## Arp / Sequence

`compose()` ile melodik diziler üretilir:

```typescript
import { compose, Presets } from '@volstudio/audio-synth';

const result = compose(Presets.arpeggioUp(440), Presets.blip(440, 0.1));
writeOgg('public/assets/audio/sfx/level-up.ogg', result);
```

```typescript
interface SequenceNote {
  freq?: number; // Hz
  semitone?: number; // root'a göre
  duration: number; // saniye veya beat
  delay?: number; // sonraki nota öncesi boşluk
  params?: Partial<SynthParams>;
}

interface SequenceParams {
  notes: SequenceNote[];
  rootFreq?: number;
  bpm?: number; // duration/delay beat olarak yorumlanır
  loop?: number;
  loopDelay?: number;
}
```

Sınırlar: swing, MIDI, real-time scheduling yok; polifoni yok, notalar üst üste binebilir.
Bus efektleri (`delay`, `flanger`, `phaser`, `chorus`, `pan`, `reverb`,
`stereoWidth`), `sampleRate` ve `sample` diziye aittir: `baseParams` ile
verilir, nota `params` içinde reddedilir. Nota `params.gain` o notanın
kazancıdır.

## Hazır presetler

Preset adlarının listesi kodda yaşar; belge kopyasını tutmaz.

```typescript
import { Presets } from '@volstudio/audio-synth';

Presets.PRESET_CATALOG; // ad → tanım
Presets.findPresets({ category: 'combat', tags: ['weapon'] });
Presets.getPreset('laser', 880, 0.15);
```

Kategoriler: `combat`, `ui`, `rewards`, `movement`, `sequence`.

## VOL.HELL SFX'leri

> VOL.HELL `frozen`'dır (`workspace-lifecycle.json`): aşağıdaki adımlar ürünün
> **tarihsel reçetidir** — frozen ağaçta yeniden üretim koşulmaz, seslerin
> üretim kanıtı `vol-hell/final-*` etiketindedir. Yeni bir ürün aynı akışı
> kendi paket ağacında kurar.

VOL.HELL'in sesleri bu dosyadaki genel preset kütüphanesini DEĞİL,
`games/vol-hell/scripts/audio/palette/*.ts` altındaki "Dark Synthetic / Void"
paletini kullanır — müzikle aynı sözlük.
Gerekçe: SFX çıplak `sawtooth`/`triangle` + kısa ADSR ile üretildiğinde klasik
konsol (chiptune) karakteri veriyor ve additive/FM ile üretilen müzikle
tutarsız bir kimlik oluşturuyordu. Aynı FM/bandpass/gürültü yaklaşımı iki
tarafta da kullanılınca ateş sesi ile ambiyans aynı dünyaya ait duyuluyor.

### Yeni Ses Ekleme

1. `games/vol-hell/scripts/audio/sfx/specs.ts`'teki `specs` dizisine ekle:

```typescript
{
  name: 'my-sound-0',
  category: 'combat',
  peak: 0.55,          // olay önemine göre seviye hiyerarşisi
  drive: 1.12,
  render: () => {
    const mix = shot(0.35);
    addVoice(mix, metalClank(A3, 0.45, 0, 1301), 0);
    addVoice(mix, deepImpact(A2 * 0.8, 0.2, 0, 1302), at(0.002));
    return mix;
  },
}
```

2. `games/vol-hell/src/config/sounds.ts`'te `soundAssets` güncelle.
3. `pnpm --filter @volstudio/vol-hell generate:sounds` çalıştır.
4. Oyun kodunda `gameAudio.playSfx('mySound', { volume: 0.3 })` ile çal.
5. Doğrula:

```bash
pnpm --filter @volstudio/vol-hell audio:qa  # click 0, clip 0 olmalı
pnpm -r typecheck
pnpm --filter @volstudio/<game> build
pnpm --filter @volstudio/<game> test
```

### Seviye kuralı

Sesler aynı tepeye normalize EDİLMEZ. Her katman `normalize: false` ile üretilir,
normalize son mix'te bir kez uygulanır (`masterPeak`). Tepe hedefi olay önemine
göre verilir: UI tıkı ~0.45-0.62, ateş ~0.6, hasar ~0.78, ölüm ~0.86. Hepsini
eşitlemek oyunun dinamik hiyerarşisini `sfxVolumes` tablosuna yüklüyordu.

## Kategori Yapısı

Sesler `public/assets/audio/sfx/` altında gruplanır; path ile `sounds.ts` eşleşmesi yeterli:

- `combat/`
- `player/`
- `ui/`

## API Örnekleri

### Koyu, temiz UI blip

```typescript
synth(0.1, {
  wave: 'sine',
  frequency: 250,
  gain: 0.7,
  envelope: {
    attack: 0.002,
    hold: 0.03,
    decay: 0,
    sustain: 0,
    release: 0.06,
    sustainLevel: 1,
    curve: 'cosine',
  },
  highpass: { cutoff: 40 },
});
```

### Düşen laser

```typescript
synth(0.15, {
  wave: 'sine',
  frequency: 880,
  slide: -700,
  envelope: { attack: 0.005, release: 0.08, sustainLevel: 1, curve: 'cosine' },
  lowpass: { cutoff: 1200 },
});
```

### Soft patlama

```typescript
synth(0.35, {
  wave: 'pink',
  frequency: 100,
  gain: 0.7,
  envelope: { attack: 0.01, release: 0.3, sustainLevel: 1, curve: 'cosine' },
  lowpass: { cutoff: 600 },
  highpass: { cutoff: 40 },
});
```

### FM zil

```typescript
synth(0.6, {
  wave: 'sine',
  frequency: 440,
  envelope: {
    attack: 0.005,
    hold: 0.05,
    decay: 0.3,
    sustain: 0.1,
    release: 0.6,
    sustainLevel: 0.3,
    curve: 'cosine',
  },
  fm: { modulatorWave: 'sine', ratio: 1.4, index: 4, feedback: 0.2 },
  lowpass: { cutoff: 3000 },
});
```

### Phaser

```typescript
synth(0.4, {
  wave: 'sawtooth',
  frequency: 440,
  phaser: { minFreq: 200, maxFreq: 2000, rate: 0.5, stages: 6, mix: 0.5 },
  lowpass: { cutoff: 5000 },
});
```

### Stereo whoosh

```typescript
synth(0.25, {
  wave: 'pink',
  frequency: 600,
  slide: -500,
  envelope: { attack: 0.01, release: 0.15, sustainLevel: 1, curve: 'cosine' },
  lowpass: { cutoff: 1200 },
  pan: -0.3,
});
```

## Cızırtı ve ucuz sesten kaçınma

Bu projede sesleri düzelttikten sonra çıkan dersler:

### Envelope: `sustainLevel` sıfır bırakma

Eğer `sustain: 0` ve `release > 0` verip `sustainLevel: 0` yazarsan, release 0'dan başlar — yani ses hemen kesilir. İşte o sert "cızz" çıkışı çoğu zaman buradan gelir. Release'i duyurmak istiyorsan `sustainLevel` 0'dan büyük ver:

```typescript
// Yanlış: release hiç duyulmaz, ses sert kesilir
envelope: { attack: 0.003, hold: 0.02, decay: 0, sustain: 0, release: 0.08, sustainLevel: 0 }

// Doğru: hold sonrası 1'den yumuşakça 0'a iner
envelope: { attack: 0.002, hold: 0.03, decay: 0, sustain: 0, release: 0.08, sustainLevel: 1 }

// Daha doğal: hold, kısa bir decay, sonra release
envelope: { attack: 0.002, hold: 0.02, decay: 0.03, sustain: 0, release: 0.1, sustainLevel: 0.6 }
```

### Kısa seslerde dalga şekli

Karanlık, profesyonel UI / SFX için `sine` tek başına en temiz ve en kontrollü
seçenektir. `sawtooth`, `square` ve `pulse` PolyBLEP ile bant sınırlıdır ve tüm
sentez 2x oversampling + halfband FIR ile decimate edilir (bkz. "Örnekleme ve
alias"); yine de PolyBLEP'in kendi katlanması kalır — ölçülen: 917 Hz testere
−54 dB, 3.6 kHz −47 dB (alias/sinyal). Parlak yüksek notalarda `lowpass` ile
kesilmelidir.

```typescript
// Koyu, yumuşak UI blip
synth(0.12, {
  wave: 'sine',
  frequency: 250,
  gain: 0.7,
  envelope: {
    attack: 0.002,
    hold: 0.03,
    decay: 0,
    sustain: 0,
    release: 0.06,
    sustainLevel: 1,
    curve: 'cosine',
  },
  highpass: { cutoff: 40 },
});
```

### Filtre sweep'lerine dikkat

Kısa seslerde `lowpass` / `highpass` `slide` kullanmak "wah" veya cızırtılı hareket hissi verir. Koyu, net sonuç istiyorsan sabit `cutoff` kullan:

```typescript
// İyi: sabit, düşük cutoff
lowpass: { cutoff: 400 }

// Kısa SFX'te kaçın: cutoff süre boyunca düşüyor, ses "cızz" yapabilir
lowpass: { cutoff: 1200, slide: -900 }
```

### Reverb ve delay kısa seslerde

Kısa bliplere uzun / yüksek reverb koymak:

- metalik zilimsi halka oluşturur,
- buffer sonunda kırpılırsa ekstra cızırtı verir.

Kısa seslerde reverb çok hafif ve kısa tutulmalı, yoksa hiç konulmamalı:

```typescript
reverb: { amount: 0.08, decay: 0.3, roomSize: 0.3, damp: 0.6 }
```

Uzun drone / ambiyanslarda ise reverb daha rahat kullanılabilir.

### `curve: 'cosine'`

Kısa seslerde attack ve release'te `cosine` eğrisi, başlangıç ve bitişteki tıkırtıyı / klik hissini azaltır. `exponential` bazen çok ani düşüş verir.

### `detune`

Çok kısa seslerde `detune` faz farkından dolayı başlangıçta zayıflama / "cızz" yapabilir. UI bliplerinde `detune: 0` bırak; uzun drone / pad'lerde ılımlı detune güzel çalışır.

### `duration` ile envelope eşleştirme

`duration` envelope toplamından çok kısa olursa ses kırpılır; çok uzun olursa sonunda sıfır olmayan sample'lar bırakır ve çalınca klik olur. Mümkünse `attack + hold + decay + sustain + release` yaklaşık `duration`'a denk gelsin.

## Sınırlar

**Motor müzik için yetersiz DEĞİLDİR.** Tarihî kanıt: frozen VOL.HELL'in
gönderilen müzik ve SFX'inin hepsi bu motorla üretildi ve freeze anında
(`vol-hell/final-2026-09-20`) reçete ↔ asset bayt-birebir doğrulandı. Bu
kanıt freeze etiketinde yaşar: motor o tarihten sonra bilinçli DSP
düzeltmeleri aldı (RT60 reverb, halfband decimator, …), yani bugünkü motor o
dosyaları bayt-birebir yeniden üretmez ve üretmesi beklenmez. Rutin kapı
frozen ağaçta üretim tetiklemez.

Gerçek sınır **motorda değil KATALOGDA**. Primitifler güçlü; altı fiziksel
model (`pluck`, `piano`, `bowedString`, `airColumn`, `brass`, `formant`)
yirmi beş enstrüman presetini taşıyor.

Ölçülmüş, bilinen sınırlar:

- Kenarlı osilatörlerin (PolyBLEP) kendi katlanması: 917 Hz testere −54 dB,
  3.6 kHz −47 dB alias/sinyal.
- Paralel comb reverb tonal girdide renklenir (saf sinüste wet ±4 dB).
- Master tavanları örnek tepesidir; kodek sonrası true peak onu aşabilir
  (demo parçalarının 2/12'si −1 dBTP üstü). True-peak limiter Dalga 10'dadır;
  o zamana kadar varlık QA'sı aşımı raporlar.

Kapsam DIŞINDA olanlar (bunlar bilinçli):

- **Çalışma zamanında canlı sentez.** Hat şudur ve öyle kalır:
  kod → offline render → OGG → MusicEngine. Motor hazır tampon çalar; canlı
  sentez istenirse onun içine gömülmez, ayrı bir çalışma zamanı katmanı
  açılır.
- **Real-time MIDI, ritmik grid, beatmatching, DAW/VST entegrasyonu.**
- **Gerçekçi foley ve insan sesi.** İkincisi formant modeli ister.

## Varlık QA'sı

Gönderilen ses KODEK SONRASI ölçülür (`scripts/audio-qa.ts`: OGG FFmpeg ile
çözülür, ölçüm `Analysis.analyzeAudio` çekirdeğindedir):

- **Yükseklik** — ITU-R BS.1770-5: K-ağırlıklama (48 kHz katsayıları Tablo
  1/2; diğer oranlar libebur128/FFmpeg'in analog prototipinden, 48 kHz'te
  tabloyu 1e-12'de tutar), 400 ms blok, %75 örtüşme, −70 LUFS mutlak ve
  −10 LU göreli kapı. Uzun varlık integrated, kısa olay (EBU Tech 3341)
  en yüksek momentary ile ölçülür; 400 ms'den kısa sinyalde integrated
  tanımsızdır ve sayı uydurulmaz. RMS ve LUFS ayrı adlardır.
- **True peak** — BS.1770 Ek 2: fs < 96 kHz'te 4× aşırı örnekleme (Kaiser
  sinc, çok fazlı; kesin üst sınırla budanır). Örnek tepesi ayrı raporlanır.
- **Kırpma** kanal örneği cinsindendir: kanal başına sayı, toplam kanal
  örneği ve etkilenen çerçeve ayrı.

Doğrulama: EBU Tech 3341 #1/#2/#3/#5 (integrated), #12 (momentary),
#15–#19 (true peak) `tests/loudness.test.ts`te yayımlanmış beklenenlerle
geçer. Referans çapraz denetim (`pnpm --filter @volstudio/audio-synth
audio:reference-check`, `just audio-verify`in parçası): fixture'lar
`writeOgg` ile encode edilip çözülür, FFmpeg `ebur128` ile karşılaştırılır —
tolerans integrated ±0.2 LU, true peak ±0.3 dB; ölçülen en büyük fark 0.052
LU / 0.044 dB. Frozen VOL.HELL kataloğunun 46 dosyasında (salt-okur) fark
integrated ≤ 0.051 LU, true peak ≤ 0.049 dB.

**Sınıf politikası** (`ASSET_CLASS_POLICIES`, makine-okunur): true peak tavanı
her sınıfta −1 dBTP (EBU R128, Sony ASWG-R001, AES TD1008); kırpma sıfır.
Yükseklik aralıkları yayın standardı DEĞİLDİR; frozen VOL.HELL kataloğunun
kodek sonrası ölçümünden ~4–6 LU payla kalibre edildi:

| Sınıf    | Ölçü        | Katalogda gözlenen | Politika (LUFS) |
| -------- | ----------- | ------------------ | --------------- |
| ui       | en yüksek M | −22.8 … −16.0      | [−28, −14]      |
| sfx      | en yüksek M | −24.0 … −10.0      | [−30, −8]       |
| ambience | integrated  | −20.2 … −19.9      | [−26, −16]      |
| music    | integrated  | −17.0 … −14.4      | [−20, −12]      |

Sınıf yol kuralıyla (`music/`, `ambience/`, `ui/` klasörleri; gerisi `sfx`)
ya da `--class` ile belirlenir. **Taban çizgisi:** frozen katalogda 46 dosyanın
43'ü politikayı geçer; 3 müzik parçası true peak tavanını aşar
(`sovereign` −0.84, `surge-protocol` −0.73, `hollow-signal` −0.92 dBTP). Frozen
ağaç değiştirilemediği için bu tarihsel kayıttır; `just audio-verify`
politikayı yalnız AKTİF paketlerin `public/assets/audio` ağaçlarına uygular.

## Doğrulama

Paketin kendi kapıları:

```bash
pnpm --filter @volstudio/audio-synth typecheck
pnpm --filter @volstudio/audio-synth test
pnpm --filter @volstudio/audio-synth test:coverage    # signoff'ta coverage-audio
pnpm --filter @volstudio/audio-synth audio:reference-check
pnpm --filter @volstudio/audio-synth audio:production-check  # manifest'ler + aramalar + aile bank'ları yalnız kendilerinden
pnpm --filter @volstudio/audio-synth audio:job canary run  # organik canary mekanik beklentileri
pnpm --filter @volstudio/audio-synth audio:job context --json
pnpm --filter @volstudio/audio-synth bench:budget     # kaynak bütçesi referans ölçümü
pnpm --filter @volstudio/audio-synth bench:resonators # tüp ↔ modal maliyet kıyası
pnpm --filter @volstudio/audio-synth audio:audition   # git-dışı dinleme paketi
pnpm --filter @volstudio/audio-synth exec tsx scripts/fm-alias-report.ts
```

Ses üreten AKTİF bir paket: reçetesini (`generate:audio`) koşar, çıktıyı
`pnpm --filter @volstudio/audio-synth qa <dizin> --policy` ile kodek sonrası
ölçer; `just audio-verify` (signoff) reçete tazeliğini, ölçüm çekirdeğinin
referans denetimini, production manifest'lerini ve aktif ses ağaçlarının
politikasını birlikte sınar.

## Dikkat

- `writeWav` sadece build zamanında, Node ortamında çalışır.
- Runtime tarayıcıda ses üretmek için `synth()` sonucu `AudioBuffer`'a aktarılır.
- `pan` veya `stereoWidth` verildiğinde çıkış stereo (`channels` 2 elemanlı); verilmezse mono.
