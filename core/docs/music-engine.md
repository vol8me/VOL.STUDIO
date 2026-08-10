# Music Engine

`@volstudio/core/audio/music`, projenin Web Audio tabanlı müzik motorudur. Stem (katman) bazlı adaptive müzik, crossfade, stinger çalma ve prosedürel pad/drone/bass üretimi sağlar. SFX motorundan (`@volstudio/core/audio/synth`) ayrıdır; müzik uzun loop'lar ve çok kanallı stem mix'i için optimize edilmiştir.

## Mimari

```
core/src/audio/music/
  types.ts             — MusicTrack, Stem, MusicState, MusicContext, gain map tipleri
  engine.ts            — MusicEngine: yükleme, çalma, durdurma, crossfade, stinger
  mixer.ts             — MusicMixer: her stem için ayrı GainNode + master kompresör
  scheduler.ts         — MusicScheduler: BPM/ölçü bazlı zaman/bar/beat dönüşümleri
  loader.ts            — StemLoader: URL'den WAV yükler, decode eder
  gain-resolver.ts     — state'e göre stem gain'ini çözer
  procedural.ts        — ProceduralStemGenerator: runtime / build-time sentez
  procedural-presets.ts— pad, drone, bass, ambientNoise hazır tarifleri
  index.ts             — public API
```

Pipeline:

1. Track tanımı `MusicEngine.loadTrack(track)` ile yüklenir.
2. Her stem için `StemLoader.loadFromUrl(src)` ile `AudioBuffer` çözülür.
3. `MusicEngine.play(trackId)` tüm stem'leri aynı `AudioContext` zamanında başlatır.
4. Her stem kendi `GainNode` kanalından master mix'e bağlanır.
5. `MusicEngine.setState()` / `setIntensity()` / `setTension()` ile stem gain'leri adaptif olarak değişir.
6. `MusicEngine.crossfadeTo()` bar sınırında yeni track'e geçer.

## Hızlı Başlangıç

### 1. Track tanımla

```typescript
import type { MusicTrack } from '@volstudio/core/audio/music';

const mainMenu: MusicTrack = {
  id: 'main-menu',
  bpm: 60,
  stems: [
    {
      id: 'theme',
      src: 'assets/audio/music/main-menu/main-menu-theme.wav',
      gain: 0.75,
      loop: true,
    },
  ],
};
```

### 2. Oyun içinde çal

```typescript
import { MusicEngine } from '@volstudio/core/audio/music';

const music = new MusicEngine({ masterVolume: 0.6, compressor: true });
await music.loadTrack(mainMenu);
await music.play('main-menu', { fadeIn: 2 });
```

### 3. Adaptive state güncelle

```typescript
music.setState({ intensity: 0.8, tension: 0.4 });
music.setIntensity(0.9, 0.5); // 0.5 saniye fade
```

## Temel Kavramlar

### Track

Bir müzik parçası. `id`, `bpm`, `stems` ve opsiyonel `timeSignature` (`[4, 4]`), `bars`, `loopStart`, `loopEnd`, `defaultState` içerir.

### Stem

Track'in bir katmanı. Birden fazla stem aynı anda çalarak harmoni/richness oluşturur.

| Alan      | Açıklama                                       |
| --------- | ---------------------------------------------- |
| `id`      | Benzersiz stem kimliği                         |
| `src`     | WAV dosyası yolu                               |
| `buffer`  | Önceden yüklenmiş `AudioBuffer`                |
| `gain`    | Temel gain (0-1)                               |
| `loop`    | Loop çalışıp çalmayacağı                       |
| `pan`     | Stereo pan (-1 sol, 1 sağ)                     |
| `gainMap` | State'e göre adaptif gain haritası             |
| `gainFn`  | `(state, context) => number` adaptif fonksiyon |
| `stinger` | One-shot çal ve bitince dur                    |

### MusicState

Müziği sahneye uyarlamak için kullanılan değerler kümesi.

```typescript
interface MusicState {
  intensity?: number; // 0-1 aksiyon yoğunluğu
  tension?: number; // 0-1 tehdit/gerilim
  bossPhase?: number | string;
  location?: string;
  [key: string]: number | string | undefined;
}
```

### MusicContext

Motorun o anki çalma bağlamını verir; `gainFn` içinde kullanılabilir.

```typescript
interface MusicContext {
  bpm: number;
  timeSignature: [number, number];
  bar: number; // 1-based
  beat: number; // 1-based float
  time: number; // track başından geçen saniye
}
```

## Stem Gain Haritası

Stem'ler `gainMap` ile state değişimlerine yanıt verir.

### Sayısal state (intensity, tension)

```typescript
const stem: Stem = {
  id: 'combat-perc',
  src: '...',
  gain: 0.6,
  gainMap: {
    intensity: [
      { threshold: 0.0, gain: 0.0 },
      { threshold: 0.5, gain: 0.5 },
      { threshold: 1.0, gain: 1.0 },
    ],
  },
};
```

`intensity = 0.25` için 0.0-0.5 arası interpolasyondan `gain = 0.25` çıkar.

### Sembolik state (bossPhase, location)

```typescript
gainMap: {
  bossPhase: {
    intro: 0.2,
    enraged: 1.0,
    defeated: 0.0,
  },
}
```

### gainFn

Daha karmaşık mantık için fonksiyon:

```typescript
gainFn: (state, ctx) => {
  if (state.location === 'boss' && ctx.bar > 4) return 1.0;
  return 0.3;
};
```

## MusicEngine API

