import type { Sha256 } from '../protocol/canonical';
import type { GrooveProfileV1 } from './groove';
import type { ChordV1, VoicingV1 } from './harmony';
import type { MusicMixV1 } from './mix';
import type { MotifTransformV1, MotifV1 } from './motif';
import type { Articulation, MusicPlayback, SectionRole } from './terms';
import type { ThemeOverrideV1 } from './themeBook';
import type { MusicTransitionV1 } from './transitions';

/**
 * Sembolik score/düzenlemenin kanonik, JSON-serileştirilebilir kaynağı.
 * Beste ad-hoc TypeScript döngülerinde kaybolmaz: tempo, ölçü, tonal sistem,
 * bölümler, armoni, motifler, şeritler, stem'ler, otomasyon ve geçiş
 * işaretleri burada yaşar; belge ses render edilmeden doğrulanabilir.
 *
 * Tek tempo, tek ölçü: hem `Timeline` hem çalışma zamanı zamanlayıcısı tek
 * ızgara varsayar. Tempo/ölçü değişimi sessizce yanlış hizalanmaktansa açık
 * bir sınırlama olarak reddedilir (bkz. `music-single-tempo`).
 */
export const MUSIC_PROGRAM_SCHEMA = 'MusicProgramV1';
export const MUSIC_PROGRAM_VERSION = 1;

export const MAX_BARS = 512;
export const MAX_LANES = 16;
export const MAX_SECTIONS = 32;
export const MAX_EVENTS_PER_PART = 512;

export interface LaneV1 {
  readonly id: string;
  readonly instrument: string;
  readonly stem: string;
  readonly pan?: number;
  readonly gain?: number;
  readonly groove?: string;
  readonly articulation?: Articulation;
  /** Dizi/akor kaynaklı perdeleri oktav kaydırır; açık nota adlarına dokunmaz. */
  readonly octave?: number;
}

export interface StemV1 {
  readonly id: string;
  readonly title?: string;
}

export interface RhythmStepV1 {
  readonly bar: number;
  readonly beat: number;
  readonly beats: number;
  readonly gain?: number;
}

export interface MotifPlacementV1 {
  readonly bar: number;
  readonly beat: number;
  readonly octave?: number;
}

export interface ExplicitNoteV1 {
  readonly bar: number;
  readonly beat: number;
  readonly beats: number;
  readonly note: string;
  readonly gain?: number;
}

export type PartV1 =
  | {
      readonly lane: string;
      readonly source: 'chord';
      readonly rhythm: readonly RhythmStepV1[];
      readonly voices?: readonly number[];
    }
  | {
      readonly lane: string;
      readonly source: 'motif';
      readonly motif: string;
      readonly transforms: readonly MotifTransformV1[];
      readonly placements: readonly MotifPlacementV1[];
      readonly beats: number;
    }
  | { readonly lane: string; readonly source: 'notes'; readonly notes: readonly ExplicitNoteV1[] };

export interface SectionV1 {
  readonly id: string;
  readonly role: SectionRole;
  /** `[başlangıç, bitiş)` — 0 tabanlı ölçü aralığı. */
  readonly bars: readonly [number, number];
  readonly targetEnergy: number;
  readonly lanes: readonly string[];
  readonly harmony?: { readonly voicing: VoicingV1; readonly chords: readonly ChordV1[] };
  readonly parts: readonly PartV1[];
}

export interface AutomationV1 {
  readonly lane: string;
  /** `[ölçü, dB]` noktaları; aralar doğrusal. */
  readonly points: readonly (readonly [number, number])[];
}

export const MARKER_KINDS = ['loop-start', 'loop-end', 'transition-point'] as const;
export type MarkerKind = (typeof MARKER_KINDS)[number];

export interface MarkerV1 {
  readonly bar: number;
  readonly kind: MarkerKind;
}

export interface MusicDeliveryV1 {
  readonly package: string;
  /** Paket-göreli dizin; stem asset'i `<assetDir>/<stem>.ogg`. */
  readonly assetDir: string;
  readonly runtimeKey?: string;
}

export interface AdaptiveStemV1 {
  readonly stem: string;
  readonly gainMap: {
    readonly intensity: readonly { readonly threshold: number; readonly gain: number }[];
  };
}

export interface MusicProgramV1 {
  readonly schema: typeof MUSIC_PROGRAM_SCHEMA;
  readonly musicId: string;
  readonly version: number;
  readonly title: string;
  readonly description: string;
  readonly seed: number;
  readonly playback: MusicPlayback;
  readonly tempo: { readonly bpm: number };
  readonly meter: readonly [number, number];
  readonly tonal: { readonly system: string; readonly root: string };
  readonly bars: number;
  readonly sampleRate: number;
  readonly themeBook?: { readonly id: string; readonly hash: Sha256 };
  readonly themeOverrides?: readonly ThemeOverrideV1[];
  readonly grooves: readonly GrooveProfileV1[];
  readonly motifs: readonly MotifV1[];
  readonly lanes: readonly LaneV1[];
  readonly stems: readonly StemV1[];
  readonly sections: readonly SectionV1[];
  readonly delivery: MusicDeliveryV1;
  readonly automation?: readonly AutomationV1[];
  readonly markers?: readonly MarkerV1[];
  readonly transitions?: readonly MusicTransitionV1[];
  readonly adaptive?: {
    readonly states: readonly { readonly id: string; readonly intensity: number }[];
    readonly stems: readonly AdaptiveStemV1[];
  };
  readonly mastering?: { readonly integratedLufs: number };
  /** Şerit → bus → send/return grafiği (akustik SoundGraph ile aynı çözücü; stem paritesi kurallı). */
  readonly mix?: MusicMixV1;
  /** Program bir arama adayından türediyse onun kimliği (bilgi; program bağlayıcıdır). */
  readonly provenance?: {
    readonly searchId: string;
    readonly candidateId: string;
    readonly reportHash: Sha256;
  };
}
