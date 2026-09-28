# Music Engine

`@volstudio/core/audio/music`, projenin Web Audio tabanlı müzik motorudur. Stem
(katman) bazlı adaptive müzik, crossfade ve state'e göre gain haritalama sağlar.
SFX motorundan (build-time ses sentez aracından) ayrıdır; müzik uzun loop'lar ve
çok kanallı stem mix'i için optimize edilmiştir.

> **Runtime'da sentez YAPILMAZ.** Motor yalnızca önceden üretilmiş OGG (iOS'ta MP3)
> stem'leri çalar. Müzik ve SFX dosyaları build-time script'lerle
> (`games/vol-hell/scripts/audio-v2/` ve `devtools/audio-synth/`) üretilir.
> Bu bilinçli bir karardır: runtime sentez CPU maliyeti ve mobilde öngörülemeyen
> zamanlama getirir.

## Mimari

```
core/src/audio/music/
  types.ts             — MusicTrack, Stem, MusicState, MusicContext, gain map tipleri
  engine.ts            — MusicEngine: yükleme, çalma, durdurma, crossfade, cue zamanlaması
  cues.ts              — MusicCuePlayer: giriş/bitiş/stinger/geçiş cue'larını yükler ve bir kez çalar
  mixer.ts             — MusicMixer: her stem için ayrı GainNode + master kompresör
  scheduler.ts         — MusicScheduler: BPM/ölçü bazlı zaman/bar/beat dönüşümleri
  loader.ts            — StemLoader: stem yükle ve decode et; OGG başarısızsa MP3 fallback
  gain-resolver.ts     — state'e göre stem gain'ini çözer
  index.ts             — public API
```

VOL.HELL'in gönderilen Arcade besteleri ve SFX tanımları
`games/vol-hell/scripts/audio-v2/` altında tutulur. Kanonik job ve müzik
yayın kapısı `devtools/audio-synth/` içindedir; oyun yalnız yayımlanmış OGG
ve manifestlerini kendi ağacından kullanır. Güncel eser envanteri ve insan
dinleme kararı `games/vol-hell/DESIGN.md` Ses bölümündedir.

Pipeline:

1. Track tanımı `MusicEngine.loadTrack(track)` ile yüklenir. Dönüş değeri,
   en az bir stem'in başarıyla yüklendiğini bildirir; tek bir bozuk stem diğer
   stem'leri veya diğer track'leri kilitlemez.
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
- **Kısmi yükleme başarısı KULLANILABİLİR.** `loadTrack()` "en az bir stem
  yüklendi mi" döner. Bir listeyi hazırlayan tüketici `Promise.all` yerine
  `allSettled` kullanmalı ve YALNIZCA yüklenen parçalarla liste kurmalıdır:
  tek bozuk dosya bütün listeyi düşürürse müzik hiç çalmaz, yüklenmemiş bir id
  listeye girerse o tur sessiz geçer (bkz. `vol-hell/src/app/menuMusic.ts`).
- **Reddedilen yükleme sözü ÖNBELLEKLENMEZ.** "Bir kez yükle" deseni sözü bir
  alana yazıyorsa, red durumunda o alan temizlenmelidir; aksi hâlde geçici bir
  hata süreç ömrü boyunca yeniden denemeyi engeller.
- **Geçişler İKİ FAZLIDIR ve yarım kalmaz.** `play()` ve `crossfadeTo()` önce
  hedefin çalınabilir stem'lerini çözer; hiçbiri yoksa ÇALAN müziğe hiç
  dokunmadan fırlatır. Eskiden `crossfadeTo()` önce eski stem'leri susturup
  `stop()` planlıyor, sonra "hiç stem yok" diye fırlatıyordu: geçiş başarısız
  olduğu hâlde mevcut müzik ölüyor, `isPlaying` `true` takılı kalıyor ve
  playlist bir daha ilerlemiyordu.
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
- **Buffer önbelleği içerik/track kapsamlıdır.** `src` veren stem'ler kaynak
  adresiyle, doğrudan `AudioBuffer` veren stem'ler `trackId + stemId` ile
  anahtarlanır; aynı stem adı iki track'in buffer'ını karıştıramaz.
- **Eşzamanlı `play()` çağrılarında son çağrı kazanır.** Yükleme beklerken daha
  yeni bir `play()`, `crossfadeTo()` veya `stop()` gelirse eski asenkron işlem
  ortak çalma durumunu değiştiremez.
- **`dispose()` abonelikleri de temizler.** `onTrackEnd()` ile eklenen
  dinleyiciler motor ömrü bittiğinde tutulmaz; ayrıca buffer cache ve mixer
  kanalları bırakılır.

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

