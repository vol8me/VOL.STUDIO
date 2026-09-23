import type { LayerRole } from './roles';

/**
 * SoundOntology — ses MEKANİZMALARININ kapalı sözlüğü ve kabiliyet matrisi.
 * Agent her istekte registry'yi baştan keşfetmez: bir mekanizmanın hangi
 * yapı taşlarıyla üretildiği (`providers`), grafikte hangi rolü aldığı ve
 * önerilen başlangıç zinciri (`recipe`) burada VERİDİR. Sağlayıcısı olmayan
 * mekanizma `unsupported`tır ve öyle raporlanır — planlayıcı onu başka bir
 * yapı taşıyla taklit edip uydurmaz. Sağlayıcı kimliklerinin registry'de
 * var olduğunu governance testi sınar.
 *
 * `terms` bir brief'in betimleyici/niyet sözcüklerinden mekanizmaya giden
 * DETERMİNİSTİK sözlüktür (Türkçe + İngilizce, küçük harf). Anlamı belirsiz
 * sözcükler (ör. `fire`: ateş etmek | yangın, `ateş`) bilerek eşlenmez;
 * çok sözcüklü terimler (`tank fire`) sözcük dizisi olarak eşleşir.
 */
export const ONTOLOGY_VERSION = 1;

export interface MechanismRecipeV1 {
  /** Katmanın kaynağı ve (varsa) zinciri — önerilen başlangıç topolojisi. */
  readonly source?: string;
  readonly resonators?: readonly string[];
  readonly articulation?: string;
  /** Zamana yayılan mekanizma (kuyruk/alan): katman değil, send alan bus efekti. */
  readonly busEffect?: string;
  /** Kaynağa verilen başlangıç parametreleri (registry sınırları içinde). */
  readonly params?: Readonly<Record<string, number | string>>;
  /** Rezonatör başına başlangıç parametreleri (`resonators` ile aynı sıra). */
  readonly resonatorParams?: readonly Readonly<Record<string, number | string>>[];
}

export interface MechanismV1 {
  readonly id: string;
  readonly description: string;
  /** Mekanizmayı üreten registry kimlikleri; boşsa `unsupported`. */
  readonly providers: readonly string[];
  /** Registry dışı üretim hattı (ör. müzik). */
  readonly pipelines?: readonly string[];
  readonly role: LayerRole;
  readonly recipe: MechanismRecipeV1 | null;
}

const m = (
  id: string,
  role: LayerRole,
  description: string,
  providers: readonly string[],
  recipe: MechanismRecipeV1 | null,
  pipelines?: readonly string[],
): MechanismV1 => ({
  id,
  role,
  description,
  providers,
  recipe,
  ...(pipelines ? { pipelines } : {}),
});

