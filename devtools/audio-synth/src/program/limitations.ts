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
    id: 'music-brief-undefined',
    affects: ['AudioBriefV1'],
    description:
      "`kind: 'music'` Dalga 6 `MusicBriefV1` sözleşmesine ayrılmıştır ve bu sürümde " +
      '`unsupported` ile reddedilir; müzik bugün `Arrange.Timeline` ile yazılır, publish ' +
      'kapısından geçmez.',
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
];
