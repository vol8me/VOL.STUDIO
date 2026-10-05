# Müzik çalma

`@volstudio/core/audio/music` hazır stem ve cue tamponlarını aynı Web Audio
zamanında çalar. Adaptif kazanç, ölçü/vuruş hizası ve parça geçişi çalışma
zamanındadır; sentez ve score üretimi audio-synth devtool'undadır.

## Bağlam ve yükleme

Oyun tek AudioContext sahibi olabilir; motor `audioContext` ve `destination`
ile o bağlama ve hedefe bağlanır. Bağlam yaratma, kilit açma ve platform
yaşam döngüsü tüketiciye aittir. Motor kaynak, mixer, buffer cache ve kendi
aboneliklerini dispose ile bırakır; dışarıdan verilen bağlamı sahiplenmez.

Track kimliği benzersizdir. Stem kaynak URL ya da AudioBuffer taşır;
OGG çözümü başarısızsa loader MP3 alternatifini deneyebilir. URL cache'i
kaynakla, doğrudan buffer cache'i track ve stem kimliğiyle kapsamlanır;
aynı adlı iki stem karışmaz. Reddedilen yükleme Promise'i kalıcı cache
olmaz.

`loadTrack` en az bir çalınabilir stem olup olmadığını bildirir. Tek bozuk
stem veya cue sağlam olanları kilitlemez. Tüketici liste yüklemesinde
allSettled benzeri yaklaşım ve yalnız başarılı trackleri kullanır.

```ts
import { MusicEngine, type MusicTrack } from '@volstudio/core/audio/music';

const track: MusicTrack = {
  id: 'track-a',
  bpm: 90,
  stems: [{ id: 'layer-a', src: 'assets/audio/music/track-a.ogg', loop: true }],
};
const music = new MusicEngine({ audioContext, destination, compressor: false });
if (await music.loadTrack(track)) await music.play('track-a');
```

## State ve kazanç

Stem gain temel seviyedir; gainMap sayısal state eşiklerini interpolate eder
veya sembolik değeri haritalar. `setState` ve `setIntensity` kazancı smooth
fade ile uygular. State'in oyun anlamını motor bilmez. `mute(false)` son
ayarlı master seviyesine döner, birim seviyeye sıfırlamaz.

Play ve geçişler önce hedefin çalınabilirliğini doğrular. Hedef boşsa mevcut
parça korunur. Aynı parçada play yeniden başlatmaz fakat verilen state'i
uygular. Eşzamanlı asenkron play/geçiş/stop içinde son istek kazanır; eski
istek ortak durumu yeniden yazamaz. Fade lineer rampayla tam hedefe varır.

## MusicEngine API

| Metot                                       | Sözleşme                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| `loadTrack(track)`                          | Stem ve cue tamponlarını yükler; en az bir stem başarıyla yüklendiyse true |
| `play(trackId, options?)`                   | Çalınabilir hedefi doğrular ve ortak zamanda başlatır                      |
| `stop(options?)`                            | Kaynakları fade ile durdurur                                               |
| `crossfadeTo(trackId, duration?, options?)` | Hemen veya açık ölçü hizasında parçaya geçer                               |
| `playStinger(cueId, options?)`              | Loop'u kesmeden hizalı tek vurgu çalar                                     |
| `playOutro()`                               | Sonraki ölçüde loop'u bırakıp bitiş cue'sunu çalar                         |
| `transitionTo(trackId, options)`            | Geçiş cue'su sonrası hedefi hizalı başlatır                                |
| `setState(state, fadeTime?)`                | Adaptif stem state'ini günceller                                           |
| `setIntensity(value, fadeTime?)`            | Yoğunluk değerini günceller                                                |
| `setMasterVolume(value, fadeTime?)`         | Master seviyeyi değiştirir                                                 |
| `mute(muted, fadeTime?)`                    | Susturur veya son ayarlı seviyeye döner                                    |
| `getCurrentState()`                         | Track, state ve çalma durumunu verir                                       |
| `dispose()`                                 | Kaynak, cache, mixer ve abonelikleri bırakır                               |

## Çapraz Geçiş

`crossfadeTo` varsayılan olarak hemen başlar. `bars` verilirse geçiş
belirtilen ölçü sınırına hizalanır; duration geçiş süresidir, bekleme süresi
değildir. Boş hedef mevcut müziği durdurmaz.

## Cue ve müzikal zaman

Giriş cue'su play ile başlar; loop girişin bars uzunluğu sonrasında aynı
örnek zamanında girer. Ölçü ızgarası giriş başlangıcından sayılır, kuyruk
loop'un ilk ölçüsüne taşabilir.

Stinger varsayılan ölçü sınırında, seçilirse vuruşta veya lookahead kadar
sonra çalar. Outro sonraki ölçüde loop'u kısa fade ile bırakır; doğal bitiş
onTrackEnd bildirir, bu arada stop gelirse doğal bitiş bildirimi yapılmaz.
Transition hedefi önce doğrular, cue'yu hizalar, hedefi cue uzunluğunun
ardından başlatır. Yüklenmeyen cue sağlam track'i düşürmez.

MusicScheduler'da bpm dörtlük başınadır:
beatDuration = (60 / bpm) × (4 / timeSignature[1]),
barDuration = beatDuration × timeSignature[0]. Tempo pozitif, ölçü geçerli
olmalıdır. Spec bpm'i ölçü birimi başına vuruştur; 6/8'de sekizliktir.
`toMusicTrack` dönüşümü tek yerde yapar; iki taraf yuvarlamayı yeniden yazmaz.

## Asset sözleşmesi

`MusicAssetSpecV1` üretim ve runtime'ın ortak tipidir. Ölçüden frame'e
`barsToFrames`, doğrulamaya `validateMusicAssetSpec`, track dönüşümüne
`toMusicTrack`, mastering uyumuna `assertEngineCompatible` karşılık gelir.
`MASTERING_PATHS` ve `MUSIC_RUNTIME_CAPABILITIES` kabul edilen yolları taşır.
Cue spec'i giriş, bitiş, stinger ve transition alanlarına açılır.

Motor kompresörünün beyanı offline mastering ile eşleşir. Kompresörsüz
ölçülen asset'i kompresör açık motorla çalmak uyumsuzdur; gönderilen ölçü
hissedilen output'u temsil etmez. Bundle'ın engine.compressor değeri motor
kurulumuna taşınır.

Yeni ses kanonik audio-synth müzik yayınından geçer. Bundle ve OGG tüketici
paketindedir; build'in girdisi gönderilmiş assettir. Kaynak, render ve
ara WAV çalışma zamanına girmez. Dosya URL dönüşümü tüketicide yapılır;
`pnpm exec just audio-verify` program kimliği ve teslimi doğrular.

## Yaşam döngüsü ve sınırlar

Motor duraklatma, uyanış ve sahne kapanışına tüketici tarafından bağlanır.
Parça listesi, yollar ve oyun state eşlemesi tüketicinin config verisidir.
Adaptive gain dışında canlı arrange, MIDI, beatmatching, DAW/VST ve canlı
sentez yüzeyi yoktur. Codec/decode ve ses çıkışı gerçek hedefte ayrıca
doğrulanır; ses yayınının teknik QA sahibi audio-synth paketidir.

Çalma, yükleme, cache, geçiş ve scheduler CORE testleriyle korunur.
Üretim/yayın doğrulaması [audio-synth](../../devtools/audio-synth/README.md)
sorumluluğundadır.
