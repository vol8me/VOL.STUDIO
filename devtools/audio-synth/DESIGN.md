# Sound Synth Motoru

`@volstudio/audio-synth` prosedürel ses sentezi üretir. Oyunlar build zamanında OGG çıktı alır; dış ses kütüphanesi veya DAW gerektirmez. Motor saf matematikle yazılmıştır; hem Node hem tarayıcıda çalışır. `writeWav`/`writeOgg` Node-only'dır ve `writeOgg` FFmpeg ister.

## Determinizm ve seviye kontrolü

- **Üretim tekrarlanabilirdir.** Gürültü kaynakları `Math.random()` değil,
  seed'lenebilir bir PRNG kullanır. Aynı parametreler + aynı `seed` her zaman
  birebir aynı örnekleri verir; `seed` verilmezse sabit bir varsayılan kullanılır.
  Aynı script her zaman aynı sesi verir; bu yüzden üretilen dosyalar repoda
  tutulmaz (asset akışı için bkz. `music-engine.md`).
- **`normalize` opsiyoneldir** (varsayılan `true`). `true` iken sonuç tepe
  değerine göre 0.95'e ölçeklenir. Bir mix içinde birden çok ses üretiliyorsa
  (`compose()` gibi) her birini ayrı ayrı normalize etmek aralarındaki dinamik
  farkı yok eder — o durumda `normalize: false` geçilip normalize yalnızca final
  mix'e uygulanmalıdır. `compose()` bunu kendisi yapar.
- **`writeWav()` ek kazanç uygulamaz** (varsayılan `targetGain: 1`). Headroom
  kararı tek yerde, normalize adımındadır.
- **16-bit dönüşümde TPDF dither** uygulanır; dither de deterministiktir.

## Mimari — dört katman, dört ayrı soru

| Katman         | Soru                                 | İçinde ne var                                      |
| -------------- | ------------------------------------ | -------------------------------------------------- |
| `synthesis/`   | Örnek NASIL üretilir?                | osilatör, gürültü, zarf, filtre, örnek kaynağı     |
| `engine/`      | Parametreler nasıl BİRLEŞTİRİLİR?    | `SynthParams` → örnek; subtractive + FM + additive |
| `instruments/` | Bir enstrüman ailesi NASIL DAVRANIR? | fiziksel modeller                                  |
| `presets/`     | Bu sesin ADI ne?                     | parametre kümeleri + katalog                       |

Ayrıca `effects/` (master zinciri), `sequencer.ts` (arp/BPM), `types.ts` ve
Node-only `writer.ts` (WAV + OGG; OGG için FFmpeg). Dosya dökümü `src/`
ağacının kendisidir; burada tekrarlanmaz.

### `instrument ≠ preset`

Bu ayrım bu paketin büyüme biçimidir ve bulanıklaşırsa katalog motoru yutar.

- **Model** (`instruments/`), `SynthParams` ile ifade EDİLEMEYEN yapı taşır:
  gecikme hattı, rezonatör, uyarım. Çıktısı doğrudan `SynthesisResult`tır.
  Bugün tek model `pluck` (Karplus-Strong).
- **Preset** (`presets/`), ad verilmiş bir parametre kümesidir ve **yeni DSP
  taşımaz**. Ya `engine`e ya bir modele biner.

Sonuç: `guitar` bir presettir, `PluckedString` bir modeldir. On enstrüman on
motor değil, bir modelin on presetidir.

Bugün `presets/acoustic.ts` altında beş akustik preset ve `presets/plucked.ts`
altında dört telli çalgı preset var; hepsi yeni DSP taşımaz:
`drawbarOrgan`, `harpsichord`, `marimba`, `vibraphone`, `glockenspiel`,
`guitar`, `bassGuitar`, `harp`, `mandolin`. Değerleri kodda değil ORANLARDADIR —
Hammond ayak uzunlukları,
oyulmuş çubuğun 4:1 akordu, oyulmamış çubuğun harmonik OLMAYAN
1 : 2,76 : 5,40 : 8,93 modları, koparma noktasının 7. harmonikte açtığı çukur.

### Bir preset ölçülerek doğrulanır

Uydurulmuş bir harmonik dizisi de hatasız sentezlenir; "çalışıyor" bir kalite
ölçüsü değildir. `tests/acousticSpectrum.test.ts` her presetin BELGELENMİŞ
yapısını sesin kendisinde arar ve dokuz mutasyonu yakalar: modları tam sayıya
çevirmek, marimbanın boş katlarını doldurmak, klavsenin çukurunu kapatmak,
orga sönüm vermek, vibrafonun tremolosunu kaldırmak, gitar/bas gitar/arp
kısmi ton yapısını bozmak, mandolinin tremolosunu kaldırmak, `pluck` modelin
`decay` veya `bodyResonance` değerini değiştirmek.

İki ölçüm aracı, iki ayrı soru:

