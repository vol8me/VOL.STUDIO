import type { MusicState, MusicTrack, Stem, StemGainMap } from './types';

/**
 * Müzik asset'inin TEK kaynağı: üretim aracı da çalışma zamanı da bu saf
 * belgeden türetir. İki ayrı gerçeğin (üretimde bir bar hesabı, runtime'da
 * başka bir loop süresi) ayrışması dosyanın sonunda duyulur ve hiçbir test
 * yakalamaz; burada `barsToFrames` tek fonksiyondur ve ikisi de onu çağırır.
 */
export const MUSIC_ASSET_SPEC_SCHEMA = 'MusicAssetSpecV1';

export type MusicPlaybackMode = 'loop' | 'playlistOneShot' | 'adaptiveLoop';

/** Çalma modeline göre zorunlu mastering yolu; üretim bunu beyan eder, kapı doğrular. */
export const MASTERING_PATHS: Readonly<Record<MusicPlaybackMode, string>> = {
  loop: 'loop-cyclic',
  playlistOneShot: 'one-shot-limited',
  adaptiveLoop: 'stem-linear',
};

/**
 * Çalışma zamanının GERÇEKTEN yapabildikleri. Geçiş sözleşmesi bu listeye
 * bakar; motor bir gün stinger kazanırsa değişecek tek yer burasıdır.
 */
export const MUSIC_RUNTIME_CAPABILITIES = {
  transitions: ['crossfade', 'fade-stop', 'playlist-gap'] as const,
  /** Dikey katmanlama state'e bağlıdır; bar/beat'e duyarlı gain yoktur. */
  verticalLayering: 'state-only',
  /** Loop noktaları PARÇA düzeyindedir: bütün stem'ler aynı loop aralığını paylaşır. */
  loop: 'track-level',
  /** Bar hizalaması yalnız ÇALAN parçanın ızgarasında hesaplanır. */
  barAlignment: 'source-grid',
  stingers: false,
  sectionJump: false,
  keyAwareTransitions: false,
  tempoChange: false,
} as const;

export interface MusicStemSpecV1 {
  readonly id: string;
  readonly file: string;
  readonly frames: number;
  readonly gain?: number;
  readonly gainMap?: StemGainMap;
}

export interface MusicTransitionSpecV1 {
  readonly id: string;
  readonly kind: 'crossfade' | 'fade-stop' | 'playlist-gap';
  readonly seconds: number;
  /** `crossfade` için bar hizası; 0 = hemen. */
  readonly bars?: number;
  readonly to?: string;
}

export interface MusicAssetSpecV1 {
  readonly schema: typeof MUSIC_ASSET_SPEC_SCHEMA;
  readonly musicId: string;
  readonly bpm: number;
  readonly meter: readonly [number, number];
  readonly bars: number;
  readonly sampleRate: number;
  readonly frames: number;
  readonly playback: MusicPlaybackMode;
  readonly loop?: { readonly startBar: number; readonly endBar: number };
  readonly runtimeGain: number;
  readonly mastering: {
    readonly path: string;
    readonly gainDb: number;
    readonly integratedLufs: number;
    readonly truePeakDbtp: number;
  };
  readonly stems: readonly MusicStemSpecV1[];
  readonly referenceMix?: { readonly file: string; readonly frames: number };
  readonly transitions: readonly MusicTransitionSpecV1[];
  /** Offline QA kompresörsüz ölçer; runtime kompresörü açıksa duyulan başka bir şeydir. */
  readonly engine: { readonly compressor: boolean };
  readonly states?: readonly { readonly id: string; readonly intensity: number }[];
}

export function beatDurationSeconds(bpm: number): number {
  return 60 / bpm;
}

export function barDurationSeconds(bpm: number, beatsPerBar: number): number {
  return beatDurationSeconds(bpm) * beatsPerBar;
}

/**
 * Ölçü → örnek. Yuvarlama TEK yerde yapılır: bpm × örnek oranı tam
 * bölünmediğinde üretimin ve runtime'ın farklı yuvarlaması loop dikişinde
 * duyulur bir tık bırakır.
 */
export function barsToFrames(
  bars: number,
  bpm: number,
  beatsPerBar: number,
  sampleRate: number,
): number {
  return Math.round(barDurationSeconds(bpm, beatsPerBar) * bars * sampleRate);
}

function fail(path: string, detail: string, value: unknown): never {
  throw new TypeError(`${path}: ${detail} (değer: ${String(value)})`);
}

function requireNumber(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    fail(path, `[${min}, ${max}] aralığında sayı olmalı`, value);
  }
  return value;
}

function requireText(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(path, 'metin olmalı', value);
  return value;
}

function checkGainMap(value: unknown, path: string): StemGainMap {
  if (typeof value !== 'object' || value === null) fail(path, 'nesne olmalı', value);
  const entries = value as Record<string, unknown>;
  const points = entries.intensity;
  if (!Array.isArray(points) || points.length < 2) {
    fail(`${path}.intensity`, 'en az iki eşik noktası olmalı', points);
  }
  for (const [i, raw] of points.entries()) {
    const point = raw as { threshold?: unknown; gain?: unknown };
    requireNumber(point.threshold, `${path}.intensity[${i}].threshold`, 0, 1);
    requireNumber(point.gain, `${path}.intensity[${i}].gain`, 0, 2);
  }
  return value as StemGainMap;
}

