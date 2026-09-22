import { describe, expect, it } from 'vitest';
import { AudioParamError } from '../../src/guard/errors';
import { applyGroove, STRAIGHT_GROOVE, swingOffset, validateGroove } from '../../src/music/groove';
import { validateChord, validateVoicing, voiceChord } from '../../src/music/harmony';
import {
  applyTransforms,
  describeChain,
  validateMotif,
  validateTransform,
} from '../../src/music/motif';
import { musicProgramHash, lanesOfStem, validateMusicProgram } from '../../src/music/program';
import { eventsOfStem, expandProgram, scoreHash } from '../../src/music/score';
import {
  degreeToMidi,
  foldIntoRange,
  inSystem,
  isScaleName,
  midiToHz,
  midiToNote,
  noteToMidi,
  pitchClass,
  scaleNames,
  scaleSteps,
} from '../../src/music/tonal';
import { edited, referenceProgram, unitAdaptiveProgram, unitProgram } from './fixtures';

/*
 * Müzik testleri GERÇEK ses render eder; kapsam ölçümü (v8 + AST yeniden
 * eşleme) sentezi birkaç kat yavaşlatır ve 5 saniyelik varsayılan süre
 * dolar. Süre sınırı bu yüzden blok başına açıkça verilir — ölçülen bir
 * kısıt, keyfi bir sayı değil.
 */
const HEAVY = { timeout: 120_000 };

describe('perde aritmetiği', HEAVY, () => {
  it('nota adı ↔ MIDI ↔ Hz', () => {
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('A4')).toBe(69);
    expect(noteToMidi('Bb3')).toBe(58);
    expect(midiToNote(69)).toBe('A4');
    expect(midiToHz(69)).toBeCloseTo(440, 9);
    expect(midiToHz(57)).toBeCloseTo(220, 9);
    expect(pitchClass(61)).toBe(1);
  });

  it('geçersiz nota adı ve aralık dışı perde reddedilir', () => {
    expect(() => noteToMidi('H4')).toThrow(AudioParamError);
    expect(() => noteToMidi('C-2')).toThrow(/MIDI/);
  });

  it('dizi dereceleri oktav taşar', () => {
    const minor = scaleSteps('minor');
    expect(degreeToMidi(57, minor, 0)).toBe(57);
    expect(degreeToMidi(57, minor, 7)).toBe(69);
    expect(degreeToMidi(57, minor, -1)).toBe(55);
    expect(() => degreeToMidi(57, [], 0)).toThrow(AudioParamError);
  });

  it('sistem üyeliği ve aralığa katlama', () => {
    const minor = scaleSteps('minor');
    expect(inSystem(60, 57, minor)).toBe(true);
    expect(inSystem(58, 57, minor)).toBe(false);
    expect(foldIntoRange(40, 60, 84)).toBe(64);
    expect(foldIntoRange(96, 60, 84)).toBe(84);
    expect(isScaleName('dorian')).toBe(true);
    expect(isScaleName('bebop')).toBe(false);
    expect(scaleNames()).toContain('harmonicMinor');
  });
});

