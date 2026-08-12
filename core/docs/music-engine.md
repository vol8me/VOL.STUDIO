# Music Engine

`@volstudio/core/audio/music`, projenin Web Audio tabanlı müzik motorudur. Stem
(katman) bazlı adaptive müzik, crossfade ve state'e göre gain haritalama sağlar.
SFX motorundan (`@volstudio/core/audio/synth`) ayrıdır; müzik uzun loop'lar ve
çok kanallı stem mix'i için optimize edilmiştir.

> **Runtime'da sentez YAPILMAZ.** Motor yalnızca önceden üretilmiş WAV/OGG/MP3
> stem'leri çalar. Müzik ve SFX dosyaları build-time script'lerle (`core/scripts/generate-*.ts`)
> üretilir. Bu bilinçli bir karardır: runtime sentez CPU maliyeti ve mobilde
> öngörülemeyen zamanlama getirir.

## Mimari

```
core/src/audio/music/
  types.ts             — MusicTrack, Stem, MusicState, MusicContext, gain map tipleri
  engine.ts            — MusicEngine: yükleme, çalma, durdurma, crossfade
  mixer.ts             — MusicMixer: her stem için ayrı GainNode + master kompresör
  scheduler.ts         — MusicScheduler: BPM/ölçü bazlı zaman/bar/beat dönüşümleri
  loader.ts            — StemLoader: WAV/OGG/MP3 stem'leri yükle ve decode et; OGG için MP3 fallback
  gain-resolver.ts     — state'e göre stem gain'ini çözer
  instrument.ts        — build-time SFX script'leri için enstrüman preset'leri
  index.ts             — public API
```

Pipeline:

1. Track tanımı `MusicEngine.loadTrack(track)` ile yüklenir.
2. Her stem için `StemLoader.loadFromUrl(src)` ile `AudioBuffer` çözülür.
3. `MusicEngine.play(trackId)` tüm stem'leri aynı `AudioContext` zamanında başlatır.
4. Her stem kendi `GainNode` kanalından master mix'e bağlanır.
5. `MusicEngine.setState()` / `setIntensity()` ile stem gain'leri adaptif olarak değişir.
6. `MusicEngine.crossfadeTo()` yeni track'e geçer — `bars` verilirse bar sınırında,
   verilmezse hemen.

## Davranış notları

Bu maddeler kolayca yanlış varsayılan, ölçülerek doğrulanmış davranışlardır.

- **`crossfadeTo()` varsayılan olarak HEMEN başlar.** `options.bars` verilirse geçiş
  o kadar bar sonraki sınıra hizalanır. Daha önce `bars` yokken geçiş `duration`
  kadar gecikiyordu: `fadeIn: 2` çağrısı 2 saniye hiçbir şey yapmayıp sonra 2
  saniyede geçiyordu.
- **`play()` çalan parçayı yeniden başlatmaz** ama verilen `state`'i uygular.
  Yoğunluğu değiştirmek için ayrıca `setState()` çağırmak gerekmez.
- **`mute(false)` ayarlanan seviyeye döner**, 1.0'a değil.
- **Fade'ler lineer rampadır ve hedefe TAM varır.** Üstel yaklaşım (`setTargetAtTime`)
  hedefe hiç varmadığı için fade-out sonunda kaynak duyulur seviyedeyken
  kesiliyordu.
- **`timeSignature` paydası hesaba katılır.** `[6, 8]` gerçekten sekizlik vuruş
  demektir; bar süresi `[6, 4]`'ün yarısıdır.
- **`bpm` pozitif olmalıdır.** Geçersiz tempo/ölçü `MusicScheduler` kurulurken
  hata fırlatır, sessizce `Infinity` üretmez.
- **Ducking zinciri `MusicEngineOptions.destination` ile verilir.** Motorun
  çıkışını dışarıdan koparıp yeniden bağlamak gerekmez.

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
      src: 'assets/audio/music/main-menu/main-menu-theme.ogg',
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

| Alan      | Açıklama                                         |
| --------- | ------------------------------------------------ |
| `id`      | Benzersiz stem kimliği                           |
| `src`     | WAV/OGG/MP3 dosya yolu; OGG tercih, MP3 fallback |
| `buffer`  | Önceden yüklenmiş `AudioBuffer`                  |
| `gain`    | Temel gain (0-1)                                 |
| `loop`    | Loop çalışıp çalmayacağı                         |
| `pan`     | Stereo pan (-1 sol, 1 sağ)                       |
| `gainMap` | State'e göre adaptif gain haritası               |
| `gainFn`  | `(state, context) => number` adaptif fonksiyon   |
| `stinger` | One-shot çal ve bitince dur                      |

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

| Metot                                       | Açıklama                                 |
| ------------------------------------------- | ---------------------------------------- |
| `loadTrack(track)`                          | Track buffer'larını önceden yükler       |
| `play(trackId, options?)`                   | Track çalmaya başlar                     |
| `stop(options?)`                            | Çalmayı fade out ile durdurur            |
| `crossfadeTo(trackId, duration?, options?)` | Diğer track'e geçer (bkz. aşağıda)       |
| `setState(state, fadeTime?)`                | State günceller                          |
| `setIntensity(value, fadeTime?)`            | Yoğunluk (0-1) ayarlar                   |
| `setMasterVolume(value, fadeTime?)`         | Master seviye ayarlar                    |
| `setLocation(location, fadeTime?)`          | Lokasyon/state ayarlar                   |
| `mute(muted, fadeTime?)`                    | Susturur / ayarlanan seviyeye açar       |
| `getCurrentState()`                         | Track id, state ve çalma durumu          |
| `dispose()`                                 | Tüm kaynakları ve buffer cache'i bırakır |

