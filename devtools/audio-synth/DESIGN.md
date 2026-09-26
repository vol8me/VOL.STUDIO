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
| `synthesis/`   | Örnek NASIL üretilir?                | osilatör, gürültü, zarf, filtre, örnek, retro çekirdeği  |
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
  Bugün yedi model ailesi var: `pluck` (Karplus-Strong), `piano` (modal
  sentez), `bowedString` (yaylı tel), `airColumn` (açık/kapalı boru), `brass`
  (lip-reed), `formant` (vokal formant) ve `instruments/percussion/` altındaki
  yedi parametrik davul modeli (kick, tom, snare, clap, hat, cymbal, perc).
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

R8'deki ikinci ölçüm turu (`bench:budget` `prog-*` senaryoları, 10 sn
programlar; kısa senaryoda JIT/çözüm sabitleri ns/birim oranını şişirir)
üç küçümseme buldu ve modeli ölçümle kalibre etti:

| Senaryo                          | Eski ns/birim | Yeni ns/birim | Değişiklik                                     |
| -------------------------------- | ------------: | ------------: | ---------------------------------------------- |
| BLEP osilatör + zarf             |           8.6 |           9.0 | — (model tutucuydu)                            |
| + `effect.air-absorption`        |          12.1 |          12.0 | FIR tasarımı ilk çağrıda sabit ~20–30 ms;      |
|                                  |               |               | steady-state ~5.5 birim/kare → 8 tutucu kalır  |
| + `effect.width` (stereo)        |           8.3 |           6.8 | — (mono'da etkisiz; stereo'da da ~0.3 ns/kare) |
| treatment: tek `eq-pass`         |          14.7 |           9.3 | `treatmentCost` tabanı 1 → 10 birim/kare:      |
|                                  |               |               | loop'un ikinci turu + seviye ölçümü            |
|                                  |               |               | modellenmemişti (~10× küçümseme)               |
| treatment: `reverb`              |          15.5 |           9.3 | `effect.reverb` 8 → 14 birim/kare              |
| treatment: occluded (3 düğüm)    |          13.5 |           8.9 | iki düzeltmenin toplamı                        |
| `source.wind@2` + gust patlaması |          13.6 |           9.2 | `workPerFrame` 24 → 36 (5 SVF + OU + noise)    |

Kalibrasyon ilkesi: küçümseyen sabit ölçülen değere yuvarlanır; tutucu
sabitlere dokunulmaz (parametre-ölçekli olanlar — `addBurst`ün
`rate·clustering` terimi, `eq-pass`in `order` terimi — aynen kalır).

### Job, özet zinciri ve bayatlık

`AudioJobV1` aşamaları: `created → briefed → programmed → rendered → analyzed
→ selected → published`. Kayıtlı aşama bilgi amaçlıdır; `audio:job status`
etkin aşamayı ve `next.action`ı YALNIZ dosyalardan hesaplar. Özetler kanonik
JSON'un SHA-256'sıdır (sıralı anahtar, `-0 → 0`, NaN/undefined/typed array
reddedilir); zaman damgası hiçbir belgeye girmez.

| Kenar                       | Taşıyan                                                  | Bozulunca                         |
| --------------------------- | -------------------------------------------------------- | --------------------------------- |
| brief → program             | job kaydı (`program.brief`)                              | program `stale`                   |
| program → render            | render kaydı `programHash`                               | render `stale`                    |
| render → analiz             | analiz kaydı `renderHash`                                | analiz `stale`                    |
| render/analiz → seçim       | seçim kaydı (iki özet)                                   | seçim `stale`, publish reddedilir |
| brief/seçim/program → yayın | manifest (brief ve program özeti, renderId, asset baytı) | yayın `stale`                     |
| program → köken             | `origin.json` `programHash`                              | köken `stale`, publish reddedilir |

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

**Render yüzeyi.** Manifest programın KULLANDIĞI düğümlerin render
sözleşmesini (`engine.renderSurface`, `render-surface-v1`) kaydeder: kimlik,
sürüm, parametre alanı ve varsayılanı, efekt yönlendirmesi, archetype
genişletme verisi; müzikte ayrıca şeritlerin enstrüman beyanları. Açıklama
metni ve test yoklama noktası girmez, kullanılmayan bir düğümün eklenmesi
kaydı oynatmaz. `verify` kaydı düğüm düğüm karşılaştırır: PCM değiştiyse
hangi düğümün sözleşmesinin kaydığını adıyla söyler. Bağlayıcı kanıt yine PCM
kimliğidir. `engine.registryHash` bütün registry'nin render izdüşümünün
özetidir — motor yüzeyinin sürüm etiketi, programa özgü kanıt değil.

**Aynı sürümde sözleşme değişmez.** `render-surface.lock.json` her düğümün
sürümünü ve izdüşüm özetini tutar; `tests/governance/renderSurface.test.ts`
kilidin bugünkü registry ile birebir eşleşmesini ister. Kilidi
`pnpm audio:surface-lock` yazar ve sürümü artmadan değişen bir sözleşmeyi
yazmayı REDDEDER: parametre alanı ya da varsayılanı değişen düğüm sürümünü
artırır, eski programlar eski sürümü adıyla ister.

**Registry çok sürümlüdür (K2).** Bir düğüm kimliği birden çok sürümü
yan yana tutar: `get(id)` en güncel sürümü verir (katalog/üretim yolu),
`resolve(id, version)` kesin sürümü çözümler ve sürüm uyuşmazlığı açık
`AudioParamError`'dır; tip denetimi sürüm denetiminden önce gelir. Kilit
anahtarı `id@version`'dır — iki sürüm aynı anda kilitlenir. Eski davranış
dondurulmuş modülde yaşar (`synthesis/waveforms-v1.ts`,
`synthesis/retro-v1.ts`, `program/primitives/environmentV1.ts`) ve eski
programlar bit-eşit render edilir (`tests/governance/legacyV1.test.ts`,
2cd8b45 manifestlerinin PCM özetleri); güncel davranış v2'dir.

### Publish kapısı

`publishJob` TEK kanonik yoldur: özet zinciri → belgeler → hedef/yol/sınıf →
yeniden render + PCM kimliği → aynı dizinde staging kodlama (sınıfın kodlama
profiliyle) → çözme + kodek sonrası analiz + sınıf politikası + yerleşim →
teslim varyantında kaynağa bağ → manifest doğrulaması → iki atomik
rename → job kaydı. Politika düşerse hiçbir dosya yazılmaz; kapı ihlali
DÜZELTMEZ. True-peak sınırlama programın kendi kararıdır (`master.limiter`,
isteğe bağlı): kapı onu ne açar ne de onun yerine sinyali ezer. Manifest'siz ya da başka işe ait
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
darbe dizisidir). Kabul testlerinin eski PolyBLEP'in riskli bölgesini
kullanmaması P3'ü uzun süre açık tuttu; F6a'da osilatör çekirdeği bant
sınırlı basamak rezidüeline geçti (`waveforms.ts` `blepResidual`), ölçülen
alias 3.6 kHz testerede −88.3 dB'ye indi ve `polyblep-alias` sınırlaması
ölçüm karşısında yanlış pozitif verdiği için emekliye ayrıldı.

### Bant sınırlama yöntemi seçimi (R2e)

Dört aday aynı testere ızgarasında ölçüldü
(`scripts/antialias-method-report.ts`; kafes-dışı alias + bant içi
harmonik genlik hatası + örnek başına CPU, 44.1 kHz):

| Yöntem                                                        | 917 Hz alias | 3.6 kHz alias | 8 kHz alias | harmonik hata | ns/örnek (8 kHz) |
| ------------------------------------------------------------- | ------------ | ------------- | ----------- | ------------- | ---------------- |
| minBLEP (aynı Kaiser büyüklüğü → kepstrum min-faz, [−16,+64]) | −31.8 dB     | −7.4 dB       | −29.1 dB    | 0.2–0.7 dB    | ~180             |
| Yüksek dereceli polinom BLEP (3. derece B-spline, ±2)         | −14.0 dB     | −7.5 dB       | −6.3 dB     | 7.9–11.0 dB   | ~22              |
| Yerel 4× aşırı örnekleme + 2× halfband                        | −29.1 dB     | −88.3 dB      | −18.6 dB    | 0.2–0.7 dB    | ~370             |
| **Pencereli-sinc BLEP rezidüeli (R=16)** — mevcut             | −68.8 dB     | −68.6 dB      | −88.6 dB    | 0.2–0.7 dB    | ~105             |

Sonuç: polinom BLEP dar desteğiyle yetersiz; minBLEP'in min-faz
dispersiyonu kenar sonrası uzun salınım üretir ve kafes metriğinde alias
olarak sayılır (çevrimdışı render'da düşük gecikme avantajı yok); aşırı
örnekleme decimator geçiş bandında frekansa bağlı dalgalanır ve ~4× daha
pahalıdır. Pencereli-sinc rezidüel hem alias hem maliyette baskındır.

Üçgen taşıyıcı (eğim süreksizliği) için basamak rezidüeli yetmez; köşe
düzeltmesi rezidüelin kümülatif integralidir (BLAMP). `blampResidual`
`bandStep` tablosunun yamuk integraliyle kurulur — parçalı doğrusal
integrande yamuk tamdır, pencere simetrisi uç değeri tam sıfıra döndürür
(ilk orta-nokta birikmesi uçta ~8e-3 kalıntı ve kenarda basamak
üretiyordu; ölçülüp düzeltildi). Naif üçgen + iki köşe BLAMP'i ile 5 kHz
üçgen kafes-dışı tabanı −43.3 dB'den −60.4 dB'ye, ham çekirdekte
−72.1 dB'ye indi; ızgara −72…−91.5 dB (`tests/oscillatorAlias.test.ts`
kilitleri, motor yolunda ≤ −58 dB).

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
tablosu `audition.json`; öznel yargı içermez). Tek-komut insan incelemesi
paketi `pnpm --filter @volstudio/audio-synth audio:listen` →
`export/listening/` (R7): dört bölüm — **canary** (kanonik render +
rehber + `reviews.json` durumu), **benchmark** (her görev parçası
`source` + kodekten çözülmüş `delivery` varyantı; `codec-loop-seam`
taşıyanlar iki ardışık tur `loop2x`; müzik parçalarının stinger'ları döngü
yatağı üzerine `overlay`), **reference** (manifest başına kaynak yeniden
render + gönderilen OGG'nin FFmpeg çözümü; `integration.loop` taşıyanlar
`loop2x`; karar `decisions.json`'daki PCM-hash bağlı beyanla sınırlı, yoksa
`undecided`), **comparison** (sabit v1↔v2 anti-aliasing çiftleri:
PolyBLEP → BLAMP/blepR16; dinleme öğesi, karar komutu yok). Varyantlar
`group` alanıyla yan yana gruplanır; her karar bekleyen öğenin sayfasında
kaydettirme komutu (`canary review` / `benchmark review` /
`regression decide`) görünür. `listening.json` envanter ve statik
`index.html` yazılır; paket yalnız dosya ve kayıtlı durum taşır — beğeni
beyanı yalnız insan tarafından yazılır.

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
kararı etkilemez; CLI yalnız kanıt olarak raporlar. Yürütme tahmine göre
seri ya da worker'larda paralel koşar; rapor ve sıra ikisinde aynıdır (bkz.
"Paralel toplu render"). Tek adayın render bütçesi aşımı o adayı
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