export const MECHANISMS: readonly MechanismV1[] = [
  m(
    'impact',
    'transient',
    'Katı cisim çarpışması: temas darbesi + gövde modları.',
    ['source.contact', 'exciter.impact', 'resonator.material', 'resonator.modal'],
    { source: 'source.contact' },
  ),
  m(
    'pressure',
    'body',
    'Basınç dalgası gövdesi: alçak frekans itki (Friedlander).',
    ['source.pressure-wave', 'archetype.pressure-event'],
    { source: 'source.pressure-wave' },
  ),
  m(
    'explosion',
    'body',
    'Türbülanslı patlama/blast gürültüsü, zamanla kararan bant.',
    ['source.blast', 'archetype.pressure-event'],
    { source: 'source.blast' },
  ),
  m(
    'discharge',
    'transient',
    'Kısa enerji boşalması: ark/deşarj + basınç sıçraması.',
    ['source.electrical', 'archetype.pressure-event'],
    { source: 'source.electrical', params: { arcs: 0.8, hum: 0.1 } },
  ),
  m(
    'debris',
    'detail',
    'Parça/döküntü mikro olayları.',
    ['source.micro-events', 'source.contact'],
    { source: 'source.micro-events', params: { event: 'click', rate: 60 } },
  ),
  m(
    'mechanical',
    'mechanism',
    'Mekanizma: tetik, sürgü, mandal, küçük metal temaslar.',
    ['source.contact', 'source.machine', 'archetype.launcher'],
    { source: 'source.contact', params: { materialA: 'metal', materialB: 'metal', mass: 0.05 } },
  ),
  m(
    'motor',
    'body',
    'Döngüsel makine: motor, fan/rotor, dişli (RPM tabanlı).',
    ['source.machine'],
    { source: 'source.machine' },
  ),
  m(
    'airflow',
    'body',
    'Hava/gaz akışı: basınç, ağız, akış hızı, türbülans.',
    ['source.airflow', 'exciter.turbulence'],
    { source: 'source.airflow' },
  ),
  m(
    'turbulence',
    'texture',
    'Türbülans gürültüsü (akış hızıyla ölçeklenen).',
    ['exciter.turbulence', 'source.airflow'],
    { source: 'exciter.turbulence' },
  ),
  m('hiss', 'detail', 'Tıslama: dar ağızdan yüksek hızlı akış, tiz bant.', ['source.airflow'], {
    source: 'source.airflow',
    params: { aperture: 1, sibilance: 0.8 },
  }),
  m(
    'sibilant-resonance',
    'detail',
    'Sıskırıcı rezonans: 4–9 kHz dar bant tepesi.',
    ['resonator.formant', 'resonator.biquad', 'source.airflow'],
    {
      source: 'exciter.turbulence',
      resonators: ['resonator.biquad'],
      params: { brightness: 0.9 },
      resonatorParams: [{ mode: 'bandpass', frequency: 6500, q: 4 }],
    },
  ),
  m('whistle', 'tonal', 'Kenar tonu/ıslık: Strouhal frekansında dar bant.', ['source.airflow'], {
    source: 'source.airflow',
    params: { turbulence: 0.1 },
  }),
  m(
    'friction',
    'body',
    'Sürtünme: sürekli temas gürültüsü + mikro takılmalar.',
    ['source.friction'],
    { source: 'source.friction' },
  ),
  m(
    'scrape',
    'body',
    'Kazıma: pürüzlü yüzeyde hızla değişen mikro temaslar.',
    ['source.friction'],
    { source: 'source.friction', params: { roughness: 0.8 } },
  ),
  m(
    'rolling',
    'body',
    'Yuvarlanma: dönme hızına bağlı düzenli-düzensiz temaslar.',
    ['source.friction'],
    { source: 'source.friction', params: { rolling: 0.9 } },
  ),
  m(
    'electrical',
    'body',
    'Elektrik: şebeke uğultusu, vızıltı, ark çatırtısı, yükleme.',
    ['source.electrical'],
    { source: 'source.electrical' },
  ),
  m(
    'fluid',
    'texture',
    'Sıvı: kabarcık, damla, çalkantı (Minnaert).',
    ['source.bubble', 'source.bubbles', 'source.gurgle'],
    { source: 'source.bubbles' },
  ),
  m(
    'vocal',
    'tonal',
    'Biyolojik ses kaynağı: glottal darbe + formant/tüp.',
    ['source.glottal', 'resonator.formant', 'resonator.tube', 'archetype.vocal-tube'],
    {
      source: 'source.glottal',
      resonators: ['resonator.formant'],
      articulation: 'articulation.envelope',
    },
  ),
  m('speech', 'tonal', 'Anlaşılır konuşma (fonem/artikülasyon dizisi).', [], null),
  m(
    'tonal',
    'tonal',
    'Perdeli ton: osilatör, modal çınlama, örneklenmiş nota.',
    ['source.oscillator', 'resonator.modal', 'source.sampler'],
    { source: 'source.oscillator', articulation: 'articulation.envelope' },
  ),
  m('noise', 'texture', 'Geniş bant gürültü.', ['source.noise'], {
    source: 'source.noise',
    articulation: 'articulation.envelope',
  }),
  m(
    'ui',
    'tonal',
    'Arayüz geri bildirimi: kısa, temiz, bant sınırlı ton.',
    ['source.oscillator', 'articulation.envelope', 'effect.eq-pass'],
    { source: 'source.oscillator', articulation: 'articulation.envelope' },
  ),
  m(
    'retro',
    'tonal',
    'Retro/dijital karakter: basamaklı perde, bit/örnek indirgeme.',
    ['source.oscillator', 'effect.bitcrush'],
    { source: 'source.oscillator', articulation: 'articulation.envelope' },
  ),
  m('musical', 'tonal', 'Müzik: score, bölüm, stem (ayrı üretim hattı).', [], null, [
    'MusicProgramV1',
  ]),
  m(
    'tail',
    'tail',
    'Kuyruk: çevre yankısı/gecikme — send alan bus.',
    ['effect.reverb', 'effect.convolution', 'effect.delay'],
    { busEffect: 'effect.reverb' },
  ),
  m(
    'space',
    'space',
    'Alan: oda/IR tepkisi — send alan bus.',
    ['effect.reverb', 'effect.convolution'],
    { busEffect: 'effect.reverb' },
  ),
  m('wind', 'texture', 'Rüzgar: çok ölçekli esinti, spektral hareket.', ['source.wind'], {
    source: 'source.wind',
  }),
  m('rain', 'texture', 'Yağmur: damla nüfusu + zemin hışırtısı.', ['source.rain'], {
    source: 'source.rain',
  }),
  m('fire', 'texture', 'Yanma: çatırtı olayları + alçak uğultu + tıslama.', ['source.fire'], {
    source: 'source.fire',
  }),
  m(
    'sampled',
    'body',
    'Kayıttan kaynak: sample, sampler bankası, granular bulut.',
    ['source.sample', 'source.sampler', 'source.granular'],
    null,
  ),
  m('doppler-motion', 'body', 'Hareketli kaynağın Doppler kayması ve konum yolu.', [], null),
];

