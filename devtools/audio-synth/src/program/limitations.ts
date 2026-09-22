import type { ResolvedProgram } from './schema';

/**
 * Bilinen sınırlamalar — agent'a `context` çıktısıyla açılır. Her kayıt
 * ölçülmüş bir durumdur ya da bilinçli bir kapsam kararıdır; "yakında"
 * vaadi değildir. `affects` registry kimliklerine ya da protokol yüzeyine
 * işaret eder.
 */
export interface KnownLimitation {
  readonly id: string;
  readonly affects: readonly string[];
  readonly description: string;
}

export const KNOWN_LIMITATIONS: readonly KnownLimitation[] = [
  {
    id: 'polyblep-alias',
    affects: ['source.oscillator'],
    description:
      'Testere/kare PolyBLEP (2 örnek) ile düzeltilir ve program oranında aşırı örneklemesiz ' +
      'çalışır; 44.1 kHz iç oranda ölçülen alias/sinyal 917 Hz −54 dB, 3.6 kHz −47 dB. Parlak ' +
      'perdeli içerikte 1 kHz üstünde sinüs/üçgen ya da bant sınırlı bir kaynak tercih edilir.',
  },
  {
    id: 'no-true-peak-limiter',
    affects: ['master'],
    description:
      'Master tepe normalize eder, true-peak sınırlayıcı YOKTUR. Kodek sonrası −1 dBTP ' +
      'politikası kaynak seviyesiyle (ör. peakDbfs ≤ −3) karşılanır; publish kapısı ihlali ' +
      'reddeder, düzeltmez.',
  },
  {
    id: 'music-single-tempo',
    affects: ['MusicProgramV1'],
    description:
      'Program başına TEK tempo ve TEK ölçü vardır: hem düzenleme ızgarası hem çalışma ' +
      'zamanı zamanlayıcısı tek ızgara varsayar. Tempo/ölçü değişimi sessizce yanlış ' +
      'hizalanmaktansa şema düzeyinde reddedilir.',
  },
  {
    id: 'music-runtime-transitions',
    affects: ['MusicAssetSpecV1'],
    description:
      'Çalışma zamanı yalnız bar hizalı crossfade, sönümlü durdurma ve playlist boşluğu ' +
      'yapar. Stinger, parça içi bölüm atlama ve farklı tempolar arası vuruş hizası YOKTUR; ' +
      'bunları isteyen geçiş `unsupported-by-runtime` ile reddedilir. Tonal ilişki beyanı ' +
      'belgelenir ama motor onu uygulamaz.',
  },
  {
    id: 'music-percussion-thin',
    affects: ['MusicProgramV1', 'preset:*'],
    description:
      'Enstrüman kaydında perküsyon rolü yalnız 3 preset taşır (ölçüldü); ritim bölümü ' +
      'melodik enstrümanlarla kurulur. Parametrik davul ailesi Dalga 11 kapsamındadır.',
  },
  {
    id: 'music-no-listening-validation',
    affects: ['MusicProgramV1', 'MusicBundleV1'],
    description:
      'Müzik yolu yalnız ölçülen değerlerle doğrulandı: sembolik uygunluk, yükseklik, ' +
      'true peak, stem paritesi ve kodlanmış hiza. İnsan dinlemesi yapılmadı; "iyi müzik" ' +
      'iddiası yoktur.',
  },
  {
    id: 'determinism-scope',
    affects: ['AcousticProgramV1'],
    description:
      'Aynı program + tohum + render/düğüm sürümü aynı PCM özetini verir: V8’in fdlibm ' +
      'tabanlı Math fonksiyonları platformdan bağımsızdır, ama farklı bir Node/V8 ana ' +
      'sürümünde bit eşitliği ölçülmeden varsayılmaz; manifest runtime sürümünü kaydeder.',
  },
  {
    id: 'encoder-bytes',
    affects: ['AudioAssetManifestV1'],
    description:
      'OGG baytları FFmpeg/libvorbis sürümüne bağlıdır. Kanonik kimlik PCM özetidir; aynı ' +
      'PCM farklı araç zinciriyle farklı baytlar verebilir ve bu "yalnız kodlayıcı" değişikliği ' +
      'olarak sınıflanır.',
  },
  {
    id: 'bubble-model-domain',
    affects: ['source.bubble', 'source.bubbles', 'source.gurgle'],
    description:
      'Minnaert rezonansı yüzey gerilimi ve ısıl etkileri ihmal eder (0.1–20 mm aralığında ' +
      'geçerli); sönüm/yükselme van den Doel (2005) uydurmasıdır. Kabarcık genliği ∝ √R ' +
      'fiziksel değil, nüfus karışımı için seçilmiş sezgisel ölçektir.',
  },
  {
    id: 'glottal-not-lf',
    affects: ['source.glottal'],
    description:
      'Kaynak LF/Rosenberg glottal akış modeli DEĞİLDİR: BLIT darbe dizisi + tek kutuplu ' +
      'eğimdir. Açık faz oranı ve kapanma keskinliği ayrı parametre değildir.',
  },
  {
    id: 'waveguide-simplified',
    affects: ['resonator.tube'],
    description:
      'Tek döngülü tüp: uç düzeltmesi, ışınım empedansı, tüp kesit değişimi ve ikinci ' +
      'boyut modları yoktur; kesirli gecikme doğrusal ara değerle okunur (yüksek frekans ' +
      'kaybı ve küçük akort hatası kısa tüpte artar).',
  },
  {
    id: 'no-listening-validation',
    affects: ['archetype.*', 'source.glottal'],
    description:
      'Archetype ve vokal program aileleri yalnız ölçülen fiziksel/spektral özelliklerle ' +
      'doğrulandı; insan dinlemesi yapılmadı. "Gerçekçi/doğal/ikna edici" iddiası yoktur.',
  },
  {
    id: 'event-cap',
    affects: ['source.micro-events', 'source.bubbles'],
    description:
      'Katman başına en çok 20000 olay (MAX_EVENTS); sınırı aşan olaylar deterministik ' +
      'olarak kesilir. Olay maliyeti render öncesi bütçeden geçer.',
  },
];

/** PolyBLEP alias'ının ölçülüp duyulabilir bulunduğu bölge (bkz. `polyblep-alias`). */
export const POLYBLEP_RISK_HZ = 1000;

/**
 * Programın bilinen bir sınırlamanın ölçülmüş riskli bölgesine girip
 * girmediği. Muhafazakârdır: gesture/makro/modülasyona bağlı frekans en kötü
 * durumda eşiği aşabileceği için riskli sayılır. Riskli bir aday reddedilmez
 * ama raporda işaretlenir; hiçbir çıktı onu "production-safe" diye etiketlemez.
 */
export function limitationRisks(program: ResolvedProgram): string[] {
  const risks = new Set<string>();
  for (const layer of program.layers) {
    const { entry, params } = layer.source;
    if (entry.id !== 'source.oscillator') continue;
    if (params.waveform !== 'sawtooth' && params.waveform !== 'square') continue;
    const f = params.frequency;
    const fixed =
      typeof f === 'number'
        ? f
        : typeof f === 'object' &&
          typeof f.base === 'number' &&
          f.controls.length === 0 &&
          f.modulations.length === 0
        ? f.base
        : Infinity;
    if (fixed > POLYBLEP_RISK_HZ) risks.add('polyblep-alias');
  }
  return [...risks].sort();
}