| Metot                                       | Açıklama                           |
| ------------------------------------------- | ---------------------------------- |
| `loadTrack(track)`                          | Track buffer'larını önceden yükler |
| `play(trackId, options?)`                   | Track çalmaya başlar               |
| `stop(options?)`                            | Çalmayı fade out ile durdurur      |
| `crossfadeTo(trackId, duration?, options?)` | Bar sınırında diğer track'e geçer  |
| `playStinger(stemId, options?)`             | One-shot stinger çalar             |
| `setState(state, fadeTime?)`                | State günceller                    |
| `setIntensity(value, fadeTime?)`            | Yoğunluk ayarlar                   |
| `setTension(value, fadeTime?)`              | Gerilim ayarlar                    |
| `setBossPhase(phase, fadeTime?)`            | Boss fazı ayarlar                  |
| `setLocation(location, fadeTime?)`          | Lokasyon/state ayarlar             |
| `setMasterVolume(value, fadeTime?)`         | Master ses seviyesi                |
| `mute(muted, fadeTime?)`                    | Motoru susturur/açar               |
| `dispose()`                                 | Tüm kaynakları temizler            |

## Çapraz Geçiş (Crossfade)

```typescript
await music.crossfadeTo('combat', 2, {
  bars: 2, // en erken 2 bar sonraki ölçü sınırında başlar
  state: { intensity: 0.7 },
});
```

`bars` verilmezse hemen `now + duration` zamanında geçiş başlar.

## Stinger

Track dışından one-shot ses:

```typescript
music.loadStinger({ id: 'level-up', src: '...', gain: 0.8 });
await music.playStinger('level-up');
```

## Procedural Stem Üretimi

Build zamanında WAV yazımak için `generate-iron-vein.ts` gibi track başına script'ler kullanılır. Runtime'da `ProceduralStemGenerator` ile `AudioBuffer` üretilebilir.

```typescript
import { ProceduralStemGenerator, droneParams } from '@volstudio/core/audio/music';

const gen = new ProceduralStemGenerator(audioContext);
const buffer = gen.generateDrone({
  duration: 24,
  frequency: 80,
  wave: ['sine', 'sine'],
  gain: 0.5,
});
```

Hazır preset fonksiyonları:

- `padParams(options)` — chord pad
- `droneParams(options)` — uzun ambient drone
- `bassParams(options)` — low bass
- `ambientNoiseParams(options)` — tonal sine + modülasyon (gürültü değil)

> Cızırtıyı önlemek için bu preset'ler yalnızca `sine` temelli osilatörler ve ılımlı reverb kullanır; brown/pink gürültü tercih edilmez.

## VOL.HELL Kullanımı

```
games/vol-hell/src/app/GameAudio.ts
```

`GameAudio` tek bir `AudioContext` yönetir ve içinde iki `MusicEngine` barındırır:

- `music` — ana temalar (main menu, death screen)
- `ambient` — gameplay ambiyans

Böylece müzik ve ambiyans birbirinden bağımsızdır; ana menüden oyuna geçerken müzik dururken ambiyans başlar.

```typescript
gameAudio.loadMusic(musicTracks.mainMenu);
gameAudio.playMusic(musicTracks.mainMenu.id, { fadeIn: 2 });

gameAudio.loadAmbient(musicTracks.gameplayAmbient);
gameAudio.playAmbient(musicTracks.gameplayAmbient.id, { fadeIn: 2 });
```

Track tanımları:

```
games/vol-hell/src/config/music.ts
```

Üretim script'leri (track başına ayrı):

```
core/scripts/generate-iron-vein.ts        — ana menü teması 1
core/scripts/generate-black-tide.ts       — ana menü teması 2
core/scripts/generate-crimson-horizon.ts  — ana menü teması 3
core/scripts/generate-ambient-tracks.ts   — void-whisper + iron-tide (oyun içi ambiyans)
```

Çalıştır:

```bash
pnpm --filter @volstudio/vol-hell generate:music
```

## Yeni Müzik Ekleme

1. `core/scripts/` altına track için render script'i ekle (mevcut `generate-iron-vein.ts` gibi).
2. `games/vol-hell/public/assets/audio/music/<kategori>/` altına WAV yaz.
3. `games/vol-hell/src/config/music.ts`'te track ve stem tanımını güncelle.
4. `games/vol-hell/package.json` `generate:music` script'ine üretim komutunu ekle.
4. Sahne kodunda `loadMusic`/`playMusic` ile bağla.
5. Doğrula:

```bash
pnpm -r typecheck
pnpm --filter @volstudio/vol-hell build
pnpm test
```

## Scheduler

`MusicScheduler` BPM ve ölçü üzerinden bar/beat hesaplar. `crossfadeTo` ve `gainFn` içinde kullanılır.

```typescript
const scheduler = new MusicScheduler(110, [4, 4]);
const nextBarTime = scheduler.getNextBarTime(ctx.currentTime, trackStartTime);
```

- `beatDuration = 60 / bpm`
- `barDuration = beatDuration * timeSignature[0]`

## Sınırlar

İyi sonuç verir:

- Uzun loop'lu ambient / drone
- Layered müzik temaları
- Adaptive gain'li stem mix'ler
- Bar sınırında crossfade

Yetersiz kalır:

- MIDI zamanlama / ritmik grid
- Real-time ritim / beatmatching
- Sample tabanlı orchestrasyon
- VST/DAW entegrasyonu

## Doğrulama

Müzik değişikliği sonrası:

```bash
pnpm -r typecheck
pnpm --filter @volstudio/core test
pnpm --filter @volstudio/vol-hell build
pnpm --filter @volstudio/vol-hell test
```

Ayrıca tarayıcıda `?debug` ile ses hataları ve context state gözlemlenebilir.