/** Sözcük (ya da sözcük dizisi) → mekanizmalar. Sıra rapor gerekçesinde korunur. */
export const MECHANISM_TERMS: readonly (readonly [string, readonly string[]])[] = [
  ['tank fire', ['impact', 'pressure', 'mechanical', 'tail']],
  ['tank', ['impact', 'pressure', 'mechanical', 'tail']],
  ['cannon', ['impact', 'pressure', 'mechanical', 'tail']],
  ['top atışı', ['impact', 'pressure', 'mechanical', 'tail']],
  ['mortar', ['pressure', 'explosion', 'mechanical', 'tail']],
  ['havan', ['pressure', 'explosion', 'mechanical', 'tail']],
  ['explosion', ['explosion', 'pressure', 'debris', 'tail']],
  ['patlama', ['explosion', 'pressure', 'debris', 'tail']],
  ['blast', ['explosion', 'pressure', 'tail']],
  ['launcher', ['pressure', 'mechanical', 'discharge', 'tail']],
  ['fırlatıcı', ['pressure', 'mechanical', 'discharge', 'tail']],
  ['rocket', ['pressure', 'airflow', 'tail']],
  ['roket', ['pressure', 'airflow', 'tail']],
  ['turret', ['mechanical', 'pressure', 'impact']],
  ['taret', ['mechanical', 'pressure', 'impact']],
  ['snake', ['airflow', 'hiss', 'sibilant-resonance']],
  ['yılan', ['airflow', 'hiss', 'sibilant-resonance']],
  ['hiss', ['hiss', 'airflow']],
  ['tıslama', ['hiss', 'airflow']],
  ['steam', ['airflow', 'hiss']],
  ['buhar', ['airflow', 'hiss']],
  ['pneumatic', ['airflow', 'mechanical']],
  ['pnömatik', ['airflow', 'mechanical']],
  ['whistle', ['whistle', 'airflow']],
  ['ıslık', ['whistle', 'airflow']],
  ['breath', ['airflow']],
  ['nefes', ['airflow']],
  ['wind', ['wind']],
  ['rüzgar', ['wind']],
  ['rain', ['rain']],
  ['yağmur', ['rain']],
  ['campfire', ['fire']],
  ['yangın', ['fire']],
  ['alev', ['fire']],
  ['flame', ['fire']],
  ['combustion', ['fire']],
  ['laser', ['electrical', 'discharge']],
  ['lazer', ['electrical', 'discharge']],
  ['energy', ['electrical', 'discharge']],
  ['enerji', ['electrical', 'discharge']],
  ['plasma', ['electrical', 'discharge']],
  ['electric', ['electrical']],
  ['elektrik', ['electrical']],
  ['hum', ['electrical']],
  ['arc', ['electrical', 'discharge']],
  ['ark', ['electrical', 'discharge']],
  ['spark', ['electrical']],
  ['kıvılcım', ['electrical']],
  ['engine', ['motor', 'mechanical']],
  ['motor', ['motor', 'mechanical']],
  ['fan', ['motor']],
  ['rotor', ['motor']],
  ['gear', ['motor', 'mechanical']],
  ['dişli', ['motor', 'mechanical']],
  ['scrape', ['scrape', 'friction']],
  ['kazıma', ['scrape', 'friction']],
  ['drag', ['friction']],
  ['sürükleme', ['friction']],
  ['friction', ['friction']],
  ['sürtünme', ['friction']],
  ['rolling', ['rolling']],
  ['yuvarlanma', ['rolling']],
  ['impact', ['impact']],
  ['hit', ['impact']],
  ['darbe', ['impact']],
  ['vuruş', ['impact']],
  ['çarpma', ['impact']],
  ['knock', ['impact']],
  ['water', ['fluid']],
  ['su', ['fluid']],
  ['bubble', ['fluid']],
  ['kabarcık', ['fluid']],
  ['splash', ['fluid']],
  ['damla', ['fluid']],
  ['drip', ['fluid']],
  ['debris', ['debris']],
  ['enkaz', ['debris']],
  ['rubble', ['debris']],
  ['creature', ['vocal']],
  ['yaratık', ['vocal']],
  ['growl', ['vocal']],
  ['hırlama', ['vocal']],
  ['roar', ['vocal']],
  ['kükreme', ['vocal']],
  ['speech', ['speech']],
  ['konuşma', ['speech']],
  ['button', ['ui']],
  ['buton', ['ui']],
  ['confirm', ['ui']],
  ['onay', ['ui']],
  ['menu', ['ui']],
  ['menü', ['ui']],
  ['ui', ['ui']],
  ['retro', ['retro']],
  ['8-bit', ['retro']],
  ['chiptune', ['retro']],
  ['music', ['musical']],
  ['müzik', ['musical']],
  ['reverb', ['tail']],
  ['echo', ['tail']],
  ['yankı', ['tail']],
  ['hall', ['space']],
  ['cave', ['space']],
  ['mağara', ['space']],
  ['noise', ['noise']],
  ['gürültü', ['noise']],
  ['beep', ['tonal']],
  ['bip', ['tonal']],
  ['doppler', ['doppler-motion']],
  ['flyby', ['doppler-motion']],
];

