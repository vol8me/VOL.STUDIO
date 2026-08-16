# Sound Synth Motoru

`@volstudio/core/audio/synth` prosedürel ses sentezi üretir. Oyunlar build zamanında OGG çıktı alır; dış ses kütüphanesi veya DAW gerektirmez. Motor saf matematikle yazılmıştır; hem Node hem tarayıcıda çalışır. `writeWav`/`writeOgg` Node-only'dır ve `writeOgg` FFmpeg ister.

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

## Mimari

```
core/src/audio/synth/
  types.ts      — tüm parametre tipleri
  waveforms.ts  — periyodik dalga şekilleri
  noise.ts      — white / pink / brown gürültü
  envelope.ts   — ADSR zarf
  filter.ts     — değişken lowpass / highpass
  effects/      — reverb, delay, modulation, distortion, pan, stereo width
  engine/       — synthesize(), compose(), applyGlobalEffects(), voice/render
  sequencer.ts  — arp / sequence / BPM
  sample.ts     — WAV decode, resample, loop, trim
  physical.ts   — fiziksel model (pluck / string)
  random.ts     — seed'li PRNG
  presets/      — kategorili hazır ses tarifleri
  writer.ts     — WAV + OGG yazıcı (OGG için FFmpeg)
  index.ts      — public API
```

Pipeline:

1. Osilatör / gürültü / sample / harmonik serisi sesi üretir.
2. Zarf, filtre, vibrato, tremolo ve LFO'lar şekillendirir.
3. `distortion` per-voice uygulanır.
4. Master efektler sırayla işlenir: `delay` → `flanger` → `phaser` → `chorus` → `pan` → `reverb` → `stereoWidth`.
5. Normalize ile çıkış hazırlanır.

## Hızlı Başlangıç

### 1. Generate scripti

```typescript
import { Presets, synth } from '@volstudio/core/audio/synth';
import { writeOgg } from '@volstudio/core/audio/synth/writer';

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
this.audio.play(soundKeys.fire, { volume: 0.3 });
```

## Parametre Referansı

### `SynthParams`

| Alan                           | Tip                               | Açıklama                                                                    |
| ------------------------------ | --------------------------------- | --------------------------------------------------------------------------- |
| `wave`                         | `Waveform \| Waveform[]`          | `sine`, `triangle`, `sawtooth`, `square`, `pulse`, `noise`, `pink`, `brown` |
| `frequency`                    | `number`                          | Temel frekans (Hz)                                                          |
| `slide`                        | `number`                          | Süre boyunca frekans değişimi (Hz)                                          |
| `slideCurve`                   | `linear \| exponential \| cosine` | Frekans kayma eğrisi                                                        |
| `detune`                       | `number`                          | İkinci osilatör detune (cent)                                               |
| `pitchJump`                    | `{ amount, time, duration }`      | Ani frekans zıplaması                                                       |
| `pulseWidth`                   | `number`                          | `pulse` duty cycle (0-1)                                                    |
| `harmonics`                    | `HarmonicParams[]`                | Additive synthesis — sine osilatör listesi                                  |
| `fm`                           | `FmParams`                        | 2-operator phase modulation                                                 |
| `envelope`                     | `EnvelopeParams`                  | attack, hold, decay, sustain, release, sustainLevel, curve                  |
| `lowpass`                      | `FilterParams`                    | `{ cutoff, slide }` — yüksekleri kes                                        |
| `highpass`                     | `FilterParams`                    | `{ cutoff, slide }` — düşükleri kes                                         |
| `lfos`                         | `LfoParams[]`                     | pitch / filter / amplitude modülasyonu                                      |
| `vibratoDepth` / `vibratoRate` | `number`                          | Frekans modülasyon derinliği / hızı (Hz)                                    |
| `tremoloDepth` / `tremoloRate` | `number`                          | Genlik modülasyon derinliği / hızı                                          |
| `reverb`                       | `ReverbParams`                    | `{ amount, decay, roomSize, damp, preDelay }`                               |
| `delay`                        | `DelayParams`                     | `{ time, feedback, mix }`                                                   |
| `flanger`                      | `FlangerParams`                   | `{ time, depth, rate, feedback, mix }`                                      |
| `phaser`                       | `PhaserParams`                    | `{ minFreq, maxFreq, rate, wave, stages, feedback, mix }`                   |
| `chorus`                       | `ChorusParams`                    | `{ depth, rate, mix }`                                                      |
| `distortion`                   | `DistortionParams`                | `{ amount, type, mix }` — `soft` / `hard` / `foldback`                      |
| `stereoWidth`                  | `StereoWidthParams`               | `{ width }` — 0 mono, 1 bypass, >1 genişlet                                 |
| `pan`                          | `number`                          | -1 (sol) ile 1 (sağ) arası stereo pan                                       |
| `sample`                       | `SampleParams`                    | WAV / Float32Array mixing                                                   |
| `repeat`                       | `number`                          | Arka arkaya tekrar sayısı                                                   |
| `repeatTime`                   | `number`                          | Tekrarlar arası süre (saniye)                                               |
| `duration`                     | `number`                          | Toplam süre (saniye)                                                        |
| `gain`                         | `number`                          | Genel kazanç (0-1)                                                          |