| Metot                                       | Açıklama                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| `loadTrack(track)`                          | Track buffer'larını yükler; `boolean`, en az bir stem başarısını bildirir |
| `play(trackId, options?)`                   | Track çalmaya başlar                                                      |
| `stop(options?)`                            | Çalmayı fade out ile durdurur                                             |
| `crossfadeTo(trackId, duration?, options?)` | Diğer track'e geçer (bkz. aşağıda)                                        |
| `playStinger(cueId, options?)`              | Loop'u kesmeden sonraki ölçü/vuruşta vurgu çalar; başlama anını döner     |
| `playOutro()`                               | Sonraki ölçü sınırında loop'u bırakıp bitişi çalar; bitince parça biter   |
| `transitionTo(trackId, options)`            | Geçiş cue'suyla başka parçaya geçer; hedef cue'nun ölçüsü kadar sonra     |
| `setState(state, fadeTime?)`                | State günceller                                                           |
| `setIntensity(value, fadeTime?)`            | Yoğunluk (0-1) ayarlar                                                    |
| `setMasterVolume(value, fadeTime?)`         | Master seviye ayarlar                                                     |
| `mute(muted, fadeTime?)`                    | Susturur / ayarlanan seviyeye açar                                        |
| `getCurrentState()`                         | Track id, state ve çalma durumu                                           |
| `dispose()`                                 | Tüm kaynakları ve buffer cache'i bırakır                                  |

## Çapraz Geçiş (Crossfade)

```typescript
await music.crossfadeTo('combat', 2, {
  bars: 2, // en erken 2 bar sonraki ölçü sınırında başlar
  state: { intensity: 0.7 },
});
```

`bars` verilmezse geçiş HEMEN başlar (`duration` geçişin kendi süresidir, öncesinde bekleme yoktur).

## Cue'lar: giriş, bitiş, stinger, geçiş

Cue, loop'a karışmayan tek seferlik bir sestir (`MusicCue`: `id`, `src`
ya da `buffer`, müzikal uzunluk `bars`, `gain`, `align`). Track `intro`,
`outro` ve `cues` (stinger ve geçişler) taşıyabilir; `loadTrack` cue'ları
da yükler, yüklenemeyen cue parçayı düşürmez.

- **Giriş.** `play()` girişi başlatır; loop stem'leri girişin `bars` kadar
  sonrasında örnek-doğru başlar. Ölçü ızgarası girişin başından sayılır;
  girişin kuyruğu loop'un ilk ölçüsünün üstünde doğal olarak söner.
- **Stinger.** `playStinger(id, { align })` loop'u kesmeden sonraki ölçü
  (varsayılan) ya da vuruş sınırında çalar; `align: 'now'` bakış payı kadar
  sonra.
- **Bitiş.** `playOutro()` sonraki ölçü sınırında loop'u 30 ms'de bırakır ve
  bitişi çalar; bitiş kendiliğinden sönünce `onTrackEnd` bildirilir. Bu
  sırada `stop()` gelirse bildirim yapılmaz.
- **Geçiş.** `transitionTo(trackId, { cue })` önce hedefin çalınabilirliğini
  doğrular, sonra cue'yu ölçü sınırında başlatır; hedef parça cue'nun
  `bars` kadar sonrasında ölçü başında girer.

Spec tarafında cue'lar `MusicAssetSpecV1.cues` listesidir (`MusicCueSpecV1`:
`id`, `kind`, `file`, `frames`, `bars`, `align`, `to`); `toMusicTrack` girişi
ve bitişi ayrı alanlara, stinger ve geçişleri `cues` listesine koyar.

## Ses üretimi (build-time)

Motor runtime'da sentez yapmaz; hazır OGG stem'lerini yükler. Yeni müzik ve
SFX kanonik `devtools/audio-synth` job/müzik yayın kapısından geçer. Oyun
paketinin `public/assets/audio/` ağacı gönderilen dosyaların tek kaynağıdır;
manifest ve bundle oyun ağacında kalır. Ara WAV ve `dist` Git'e girmez.

VOL.HELL'in Arcade seti 38 SFX ve sekiz tek-`main` mix (menü, savaş, boss,
bitiş, ambiyans) gönderir. Eski ayrı combat stem/cue dosyaları bu sette yoktur.
Kaynaklar `games/vol-hell/scripts/audio-v2/` ve
`devtools/audio-synth/audio-jobs/` ile `audio-music/` altındadır.
`pnpm --filter @volstudio/audio-synth audio:production-check` manifestleri
kaynak programdan yeniden render ederek PCM kimliğini ve gönderilen OGG
ilişkisini doğrular. `games/vol-hell/tests/config/audioIntegration.test.ts`
parça sürelerini ve runtime eşlemesini denetler.

## VOL.HELL Kullanımı

`games/vol-hell/src/app/GameAudio.ts` tek bir `AudioContext` yönetir ve iki
`MusicEngine` tutar: `music` menü/savaş/boss/bitiş parçalarını, `ambient`
oyun içi ambiyansı çalar. `GameAudioDirector` sahneye göre geçişi yönetir.
Track'lerin yolları ve loop süreleri `games/vol-hell/src/config/music.ts`
ile `musicTiming.ts` içindedir. Combat ve boss artık birer tek mix'tir; CORE
motorunun çoklu stem/cue kabiliyeti diğer oyunlar için kullanılabilir.

## Müzik asset sözleşmesi