/** Sözcük → materyal (planlayıcı materyal kabul eden tariflere geçirir). */
export const MATERIAL_TERMS: readonly (readonly [string, string])[] = [
  ['metal', 'metal'],
  ['metallic', 'metal'],
  ['steel', 'metal'],
  ['çelik', 'metal'],
  ['iron', 'metal'],
  ['demir', 'metal'],
  ['wood', 'wood'],
  ['wooden', 'wood'],
  ['ahşap', 'wood'],
  ['tahta', 'wood'],
  ['glass', 'glass'],
  ['cam', 'glass'],
  ['stone', 'stone'],
  ['taş', 'stone'],
  ['rock', 'stone'],
  ['kaya', 'stone'],
  ['ceramic', 'ceramic'],
  ['seramik', 'ceramic'],
  ['plastic', 'hard-plastic'],
  ['plastik', 'hard-plastic'],
  ['rubber', 'rubber'],
  ['lastik', 'rubber'],
  ['cloth', 'cloth'],
  ['kumaş', 'cloth'],
  ['flesh', 'flesh'],
  ['et', 'flesh'],
];

export function mechanismById(id: string): MechanismV1 | undefined {
  return MECHANISMS.find((mechanism) => mechanism.id === id);
}

export type MechanismStatus = 'supported' | 'pipeline' | 'unsupported';

export function mechanismStatus(mechanism: MechanismV1): MechanismStatus {
  if (mechanism.providers.length > 0) return 'supported';
  return mechanism.pipelines && mechanism.pipelines.length > 0 ? 'pipeline' : 'unsupported';
}

/** Kabiliyet matrisi: mekanizma → durum, rol ve sağlayıcılar (context'in okuduğu biçim). */
export function capabilityMatrix() {
  return {
    version: ONTOLOGY_VERSION,
    mechanisms: MECHANISMS.map((mechanism) => ({
      id: mechanism.id,
      status: mechanismStatus(mechanism),
      role: mechanism.role,
      description: mechanism.description,
      providers: [...mechanism.providers].sort(),
      ...(mechanism.pipelines ? { pipelines: mechanism.pipelines } : {}),
      recipe: mechanism.recipe,
    })),
  };
}