- **Goertzel** — tek hedef frekanstaki enerji. FFT değil, çünkü kısmi tonların
  çoğu tam sayı katı değildir ve bir FFT kutusuna oturmaz.
- **Periyot içi tepe-dip** — LFO derinliği. Zarf spektrumu burada işe yaramaz:
  sönüm ve reverb kabarması düşük frekansları doldurup LFO'yu gömer. Analiz
  penceresi en pes kısmi tonun periyodundan UZUN, LFO periyodundan KISA
  olmalıdır; ikisini karıştırmak bir tur ölçümü çöpe attı.

**Kapı:** `tests/governance/publicSurface.test.ts` kök yüzeydeki isimleri
kilitler. Yeni bir enstrüman `Presets` altında bir kalem olarak gelir ve
yüzeyi BÜYÜTMEZ; yüzey ancak yeni bir sentez tekniği ya da yeni bir MODEL
girdiğinde büyür. Kilit olmadan bu ayrım bir niyettir; kilitle bir kapıdır.

### Düzenleme katmanı

`compose` tek seslidir: notaları art arda dizer, tek preset kullanır ve mono
döner. Akor kurmak, iki enstrümanı üst üste çalmak ya da bir sesi diğerinin
ortasında başlatmak orada mümkün değildir — müzik üreten her betik kendi
karıştırıcısını yeniden yazıyordu. `arrange/` bunu kapatır:

- **`Timeline`** — ölçü/vuruş zamanlı, çok sesli, çok enstrümanlı, stereo.
  Bozuk olayı EKLENİRKEN reddeder (render sırasında değil: yüzlerce nota
  arasında bozuğunu aramak istenmez). Tohumlu insanlaştırma taşır, yani
  mekanik duyulmaz ama deterministik kalır.
- **Perde sözlüğü** — `noteToHz`, `transposeNote`, `SCALES`, `scaleDegree`,
  `scaleChord`. Akor dizinin RENGİNİ alır: majör dizinin ikinci derecesinde
  kurulan üçlü doğal olarak minördür.
- **`matchLoudness`** — tepe değil RMS eşitler. Tepeye göre normalize etmek
  parçaları eşit YÜKSEKLİKTE yapmaz: vurmalı ve sürekli dokular aynı tepede
  10 dB farkla çalar (ölçüldü). `targetRms: 0` "dokunma" demektir, "sustur"
  değil — bu ayrım bir kez yanlış tasarlandı ve testler yakaladı.

Kök yüzeye tek isimle girer (`Arrange`); içindekiler yüzey sayısını büyütmez.

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
5. Normalize ile çıkış hazırlanır.

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
pnpm --filter @volstudio/vol-hell generate:sounds
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
sentez 2x oversampling + 4. derece Butterworth alçak geçiren ile decimate edilir;
yine de çok yüksek temel frekanslarda üst harmonikler katlanabilir, gerektiğinde
`lowpass` ile kesilmelidir.

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

**Motor müzik için yetersiz DEĞİLDİR.** Bu belge bir dönem öyle yazıyordu ve
tersini repo kendi kapısında kanıtlıyor: VOL.HELL'in gönderilen müzik
parçalarının HEPSİ bu motorla üretiliyor ve `just audio-verify` (signoff'un
parçası) onları yeniden üretip bayt-birebir olduklarını doğruluyor. İddia
motorun tek osilatör + ADSR döneminden kalmıştı; additive, FM, filtre, LFO,
efekt zinciri ve Karplus-Strong eklendikten sonra geçerliliğini yitirdi.

Gerçek sınır **motorda değil KATALOĞDA**. Primitifler güçlü, paketlenmiş
enstrüman modeli az: bugün tek fiziksel model `pluck()` (Karplus-Strong).
Akustik piyano, yaylı, nefesli ve bakır üflemeli sesler yeni fiziksel model
ister — yeni bir motor değil.

Kapsam DIŞINDA olanlar (bunlar bilinçli):

- **Çalışma zamanında canlı sentez.** Hat şudur ve öyle kalır:
  kod → offline render → OGG → MusicEngine. Motor hazır tampon çalar; canlı
  sentez istenirse onun içine gömülmez, ayrı bir çalışma zamanı katmanı
  açılır.
- **Real-time MIDI, ritmik grid, beatmatching, DAW/VST entegrasyonu.**
- **Gerçekçi foley ve insan sesi.** İkincisi formant modeli ister.

## Doğrulama

Her ses değişikliği sonrası:

```bash
pnpm -r typecheck
pnpm --filter @volstudio/vol-hell generate:sounds
pnpm --filter @volstudio/vol-hell audio:qa
pnpm --filter @volstudio/vol-hell build
pnpm --filter @volstudio/vol-hell test
```

## Dikkat

- `writeWav` sadece build zamanında, Node ortamında çalışır.
- Runtime tarayıcıda ses üretmek için `synth()` sonucu `AudioBuffer`'a aktarılır.
- `pan` veya `stereoWidth` verildiğinde çıkış stereo (`channels` 2 elemanlı); verilmezse mono.