Yeni müzik `devtools/audio-synth` müzik hattında üretilir ve çalma
sözleşmesini `MusicAssetSpecV1` olarak taşır. Spec bu paketin
`src/audio/music/spec.ts` dosyasındadır, çünkü üretim aracı da çalışma
zamanı da ondan TÜRETİR: ölçü → örnek dönüşümü tek yerdedir ve iki taraf
ayrışamaz (ayrışma loop dikişinde duyulur, hiçbir test yakalamaz).

| Ad (`Music.` altında)                              | Ne yapar                                                                                  |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `barsToFrames(bars, bpm, beatsPerBar, sampleRate)` | Ölçü → örnek; yuvarlamanın TEK yeri                                                       |
| `validateMusicAssetSpec(value)`                    | Runtime'ın okuyabileceği kadar doğrular (şema, çalma modeli, kare sayısı, mastering yolu) |
| `toMusicTrack(spec, { resolve })`                  | Spec'i motorun çaldığı `MusicTrack`e çevirir; loop noktaları SANİYE                       |
| `assertEngineCompatible(spec, options)`            | Spec kompresörsüz ölçüldüyse motor kompresörü açıkken hata verir                          |
| `MASTERING_PATHS`                                  | Çalma modeli → zorunlu mastering yolu                                                     |
| `MUSIC_RUNTIME_CAPABILITIES`                       | Motorun GERÇEKTEN yaptığı geçişler, cue türleri ve sınırları (üretim bu listeye bakar)    |

**Kompresör uyumu.** Master kompresörü (−24 dB eşik, 12 oran) varsayılan
olarak açıktır ve −14 LUFS'e getirilmiş bir parçayı ezer; offline ölçüm
duyulanı temsil etmez. Spec'in `engine.compressor` beyanı motorun kurulumuyla
eşleşmelidir.

## Yeni Müzik Ekleme

1. audio-synth'te müzik isteğini (`brief.json`, `AudioBriefV1` `kind: 'music'`)
   ve programı (`music.json`, `MusicProgramV1`) yaz; `devtools/audio-synth`
   içinde `pnpm audio:job music analyze <id>` ses render etmeden sembolik
   uyumu raporlar. Giriş, bitiş ve stinger isteyen parça programda
   `segments` bildirir; her cue ayrı asset olarak yayımlanır ve spec'in
   `cues` listesine girer.
2. `audio:job music publish <id>`: her stem kanonik publish kapısından geçer,
   en son `MusicBundleV1` (içinde `MusicAssetSpecV1`) hedef paketin müzik
   köküne yazılır. Oyun hedefi çalışma zamanı beyanı (`audio-target.json`)
   ister.
3. Oyun paketi bundle'ı kendi ağacından okur ve
   `Music.toMusicTrack(bundle.spec, { resolve })` ile track'e çevirir; motoru
   `compressor: bundle.spec.engine.compressor` ile kurar.
4. Doğrula: `audio:job music verify <id>` (ya da `verify --all`) ve oyunun
   kendi kapıları.

VOL.HELL Arcade seti bu yayın hattını kullanır; oyun paketi yalnız yayımlanmış
varlıkları tüketir.

## Scheduler

`MusicScheduler` BPM ve ölçü üzerinden bar/beat hesaplar. `crossfadeTo` içinde kullanılır.

```typescript
const scheduler = new MusicScheduler(110, [4, 4]);
const nextBarTime = scheduler.getNextBarTime(ctx.currentTime, trackStartTime);
```

- `beatDuration = (60 / bpm) * (4 / timeSignature[1])` — `bpm` dörtlük başınadır
- `barDuration = beatDuration * timeSignature[0]`

Spec'in `bpm`'i ise ölçü BİRİMİ başına vuruştur (6/8'de sekizlik);
`toMusicTrack` dönüşümü `bpm × 4 / birim` ile tek yerde yapar. Önceden bpm
olduğu gibi geçiyor ve 6/8 parçada bar hizalı geçişler yarım ölçü kayıyordu.

## Sınırlar

İyi sonuç verir:

- Uzun loop'lu ambient / drone
- Layered müzik temaları
- Adaptive gain'li stem mix'ler
- Bar sınırında crossfade
- Giriş + dikişsiz loop + bitiş; ölçü/vuruş hizalı stinger; cue'lu geçiş

Yetersiz kalır:

- Real-time MIDI zamanlama / ritmik grid
- Real-time ritim / beatmatching
- DAW/VST entegrasyonu ve canlı orkestrasyon
- **Çalışma zamanında sentez.** Motor `AudioBuffer` çalar; enstrümanı üreten
  taraf build-time'dadır ve bu sınır bilinçlidir.

Adaptif gain dışında real-time arrange yoktur.

## Doğrulama

Müzik değişikliği sonrası:

```bash
pnpm -r typecheck
pnpm --filter @volstudio/core test
pnpm --filter @volstudio/vol-hell build
pnpm --filter @volstudio/vol-hell test
```

Ayrıca tarayıcıda `?debug` ile ses hataları ve context state gözlemlenebilir.