describe('armoni ve voicing', HEAVY, () => {
  const tonal = { rootMidi: 57, scale: scaleSteps('minor') };
  const voicing = validateVoicing(
    { voices: 3, spread: 'close', register: [52, 76], maxMovement: 7 },
    'v',
  );
  const chord = (overrides: Record<string, unknown> = {}) =>
    validateChord({ bar: 0, beat: 0, beats: 4, degree: 1, quality: 'triad', ...overrides }, 'c');

  it('akoru dizinin renginden kurar', () => {
    const voiced = voiceChord(chord(), tonal, voicing, null, 'c');
    expect(voiced.midis).toHaveLength(3);
    expect(voiced.midis.every((midi) => midi >= 52 && midi <= 76)).toBe(true);
    expect(voiced.midis[1] - voiced.midis[0]).toBe(3);
  });

  it('aynı progresyon farklı yayılımla deterministik üretilir', () => {
    const open = validateVoicing(
      { voices: 3, spread: 'open', register: [50, 84], maxMovement: 9 },
      'v',
    );
    const a = voiceChord(chord(), tonal, open, null, 'c');
    const b = voiceChord(chord(), tonal, open, null, 'c');
    expect(a.midis).toEqual(b.midis);
    expect(a.midis).not.toEqual(voiceChord(chord(), tonal, voicing, null, 'c').midis);
  });

  it('çevrim ve alterasyon açıkça uygulanır', () => {
    const plain = voiceChord(chord(), tonal, voicing, null, 'c').midis;
    const inverted = voiceChord(chord({ inversion: 1 }), tonal, voicing, null, 'c').midis;
    expect(inverted).not.toEqual(plain);
    const altered = voiceChord(
      chord({ alter: [{ voice: 1, semitones: 1 }] }),
      tonal,
      voicing,
      null,
      'c',
    ).midis;
    expect(altered[1] - plain[1]).toBe(1);
  });

  it('nitelikler farklı ses yığını verir', () => {
    const wide = validateVoicing(
      { voices: 4, spread: 'close', register: [48, 84], maxMovement: 12 },
      'v',
    );
    const triad = voiceChord(chord(), tonal, wide, null, 'c').midis;
    const seventh = voiceChord(chord({ quality: 'seventh' }), tonal, wide, null, 'c').midis;
    const sus4 = voiceChord(chord({ quality: 'sus4' }), tonal, wide, null, 'c').midis;
    const fifth = voiceChord(chord({ quality: 'fifth' }), tonal, wide, null, 'c').midis;
    expect(new Set([triad.join(), seventh.join(), sus4.join(), fifth.join()]).size).toBe(4);
  });

  it('register’a sığmayan ses sessizce kırpılmaz', () => {
    const narrow = validateVoicing(
      { voices: 4, spread: 'open', register: [60, 64], maxMovement: 12 },
      'v',
    );
    expect(() => voiceChord(chord(), tonal, narrow, null, 'c')).toThrow(/sığmıyor/);
  });

  it('hareket sınırı aşılırsa akorun yeriyle birlikte hata verir', () => {
    const strict = validateVoicing(
      { voices: 3, spread: 'close', register: [52, 76], maxMovement: 1 },
      'v',
    );
    const first = voiceChord(chord(), tonal, strict, null, 'c');
    expect(() => voiceChord(chord({ degree: 4 }), tonal, strict, first.midis, 'chords[1]')).toThrow(
      /ses hareketi/,
    );
  });

  it('en az hareketi seçer', () => {
    const wide = validateVoicing(
      { voices: 3, spread: 'close', register: [40, 90], maxMovement: 12 },
      'v',
    );
    const first = voiceChord(chord(), tonal, wide, null, 'c');
    const second = voiceChord(chord({ degree: 6 }), tonal, wide, first.midis, 'c');
    expect(second.movement).toBeLessThanOrEqual(12);
  });

  it.each([
    ['derece', { degree: 0 }],
    ['nitelik', { quality: 'ninth' }],
    ['süre', { beats: 0 }],
    ['çevrim', { inversion: 9 }],
  ])('akor %s hatası reddedilir', (_label, patch) => {
    expect(() =>
      validateChord({ bar: 0, beat: 0, beats: 4, degree: 1, quality: 'triad', ...patch }, 'c'),
    ).toThrow(AudioParamError);
  });

  it('voicing register’ı iki sayı ister', () => {
    expect(() =>
      validateVoicing({ voices: 3, spread: 'close', register: [52], maxMovement: 7 }, 'v'),
    ).toThrow(AudioParamError);
  });
});

