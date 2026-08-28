# Music Engine

`@volstudio/core/audio/music`, projenin Web Audio tabanlı müzik motorudur. Stem
(katman) bazlı adaptive müzik, crossfade ve state'e göre gain haritalama sağlar.
SFX motorundan (`@volstudio/audio-synth`) ayrıdır; müzik uzun loop'lar ve
çok kanallı stem mix'i için optimize edilmiştir.

> **Runtime'da sentez YAPILMAZ.** Motor yalnızca önceden üretilmiş OGG (iOS'ta MP3)
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
  loader.ts            — StemLoader: stem yükle ve decode et; OGG başarısızsa MP3 fallback
  gain-resolver.ts     — state'e göre stem gain'ini çözer
  index.ts             — public API
```

Track'ler ve SFX'ler artık oyun paketi içinden üretilir:

```
games/vol-hell/scripts/audio/
  lib/mix.ts           — master zincir: voice toplama, normalize, DC blocker
  lib/theory.ts        — müzik teorisi yardımcıları
  palette/*.ts         — "Dark Synthetic / Void" ses paleti
  music/*.ts           — track başına render script'leri
  ambience/*.ts        — gameplay ambiyans render'ları
  sfx/specs.ts         — SFX tanım tablosu
  generate-music.ts    — tüm müzik ve ambiyansı export eder
  generate-ambience.ts — ambiyans render giriş noktası
  generate-sfx.ts      — SFX render giriş noktası
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
  id: 'hollow-signal',
  bpm: 60,
  stems: [
    {
      id: 'theme',
      src: 'assets/audio/music/main-menu/hollow-signal.ogg',
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

| Alan      | Açıklama                                    |
| --------- | ------------------------------------------- |
| `id`      | Benzersiz stem kimliği                      |
| `src`     | OGG dosya yolu; iOS'ta MP3 fallback denenir |
| `buffer`  | Önceden yüklenmiş `AudioBuffer`             |
| `gain`    | Temel gain (0-1)                            |
| `loop`    | Loop çalışıp çalmayacağı                    |
| `pan`     | Stereo pan (-1 sol, 1 sağ)                  |
| `gainMap` | State'e göre adaptif gain haritası          |

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

Motorun o anki çalma bağlamını verir; `gainMap` çözümlemesinde ve dış dinleyicilerde kullanılabilir.

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

Motor runtime'da sentez YAPMAZ; yalnızca hazır dosya çalar.

### Asset akışı — tek format, tek kopya

```
games/vol-hell/scripts/audio/*.ts   ÜRETİM SCRIPT'LERİ (git'te)
        ↓ pnpm --filter @volstudio/vol-hell generate:audio
        ↓ (yalnız ses tasarımı değişince elle çalıştırılır)
games/vol-hell/public/assets/audio/**.ogg  OYUN ASSET'İ (git'te)
        ↓ vite build
games/vol-hell/dist/assets/audio/**.ogg    BUILD ÇIKTISI (gitignore)
```

**Shipped OGG dosyaları repoda tutulur; üreten script'ler de git'te durur.**
Oyun kodları bu dosyaları `public/assets/audio/` altında bekler. Ses tasarımı
değiştiğinde `pnpm --filter @volstudio/vol-hell generate:audio` çalıştırılarak
OGG'ler yenilenir. Ara formatlar (WAV, MP3) repoda tutulmaz; iOS hedefi için
`pnpm convert:ios` ile üretilen MP3'ler build çıktısına (`dist`) gider.

Üretim deterministiktir: aynı seed + aynı script aynı OGG'yi verir.
Kayıpsız WAV kopyası saklanmaz, gerektiğinde yeniden üretilir. iOS hedefi
için `StemLoader` `.ogg` başarısız olursa `.mp3` fallback dener; proje
build'inde `convert:ios` yokken yalnızca OGG üretilir.

> **Uyarı — müzik için öneri:** `synth` motoru SFX, UI blip ve kısa drone için
> designed. Çoksesli müzik, armoni ve uzun melodi üretmeye çalışmak aynı sonik
> hissiyat ve sınırlı tımbr çıkarır. Müzik parçaları için DAW veya hazır royalty-free
> stem'leri OGG olarak export edip bu motorla çalmak daha sağlıklıdır.
> Prosedürel müzik denemeleri yalnızca kısa jingle / drone düzeyinde tutarlıdır.

```bash
pnpm --filter @volstudio/vol-hell generate:audio   # SFX + müzik (hepsi)
pnpm --filter @volstudio/vol-hell generate:music   # yalnız müzik
pnpm --filter @volstudio/vol-hell generate:sounds  # yalnız SFX
pnpm --filter @volstudio/vol-hell audio:qa         # üretileni ölç
```

> Daha önce bu doküman `ProceduralStemGenerator`, `procedural-presets.ts`,
> `playStinger()`, `setTension()` ve `setBossPhase()` belgeliyordu. Bunların
> hiçbiri kodda yok — planlanmış ama yazılmamış bir API'ydi. One-shot ses
> gerekiyorsa oyun tarafındaki SFX yolu (`GameAudio.playSfx`) kullanılır.

## VOL.HELL Kullanımı

```
games/vol-hell/src/app/GameAudio.ts
games/vol-hell/src/runtime/systems/GameAudioDirector.ts
```

`GameAudio` tek bir `AudioContext` yönetir ve içinde iki `MusicEngine` barındırır:

- `music` — ana temalar (main menu, death screen, victory)
- `ambient` — gameplay ambiyans

`GameAudioDirector` sahne durumuna göre müzik ve ambiyans arası geçişi
yönetir: menüden oyuna, oyundan savaşa, savaştan boss'a, ölüm ve zafer
anlarına kararlı geçişler kurar.

```typescript
gameAudio.loadMusic(musicTracks['hollow-signal']);
gameAudio.playMusic('hollow-signal', { fadeIn: 2 });

gameAudio.loadAmbient(musicTracks['null-drift']);
gameAudio.playAmbient('null-drift', { fadeIn: 2 });
```

Track tanımları:

```
games/vol-hell/src/config/music.ts
```

Üretim altyapısı (`Dark Synthetic / Void` teması):

```
games/vol-hell/scripts/audio/
  lib/mix.ts          — master zincir: normalize, DC blocker, peak limitleme
  lib/theory.ts       — armoni, ölçek ve ritim yardımcıları
  lib/track.ts        — track render pipeline'ı
  palette/*.ts        — synth ses paleti (bass, pads, keys, percussion, fx, ambience)
  music/*.ts          — her track için ayrı render script'i
  ambience/*.ts       — gameplay ambiyans render'ları
  generate-music.ts   — müzik + ambiyans üretim giriş noktası
  generate-ambience.ts — ambiyans giriş noktası
```

`core/scripts/audio-qa.ts` üretilen asset'leri ölçer (click, clip, bant profili) — paylaşılan CLI, `pnpm --filter @volstudio/vol-hell audio:qa` ile çağrılır.

Mevcut müzik track'leri:

- `hollow-signal` — ana menü, yavaş, boşluk hissiyatı
- `event-horizon` — ana menü alternatifi, hareketli
- `surge-protocol` — savaş müziği
- `sovereign` — boss müziği
- `terminal-echo` — ölüm ekranı
- `first-light` — zafer ekranı
- `null-drift` / `deep-current` — gameplay ambiyansı

Çalıştır:

```bash
pnpm --filter @volstudio/vol-hell generate:music
pnpm --filter @volstudio/vol-hell audio:qa
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

1. `games/vol-hell/scripts/audio/music/` altına track için render script'i ekle
   (mevcut `menu-hollow-signal.ts` gibi).
2. `games/vol-hell/src/config/music.ts`'te track/stem tanımını güncelle — `bpm` ve
   `loopEnd` script'teki değerlerle BİREBİR eşleşmeli.
3. `games/vol-hell/scripts/audio/generate-music.ts` içinde yeni track'i export et.
4. `games/vol-hell/src/config/music.ts`'te gerekirse state mantığını (ör. menu,
   combat, boss) güncelle.
5. `GameAudioDirector` veya sahne kodunda `loadMusic`/`playMusic` ile çalma anını bağla.
6. Doğrula:

```bash
pnpm --filter @volstudio/vol-hell generate:music
pnpm --filter @volstudio/vol-hell audio:qa  # click 0, clip 0 olmalı
pnpm -r typecheck
pnpm --filter @volstudio/vol-hell build
pnpm test
```

## Scheduler

`MusicScheduler` BPM ve ölçü üzerinden bar/beat hesaplar. `crossfadeTo` içinde kullanılır.

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