## Çapraz Geçiş (Crossfade)

```typescript
await music.crossfadeTo('combat', 2, {
  bars: 2, // en erken 2 bar sonraki ölçü sınırında başlar
  state: { intensity: 0.7 },
});
```

`bars` verilmezse geçiş HEMEN başlar (`duration` geçişin kendi süresidir, öncesinde bekleme yoktur).

## Ses üretimi (build-time)

Motor runtime'da sentez YAPMAZ; yalnızca hazır WAV/OGG/MP3 çalar. Müzik dosyaları
`core/scripts/` altındaki track başına script'lerle üretilir (source-of-truth WAV,
ship edilen OGG + MP3 fallback).

> **Uyarı — müzik için öneri:** `synth` motoru SFX, UI blip ve kısa drone için
> designed. Çoksesli müzik, armoni ve uzun melodi üretmeye çalışmak aynı sonik
> hissiyat ve sınırlı tımbr çıkarır. Müzik parçaları için DAW veya hazır royalty-free
> stem'leri WAV/OGG olarak export edip bu motorla çalmak daha sağlıklıdır.
> Prosedürel müzik denemeleri yalnızca kısa jingle / drone düzeyinde tutarlıdır.

```bash
pnpm --filter @volstudio/vol-hell generate:music   # tüm müzik WAV'ları
pnpm --filter @volstudio/vol-hell generate:sounds  # tüm SFX WAV'ları
```

Script'ler `@volstudio/core/audio/synth` motorunu kullanır (bkz. `sound-synth.md`).
Üretim **deterministiktir**: aynı parametreler her zaman birebir aynı dosyayı
verir, dolayısıyla üretilen asset'ler diff'lenebilir.

> Daha önce bu doküman `ProceduralStemGenerator`, `procedural-presets.ts`,
> `playStinger()`, `setTension()` ve `setBossPhase()` belgeliyordu. Bunların
> hiçbiri kodda yok — planlanmış ama yazılmamış bir API'ydi. One-shot ses
> gerekiyorsa oyun tarafındaki SFX yolu (`GameAudio.playSfx`) kullanılır.

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

Üretim altyapısı:

```
core/scripts/audio-mix.ts            — mix temeli: voice toplama, humanize, DC blocker, master
core/scripts/industrial-voices.ts    — endüstriyel ses paleti (müzik + SFX ortak sözlüğü)
core/scripts/audio-qa.ts             — üretilen asset'leri ölçer (click, clip, bant profili)
```

Üretim script'leri (track başına ayrı):

```
core/scripts/generate-iron-vein.ts        — ana menü 1, karakter: ağırlık
core/scripts/generate-black-tide.ts       — ana menü 2, karakter: hareket
core/scripts/generate-crimson-horizon.ts  — ana menü 3, karakter: boşluk
core/scripts/generate-ambient-tracks.ts   — void-whisper + iron-tide + last-ember
```

Çalıştır:

```bash
pnpm --filter @volstudio/vol-hell generate:music
pnpm audio:qa   # üretilenleri ölç
```

## Üretim kuralları

Bu kurallar ölçümle konuldu; bozulduğunda sonuç duyulur şekilde kötüleşir.

- **Voice'lar `normalize: false` ile üretilir.** `synth()` varsayılanı `true`'dur ve
  her notayı tek tek 0.95 tepeye çeker; bu katmanlar arası doğal dinamiği yok eder.
  Seviye dengesi `gain` ile kurulur, normalize yalnızca master zincirde bir kez
  uygulanır (`masterChain` / `masterPeak`).
- **Seviye hedefi RMS'tir, tepe değil.** Arka plan müziğinde algılanan yükseklik
  ortalama seviyeyle belirlenir. Menü ~-17 dB, ambiyans -20/-22 dB.
- **Ambiyans parçalarında orta bant boşaltılır.** Oyun içi SFX enerjisi 200-3000 Hz
  bandında; ambiyans o bandı doldurursa ateş/hasar sesleri maskelenir.
- **Üst üste binen perküsyon `humanize` ile ayrıştırılır.** Aynı örneğe düşen
  transientlerin farkları toplanıp yapay sertlik üretiyordu.
- **Loop'lanan parçada uzun fade YOK.** Yalnızca milisaniyelik `applyEdgeGuard`;
  uzun fade her turda duyulur bir boşluk bırakır.

## Yeni Müzik Ekleme

1. `core/scripts/` altına track için render script'i ekle (mevcut `generate-iron-vein.ts` gibi).
2. `games/vol-hell/src/config/music.ts`'te track/stem tanımını güncelle — `bpm` ve
   `loopEnd` script'teki değerlerle BİREBİR eşleşmeli.
3. `games/vol-hell/package.json` `generate:music` script'ine üretim komutunu ekle.
4. Sahne kodunda `loadMusic`/`playMusic` ile bağla.
5. Doğrula:

```bash
pnpm --filter @volstudio/vol-hell generate:music
pnpm audio:qa                 # click 0, clip 0 olmalı
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

- Real-time MIDI zamanlama / ritmik grid
- Real-time ritim / beatmatching
- DAW/VST entegrasyonu ve canlı orkestrasyon

Sample tabanlı stem çalma desteklenir, ancak adaptif gain dışında real-time
arrange/anlaşma yoktur.

## Doğrulama

Müzik değişikliği sonrası:

```bash
pnpm -r typecheck
pnpm --filter @volstudio/core test
pnpm --filter @volstudio/vol-hell build
pnpm --filter @volstudio/vol-hell test
```

Ayrıca tarayıcıda `?debug` ile ses hataları ve context state gözlemlenebilir.
