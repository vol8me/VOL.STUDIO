/**
 * Nota ve zaman yardımcıları — müzik script'leri frekansları Hz olarak değil
 * nota adıyla ('D2', 'Bb3') yazar; okunabilirlik ve transpoze kolaylığı için.
 */

const NOTE_OFFSETS: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};

/** Nota adını frekansa çevirir. Örn: 'A4' → 440, 'D2' → 73.42. */
export function hz(note: string): number {
  const match = /^([A-G][#b]?)(-?\d+)$/.exec(note);
  if (!match) throw new Error(`Geçersiz nota adı: ${note}`);
  const [, name, octaveRaw] = match;
  const offset = NOTE_OFFSETS[name ?? ''];
  if (offset === undefined) throw new Error(`Geçersiz nota adı: ${note}`);
  const midi = (Number(octaveRaw) + 1) * 12 + offset;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Frekansı yarım ton cinsinden kaydırır. */
export function transposeHz(frequency: number, semitones: number): number {
  return frequency * Math.pow(2, semitones / 12);
}

/** Bir vuruşun süresi (saniye). */
export function beatSec(bpm: number): number {
  return 60 / bpm;
}

/** Bir ölçünün süresi (saniye); `beatsPerBar` varsayılan 4. */
export function barSec(bpm: number, beatsPerBar = 4): number {
  return beatSec(bpm) * beatsPerBar;
}

/**
 * Nota olayı — müzik script'lerindeki desen tabloları bu tiple yazılır.
 * `beat` parça başından itibaren vuruş (0-based), `dur` vuruş cinsinden süre.
 */
export interface NoteEvent {
  note: string;
  /** Parça başından vuruş (0-based, float olabilir). */
  beat: number;
  /** Süre (vuruş). */
  dur: number;
  /** Voice'a geçilecek ek kazanç (0-1). Varsayılan 1. */
  gain?: number;
}

/**
 * Bir deseni belirli bir vuruş ofsetiyle tekrarlar — 8 barlık bir motifi
 * parçanın farklı bölümlerine kopyalarken kullanılır.
 */
export function repeatAt(pattern: NoteEvent[], beatOffset: number): NoteEvent[] {
  return pattern.map((event) => ({ ...event, beat: event.beat + beatOffset }));
}