### `FmParams`

| Alan                | Tip              | Açıklama                                                       |
| ------------------- | ---------------- | -------------------------------------------------------------- |
| `modulatorWave`     | `Waveform`       | `sine`, `triangle`, `sawtooth`, `square`, `pulse`              |
| `ratio`             | `number`         | `modulatorFreq = carrierFreq * ratio`                          |
| `index`             | `number`         | Modülasyon derinliği (radian, pik faz sapması). 0 = FM kapalı. |
| `modulatorLevel`    | `number`         | Modulator seviyesi.                                            |
| `feedback`          | `number`         | Modulator kendini besleme.                                     |
| `modulatorEnvelope` | `EnvelopeParams` | `index`'i zamanla çarpar.                                      |

### `SampleParams`

| Alan            | Tip                                         | Açıklama                                                      |
| --------------- | ------------------------------------------- | ------------------------------------------------------------- |
| `data`          | `Float32Array \| ArrayBuffer \| Uint8Array` | Decode edilmiş örnekler veya ham WAV.                         |
| `sampleRate`    | `number`                                    | `data` WAV ise kaynak örnek oranı.                            |
| `trim`          | `{ start?, end? }`                          | Saniye cinsinden kırpma. `end` negatifse sondan geriye doğru. |
| `pitchShift`    | `number`                                    | Semitone cinsinden pitch shift.                               |
| `loop`          | `boolean`                                   | Hedef süre aşılırsa loop; false ise zero-pad.                 |
| `loopCrossfade` | `boolean`                                   | Loop geçişlerinde kısa crossfade.                             |
| `gain`          | `number`                                    | Sample kazancı (0-1).                                         |
| `envelope`      | `EnvelopeParams`                            | Sample zarfı.                                                 |

PCM16 (ve temel PCM8) WAV decode edilir. Dinamik sample yükleme runtime'da yok; build-time pipeline.

### `PhaserParams`

| Alan       | Tip                | Açıklama                                |
| ---------- | ------------------ | --------------------------------------- |
| `minFreq`  | `number`           | Allpass merkez frekansı minimumu (Hz).  |
| `maxFreq`  | `number`           | Allpass merkez frekansı maksimumu (Hz). |
| `rate`     | `number`           | LFO hızı (Hz).                          |
| `wave`     | `sine \| triangle` | LFO dalga şekli.                        |
| `stages`   | `number`           | Allpass aşama sayısı.                   |
| `feedback` | `number`           | Geri besleme (-0.95..0.95).             |
| `mix`      | `number`           | Karışım (0-1).                          |

### `EnvelopeParams` ve eğrileri

```typescript
interface EnvelopeParams {
  attack?: number;
  hold?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  sustainLevel?: number;
  curve?: 'linear' | 'exponential' | 'cosine';
}
```

- `linear` — düz çizgi
- `exponential` — doğal sönüş
- `cosine` — yumuşak giriş/çıkış

Belirtilmezse motor varsayılan zarf uygular:

```
attack: 0.01
sustain: duration * 0.5
release: duration * 0.4
sustainLevel: 0.7
```

### Waveform türleri

- `sine` — saf ton
- `triangle` — yumuşak, az harmonik
- `sawtooth` — tiz, agresif
- `square` — retro kare
- `pulse` — duty cycle ayarlanabilir kare
- `noise` — beyaz
- `pink` — beyazdan daha az yorucu
- `brown` — yoğun, baslı