describe('motif dönüşümleri', HEAVY, () => {
  const motif = validateMotif(
    {
      id: 'call',
      notes: [
        { degree: 0, beat: 0, beats: 0.5 },
        { degree: 2, beat: 0.5, beats: 0.5 },
        { degree: 4, beat: 1, beats: 1 },
      ],
    },
    'm',
  );
  const transform = (value: Record<string, unknown>) => validateTransform(value, 't');

  it('kaynak motif kendi kimliğini taşır', () => {
    const instance = applyTransforms(motif, [], 7);
    expect(instance.motif).toBe('call');
    expect(instance.variationId).toMatch(/^m-[0-9a-f]{12}$/);
    expect(describeChain([])).toBe('kaynak');
  });

  it('üç varyasyon kaynağına izlenebilir ve birbirinden farklıdır', () => {
    const variations = [
      applyTransforms(motif, [transform({ op: 'transpose', degrees: 2 })], 7),
      applyTransforms(motif, [transform({ op: 'invert', axisDegree: 2 })], 7),
      applyTransforms(
        motif,
        [
          transform({ op: 'fragment', from: 1, count: 2 }),
          transform({ op: 'sequence', steps: 1, times: 2 }),
        ],
        7,
      ),
    ];
    expect(new Set(variations.map((v) => v.variationId)).size).toBe(3);
    expect(variations.every((v) => v.motif === 'call')).toBe(true);
    expect(describeChain(variations[2].chain)).toBe('fragment → sequence');
  });

  it.each([
    ['transpose', { op: 'transpose', degrees: 3 }, (n: number[]) => expect(n[0]).toBe(3)],
    ['register-shift', { op: 'register-shift', octaves: 1 }, (n: number[]) => expect(n[0]).toBe(7)],
    ['rotate', { op: 'rotate', steps: 1 }, (n: number[]) => expect(n[0]).toBe(2)],
    ['invert', { op: 'invert', axisDegree: 0 }, (n: number[]) => expect(n[2]).toBe(-4)],
  ])('%s dereceleri dönüştürür', (_label, op, assertion) => {
    const instance = applyTransforms(motif, [transform(op)], 7);
    assertion(instance.notes.map((n) => n.degree));
  });

  it('augment ve diminish süreyi ölçekler', () => {
    const longer = applyTransforms(motif, [transform({ op: 'augment', factor: 2 })], 7);
    const shorter = applyTransforms(motif, [transform({ op: 'diminish', factor: 2 })], 7);
    expect(longer.notes[2].beats).toBe(2);
    expect(shorter.notes[2].beats).toBe(0.5);
  });

  it('sequence motifi kendi uzunluğu kadar iteler', () => {
    const sequenced = applyTransforms(
      motif,
      [transform({ op: 'sequence', steps: 1, times: 2 })],
      7,
    );
    expect(sequenced.notes).toHaveLength(6);
    expect(sequenced.notes[3].beat).toBe(2);
  });

  it('boş parça ve aşırı büyüme reddedilir', () => {
    expect(() =>
      applyTransforms(motif, [transform({ op: 'fragment', from: 5, count: 2 })], 7),
    ).toThrow(/parça en az/);
    expect(() =>
      applyTransforms(
        motif,
        [
          transform({ op: 'sequence', steps: 1, times: 8 }),
          transform({ op: 'sequence', steps: 1, times: 8 }),
        ],
        7,
      ),
    ).toThrow(/en çok/);
  });

  it.each([['op'], ['degrees']])('geçersiz dönüşüm alanı (%s) reddedilir', (field) => {
    const raw: Record<string, unknown> = { op: 'transpose', degrees: 2 };
    raw[field] = field === 'op' ? 'reverse' : 99;
    expect(() => validateTransform(raw, 't')).toThrow(AudioParamError);
  });

  it('motif en az bir nota ister', () => {
    expect(() => validateMotif({ id: 'x', notes: [] }, 'm')).toThrow(AudioParamError);
  });
});