### Referans uydurma (inverse synthesis) — araştırma kapısı

`AcousticFitSpecV1` + `audio:job fit` (`src/search/fit.ts`,
`src/protocol/fit.ts`). Hedef bir sesin mekanik betimleyici vektörüdür:
`DescriptorSummaryV1` alanlarından seçilenler (pitch/zarf/spektral/zamansal)
`FIT_DESCRIPTOR_SCALES` tablosuyla normalize edilir — frekanslar ve süreler
log2 genişliğiyle (oktav/ikileme başına 1 birim), dB'ler doğrusal — ve
ağırlıklı RMS uzaklığı en aza indirilir. `target.manifest` verilince değerler
manifest `analysis.encoded`'ından okunur (`FIT_MANIFEST_FIELDS`; `pitchHz`
ile `onsetsPerSecond` manifestte yoktur). `null`↔sayı uyuşmazlığı (ör. hedef
perdeli, aday perdesiz) alan başına 1 birim cezadır.

Algoritma deterministik zoom taramasıdır: tur 0 tam birim küpü karışık Halton
ile tarar; sonraki her tur görev sahibi nokta etrafında `shrink` oranında
daralan kutuyu örnekler ve görev sahibi elit taşınır — rapordaki
`bestDistance` monoton azalmaz. Aday inşası `planCandidate`i, değerlendirme
`search-candidate` görevini paylaşır: seri/worker eşitliği, render bütçesi ve
materialize reddi aynı tek kaynaktan gelir; aynı program özeti turlar arasında
yeniden render edilmez. Sinirsel bağımlılık yoktur.

Kapanış kanıtı (`audio-fits/`): 660 Hz sine + AHDSR gizli hedefi
`hidden-tone-660` — 30 değerlendirme / 3 turda `converged` (uzaklık 0.071 ≤
tolerans 0.2; geri yakalanan frekans 644.99 Hz = %2.3 hata, FFT tepe
çözünürlüğü 46.875 Hz/bin taban; `waveform: sine` doğru). Negatif kanıt
`hidden-tone-wrong-topology`: aynı hedefe perdesiz `source.noise` tabanı
`exhausted` (uzaklık 4.04 ≫ tolerans; `pitchHz` cezası 1) — yanlış topoloji
sessizce "başarı" sayılmaz. `verdict: converged` yalnız "betimleyici uzaklığı
eşik altında" demektir; ses benzerliği ya da kalite yargısı değildir, fit
çıktısı hiçbir publish kapısını açmaz ve production'a tek giriş kanonik iş
akışıdır.

#### Çok-hedefli kurtarma deneyi (R6)

`pnpm audio:fit-experiment` (`scripts/fit-experiment.ts`) dört gizli hedefi
üç tohumla koşturur; optimize ediciye parametre değerleri asla gösterilmez —
yalnız hedef PCM'den ölçülen betimleyici vektörü (`pcm`) ya da manifest'in
`analysis.encoded` alanları (`manifest`) verilir. Boyut hatası aralığa
normalize edilir: log boyutlarda oktav payı, doğrusalda aralık payı,
seçeneklerde 0/1 eşleşme. Kanıt `export/audio-fits/` + `export/fit-experiment/
results.json` (git dışı, yeniden üretilebilir). Bütçe: 12 aday × 5 tur,
`shrink` 0.4, tolerans 0.2; boyut başına kurtarma eşiği 0.15.

| hedef        | tohum | giriş    | verdict   | uzaklık | boyut hataları                                         |
| ------------ | ----- | -------- | --------- | ------- | ------------------------------------------------------ |
| hidden-tone  | 23    | pcm      | converged | 0.124   | frequency 0.007, waveform 0, attack 0.132, decay 0.302 |
| hidden-tone  | 5001  | pcm      | exhausted | 0.419   | frequency 0.004, waveform 0, attack 0.373, decay 0.258 |
| hidden-tone  | 90210 | pcm      | exhausted | 0.418   | frequency 0.002, waveform 0, attack 0.338, decay 0.315 |
| hidden-noise | 23    | pcm      | converged | 0.002   | color 0, attack 0.013, decay 0.040                     |
| hidden-noise | 5001  | pcm      | converged | 0.130   | color 0, attack 0.167, decay 0.289                     |
| hidden-noise | 90210 | pcm      | converged | 0.030   | color 0, attack 0.028, decay 0.016                     |
| hidden-drum  | 23    | pcm      | converged | 0.057   | tune 0.160, decay 0.062, noise 0.112                   |
| hidden-drum  | 5001  | pcm      | converged | 0.015   | tune 0.064, decay 0.047, noise 0.151                   |
| hidden-drum  | 90210 | pcm      | converged | 0.064   | tune 0.138, decay 0.049, noise 0.445                   |
| hidden-muted | 23    | pcm      | converged | 0.041   | frequency 0.004, ghost-freq 0.205                      |
| hidden-muted | 5001  | pcm      | converged | 0.028   | frequency 0.003, ghost-freq 0.046                      |
| hidden-muted | 90210 | pcm      | converged | 0.112   | frequency 0.009, ghost-freq 0.347                      |
| hidden-drum  | 23    | manifest | converged | 0.057   | pcm koşusuyla birebir (aynı betimleyici kaynağı)       |

Dürüst okuma:

- `hidden-muted.ghost-freq` **tanımlanamaz**: `ghost` katmanı
  `gainDb: -120` ile suskun; parametre hiçbir hedef betimleyicisini
  etkilemiyor ve kurtarılan değer tohumdan tohuma savruluyor
  (0.046/0.205/0.347) — `frequency` aynı koşularda 0.003…0.009 ile
  izleniyor. Bu parametre "bulunamadı" değil "ölçülemiyor"dur; deney
  bunu uydurmak yerine raporlar.
- `hidden-tone.decay` **zayıf tanımlanır**: standart bütçede 0.26–0.32
  hata; 32×7=224 değerlendirmelik yükseltilmiş probe'da da fit
  `exhausted` (0.263) ve decay 0.18 yerine 0.05'e oturuyor —
  `decay40Seconds` AHDSR'de esas olarak sustain/release tarafından
  sürülür, `decay` parametresi betimleyiciye zayıf bağlanır. Başarısızlık
  eniyileme değil gözlenebilirlik sınırıdır.
- Başarı oranı (converged + tanımlanabilir boyutlar ≤0.15):
  tone 0/3, noise 2/3, drum 0/3, muted 3/3. Bütçe artışı tabloyu
  iyileştirir ama `decay`/`ghost-freq` gözlenebilirlik duvarını aşamaz.

### Semantic scorer — isteğe bağlı laboratuvar adaptörü

`search run --semantic --scorer '["<exe>","arg",…]' --positive "a,b" [--negative "c,d"]`
(`src/search/semantic.ts`, `src/protocol/semantic.ts`). Metin-ses gömücüsü
ya da benzeri bir model core bağımlılığı YAPILMAZ: skorer kullanıcının
verdiği harici süreçtir (komut `--scorer` ya da `AUDIO_SYNTH_SEMANTIC_SCORER`
ile gelir ve bir **argv dizisidir**: JSON dizi; köşeli ayraçsız düz metin
tek elemanlı argv sayılır). Başlatma kabuksuzdur —
`spawnSync(argv[0], argv.slice(1))`; `;`, `$()`, `&&` gibi metakarakterler
yorumlanmaz, literal argüman olarak sürece geçer (R5; kabuk-quoted eski
dizi tek argv[0] olduğundan `toolchain` olarak düşer). Rapor ve aday programları yazıldıktan sonra her render edilmiş
adayın WAV kopyası `export/` altına düşer, `SemanticScoreRequestV1`
(searchId, spec/report özeti, terimler, `{candidateId, wav, descriptors}`
listesi) sürecin stdin'ine yazılır ve `SemanticScoreResponseV1` stdout'tan
okunur; bilinmeyen/tekrarlanan aday kimliği, sonlu-olmayan skor ya da JSON
dışı çıktı `toolchain` hatasıdır. Sonuç `<search>/semantic.json`
(`SearchSemanticV1`: skorlar + azalan `ranked` sırası) ve CLI sıralamasıdır.

Sınır dürüstlüğü: skorlar **danışmandır** — aday durumunu
(`passed`/`filtered`/…), insan kararını, promote ve publish kapılarını
etkilemez; aynı spec'in skorlu ve skorsuz koşusu birebir aynı mekanik raporu
verir. Skorer yoksa ya da düşerse arama tamamlanmış kalır: rapor önce
yazılır, hata sonra yüzeye çıkar; `--semantic` verilmedikçe hiçbir süreç
koşmaz. Çevrimdışı deterministik üretim akışı hiçbir modele ya da ağa
bağlı değildir.

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

