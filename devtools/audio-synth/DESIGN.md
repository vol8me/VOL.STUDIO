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
pnpm --filter @volstudio/audio-synth audio:production-check  # manifest'leri yalnız kendilerinden doğrular
pnpm --filter @volstudio/audio-synth audio:job context --json
pnpm --filter @volstudio/audio-synth bench:budget     # kaynak bütçesi referans ölçümü
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