describe('groove ve insanlaştırma', HEAVY, () => {
  it('düz profil ızgarayı bozmaz', () => {
    const result = applyGroove(STRAIGHT_GROOVE, {
      seed: 1,
      musicId: 'x',
      eventId: 'a/b/0',
      beatInBar: 1.5,
      beatsPerBar: 4,
    });
    expect(result.beatOffset).toBe(0);
    expect(result.gainFactor).toBe(1);
  });

  it('swing yalnız çift sekizliği geciktirir', () => {
    expect(swingOffset(1, 0.2)).toBe(0);
    expect(swingOffset(1.5, 0.2)).toBeCloseTo(0.1, 9);
    expect(swingOffset(1.25, 0.2)).toBe(0);
    expect(swingOffset(1.5, 0)).toBe(0);
  });

  it('aynı profil + tohum + olay kimliği aynı sonucu verir', () => {
    const profile = validateGroove(
      { id: 'human', swing: 0.1, timingJitter: 0.02, velocityJitter: 0.3, accents: [1, 0.8] },
      'g',
    );
    const input = { seed: 9, musicId: 'x', eventId: 'body/lead/3', beatInBar: 2, beatsPerBar: 4 };
    expect(applyGroove(profile, input)).toEqual(applyGroove(profile, input));
    const other = applyGroove(profile, { ...input, eventId: 'body/lead/4' });
    expect(other.beatOffset).not.toBe(applyGroove(profile, input).beatOffset);
  });

  it('vurgu tablosu ölçü içindeki konuma göre kazanç verir', () => {
    const profile = validateGroove(
      { id: 'accent', swing: 0, timingJitter: 0, velocityJitter: 0, accents: [1, 0.5] },
      'g',
    );
    const base = { seed: 1, musicId: 'x', eventId: 'e', beatsPerBar: 4 };
    expect(applyGroove(profile, { ...base, beatInBar: 0 }).gainFactor).toBe(1);
    expect(applyGroove(profile, { ...base, beatInBar: 1 }).gainFactor).toBe(0.5);
  });

  it('geçersiz profil reddedilir', () => {
    expect(() =>
      validateGroove(
        { id: 'g', swing: 0.9, timingJitter: 0, velocityJitter: 0, accents: [1] },
        'g',
      ),
    ).toThrow(AudioParamError);
    expect(() =>
      validateGroove({ id: 'g', swing: 0, timingJitter: 0, velocityJitter: 0, accents: [] }, 'g'),
    ).toThrow(AudioParamError);
  });
});