`canaries/<id>.json` (`OrganicCanaryV1`): 19 sürümlü görev — `breath`,
`bubble`, `droplet`, `membrane-pulse`, `wet-squish`, `insect-like-chirp`,
`cat-like-gesture`, `alien-fluid-call`, `campfire`, `contact-metal`,
`contact-rubber`, `friction-rolling`, `friction-scrape`, `granular-breath`,
`pressure-blast`, `rain`, `shifted-note`, `stretched-note`, `wind-gusts`.
Her biri sürümlü kimlik, deterministik kaynak (program ya
da archetype isteği + tohum), ucuz mekanik beklentiler ve dinleme rehberi
taşır; mevcut yapı taşlarından kurulur, asset kütüphanesi değildir. Mekanik
beklentilerin dişi mutasyonla sınanır (nabız hızı, düz perde eğrisi, nefese
eklenen ton beklentiyi düşürür; metal teması lastiğe dönünce, bağlı germe
resample'a dönünce beklenti düşer). İnsan dinleme durumu `canaries/reviews.json`
(`CanaryReviewsV1`) içindedir, 19'u da `pending-human`dır ve yalnız
`canary review … --by human` ile değişir; canary sürümü artınca inceleme
bayatlar. Mekanik geçiş sesin "organik" olduğunu kanıtlamaz.

### Yetenek benchmark derlemi

`benchmarks/<id>.json` (`BenchmarkTaskV1`): canary'nin **kardeş şemasıdır,
V2'si değildir** — canary tek kaynaklı organik yapı taşı görevidir;
benchmark görevi birden çok parça (UI onay/hata), yetenek kategorisi
(`audio:capabilities` bu anahtarla gruplar), gömülü müzik kaynağı ve
kodek-sonrası/QA kriterleri taşır. İki şema ayrı sürümlenir: görev eklemek
organik derlemi, canary sürümü görev raporunu etkilemez.

14 görev (v1): `tank-fire`, `heavy-impact`, `snake-hiss`, `steam`,
`metal-scrape`, `motor-acceleration`, `electrical-charge`, `water-splash`,
`creature-vocal`, `ui-feedback` (iki parça), `retro-arcade-sfx`,
`arcade-theme`, `ambience-loop`, `music-cue`. Parça kaynağı `program`,
`archetype` ya da `music` (gömülü `MusicProgramV1`+brief; repo ThemeBook
başvurusu yasaktır — görev kendi belgesini taşır). Kriterler
`MechanicalCheckV1` + dört genişletilmiş türdür: `codec-loop-seam` ve
`codec-stem-sync` geçici dizinde gerçek OGG kodla-çöz üzerinden ölçülür
(sınıfının kodlama kalitesinde; metrik kodek davranışı isterken kodeği
atlamak yasak), `music-qa` ve `bar-align` `checkMusic`'in QA kararı ile
spec kare sayılarından okunur. Her parçada tam bir `asset-policy`,
`clipping` ve `clicks` kriteri zorunludur.

Koşu (`benchmark run`): akustik parçalar `benchmark-part` göreviyle
`runTasks` üzerinde — seri ve worker yolu aynı saf işlevdir ve çıktı girdi
sırasıyla döner; müzik parçaları ana iş parçacığında `checkMusic` ile
koşar (kendi içinde paralel). 19 canary aynı rapora girer; tek komut
bütün motor sağlığını döker. `--audition` PCM'i `export/benchmarks/`
altına `writeAuditionCopy` ile yazar.

Kriterler ölçülen davranışa yazılır, tahmin edilmez ve ayırt edicilikleri
testle kilitlenir: motor rpm eğrisini düzleştirmek `pitch-contour`'u, hata
sesinin eğrisini ters çevirmek pencereli `pitch`'i, gövde vuruşunu zil
modeline çevirmek `descriptor`+`band-dominance`'i düşürür; `snake-hiss`
kriterleri `steam` render'ını, `tank-fire` kriterleri `metal-scrape`
render'ını reddeder. Amaçlı dokuların sınırları da kayıtlıdır: blast
crackle'ı tık sayacında aday üretir (tank-fire crackle 0), elektrik
arcları seyrek tutulur (arcs 0.1 → 16 aday, sınır 20). İnsan dinleme
durumu `benchmarks/reviews.json` (`BenchmarkReviewsV1`) içindedir, hepsi
`pending-human`dır ve yalnız `benchmark review … --by human` ile değişir;
görev sürümü artınca inceleme bayatlar.

**Açıklık matrisi (R4).** `scripts/distinctiveness-report.ts`
(`measureDistinctiveness`) bütün görev parçalarını bir kez render eder —
akustik `renderProgram`, müzik `checkMusic` referans mix'i — sonra her
(değerlendirici, aday) çiftinde adayın bütün parça render'larını
değerlendiricinin bütün parça kriter kümelerine karşı sınar. Çapraz
sınama yalnız `CHECK_KINDS` mekanik kriterlerini kullanır (kodek ve
müzik-özgü türler yabancı render'a uygulanmaz). Aday tek bir
(kriter kümesi, render) eşleşmesini bile bütünüyle karşılıyorsa
"reddedilemez"dir ve çift adıyla raporlanır. Kural: her görev diğer 13
görevin en az 11'ini reddeder; reddedilemeyen çiftler
`tests/benchmark/distinctiveness.test.ts` içinde `DOCUMENTED_PAIRS`
olarak adıyla kilitlenir ve burada gerekçelendirilir.

İlk ölçüm iki çifti yakaladı ve kriterler gerçekten ayırt edici hâle
getirildi (eşik gevşetilmedi): `arcade-theme→music-cue` — iki müzik
görevinin mekanik kriterleri aynı profildeydi, tema süre üst sınırı
16 sn'den ölçülen 6.4 sn döngüye göre 8 sn'ye indi (cue 12.8 sn →
reddedilir); `metal-scrape→snake-hiss` — ikisi de parlak gürültü dokusu,
scrape'e rezonans sırtlı `flatness ≤ 0.05` kriteri eklendi (ölçüm 0.0095;
hiss 0.163 → reddedilir). Güncel matris 14×13 = 182 çiftin tamamını
reddediyor; `DOCUMENTED_PAIRS` boş — yeni bir reddedilemeyen çift testte
ismiyle düşer.

### Kalite matrisi (`audio:capabilities`)

`QualityMatrixV1`, ontolojinin 31 mekanizmasının her biri için motorun
KANITLANMIŞ seviyesini döker — registry'de sağlayıcı bulunması kanıt
değildir. Kapsam elle yazılmış tablodan değil kayıttan türetilir: görev ya
da canary, kaynak programında mekanizmanın `providers` kimliğini (ya da
katman `mechanism` etiketini, ya da müzikte `pipeline:MusicProgramV1`'i)
kullanıyorsa o mekanizmanın kanıtıdır; yeni görev ya da sağlayıcı matrise
kendiliğinden düşer.

Seviyeler: `production-ready` = geçen benchmark kanıtı VE kategoriyi
kapsayan doğrulanmış yayımlanmış manifest (`reference/production/
manifests/**`; `asset` + `analysis.encoded` kaydı yalnız kanonik yayın
kapısının çıktısıdır) VE güncel görev sürümü için insan
`heard-acceptable` beyanı; `benchmarked` = geçen benchmark kanıtı var ama
yayın ya da kabul kanıtı eksik — mekanik geçiştir, üretim onayı değildir;
`canary` = yalnız geçen canary kanıtı; `regressed` = kanıt var ama tamamı
düşüyor (komut çıkış kodu 1); `research` = sağlayıcı var, render kanıtı
yok; `pipeline` = ayrı üretim hattı kanıtsız; `unsupported` =
sağlayıcısız. Görev sürümü artınca eski sürüme yapılmış kabul bayatlar ve
raporda `pending-human` görünür — production-ready statüsü kendiliğinden
düşer. İnsan dinleme durumu kanıt kayıtlarından toplanıp ayrı sütunda
taşınır. `audio:job capabilities` taze rapor koşar; `--from-report
<repo-göreli rapor.json>` kayıtlı `BenchmarkReportV1`'i render etmeden
okur. Bugünkü taban (koşuyla doğrulanmış): 0 production-ready
(benchmarks/reviews.json boş — insan kabulü yok), 24 benchmarked, 3
canary (`vocal`, `fire`, `sampled`), 2 research (`tail`, `space` —
hiçbir görev reverb/delay bus'ı kullanmıyor), 2 unsupported (`speech`,
`doppler-motion`).

### Estetik regresyon hafızası (`audio:job regression`)

`RegressionReportV1`, `reference/production/manifests/**` altındaki bütün
yayımlanmış manifestleri korpus sayar — üyelik elle beyan edilmez, yeni
referans publish'i kendiliğinden korpusa düşer. `regression run` her
girdiyi güncel motorla (`regression-part` görevi, batch bütçesiyle paralel)
yeniden render eder: PCM kimliği aynıysa satır `unchanged`; değiştiyse
yayımlanmış `.ogg` FFmpeg ile çözülüp betimleyici farkı ölçülür ve satır
`audition-required` olur. Hash değişimi tek başına gerileme sayılmaz —
bilinçli iyileştirme de hash değiştirir; ayrım ancak insan kararıyla yapılır.

`regression decide <id> --status accepted-change|rejected-regression --pcm
sha256:… --note <metin> --by human`, kararı `regression/decisions.json`
(`RegressionDecisionsV1`) içine makine-okunur yazar. Karar tam o PCM
hash'ine bağlıdır: sonraki koşu aynı hash'i üretirse satır kararın
durumunu taşır, farklı hash üretirse karar bayatlar ve satır yeniden
`audition-required` olur. Rapor motor sürümlerini (program/music renderer,
analizör, registry özeti) taşır; böylece büyük DSP değişikliğinde etkilenen
accepted asset'ler tek komutla listelenir.

Bugünkü taban: 36 manifest (25 sfx, 1 ambience, 10 music/stem) güncel
motorla bit-bit aynı ürüyor (`unchanged=36`).

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
sistem ve isteğe bağlı ayar, şeritler (enstrüman `preset:<ad>` ya da
programın kendi tanımı `inst:<kimlik>`, ya da paletteki görev), stem'ler,
bölümler (bar aralığı, rol, hedef enerji, aktif şeritler, armoni planı),
motifler, tracker desenleri, groove profilleri, otomasyon, işaretler,
geçişler, bundle segmentleri ve teslim beyanı. Program JSON'dur;
`Timeline`ın `InstrumentFn` fonksiyonu JSON'a yazılamaz, bu yüzden enstrüman
kayıttan ya da programın `instruments` listesinden ADIYLA çözülür.

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

### Enstrüman sözleşmesi ve üretim kapsamı (Dalga 11)

**`InstrumentDefinitionV1`** (`music/instrumentDefinition.ts`) bestecinin
gördüğü sözleşmedir: rol, SESLENEN aralık, tercih edilen register,
transpozisyon (yazılan + transpozisyon = seslenen), polifoni, velocity tepkisi
(`rangeDb`, preset kaynağında `brightness`), bırakma (sampler) ve desteklenen
artikülasyonlar. Kaynak sözleşmenin ARKASINDADIR: `preset`, `sampler`
(programın `samples` + `banks` bildirimi, akustik programla aynı biçim),
`drum-kit`, `retro` ya da bunların `layer`ı (velocity aralıklı katmanlar).
Yerleşik `preset:<ad>` enstrümanı da aynı çözülmüş biçime iner
(`ResolvedInstrumentV1`); score, analiz ve ses planı yalnız onu okur ve aynı
nota verisi hangi kaynağa giderse gitsin aynı anlamı taşır. Kaynağın
çalamadığı artikülasyon tanımda, enstrümanın desteklemediği artikülasyon
score'da adıyla reddedilir. Programa özgü enstrümanlar render yüzeyine
`backend:<tür>` (kaynak sürümü) olarak kaydedilir; tanımın kendisi program
özetindedir.

**Ses planı** (`music/voices.ts`) velocity, artikülasyon ve kapı süresini TEK
yerde yorumlar; kaynak yalnız "şu perdede, şu sürede, şu şiddette" isteğini
alır. Velocity yazılmazsa seviye çarpanı hiç uygulanmaz — eski programlar
bit-eşit kalır (production-check ile doğrulandı); yazılırsa
`rangeDb × (v − 0.8)` dB. Kapı: `staccato` yazılı sürenin yarısı (en az
30 ms), `legato` bir sonraki notaya +30 ms, `let-ring` kaynağın doğal süresi,
`mute` kapının %35'i ve süzgeç yarıya; `accent` velocity +0.2, `ghost` ×0.45;
`slide` önceki notanın perdesinden en çok 80 ms'lik portamento (preset'te
`SynthParams.glide`, retro'da perde süpürmesi); `tie` bitişik aynı perdeli
notayla tek notaya birleşir. Komşu bilgisi (legato, slide, hat boğması)
score'un TAMAMINDAN okunur: stem ya da segment ayrı render edildiğinde her
olay aynı sesi verir.

Yerleşik enstrümanın "notayı tutabilir mi" sınıflaması presetin tipik nota
süresinde ölçülür: notanın %15–25'i ile %45–55'i arasında 6 dB'den fazla
düşen ses vurgusaldır (`staccato`, `let-ring`; telli/baslarda `mute`),
diğerleri süreklidir (`sustain`, `legato`, `tie`, `slide`). Önceki ölçü 1 sn'lik
yoklamanın −40 dB sönümünü tipik süreyle kıyaslıyordu ve yaylıları, koroyu,
tubayı "vurgusal" sayıyordu.

**Perküsyon** (`instruments/percussion/`): yedi model dört bileşenden kurulur
— perde zarflı gövde (kip başına sönüm), süzülmüş gürültü, vuruş tıkı ve
metalik kare kümesi (hat/zil). Makrolar her modelde aynı anlamdadır
(`tune`, `decay`, `tone`, `attack`, `noise` çarpanı, `drive`, `open`);
velocity SEVİYEYİ değil tınıyı değiştirir (seviye enstrümanın velocity
tepkisidir) ve çıktının tepesi `level`dir. Yön iddiaları yedi modelde ölçülür
(`tests/percussion.test.ts`): velocity ve ton → spektral merkez, decay →
−40 dB süresi, noise → spektral düzlük, attack → ilk 50 ms'nin tepe/RMS oranı,
drive → tepe/RMS düşüşü. Ölçülen örnekler: kick tabanı 45–56 Hz, trampet
merkezi velocity 0.3→1'de 1.16→2.15 kHz, kapalı hat −40 dB'ye 70 ms, açık hat
doğal uzunluğu 1.48 sn; uzun sönüm 4 sn tavanda 20 ms'lik kuyrukla kesilir,
boğma (choke) kapıdan sonra 5 ms. Müzikte `drum-kit` tuşu parçaya eşler
(perdesizdir; perde analizine girmez, olay başına gürültü tohumu olay
kimliğinden türer); akustik programda aynı çekirdek `source.drum` düğümüdür.
kick/snare/hat SoundFamily'leri velocity ve tını makrolarıyla aile kalite
kapısını geçer (`tests/program/chip.test.ts`).

**Retro araç seti** (`synthesis/retro.ts`): darbe (duty ve süpürme), düz ya da
4-bit üçgen, testere, uzun/kısa LFSR (kısa kip 93 adımlık dizi; saat =
perde × 93), 4-bit wavetable'lar ve özel tablo, hard sync, arpej, perde
süpürmesi, gecikmeli vibrato, 16 basamaklı ses zarfı. Her süreksizlik (kenar,
sarma, tablo basamağı, LFSR saati, sync sıfırlaması) motorla aynı bant
sınırlı basamak rezidüeliyle düzeltilir (`waveforms.ts` `blepResidual`);
bilinçli alias yalnız `bits`/`holdHz` aşamasından ve çıkış oranında gelir.
Ölçülen alias (kafes yöntemi, 2× iç oran, F6a çekirdeği): darbe %25
233 Hz −90.7 dB, 3.6 kHz −90.7 dB; testere 917 Hz −89.0 dB, 3.6 kHz
−88.3 dB; 4-bit üçgen 917 Hz −88.7 dB; org tablosu 3.6 kHz −88.6 dB;
sync'li testere 917 Hz −89.3 dB. Sınırlar ölçülenin 2 dB üstünde
kilitlidir (`tests/retro.test.ts`); tam ızgara
`scripts/polyblep-alias-report.ts`. Müzikte `retro` kaynağı,
akustik programda `source.retro` düğümüdür (UI, arcade SFX, gürültü).

**Orkestrasyon** (`music/orchestration.ts`): şeridin görevi (`bass`,
`foundation`, `rhythm`, `harmony`, `counterline`, `lead`, `texture`,
`accent`) enstrüman adından ayrıdır. Palet görevi enstrümana bağlar
(`transposition: "auto"` yazılanı enstrümanın tercih ettiği register'a
oturtan oktavı seçer, `gainDb` görevin paletteki seviyesi); aynı score başka
bir paletle çalındığında yazılan notalar, armoni ve olay kimlikleri değişmez.
Görev bantları (register ve nota/ölçü) yönlendiricidir: rapor `roles`
bölümünde ölçülür, kapıyı düşürmez.

**Tracker** (`music/pattern.ts`): desen satırları dizgiyle (`x` vuruş, `X`
accent, `o` ghost, `.` sus, `_` uzatma), melodik adımlar listeyle yazılır.
Parça desenleri zincirler (`repeat`, `variation`, `loop`, her N'inci örnekte
`fill`); döngüsüz zincirin bölüm sonunu aşması hatadır. Olasılık olay
kimliğine bağlı alt akıştan çekilir ve düşen vuruş kimlik sayacını ilerletir:
bir adımın olasılığını değiştirmek diğer olayların insanlaştırmasını kaydırmaz.

**Ayar** (`music/tuning.ts`): `equal` (başka referans), `cents` ve `ratios`
(kökten 12 kromatik basamak; kök 12-TET frekansında sabit) ve nota adına cent
sapması (`A3+50c`). Ayar yazılmazsa `frequencyOf` `midiToHz` ile birebir
aynıdır; harmoni ve analiz tuşlarla çalışmaya devam eder.

**Bundle segmentleri** (`music/segments.ts`): segment programın ölçü
zamanında bir aralıktır — tam bir `loop` (döngüsel, kuyruk başa sarılır),
loop'un başladığı ölçüde biten isteğe bağlı `intro`, `outro`, `stinger` ve
`transition` (tek seferlik, kuyruk doğal söner). Mix ve stem'ler loop
aralığından, her cue kendi aralığından render edilir ve kendi asset'i olur;
cue işinin brief'i bundle brief'inden deterministik türer (çalma modeli tek
seferlik). Bütün segmentler loop'un mastering kazancını paylaşır (giriş ile
loop arasında seviye sıçraması olmaz); stinger/geçiş kendi `gainDb` farkını
taşır. Segment QA'sı her cue'yu tek başına ve BİRLİKTE ölçer: stinger loop'un
her hizalı noktasında (ölçü ya da vuruş) loop ile toplanır, giriş loop'a
devrederken kuyruğuyla toplanır; motorun veriyolunda sınırlayıcı yoktur,
bindirme −1 dBTP'yi aşarsa QA düşer. Cue asset'leri `music-stem` politika
sınıfındadır (tek başına bir mix değil, bundle'ın parçasıdır).

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
sonrası −1 dBTP politikasıdır. Akustik programların isteğe bağlı 4× true-peak
sınırlayıcısı (`master.limiter`) müzik yolunda KULLANILMAZ: stem yolunda
doğrusal olmadığı için stem paritesini bozar, tek asset'li yollarda ise pay
ölçülerek bulunduğu için gerekmez.

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
crossfade, sönümlü durdurma, playlist boşluğu ve cue'lu geçiş (`stinger`)
VARDIR; parça içi bölüm atlama ve farklı tempolar arası bar hizası YOKTUR ve
`unsupported-by-runtime` ile reddedilir. Tonal ilişki beyan edilebilir ama
motor ton bilmez; rapor bunu "motor uygulamıyor" diye işaretler.

Motor cue'ları (`MusicCuePlayer`) örnek-doğru zamanlar: parça girişi (intro)
çalarken loop stem'leri girişin ölçü sayısı kadar sonra başlar ve girişin
kuyruğu loop'un ilk ölçüsünün üstünde söner; `playStinger` loop'u kesmeden
sonraki ölçü ya da vuruş sınırında çalar; `playOutro` loop'u sonraki ölçü
sınırında 30 ms'de bırakıp bitişi çalar ve bitiş sönünce parça biter;
`transitionTo` geçiş cue'sunu ölçü sınırında başlatır, hedef parça cue'nun
ölçü sayısı kadar sonra girer.

**6/8 düzeltmesi.** Spec'in `bpm`'i ölçü BİRİMİ başına vuruştur (6/8'de
sekizlik), motorun zamanlayıcısı dörtlük başına sayar ve birimi paydadan
ölçekler. `toMusicTrack` önceden bpm'i olduğu gibi veriyordu: 6/8 bir
parçada motorun ölçüsü spec'inkinin yarısı çıkıyor ve bar hizalı her geçiş
yarım ölçü kayıyordu (4/4'te fark yoktu, bu yüzden hiçbir test yakalamadı).
Dönüşüm artık `toMusicTrack`'te tek yerdedir: `bpm × 4 / birim`.

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
Döngüye giren asset'lerde (mix, stem, loop gövdesi) çözülmüş DİKİŞ de
ölçülür: son örnekten ilk örneğe adım, sinyalin kendi komşu-örnek adımlarının
%99.9 yüzdeliğinin iki katını aşamaz (`checkLoopSeam`); kodek kenarındaki bir
süreksizlik her turda tık olur ve hiza denetimi onu görmez.

Önceki bir kusur: `music check` ön denetimi programın bus grafiğini (`mix`)
yok sayıp ham render alıyordu, iş render'ı ise grafikle render ediyordu. Bus
grafikli bir müzik yayımlanmaya kalksa ön denetimin PCM özeti ve mastering
kararı iş render'ıyla tutmaz ve yayın düşerdi. Artık bütün yollar tek
`renderMusicRaw` işlevini çağırır.

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
| `reference-arcade`   | loop + cue      | 564480 (12.8 sn) | −11.0 dB | −15.06 | −3.98 | loop + 3 cue, 365 KB |

`reference-arcade` (150 bpm, A minör) Dalga 11'in uçtan uca kanıtıdır: retro
ezgi/bas/arp, davul kiti, tracker desenleri, palet görevleri; giriş (2 ölçü,
−26.97 LUFS), 8 ölçülük dikişsiz loop, bitiş (2 ölçü, −15.81 LUFS) ve
güçlenme stinger'ı (1 ölçü, −4 dB fark). Stinger loop'un 32 vuruşunun her
birinde loop ile birlikte en kötü −1.52 dBTP, giriş loop'a devrederken
−3.78 dBTP; dört asset'in kodlanmış hizası 0/0, loop dikişi sürekli.

Referans arama (`reference-loop/search.json`): 24 aday sembolik açıldı, 12'si
süzgeci geçti, 3'ü render edildi.

### Bilinen sınırlar

Müzik yolu yalnız ÖLÇÜLEN değerlerle doğrulandı — sembolik uygunluk,
yükseklik, true peak, stem paritesi, kodlanmış hiza ve dikiş; insan dinlemesi
yapılmadı ve "iyi müzik" iddiası yoktur (`music-no-listening-validation`).
Davul ve retro seslerin yön iddiaları ölçüldü; tınılarının beğenisi
dinleyicinindir. Retro çekirdek konsol öykünmesi DEĞİLDİR; öykünme iddiası
ayrı bir donanım doğrulaması ister.

## Genel ses tasarımı ve üretim grafiği

Dalga 7–10: SFX üretimi tek bir `AcousticProgramV1` şemasında birleşir.
Önceki dalgaların fiziksel model/arama/publish kapıları AYNEN kalır; yeni
yüzey onların yerine ikinci bir sistem kurmaz.

### SoundGraph ve tek toplama yolu

`SoundGraphV1` (`src/program/soundGraph.ts`) programın render ETMEDEN
okunan topolojisidir: düğümler katmanlar (yapı taşı zinciri + rol +
mekanizma), bus'lar ve master; kenarlar `route`, `send` ve `sidechain`.
Parametre DEĞERLERİ topolojiye girmez — aynı topolojide farklı ayar ya da
stil aynı düğüm/kenar kümesini verir; kanonik özet protokol katmanındadır.
Tank ateşi (impact + pressure body + mechanical layer + ortam kuyruğu
bus'ta) ve yılan tıslaması (airflow + articulation + resonator) aynı graph
altyapısıyla, farklı topolojiyle geçer.

Toplama tek yerdedir (`src/program/mixdown.ts`): katmanlar kendi bus'ına
kanonik `addVoice` ile yerleşir, bus'lar topolojik sırayla işlenir, en son
master zinciri koşar. Bus'sız program yalnız master'a yerleşir ve eski yolu
izler — mevcut programların PCM'i bit-eşit değişmez (dördüncü bir mixer
açılmaz).

### Ontoloji, planner ve kabiliyet matrisi

Ontoloji (`src/program/ontology.ts`) brief'in betimleyici
sözcüklerinden mekanizmaya giden DETERMİNİSTİK sözlüktür (Türkçe +
İngilizce). Anlamı belirsiz sözcükler bilerek eşlenmez: `fire` (ateş
etmek | yangın) ve `et` (et | etmek) haritalanmaz; çok sözcüklü terimler
(`tank fire`) sözcük dizisi olarak eşleşir. Planner (`src/program/planner.ts`)
brief'ten mekanizma/stil/materyal önerir, seçim gerekçesini planda taşır
(`term:` kaynaklı ya da `declared`); sağlayıcısız mekanizma (konuşma,
Doppler) `unsupported` raporlanır, başka yapı taşıyla TAKLİT EDİLMEZ ve
iskelet üretilmez. Kabiliyet matrisi registry'den türetilir: `impact`
supported, `musical` pipeline, `speech` unsupported.

### StyleProfile ve MaterialProfile

Stil adı ham preset adına indirgenmez: `StyleProfileV1` (`src/program/styles.ts`)
transient sertliği, bant genişliği, doygunluk, perde dili, dinamik aralık,
stereo genişlik gibi KONTROL ALANLARINA çözülür; ad oyun/sanatçı referansı
ise kalıcı profile kopyalanmadan ayırt edici niteliklerine çözülür.
Ölçülen ayrışma: aynı tank topolojisi üç profilde korunur (düğüm/kenar
aynı), karakter farklı — `arcade-industrial` doygunluk basamağı > 0.5,
`realistic-heavy` < 0.2; nötr stil bit-eşittir.

Materyal EQ preset'i DEĞİLDİR (`src/program/materials.ts`): kayıp faktörü
η, Young modülü E, yoğunluk ρ ve yerleşim (çubuk/levha/kabuk/zar) mod
frekanslarını, mod başına ayrı çınlama süresini (T60 = 2.2/(η·f·oran^üs)),
temas süresini (Hertz) ve yüzey pürüzünü türetir. Ölçülen ayrışma: aynı
uyarımda −40 dB sönüm sırası ve mod aralığı materyal verisinin
öngördüğü yönde. Modeller sonlu eleman çözümü değildir
(`material-modal-approximation`): oranlar yerleşimden, sönüm sabit kayıp
çarpanından türetilir; kompozit/anizotropi/sınır koşulu modellenmez.

### SFX mekanizma aileleri

- **Contact/Impact**: hız arttıkça uyarım enerjisi ve atak parlaklığı
  monoton artar (temas süresi t_c ∝ v^(−1/5)); temas pürüzü temas süresiyle
  süzülür — ölçülen düzeltme: kauçuk teması metalden parlak çıkıyordu.
  Metal-metal, taş-taş, yumuşak-sert çiftleri aynı motor ölçülebilir
  biçimde ayrışır; `contact-metal`/`contact-rubber` canary'leri taşır,
  mutasyon (metal→lastik) beklentiyi düşürür.
- **Pressure** (`archetype.pressure-event`): şok, low-end gövde, türbülans,
  döküntü, mekanizma ve ortam kuyruğu bağımsız katmanlardır — transient ile
  low-end ayrı ayrı ölçülür; tank/havan atışı, büyük patlama ve enerji
  deşarjı aynı aileden farklı programlardır; kısa süreye ölçekli iş render
  öncesi reddedilir.
- **Weapon** (`archetype.launcher`): tank topu, arcade taret ve bilimkurgu
  fırlatıcı aynı archetype'tan farklı stil/materyalle; oyun başına DSP yok.
- **Airflow**: Strouhal ölçülür — ağız çapı yarıya inince jet bandı oktav
  yukarı, basınç U³ ile yükselir; tıslama/buhar/pnömatik/ıslık/nefes aynı
  yapı taşı ailesinden belirgin ama ilişkili davranış verir.
- **Friction**: yuvarlanma dönme darbesi v/(2πr) ile izlenir (hız ×2 →
  periyodik oran ×2); kayma hızlandıkça bant merkezi yükselir. Ölçülen
  düzeltme: yuvarlanma akışı AYRI bir kaynaktır, dönüş periyodu eski
  birleşik modelde ölçülemiyordu; olaylar gürültünün ÜSTÜNE alınır.
- **Machine**: RPM iki katına çıkınca baskın döngüsel bileşenler ölçümde
  kayar; ivmelenme gesture'ı bileşeni zamanla yükseltir.
- **Electrical**: hum şebeke harmoniği taşır, kararsız ark olay yoğun ve
  gürültülüdür, şarj perdesi yükselirken enerji atışı düşer (YIN).
- **Environment** (wind/rain/fire): uzun render'lar deterministiktir;
  tekrar ölçüsü DİŞLİDİR — 2 sn'lik döngüyle tekrarlanan doku yakalanır;
  loop sürümleri `master.loop` dikiş QA'sından geçer. `wind-gusts`, `rain`,
  `campfire` canary'leri taşır.

### Örneklemeli yol: sample, germe, granular, konvolüsyon

Kayıttan kaynaklar prosedürel kaynaklarla AYNI katman/graph/publish
sözleşmesindedir; oyun tarafı kaynağın türünü bilmez. Sample kimliği WAV
baytlarının özetidir (`SampleAssetV1`); kütüphanedeki kayıtlar motorla
üretilmiş SENTETİK fixture'dır — JSON repoda, WAV git-dışı üretilir
(`synthetic-sample-fixtures`).

- **Sampler** (`SampleBankV1`): velocity katmanı, round-robin, anahtar
  bölgesi, start-offset ve loop bölgesi; hangi kaydın neden seçildiği
  manifest'te gerekçelidir.
- **Germe/perde kaydırma** birbirinden bağımsızdır (offline): WSOLA
  dalga biçimini kopyaladığı için transient'i korur, faz vokoderi tonal
  gövdede temizdir; yöntem yazarın seçimidir ve ölçümlü karşılaştırma
  `stretch-method-choice` kaydındadır. `resample` klasik bağlı
  değişimdir ve adıyla beyan edilir.
- **Granular**: donmuş, hareketli ve yoğun bulut tekrarlanabilir ve
  ayrışıktır; yoğunluk tavanı kaçak bellek ayırmasına izin vermez.
- **Konvolüsyon**: IR'lar sample kütüphanesinden içerik özetiyle gelir;
  bölümlü FFT (UPOLS, blok 2048) doğrudan konvolüsyona eşittir. Zamana
  yayıldığı için katman insert'ine giremez, bus/return'de kullanılır; IR
  uzunluğu maliyete girer ve render bütçesine tabidir.
- **HPSS ayrıştırması**: STFT büyüklüğünde zaman/frekans medyanı +
  Wiener maskeleri toplamı koruyarak böler. Araç sessizce kötü sonuç
  vermez: atak için enerji payı değil TEPE oranı sorulur (ölçüldü: çınlayan
  metal darbesinde atak enerjisi %0.06), ayrışma koşulları tutmazsa
  `failed` ve adlı gerekçe döner. `reference-hybrid` bu yolla sample
  transient + prosedürel gövde + IR konvolüsyonunu aynı publish kapısından
  geçirir.

### Bus, sidechain ve işleme

- **Müzik bus'ları** (`MusicProgramV1.mix`): drum/music stemleri ayrı
  bus'lara yönlenir; stem toplamı mix'e en çok −90 dBFS sapabilir (ölçülen
  daha iyi). Doğrusal OLMAYAN bus tek stem'den beslenir; adaptive pakette
  stem'ler arası sidechain reddedilir (`music-sidechain-lane-only`) —
  aksi hâlde parite garantisi ölür.
- **Sidechain**: sessiz sidechain çıktıyı bit-eşit bırakır; aktif sidechain
  ölçülen bir ducking zarfı üretir.
- **EQ**: RBJ "Audio EQ Cookbook" biquad'ları, float64 transpoze direkt
  form II; işleme EQ'su sentez filtresinden AYRI çekirdektir (sentez
  örnek başına otomasyon ister, işleme 0.01 dB mertebesinde doğru olmalı).
- **Kompresör**: statik eğri eşik altı 1:1, üstü 1:ratio; atak/bırakma
  zaman sabitleri basamakta ölçülür; bağlı mod iki kanala aynı zarfı verir.
- **True-peak sınırlayıcı OPT-İNDİR**: 4× aşırı örnekli, `master.limiter`
  ile açılır; varsayılan davranış (tepe normalize) eski programların
  bit-eşitliği için değişmez. Kodek sonrası −1 dBTP politikası yine publish
  kapısında denetlenir; kapı ihlali reddeder, düzeltmez.
- **Transient şekillendirici**: atak ve gövde kazançlarının bırakması
  AYRI ayrı kontrol edilir (ölçülen düzeltme: tek zarf bırakması iki
  davranışı birbirine bağlıyordu).

## Teslim biçimleri (Dalga 12)

Bir sesin nasıl ÇALINDIĞI (konumlu mu, ekranda mı, zeminde mi), hangi
kalitede KODLANDIĞI, aynı kaynağın uzaktan ya da bir engelin ardından nasıl
DUYULDUĞU ve oyun durumuna göre nasıl DEĞİŞTİĞİ ayrı kararlardır. Dördü de
makine-okunur politikadır ve ölçülerek kapanır.

### Kanal ve yerleşim

`placement` (brief'te, yazılmazsa sınıf varsayılanı) çalınış biçimidir:
`positional` dünyada bir yayıcıdır ve motor onu konumlandırır, bu yüzden mono
olmalıdır. `screen` konumsuz arayüz/HUD sesidir, mono ya da stereo olur.
`bed` konumsuz zemindir (ambiyans yatağı, müzik). `LAYOUT_POLICY`
(`channel-layout-v1`) sınıf başına izinli yerleşimi ve kanal sayısını tutar
(ui: screen 1|2; sfx: positional 1, screen 1|2; ambience: positional 1,
bed 1|2; music ve music-stem: bed 2). Yanlış kanal sayısı brief
doğrulamasında adıyla düşer.

Stereo kodek SONRASI mono katlamaya dayanmalıdır (`stereo-image-v1`): mono
katlama kaybı = stereo yükseklik − (L+R)/2 çift-mono yüksekliği. Tam ilintili
stereo 0 LU, ilintisiz eşit kanallar ve sert panlı mono kaynak ≈3 LU verir,
ters faz bunun üstüne çıkar. Tavan 4 LU'dur; eşit seviyede bu ≈ −0.2
ilintiye denk gelir. Referans stereo asset'ler 0.004–1.40 LU ölçüldü; yan
kanalı ×3 genişletilen bir müzik 5.41 LU verdi. Mono'ya izin verilen yerde
özdeş iki kanal (dual-mono, yan/orta < −50 dB) boşa bayttır ve ihlaldir.
Manifest `layout` bloğu yerleşimi ve görüntüyü kaydeder, `verify` yeniden
sınar. Bu alandan önce yayımlanan manifest'te blok yoktur ve değerlendirilmez.
`reference-hybrid` (stereo oda kuyruklu darbe) yeni kuralda `placement:
screen` beyan ederek yeniden yayımlandı; PCM aynı.

### Kodlama profili

Vorbis kalitesi asset sınıfından gelir (`ENCODE_POLICY`, `encode-profile-v1`).
Seçim ölçülür: korpus (referans manifest'lerin yeniden render'ı + UI
presetleri + stereo ambiyans programları, 22 öğe) q0–q10 ile kodlanıp FFmpeg
ile çözülür; bayt ve kodek sonrası sadakat (`decoded-fidelity-v1`)
kaydedilir. Sadakat: karenin en güçlü bandının 30 dB altına kadar 1/3 oktav
hücrelerinde |10·log10(çözülmüş/kaynak)| ortalaması ve 95. yüzdeliği,
korunan bant genişliği, ΔLUFS ve Δtrue peak. Ölçüt: ortalama ≤ 1.5 dB,
p95 ≤ 1.5 dB, |ΔLU| ≤ 0.5, ΔTP ≤ 0.5 dB, sınıfın HER öğesinde.

Kural: ölçütü geçen en düşük kalite, ama `minQuality` (4, önceden yayımlanan
kalite) altına inilmez. Ölçü algısal şeffaflığı kanıtlamaz, yalnız bozulmayı
yakalar: kaliteyi yükseltebilir, daha önce yayımlanmış kalitenin altına inmek
kayıtlı bir dinleme kararı ister.

| Sınıf      | Öğe | Ölçütü geçen en düşük | Seçilen | Bayt (q4 → seçilen) | kbps  | Seçilende en kötü öğe         |
| ---------- | --- | --------------------- | ------- | ------------------- | ----- | ----------------------------- |
| ui         | 4   | q6                    | q6      | 17815 → 20449       | 240.6 | ort. 1.32, p95 0.19 dB        |
| sfx        | 7   | q7                    | q7      | 60963 → 78444       | 87.2  | ort. 0.33, p95 0.86 dB        |
| ambience   | 3   | q6                    | q6      | 970436              | 242.6 | ort. 0.33, p95 0.81, ΔLU 0.34 |
| music      | 4   | q2                    | q4      | 374495              | 76.0  | ort. 0.25, p95 0.75 dB        |
| music-stem | 4   | q3                    | q4      | 138456              | 44.9  | ort. 0.30, p95 1.16 dB        |

q4'te 60 ms'lik UI blip'inde ortalama bant hatası 4.31 dB, lazer sfx'te p95
3.97 dB ölçüldü; profil bu yüzden yükseldi. Ambiyans korpusu v2
wind/rain/fire primitifleriyle yeniden ölçüldüğünde keskin genişbant
transientler (`addBurst`) q4 ölçütünü aşamadı → ambience q6'ya çekildi
(dinleme turu 2 sonrası). Kısa seste boyutu Vorbis başlığı
belirler: 10 ms sessizlik mono 3639 B, stereo 4322 B. UI korpusunda q4 → q8
baytı yalnız ≈%24 büyütür, gürültülü ambiyansta ≈3.3 kat.

`encode-profiles.lock.json` politika özetini, korpusu, taramanın tamamını ve
kuralın seçimini taşır; `pnpm audio:encode-baseline` onu yeniden ÖLÇEREK
yazar ve koddaki tablo ölçümün seçiminden farklıysa yazmayı reddeder.
`tests/governance/encodeProfiles.test.ts` kilidin bugünkü politikayı
ölçtüğünü, seçimin ve başarısızlık listelerinin taramadan türediğini ister ve
seçilen kalitelerde ölçümü yeniden üretir (aynı araç zincirinde bayt bayt).
Yayın profilin kalitesiyle kodlar; manifest `encoding` bloğu politika özetini
ve kaliteyi kaydeder. `verify` KAYITLI kaliteyle yeniden kodlar (eski q4
manifest'ler `identical` kalır) ve profil değiştiyse bilgi olarak yeniden
yayın önerir.

### İşleme katmanı ve teslim profilleri

`AcousticProgramV1.treatment`, kaynağın BİTMİŞ çıktısına (master + loop
katlaması sonrası) uygulanan teslim işlemidir: kanal dönüşümü (katlama ya da
çoğaltma) → süre → sabit parametreli efekt zinciri → seviye → isteğe bağlı
true-peak sınırı → kuyruğun son 20 ms'lik sönümü. `treatment` çıkarılınca
kalan belge kaynağın kendisidir; aynı program + tohum aynı kaynak PCM'ini
verir, işleme onun üstüne deterministik bir zincirdir. Boş zincir kaynağı bit
bit korur.

- **Seviye kaynağa göredir** (`levelLu`): işlenmiş sesin en yüksek momentary
  yüksekliği kaynağınkinin `levelLu` kadar altına getirilir. İlk tasarımdaki
  sabit kazanç kaynağın spektrumuna göre farklı sonuç verdi: duvar ardı
  −38 LUFS'e indi ve sfx politikasının altında kaldı.
- **Loop dairesel işlenir:** zincir iki turun üstünde çalışır, ikinci tur
  alınır; zamana yayılan efektin kuyruğu başa sarar ve dikiş sürekli kalır.
- **Parametreler sabittir:** gesture ve modülasyon kaynağın zamanına aittir.

İki yeni düğüm: `effect.air-absorption` ISO 9613-1 atmosferik soğurmasını
(20 °C, 101.325 kPa, bağıl nem parametre) minimum fazlı FIR (homomorfik
tasarım, 1024 dal) ile uygular. Katsayı ISO 9613-2 Tablo 2'nin 20 °C/%70
satırını tam bant merkezlerinde tablonun yuvarlaması içinde verir (ör.
1 kHz 4.98/5.0, 8 kHz 76.62/76.6 dB/km). FIR genliği hedefi 0.05 dB içinde
uygular (120 dB tabana kadar), enerjinin %99.9'u ilk 64 daldadır.
`effect.width` orta/yan genişliğidir.

Profiller (`treatment-profile-v1`) adlı, sürümlü düğüm zincirleridir;
fiziksel modeli olan yerde model uygulanır, olmayan yerde seçim adıyla
yazılır ve yönü ölçülür. Mesafe profilleri 1/r zayıflamasını PİŞİRMEZ: oyun
motoru onu çalışma zamanında uygular, pişmiş varyant ikinci kez uygularsa ses
iki kez söner; 1/r değeri `model.inverseSquareDb` olarak bildirilir.

| Profil        | Zincir (kısaca)                                             | levelLu | Görüntü |
| ------------- | ----------------------------------------------------------- | ------- | ------- |
| distance-near | yansıma 0.06 → hava 5 m → genişlik 1                        | 0       | koru    |
| distance-mid  | atak −6 dB → yansıma 0.3 → hava 30 m → genişlik 0.6         | −3      | koru    |
| distance-far  | atak −15 dB → yansıma 0.55 → hava 150 m → genişlik 0.25     | −6      | koru    |
| occluded      | 1.8 kHz alçak geçiren → atak −6 → yansıma 0.25              | −5      | koru    |
| behind-wall   | 350 Hz 24 dB/okt → atak −12 → kısa oda → genişlik 0         | −9      | mono    |
| underwater    | 600 Hz 24 dB/okt → 220 Hz +5 dB → atak −10 → koyu yankı     | −5      | koru    |
| radio         | 350–3200 Hz → 1.8 kHz tepe → tanh sürüş → sıkıştırma → mono | 0       | mono    |

Yansımalar da aynı yolu gider: mesafe profillerinde soğurma yankıdan SONRA
uygulanır (önce uygulandığında centroid mesafeyle monoton düşmedi). `mono`
görüntü yalnız yerleşim mono'ya izin veriyorsa kanalı katlar; müzik zemininde
kanal sayısı korunur, genişlik düğümü daraltır. Türetilmiş sesin tavanı
−1.5 dBTP'dir (kodek payı).

**Türetme** (`audio:job derive`): kaynak manifest'ten brief ve program
türetilir (program = kaynak + profilin genişletilmesi), köken `treatment`
olarak yazılır ve varyant kanonik job akışından geçer. Manifest `derivation`
bloğu kaynağın manifest yolunu, asset kimliğini, program ve PCM özetini,
profilin kimliğini/sürümünü/özetini ve yön ölçülerini (`treatment-cues-v1`)
taşır. Bağın kanıtı üç eşitliktir: işleme dışındaki program kaynağın
programıdır, kaynak manifest hâlâ o program ve PCM'dir, işleme profilin o
kaynağa genişletilmesidir. `verify` üçünü de bugünkü kaynak ve katalogla
yeniden sınar; kaynak değişirse bağ adıyla kopar.

Yön ölçüleri: centroid, atak oranı (başlangıçtan sonraki ilk 5 ms'nin
enerjisi / sonraki 95 ms) ve doğrudanlık (ilk 50 ms / geri kalan; C50 benzeri
netlik, sinyalin kendisinden). Crest ve 50 ms'lik tepe/RMS atak yumuşamasını
göstermedi (8.5 → 8.4 dB), bu yüzden atak oranı seçildi. `reference-impact`
(fırlatıcı archetype'ı, kuru, konumlu mono) ve yedi varyantı kodek SONRASI:

| Varyant       | Centroid (Hz) | Atak oranı (dB) | Doğrudanlık (dB) | LU (kaynağa göre) |
| ------------- | ------------- | --------------- | ---------------- | ----------------- |
| kaynak        | 1485          | −7.22           | −4.96            | 0                 |
| distance-near | 1442          | −7.22           | −4.87            | 0.0               |
| distance-mid  | 1368          | −7.78           | −7.46            | −3.0              |
| distance-far  | 1016          | −9.20           | −21.63           | −6.0              |
| occluded      | 799           | −7.89           | −8.24            | −5.0              |
| behind-wall   | 244           | −9.09           | −6.46            | −9.0              |
| underwater    | 316           | −9.65           | −7.27            | −5.0              |
| radio         | 1251          | −5.21           | −11.09           | −0.3              |

Yakın → orta → uzak üç ölçüde de kesin monotondur. Telsizin sub ve air
bantları orta bandın 20 dB'den fazla altındadır. Telsizde atak oranı
sıkıştırma nedeniyle kaynaktan yüksektir; cihaz profilinin yön iddiası bant
sınırıdır, uzaklık değil. Test ortamındaki sessiz bir kaynağın (−26.9 LUFS)
uzak varyantı sfx politikasının altına düştü ve kapı onu reddetti: seviye
göreli olduğu için sessiz kaynaktan uzak varyant türemez, kaynak düzeltilir.

### Oyun durumu aileleri

Rol sözlüğüne üç SIRALI ve genel oyun durumu ekseni eklendi
(`family/vocabulary.ts`): `energy` (idle < low < normal < high < peak),
`urgency` (calm < alert < warning < critical), `integrity` (intact < worn <
damaged < broken). Bunlar domain kavramı değildir: silah şarjı, motor devri,
yaralı yaratık ya da kritik uyarı tüketici paketinde bu değerlere eşlenir.
Durum eksenli varyantın brief'i ve manifest'i yapılandırılmış `state` taşır
(ör. `{ energy: high, integrity: damaged }`); bank rolleri de taşır, arama
sözleşmesi (`sound-family-lookup-v1`) değişmez.

Aile iki kanıtı beyan eder ve kapı ölçer (beyan edilmezse rapor bölümü
yoktur; `reference-shell-hits` raporu değişmedi):

- **Yön iddiaları** (`quality.states`): `{ axis, descriptor, direction }`.
  İddia yalnız o eksende farklı, diğer bütün rolleri aynı üye çiftlerinde
  sınanır (kontrollü karşılaştırma); betimleyici sıra yönünde KESİN
  değişmelidir. Sınanabilir çifti olmayan iddia geçmez; ailede rol olmayan
  eksene iddia yazılamaz.
- **Ortak tını kimliği** (`quality.identity`, `timbre-envelope-v1`): her
  üye medoide beyan edilen eşik içindedir. Zarf 1/6 oktav uzun dönem
  spektrumudur (25 Hz – 16 kHz); uzaklık, ortalaması çıkarılmış farkın
  log-frekansta ±3 oktav kaydırmanın en iyisindeki RMS'idir. Böylece seviye
  ve mekanizmanın hızlanması (devir, perde) kimliği değiştirmez. İlk deneme
  MFCC (c1–c12, alt kümeleri dahil) aileyi yabancı seslerden AYIRMADI (üye
  medoide 57–96, yabancılar 46–67); kaydırmasız zarf da ayırmadı. Formant
  gibi sabit rezonansla tanınan kaynaklarda (konuşma) kaydırma serbestliği
  fazla hoşgörülüdür; o aileler bu ölçüyle beyan edilmemelidir.

`reference-engine-states`: tek motor programı (`source.machine`), `energy`
idle/normal/high × `integrity` intact/damaged, altı varyant. Kimlik: medoid
`high`, üyeler en çok 12.27 (eşik 13; rölanti −1.83 oktav kayar, devir
oranından beklenen −1.92). Yedi yabancı referans ses (darbe, uzak darbe, iki
kabuk, tık, hybrid, sample) medoide 13.9 ve üstü: pay küçüktür ve öyle
raporlanır. İddialar: enerji→centroid ve enerji→yükseklik (6 çift),
bütünlük→düzlük (3 çift) ihlalsiz. `high` varyantının perdesi sağlam z 4.9
ile aykırı olarak RAPORLANIR (`outliers: report`): devir farkı bilerek
büyüktür.

## Hızlı Başlangıç — yeni bir oyun için ses

Gönderilen ses TEK kapıdan geçer (`publishJob`); oyun betiğinde `writeOgg`
çağırmak bu kapıyı atlar ve `tests/governance/publishPath.test.ts` onu
reddeder. Yeni bir oyun şu yoldan ses alır:

1. **Hedef beyanı.** Oyun paketinin köküne `audio-target.json`
   (`AudioTargetV1`: biçim, örnek oranları, kanal sayıları, loop desteği)
   yazılır; beyansız aktif oyun publish hedefi olamaz.
2. **İş.** `audio:job init <jobId> --package <paket> --asset
public/assets/audio/<sınıf>/<ad>.ogg [--runtime-key <anahtar>]` — sınıf
   klasörü (`sfx`, `ui`, `ambience`, `music`) kodek sonrası politikayı seçer.
3. **Brief → program.** `brief` ile istek kaydedilir; program elle,
   `plan` iskeletinden ya da `search` → `promote` ile gelir.
4. **Render → analiz → seçim → publish.** `status <jobId> --json` her an
   sonraki geçerli adımı söyler; publish kodek SONRASI sınıf politikasından
   geçmeyen asset'i yazmaz.
5. **Oyun tarafı.** Oyun gönderilen OGG'yi kendi `public/assets/audio`
   ağacından çalar (runtime anahtarı manifest'tedir); audio-synth'i
   import etmez.

İlişkili varyant setleri `family`, müzik `music` alt komutlarıyla aynı kapıdan
geçer. Bütün sözdizimi `audio:job context --json` çıktısındadır.

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

## Render kalitesi, artımlı render ve paralel toplu iş

Agent aynı programı onlarca kez yineler. Bu bölümün üç mekanizması o
yinelemeyi ucuzlatır ve hiçbiri yayımlanan PCM'i değiştirmez:

- **Taslak kalite:** Aynı program daha düşük iç aşırı örneklemeyle işlenir.
- **Artımlı render:** Değişmeyen aşama ve sesler önbellekten gelir.
- **Paralel toplu iş:** Aday, varyant ve stem'ler worker'larda koşar.

### Render oturumu ve kalite profili

Kalite ve önbellek, derindeki çekirdeklere imza değiştirmeden bir **render
oturumuyla** ulaşır (`src/engine/session.ts`). Genel render API'leri
(`renderProgram`, `renderMusicStem`, protokol girişleri) `quality` ve `cache`
seçeneklerini alır ve oturumu yalnız kendi çağrı süreleri boyunca kurar.
Oturum dışında render nihai kalitededir ve önbelleksizdir; davranış bu
mekanizmalardan önceki davranışla aynıdır.

| Katsayı                                     | `final` | `draft` | Nerede                                           |
| ------------------------------------------- | ------: | ------: | ------------------------------------------------ |
| Ses sentezi iç oranı                        |      2× |      1× | `engine/synthesize.ts` (1×'te decimator atlanır) |
| Doygunluk şekillendiricisi                  |      4× |      1× | `effects/saturation.ts` (düğüm ve stil zinciri)  |
| True-peak ara değeri (sınırlayıcı ve ölçüm) |      4× |      1× | `analysis/loudness.ts` `truePeakFactor`          |

Program, düğümler, tohumlar ve alt akışlar iki kalitede de aynıdır. Uzunluk da
aynıdır: nihai yolda `floor(floor(2·fs·T)/2) = floor(fs·T)`. Kaliteye bağlı
düğüm taşımayan bir programda taslak ve nihai PCM özdeştir (test kilitli).
Maliyet tahmini nihai kaliteyi varsayar ve bu bilinçli olarak muhafazakârdır.

**Kalite ve yayın:**

- Taslak render kaydı `quality: "draft"` taşır ve kimliğe kaliteyi katan ayrı
  bir `renderId` alır. Nihai kayıt alanı hiç yazmaz; mevcut `renderId`'ler ve
  kayıt özetleri değişmez.
- Analiz, kaydın kalitesiyle yeniden render eder. PCM kimliği taslakta da
  doğrulanır.
- `publishJob` taslak seçimi `policy` hatasıyla reddeder ve hiçbir dosya
  yazmaz. Kendi render'ını dıştaki oturumdan bağımsız olarak açıkça
  `final` kalitede yapar.

**Komutlar:**

- `audio:job render --draft`
- `music check|render --draft`
- `family check --draft` (çıktıda `renderQuality` alanı)

Arama koşusu ve yayın kalıcı karar kaydı yazdığı için taslağa açılmaz.

### Artımlı render

**Anahtar.** Önbellek içerik adreslidir: anahtar, çıktıyı belirleyen her şeyin
kanonik özetidir (`src/program/renderKeys.ts`).

- **Taban anahtar:** renderer sürümü, kalite, tohum, örnek oranı, program
  uzunluğu, derinlik kontrolü, sample bildirimleri (WAV özetiyle) ve bank'lar.
- **Katman aşamaları:** kaynak → her seri rezonatör (paralel blok tek aşama)
  → artikülasyon → her insert.
- **Aşama anahtarı (Merkle):** bir önceki aşamanın anahtarı + düğümün kimliği
  (sürüm, alt akış yolu, parametre değerleri; eğriler `id@sürüm` ile) +
  dinlediği modülatörlerin anahtarları.
- **Modülatörler:** kendi anahtarlarıyla ayrı önbelleğe girer.
- **Kök anahtar:** program belgesinin tamamı + tohum + kalite + renderer
  sürümü. Mix, bus, stil, master ve loop bütün katmanların torunudur;
  kökten hesaplanır.

Bir yaprak parametresi değişince yalnız o aşamanın ve ardıllarının anahtarı
değişir. Katman, önbellekte bulunan en derin aşamadan devam eder.

**Aşama sırası.** Zincir bugün aşama öncelikli işlenir (her aşama bütün
kanallara). Bu, kanal öncelikli eski sırayla aynı PCM'i verir, çünkü her düğüm
çağrısı taze parametre ve taze alt akış alır ve kanallar arasında değişken
durum paylaşılmaz. Önbelleksiz yolda da yayımlanmış 17 manifest `identical`
kaldı.

**Kopya kuralı.** Okuma ve yazma kopya üzerinden yapılır. Zincir düğümleri
tamponu yerinde değiştirir; önbellekteki örnek hiçbir çağırana ödünç verilmez.

**Sample doğrulaması.** Önbellek varken bildirilen her sample, önbelleğe
bakmadan ÖNCE yüklenip doğrulanır. Kütüphanede sürüm değişmişse ya da dosya
kaybolmuşsa hata önbelleksiz render'la aynı çıkar; eski bir PCM sessizce
dönmez.

**Ses önbelleği (müzik).** `synthesize` doğrulanmış VE ham parametrelerle
(global efektler ham parametreyi okur) artı iç oranla anahtarlanır. Kanonik
JSON'a çevrilemeyen parametre önbelleğe girmez; sample verisi taşıyan ses
her seferinde render edilir. Kazanç ve konum karıştırma anında uygulandığı
için şerit kazancı değişince hiçbir ses yeniden sentezlenmez.

**Katmanlar ve güvenlik** (`src/protocol/renderCacheStore.ts`):

| Katman | Yer                                                  | Sınır                       | Tahliye                                 |
| ------ | ---------------------------------------------------- | --------------------------- | --------------------------------------- |
| Bellek | süreç geneli, depolar arasında paylaşılır            | 512 MiB, girdi başı 128 MiB | en az yakın zamanda kullanılan          |
| Disk   | `node_modules/.cache/audio-synth/render/<parmakizi>` | 2 GiB, girdi başı 256 MiB   | en eski erişilen, bütçenin %80'ine iner |

- **Parmak izi** audio-synth `src/` ve CORE `src/` ağacının özetidir. Kod
  değişince eski girdiler hiç okunmaz ve dizinleri temizlenir. Aynı sürümde
  DSP'si değişmiş bir düğüm bu yüzden bayat PCM döndüremez.
- **Yarım ya da bozuk girdi** (başlık, boyut) ıska sayılır ve silinir.
- **Nerede açık:** `audio:job` süreci önbellekli bir oturumda koşar;
  `AUDIO_SYNTH_RENDER_CACHE=off` kapatır. Kütüphane olarak çağrılan protokol
  işlevleri ve testler varsayılan olarak önbelleksizdir.
- **Doğrulama önbelleği hiç kullanmaz:** `verifyManifest`, `verifySearch` ve
  sentetik sample fixture'ı açıkça `cache: null` ile gerçek hesap yapar. Bir
  sürüm kapısının kanıtı ödünç alınmış bir sonuç olamaz. Test, kök anahtara
  bilerek yanlış PCM yazar; normal render onu döndürür, `verifyManifest`
  döndürmez.

### Paralel toplu render

**Görevler.** Toplu işler aynı saf görev işlevlerini seri yolda ana iş
parçacığında, paralel yolda worker'da koşar (`src/protocol/parallelTasks.ts`):

- `family-member`: aile kontrolü
- `search-candidate`: arama koşusu ve arama doğrulaması
- `music-raw`: müzik kontrolünde referans mix ve stem'ler

Sonuç girdi sırasına yerleşir; tamamlanma sırası içeriği ve sırayı
etkilemez. Dinleme kopyaları da aday sırasıyla yazılır.

**Senkron bekleme.** Protokol API'si senkrondur (kilitler, CLI, testler); bu
yüzden ana iş parçacığı `Atomics.wait` ile bekler ve yanıtı
`receiveMessageOnPort` ile senkron alır (`src/protocol/parallel.ts`).

- PCM tamponları kopyasız aktarılır.
- Worker tsx'i açılışta yükler ve bunu bir el sıkışmasıyla bildirir. Bloklu
  bekleyen ana iş parçacığı worker'ın asenkron `error` olayını göremeyeceği
  için yükleme hatası da el sıkışmasıyla döner.
- Görev hatası `ParallelTaskError` olarak adıyla gelir.
- Worker ana oturumun kalite ve önbellek kararını izler: önbellek varsa
  deponun disk katmanını paylaşır.

**Politika** (`src/guard/parallel.ts`, `batchWorkers`):

- Eşzamanlı tepe bellek tavanı 4 × render bütçesidir. Bu, "Kaynak bütçesi"ndeki
  dört eşzamanlı render ölçümüdür.
- Worker başına en az 2 sn tahmini iş düşer; toplamı bunun altındaki toplu iş
  seri koşar.
- En çok çekirdek − 1 worker açılır.
- Karar deterministik iş birimi tahminine dayanır. `AUDIO_SYNTH_WORKERS=N`
  sayıyı sabitler.
- Politika `BatchBudget`'a katılmaz: arama raporu etkin bütçeyi kaydeder ve
  şemayı değiştirmek yayımlanmış raporların yeniden türetilmesini bozardı.

### Ölçümler

Ölçüm makinesi yukarıdaki bütçe tablosuyla aynıdır (8 iş parçacığı).
Külliyat: 19 canary, 3 referans job, 3 referans müzik (`checkMusic`).

| Senaryo                                             | Süre                  | Kazanç              |
| --------------------------------------------------- | --------------------- | ------------------- |
| Müzik kontrolü, nihai, önbelleksiz                  | 9,35 sn               | —                   |
| Müzik kontrolü, taslak                              | 4,79 sn               | 1,95×               |
| Müzik kontrolü, önbellek soğuk (tek tur içi tekrar) | 4,78 sn               | 1,96×               |
| Müzik kontrolü, önbellek sıcak                      | 1,67 sn               | 5,6×                |
| Akustik külliyat, nihai → taslak                    | 923 → 873 ms          | akustik zaten ucuz  |
| 57 öğelik toplu iş, seri → 3 / 6 worker             | 3,56 → 1,79 / 1,94 sn | 1,99× / 1,84×       |
| 8 varyantlık aile, seri → 3 worker                  | 332 → 1109 ms         | eşik bu yüzden var  |
| Adaptive müzik, seri → 3 worker                     | 4,23 → 3,78 sn        | referans mix baskın |

- **Önbelleğin payı:** Önbellek açık/kapalı PCM kimliği bütün külliyatta soğuk
  ve sıcak 0 uyuşmazlık verdi.
- **Aşama sayıları:** Karma bir programda (3 katman, modülatör, paralel blok,
  insert) ilk render 12 aşama yazdı. Tek rezonatör değişince 3, modülatör
  değişince 6 aşama yazıldı; bunlar tam olarak torunlardır.
- **Taslağın payı:** Müzik süresinin yarısından fazlası 2× iç oranlı ses
  sentezindeydi.
- **Önbelleğin payı:** Adaptive parçada referans mix stem'lerin seslerini
  yeniden sentezliyordu; benzersiz ses oranı %35'tir.
- **Worker açılışı:** ~0,8 sn'dir. Küçük toplu iş bu yüzden seri kalır.

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
4800 nokta, dört taşıyıcı dalga × 110–5000 Hz, 44.1 kHz) risk sınıflarını ve
eşiklerini `FM_ALIAS_LIMITS`e (makine-okunur) yazar; `Analysis.assessFmAlias()`
bir ayarı render etmeden değerlendirir. Seviye: güvenli ≤ −60 dB, dikkat ≤
−30 dB alias/sinyal. Index korumasının Δf=0'a sıkıştırdığı noktalar ölçümde
yalnız taşıyıcının kendi kafes-dışı tabanını verir (ör. üçgen @ 5 kHz'de
−87.6 dB); değerlendirme yalnız FM kaynaklı katlanmayı iddia ettiği için bu
satırlar sınır türetmeye ve yanlış-"güvenli" sayımına girmez.

**Sinüs taşıyıcı:**

| Modülatör                   | Güvenli Δf (= I·fm) < | Dikkat Δf < | Izgaradaki en kötü |
| --------------------------- | --------------------: | ----------: | -----------------: |
| sinüs, feedback 0           |              sınırsız |    sınırsız |           −82.2 dB |
| sinüs, 0 < feedback ≤ 0.1   |              10000 Hz |    24690 Hz |           −11.4 dB |
| sinüs, feedback > 0.1       |               27.5 Hz |      275 Hz |            −1.9 dB |
| üçgen                       |              24690 Hz |    sınırsız |           −38.3 dB |
| üçgen + feedback            |               27.5 Hz |      110 Hz |            +6.1 dB |
| testere / kare / pulse      |                110 Hz |      550 Hz |            −4.8 dB |
| testere / kare / pulse + fb |               27.5 Hz |     27.5 Hz |           +13.9 dB |

**Kenarlı taşıyıcı** (sawtooth/square/pulse): BLEP rezidüeli kenar
zamanlamasını sabit faz adımıyla hesaplar; PM kenarı kaydırınca katkı birkaç
dB hatayla yerleşir. Sinüs taşıyıcılı kenarlı modülatörden daha sıkıdır.

| Modülatör              | Güvenli Δf < | Dikkat Δf < | Izgaradaki en kötü |
| ---------------------- | -----------: | ----------: | -----------------: |
| sinüs / üçgen, fb 0    |        55 Hz |      275 Hz |            −2.6 dB |
| kenarlı mod. veya fb>0 |      27.5 Hz |     27.5 Hz |           +10.8 dB |

**Üçgen taşıyıcı:** BLAMP düzeltmesi kenar zamanlamasını sabit faz adımıyla
hesaplar; PM kenarı kaydırınca katkı birkaç dB hatayla yerleşir — sinüs
taşıyıcılı kenarlı modülatörden daha sıkıdır. Kenarlı modülatör ya da
feedback birleşimi en küçük ölçülmüş sapmada (27.5 Hz) bile −30 dB'yi
aşar.

| Modülatör              | Güvenli Δf < | Dikkat Δf < | Izgaradaki en kötü |
| ---------------------- | -----------: | ----------: | -----------------: |
| sinüs / üçgen, fb 0    |      1760 Hz |    17600 Hz |           −14.6 dB |
| kenarlı mod. veya fb>0 |      27.5 Hz |     27.5 Hz |           +14.4 dB |

Motorun index koruması yan bantları (Carson) iç Nyquist'in altında tutar;
yeni decimator'la sinüs modülatör + feedback 0 bütün ızgarada −82 dB'nin
altındadır (eski decimator'da fc 917 Hz / I 25 → −20.8 dB, fc 3572 Hz / I 8 →
−22.4 dB). Risk sinüs olmayan modülatörde (sonsuz harmonik; koruma yalnız
temeli sayar), feedback'te (modülatör harmonik kazanır; ≳ 0.3 döngüde
periyodikliği kaybeder, kafes dışı enerji kaosu da içerir) ve sinüs olmayan
taşıyıcıda (PM'in taşıyıcı kenarına / tablo basamağına etkisi) kalır.
Oversampling'i körlemesine artırmak bu kaynakları çözmez; kural onları
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

Frozen ağaçta ses eklenmez ve yeniden üretilmez; yeni bir ürün sesini
"Hızlı Başlangıç"taki kanonik yoldan alır.

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
seçenektir. `sawtooth`, `square` ve `pulse` bant sınırlı basamak
rezidüeliyle düzeltilir ve tüm sentez 2x oversampling + halfband FIR ile
decimate edilir (bkz. "Örnekleme ve alias"); ölçülen alias 3.6 kHz
testerede −88.3 dB, kareda −87.3 dB'dir
(`scripts/polyblep-alias-report.ts`).

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
katalogdaki akustik enstrümanların çoğunu taşır. Güncel enstrüman sayısı
elle yazılmaz, çalışan koddan okunur (`audio:job context --json` →
`music.instruments.count`).

Ölçülmüş, bilinen sınırlar:

- Kenarlı osilatörlerin katlanması F6a'da ölçülen marjın altına indi:
  3.6 kHz testere −88.3 dB alias/sinyal (eski iki örneklik PolyBLEP'te
  −47 dB idi); artık pratik bir sınırlama değil, karakterizasyon kaydıdır
  (`scripts/polyblep-alias-report.ts`).
- Paralel comb reverb tonal girdide renklenir (saf sinüste wet ±4 dB).
- Master tavanları örnek tepesidir; kodek sonrası true peak onu aşabilir.
  4× true-peak sınırlayıcı `master.limiter` ile OPT-İNDİR; varsayılan zincir
  bit-eşit kalmaya devam eder ve kodek sonrası sınıf politikası aşımı
  reddeder.

Kapsam DIŞINDA olanlar (bunlar bilinçli):

- **Çalışma zamanında canlı sentez.** Hat şudur ve öyle kalır:
  kod → offline render → OGG → MusicEngine. Motor hazır tampon çalar; canlı
  sentez istenirse onun içine gömülmez, ayrı bir çalışma zamanı katmanı
  açılır.
- **Gerçek zamanlı MIDI, çalma zamanında ritmik grid/beatmatching, DAW/VST
  entegrasyonu.** Offline adım deseni (tracker) yazımı bundan ayrıdır ve
  kapsamdadır: desen render'dan önce score'a açılır.
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
pnpm --filter @volstudio/audio-synth audio:production-check  # manifest'ler, aramalar, aile bank'ları, müzik bundle'ları ve sample kayıtları yalnız kendilerinden
pnpm --filter @volstudio/audio-synth audio:surface-lock      # registry render yüzeyi kilidi (aynı sürümde değişeni reddeder)
pnpm --filter @volstudio/audio-synth audio:encode-baseline   # kodlama profili taban çizgisi (ölçerek; tablo ayrışırsa yazmaz)
pnpm --filter @volstudio/audio-synth audio:job canary run  # organik canary mekanik beklentileri
pnpm --filter @volstudio/audio-synth audio:job context --json
pnpm --filter @volstudio/audio-synth bench:budget     # kaynak bütçesi referans ölçümü
pnpm --filter @volstudio/audio-synth bench:resonators # tüp ↔ modal maliyet kıyası
pnpm --filter @volstudio/audio-synth audio:audition   # git-dışı dinleme paketi
pnpm --filter @volstudio/audio-synth exec tsx scripts/fm-alias-report.ts
```

`just audio-verify` (signoff) dört işi birlikte sınar: `generate:audio`
reçetesi tanımlayan aktif paketlerde reçete tazeliği, ölçüm çekirdeğinin
referans araçla (FFmpeg ebur128) denetimi, production manifest'leri
(`audio:production-check`) ve aktif ses ağaçlarının kodek sonrası politikası.
Kanonik yoldan yayımlanan asset'in tazelik kanıtı reçete değil manifest'tir;
`generate:audio` yalnız eski usul reçete taşıyan paketler içindir.

## Dikkat

- `writeWav` sadece build zamanında, Node ortamında çalışır.
- Runtime tarayıcıda ses üretmek için `synth()` sonucu `AudioBuffer`'a aktarılır.
- `pan` veya `stereoWidth` verildiğinde çıkış stereo (`channels` 2 elemanlı); verilmezse mono.