/** Belgeyi runtime'ın okuyabileceği kadar doğrular; ölçüm ve provenance üretimin işidir. */
export function validateMusicAssetSpec(value: unknown): MusicAssetSpecV1 {
  if (typeof value !== 'object' || value === null) fail('spec', 'nesne olmalı', value);
  const o = value as Record<string, unknown>;
  if (o.schema !== MUSIC_ASSET_SPEC_SCHEMA) fail('spec.schema', MUSIC_ASSET_SPEC_SCHEMA, o.schema);
  const playback = o.playback;
  if (playback !== 'loop' && playback !== 'playlistOneShot' && playback !== 'adaptiveLoop') {
    fail('spec.playback', 'loop | playlistOneShot | adaptiveLoop', playback);
  }
  const meter = o.meter;
  if (!Array.isArray(meter) || meter.length !== 2) fail('spec.meter', '[vuruş, birim]', meter);
  const bpm = requireNumber(o.bpm, 'spec.bpm', 20, 300);
  const beatsPerBar = requireNumber(meter[0], 'spec.meter[0]', 1, 32);
  const sampleRate = requireNumber(o.sampleRate, 'spec.sampleRate', 8000, 384000);
  const bars = requireNumber(o.bars, 'spec.bars', 1, 512);
  const frames = requireNumber(o.frames, 'spec.frames', 1, Number.MAX_SAFE_INTEGER);
  const stems = o.stems;
  if (!Array.isArray(stems) || stems.length === 0) fail('spec.stems', 'en az bir stem', stems);
  for (const [i, raw] of stems.entries()) {
    const stem = raw as Record<string, unknown>;
    requireText(stem.id, `spec.stems[${i}].id`);
    requireText(stem.file, `spec.stems[${i}].file`);
    requireNumber(stem.frames, `spec.stems[${i}].frames`, 1, Number.MAX_SAFE_INTEGER);
    if (stem.gainMap !== undefined) checkGainMap(stem.gainMap, `spec.stems[${i}].gainMap`);
  }
  if (playback === 'adaptiveLoop' && stems.length < 3) {
    fail('spec.stems', 'adaptiveLoop en az 3 stem ister', stems.length);
  }
  if (playback !== 'playlistOneShot' && o.loop === undefined) {
    fail('spec.loop', 'loop ve adaptiveLoop loop aralığı ister', o.loop);
  }
  const mastering = o.mastering as Record<string, unknown> | undefined;
  if (!mastering || mastering.path !== MASTERING_PATHS[playback]) {
    fail('spec.mastering.path', MASTERING_PATHS[playback], mastering?.path);
  }
  const grid = barsToFrames(bars, bpm, beatsPerBar, sampleRate);
  // Loop örnek-tam olmalı; tek seferlik cue sonda kuyruk taşıyabilir.
  if (playback === 'playlistOneShot' ? frames < grid : frames !== grid) {
    fail('spec.frames', `${bars} ölçü ${grid} örnek eder`, frames);
  }
  return value as MusicAssetSpecV1;
}

export interface MusicTrackOptions {
  /** Stem dosyasını çalınabilir bir URL'ye çevirir (paket köküne göre). */
  readonly resolve: (file: string) => string;
  readonly defaultState?: MusicState;
}

/**
 * Spec'i motorun çaldığı `MusicTrack`e çevirir. Loop aralığı ölçüden
 * türetilir ve SANİYE olarak verilir; `AudioBufferSourceNode` saniye okur.
 */
export function toMusicTrack(spec: MusicAssetSpecV1, options: MusicTrackOptions): MusicTrack {
  const beatsPerBar = spec.meter[0];
  const stems: Stem[] = spec.stems.map((stem) => ({
    id: stem.id,
    src: options.resolve(stem.file),
    ...(stem.gain === undefined ? {} : { gain: stem.gain }),
    loop: spec.playback !== 'playlistOneShot',
    ...(stem.gainMap === undefined ? {} : { gainMap: stem.gainMap }),
  }));
  const defaultState =
    options.defaultState ??
    (spec.states && spec.states.length > 0 ? { intensity: spec.states[0].intensity } : undefined);
  return {
    id: spec.musicId,
    bpm: spec.bpm,
    timeSignature: [spec.meter[0], spec.meter[1]],
    ...(spec.loop
      ? {
          loopStart: barDurationSeconds(spec.bpm, beatsPerBar) * spec.loop.startBar,
          loopEnd: barDurationSeconds(spec.bpm, beatsPerBar) * spec.loop.endBar,
        }
      : {}),
    stems,
    ...(defaultState ? { defaultState } : {}),
  };
}

/**
 * Master kompresörü offline ölçümü geçersiz kılar: −24 dB eşik ve 12 oran,
 * −14 LUFS'e getirilmiş bir parçayı ezer. Spec kompresörsüz ölçüldüyse
 * motor da kompresörsüz kurulmalıdır.
 */
export function assertEngineCompatible(
  spec: MusicAssetSpecV1,
  options: { readonly compressor?: boolean },
): void {
  const enabled = options.compressor !== false;
  if (enabled !== spec.engine.compressor) {
    throw new Error(
      `${spec.musicId}: spec kompresör=${spec.engine.compressor} bekliyor, motor kompresör=${enabled} ile kuruldu`,
    );
  }
}