describe('MusicProgramV1 ve genişletme', HEAVY, () => {
  it('birim program geçerlidir ve özet kararlıdır', () => {
    const program = validateMusicProgram(unitProgram());
    expect(musicProgramHash(program)).toBe(musicProgramHash(validateMusicProgram(unitProgram())));
    expect(lanesOfStem(program, 'main')).toHaveLength(3);
  });

  it('depo programları geçerlidir', () => {
    for (const id of ['reference-loop', 'reference-cue', 'reference-adaptive']) {
      expect(validateMusicProgram(referenceProgram(id)).musicId).toBe(id);
    }
  });

  it('score düzdür, sıralıdır ve provenance taşır', () => {
    const score = expandProgram(validateMusicProgram(unitProgram()));
    expect(score.events.length).toBeGreaterThan(5);
    const beats = score.events.map((e) => e.beat);
    expect([...beats].sort((a, b) => a - b)).toEqual(beats);
    expect(score.events.some((e) => e.provenance.kind === 'chord')).toBe(true);
    expect(score.events.some((e) => e.provenance.kind === 'motif')).toBe(true);
    expect(score.events.some((e) => e.provenance.kind === 'explicit')).toBe(true);
    expect(scoreHash(score)).toBe(scoreHash(expandProgram(validateMusicProgram(unitProgram()))));
  });

  it('insanlaştırma sıfırken ızgara korunur', () => {
    const score = expandProgram(validateMusicProgram(unitProgram()));
    for (const event of score.events) expect(event.beat).toBeCloseTo(event.gridBeat, 9);
  });

  it('insanlaştırma olay KİMLİĞİNE bağlıdır (stem ayrımı zamanlamayı değiştirmez)', () => {
    const mixed = expandProgram(validateMusicProgram(unitAdaptiveProgram()));
    const single = expandProgram(validateMusicProgram(unitProgram()));
    const beatsOf = (score: typeof mixed) =>
      score.events.map((e) => `${e.lane}:${e.beat.toFixed(6)}:${e.midi}`).sort();
    expect(beatsOf(mixed)).toEqual(beatsOf(single));
  });

  it('stem süzgeci yalnız o stemin olaylarını verir', () => {
    const score = expandProgram(validateMusicProgram(unitAdaptiveProgram()));
    const bed = eventsOfStem(score, 'bed');
    expect(bed.length).toBeGreaterThan(0);
    expect(bed.every((event) => event.stem === 'bed')).toBe(true);
    expect(bed.length).toBeLessThan(score.events.length);
  });

  it('otomasyon şeridin kazancını ölçüye göre değiştirir', () => {
    const program = validateMusicProgram(
      unitProgram({
        automation: [
          {
            lane: 'keys',
            points: [
              [0, -12],
              [2, 0],
            ],
          },
        ],
      }),
    );
    const score = expandProgram(program);
    const keys = score.events.filter((e) => e.lane === 'keys').sort((a, b) => a.beat - b.beat);
    expect(keys[0].gain).toBeLessThan(keys[keys.length - 1].gain);
  });

  it.each([
    ['şema', ['schema'], 'MusicProgramV2'],
    ['bilinmeyen dizi', ['tonal'], { system: 'bebop', root: 'A2' }],
    ['kök nota', ['tonal'], { system: 'minor', root: 'Q9' }],
    ['ölçü', ['meter'], [4, 3]],
    ['tempo', ['tempo'], { bpm: 400 }],
    ['teslim paketi', ['delivery'], { package: 'audio-synth', assetDir: 'a/music/b' }],
    ['teslim yolu', ['delivery'], { package: '@volstudio/audio-synth', assetDir: 'assets/sfx/x' }],
    ['tohum', ['seed'], -1],
  ])('program %s hatası reddedilir', (_label, path, value) => {
    expect(() => validateMusicProgram(edited(unitProgram(), path, value))).toThrow(AudioParamError);
  });

  it('bölümler boşluksuz ve tam kapsamalı', () => {
    const gap = edited(
      unitProgram(),
      ['sections'],
      [{ ...(unitProgram().sections as Record<string, unknown>[])[0], bars: [1, 2] }],
    );
    expect(() => validateMusicProgram(gap)).toThrow(/boşluksuz/);
    const short = edited(unitProgram(), ['bars'], 4);
    expect(() => validateMusicProgram(short)).toThrow(/kaplamalı/);
  });

  it('adaptive olmayan program stem ayıramaz, adaptive olan state ister', () => {
    expect(() =>
      validateMusicProgram(unitProgram({ stems: [{ id: 'main' }, { id: 'extra' }] })),
    ).toThrow(/stem ayrımı/);
    expect(() => validateMusicProgram(unitAdaptiveProgram({ adaptive: undefined }))).toThrow(
      /adaptiveLoop state ister/,
    );
    const mainOnly = {
      states: [
        { id: 'calm', intensity: 0 },
        { id: 'peak', intensity: 1 },
      ],
      stems: [
        {
          stem: 'main',
          gainMap: {
            intensity: [
              { threshold: 0, gain: 0.5 },
              { threshold: 1, gain: 1 },
            ],
          },
        },
      ],
    };
    expect(() => validateMusicProgram(unitProgram({ adaptive: mainOnly }))).toThrow(
      /yalnız adaptiveLoop/,
    );
  });

  it('adaptive her stem için gain haritası ister ve eşikler artan olmalı', () => {
    const missing = unitAdaptiveProgram();
    const adaptive = missing.adaptive as { stems: unknown[] };
    adaptive.stems = adaptive.stems.slice(0, 2);
    expect(() => validateMusicProgram(missing)).toThrow(/gain haritası/);
    const unordered = unitAdaptiveProgram();
    const stems = (unordered.adaptive as { stems: { gainMap: { intensity: unknown[] } }[] }).stems;
    stems[0].gainMap.intensity = [
      { threshold: 1, gain: 1 },
      { threshold: 0, gain: 0.5 },
    ];
    expect(() => validateMusicProgram(unordered)).toThrow(/artan/);
  });

  it('şerit tanımsız stem, groove ya da enstrüman kullanamaz', () => {
    expect(() =>
      validateMusicProgram(edited(unitProgram(), ['lanes', '0', 'stem'], 'yok')),
    ).toThrow(/tanımlı bir stem/);
    expect(() =>
      validateMusicProgram(edited(unitProgram(), ['lanes', '0', 'groove'], 'yok')),
    ).toThrow(/tanımlı bir groove/);
    expect(() =>
      validateMusicProgram(edited(unitProgram(), ['lanes', '0', 'instrument'], 'preset:laserShot')),
    ).toThrow(/müzik enstrümanı değil/);
  });

  it('akor kaynaklı part armonisiz olamaz ve olmayan akor konumu reddedilir', () => {
    const noHarmony = unitProgram();
    const section = (noHarmony.sections as Record<string, unknown>[])[0];
    delete section.harmony;
    expect(() => validateMusicProgram(noHarmony)).toThrow(/armoni ister/);
    const late = unitProgram();
    const parts = (
      (late.sections as Record<string, unknown>[])[0].parts as Record<string, unknown>[]
    )[0];
    (parts.rhythm as Record<string, unknown>[])[0].bar = 5;
    expect(() => expandProgram(validateMusicProgram(late))).toThrow(AudioParamError);
  });

  it('parçanın dışına taşan olay ve aralık dışı nota reddedilir', () => {
    const outside = unitProgram();
    const parts = (
      (outside.sections as Record<string, unknown>[])[0].parts as Record<string, unknown>[]
    )[1];
    (parts.notes as Record<string, unknown>[])[0].bar = 1;
    (parts.notes as Record<string, unknown>[])[0].beat = 7;
    expect(() => expandProgram(validateMusicProgram(outside))).toThrow(/parçanın dışında/);
    const high = unitProgram();
    const bassNotes = (
      (high.sections as Record<string, unknown>[])[0].parts as Record<string, unknown>[]
    )[1].notes as Record<string, unknown>[];
    bassNotes[0].note = 'A6';
    expect(() => expandProgram(validateMusicProgram(high))).toThrow(/aralığı MIDI/);
  });

  it('eşzamanlılık enstrümanın önerisini aşamaz', () => {
    const crowded = unitProgram();
    const parts = (
      (crowded.sections as Record<string, unknown>[])[0].parts as Record<string, unknown>[]
    )[1];
    parts.notes = [
      { bar: 0, beat: 0, beats: 4, note: 'A2' },
      { bar: 0, beat: 0, beats: 4, note: 'C3' },
      { bar: 0, beat: 0, beats: 4, note: 'E3' },
    ];
    expect(() => expandProgram(validateMusicProgram(crowded))).toThrow(/eşzamanlılık/);
  });

  it('akorun olmayan sesi istenemez', () => {
    const program = unitProgram();
    const chordPart = (
      (program.sections as Record<string, unknown>[])[0].parts as Record<string, unknown>[]
    )[0];
    chordPart.voices = [0, 5];
    expect(() => expandProgram(validateMusicProgram(program))).toThrow(/akorun/);
  });
});