## Arp / Sequence

`compose()` ile melodik diziler üretilir:

```typescript
import { compose, Presets } from '@volstudio/core/audio/synth';

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

## Hazır Presetler

```typescript
import { Presets } from '@volstudio/core/audio/synth';

// combat
Presets.fire(freq?, dur?)        Presets.bulletBounce(freq?, dur?)
Presets.laser(freq?, dur?)       Presets.explosion(freq?, dur?)
Presets.hit(freq?, dur?)         Presets.metallicClang(freq?, dur?)
Presets.fmLaser(freq?, dur?)

// ui
Presets.blip(freq?, dur?)        Presets.pause(freq?, dur?)
Presets.resume(freq?, dur?)      Presets.restart(freq?, dur?)

// rewards
Presets.coin(freq?, dur?)        Presets.powerup(freq?, dur?)
Presets.bell(freq?, dur?)        Presets.electricPiano(freq?, dur?)

// movement
Presets.hurt(freq?, dur?)        Presets.death(freq?, dur?)
Presets.jump(freq?, dur?)        Presets.dash(freq?, dur?)
Presets.whoosh(freq?, dur?)      Presets.dubBass(freq?, dur?)

// sequence
Presets.arpeggioUp(rootFreq?)
Presets.levelUpJingle(rootFreq?)
Presets.menuJingle(rootFreq?)
```

Katalog ve arama:

```typescript
Presets.PRESET_CATALOG['laser'];
Presets.findPresets({ category: 'combat', tags: ['weapon'] });
Presets.getPreset('laser', 880, 0.15);
```

## VOL.HELL SFX'leri

VOL.HELL'in sesleri bu dosyadaki genel preset kütüphanesini DEĞİL,
`core/scripts/industrial-voices.ts` paletini kullanır — müzikle aynı sözlük.
Gerekçe: SFX çıplak `sawtooth`/`triangle` + kısa ADSR ile üretildiğinde klasik
konsol (chiptune) karakteri veriyor ve additive/FM ile üretilen müzikle
tutarsız bir kimlik oluşturuyordu. Aynı FM/bandpass/gürültü yaklaşımı iki
tarafta da kullanılınca ateş sesi ile ambiyans aynı dünyaya ait duyuluyor.

### Yeni Ses Ekleme

1. `core/scripts/generate-volhell-sounds.ts`'teki `specs` dizisine ekle:

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

2. `src/config/sounds.ts`'te `soundAssets` ve `soundKeys` güncelle.
3. `pnpm --filter @volstudio/<game> generate:sounds` çalıştır.
4. Oyun kodunda `soundKeys.mySound` ile çal.
5. Doğrula:

```bash
pnpm audio:qa                 # click 0, clip 0 olmalı
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

İyi sonuç verir: retro/synth SFX, UI blip, vuruş, zıplama, laser, dash, whoosh, kısa patlama ve hasar.

Yetersiz kalır: gerçekçi foley, insan sesi, uzun ambient, **müzik, armoni ve uzun melodi**. Hollywood patlaması. Bunun nedeni sınırlı osilatör paleti, matematiksel dalgalardan gelen "plastik" timbre ve paylaşılan master zinciri: bu motorla çoksesli müzik üretmeye çalışmak farklı parametrelerle aynı sonik hissiyat verir. Bu durumlarda WAV/OGG sample tabanlı veya hybrid yaklaşım gerekir; müzik için DAW'da üretilmiş stem'leri `music-engine` ile çalmak daha sağlıklıdır.

## Doğrulama

Her ses değişikliği sonrası:

```bash
pnpm -r typecheck
pnpm --filter @volstudio/core test
pnpm --filter @volstudio/vol-hell generate:sounds
pnpm --filter @volstudio/vol-hell build
pnpm --filter @volstudio/vol-hell test
```

## Dikkat

- `writeWav` sadece build zamanında, Node ortamında çalışır.
- Runtime tarayıcıda ses üretmek için `synth()` sonucu `AudioBuffer`'a aktarılır.
- `pan` veya `stereoWidth` verildiğinde çıkış stereo (`channels` 2 elemanlı); verilmezse mono.
