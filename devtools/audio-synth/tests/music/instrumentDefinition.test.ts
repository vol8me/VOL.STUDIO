import { describe, expect, it } from 'vitest';
import { MemoryRenderCache } from '../../src/engine/renderCache';
import { withRenderSession } from '../../src/engine/session';
import { AudioParamError } from '../../src/guard/errors';
import { analyzeScore } from '../../src/music/analyze';
import { validateMusicProgram, type MusicProgramV1 } from '../../src/music/program';
import { expandProgram, type ScoreEventV1 } from '../../src/music/score';
import { renderMusicRaw } from '../../src/music/stem';
import { planVoices } from '../../src/music/voices';
import { hashPcm } from '../../src/protocol/canonical';
import { probeResolver, registerSample } from '../support/samples';
import { rms } from '../support/measure';
import { RENDER_BLOCK } from '../support/timeouts';
import { clone, unitProgram } from './fixtures';

/**
 * `InstrumentDefinitionV1` sözleşmesi: besteci kaynağı bilmez. Aynı nota
 * verisi yerleşik prosedürel piyanoya, sampler'a, retro sese ya da katmana
 * gider; score yalnız enstrüman kimliğinde ayrışır.
 */
function tone(name: string, frequency: number, seconds: number, level: number) {
  const rate = 44100;
  const out = new Float32Array(Math.round(rate * seconds));
  for (let i = 0; i < out.length; i++) {
    const t = i / rate;
    out[i] = level * Math.exp(-3 * t) * Math.sin(2 * Math.PI * frequency * t);
  }
  return registerSample(`keys-${name}`, { channels: [out], sampleRate: rate });
}

const SOFT = tone('soft', 261.63, 1.2, 0.3);
const HARD = tone('hard', 261.63, 1.2, 0.9);

const SAMPLED = {
  id: 'sampled-keys',
  role: 'keys',
  range: ['C3', 'C6'],
  polyphony: 8,
  velocity: { rangeDb: 12 },
  release: { seconds: 0.1 },
  articulations: ['sustain', 'staccato', 'accent', 'ghost'],
  source: { kind: 'sampler', bank: 'keys' },
};

const SAMPLING = {
  samples: { soft: SOFT, hard: HARD },
  banks: {
    keys: {
      schema: 'SampleBankV1',
      zones: [
        { sample: 'soft', rootKey: 60, keyLow: 0, keyHigh: 127, velocityHigh: 0.6 },
        { sample: 'hard', rootKey: 60, keyLow: 0, keyHigh: 127, velocityLow: 0.6 },
      ],
    },
  },
};

const KIT = {
  id: 'kit',
  role: 'percussion',
  polyphony: 8,
  velocity: { rangeDb: 12 },
  articulations: ['accent', 'ghost', 'mute', 'let-ring'],
  source: {
    kind: 'drum-kit',
    pieces: [
      { note: 'C2', model: 'kick' },
      { note: 'D2', model: 'snare', macros: { tone: 0.6 } },
      { note: 'F#2', model: 'hat', choke: 'hat' },
      { note: 'A#2', model: 'hat', macros: { open: 1 }, choke: 'hat' },
    ],
  },
};

const CHIP = {
  id: 'chip-lead',
  role: 'lead',
  range: ['C3', 'C7'],
  polyphony: 1,
  velocity: { rangeDb: 12 },
  articulations: ['sustain', 'staccato', 'legato', 'slide', 'accent'],
  source: {
    kind: 'retro',
    patch: { waveform: 'pulse', duty: 0.25, envelope: { attack: 0.002, release: 0.03 } },
  },
};

type Note = { bar: number; beat: number; beats: number; note: string } & Record<string, unknown>;

/** Tek şeritli, tek bölümlü program: şerit enstrümanı ve notalar verilir. */
function single(instrument: string, notes: Note[], extra: Record<string, unknown> = {}) {
  const base = unitProgram();
  return {
    ...base,
    instruments: [SAMPLED, KIT, CHIP],
    ...SAMPLING,
    lanes: [{ id: 'part', instrument, stem: 'main' }],
    sections: [
      {
        id: 'body',
        role: 'body',
        bars: [0, 2],
        targetEnergy: 0.6,
        lanes: ['part'],
        parts: [{ lane: 'part', source: 'notes', notes }],
      },
    ],
    ...extra,
  };
}

const MELODY: Note[] = [
  { bar: 0, beat: 0, beats: 1, note: 'C4' },
  { bar: 0, beat: 1, beats: 1, note: 'E4', velocity: 0.3 },
  { bar: 0, beat: 2, beats: 2, note: 'G4', velocity: 0.95 },
];

function rejects(fn: () => unknown, fragment: string | RegExp) {
  expect(fn).toThrow(AudioParamError);
  expect(fn).toThrow(fragment);
}

function render(program: MusicProgramV1) {
  return renderMusicRaw(program, expandProgram(program), undefined, probeResolver);
}

const strip = (e: ScoreEventV1) => {
  const { instrument: _i, ...rest } = e;
  return rest;
};

describe('enstrüman tanımı: sözleşme doğrulaması', () => {
  const withDef =
    (def: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    () =>
      validateMusicProgram(
        single('inst:x', MELODY, {
          instruments: [{ ...SAMPLED, id: 'x', ...def }],
          ...extra,
        }),
      );

  it('perdeli enstrüman aralık ister; kit aralığı ve transpozisyonu reddeder', () => {
    const { range: _r, ...noRange } = SAMPLED;
    rejects(
      () => validateMusicProgram(single('inst:sampled-keys', MELODY, { instruments: [noRange] })),
      /aralık ister/,
    );
    rejects(
      () =>
        validateMusicProgram(
          single('inst:kit', [{ bar: 0, beat: 0, beats: 1, note: 'C2' }], {
            instruments: [{ ...KIT, range: ['C1', 'C3'] }],
          }),
        ),
      /perdesizdir/,
    );
  });

  it('kaynağın çalamadığı artikülasyon tanımda reddedilir', () => {
    rejects(withDef({ articulations: ['slide'] }), /sampler kaynağı yalnız/);
    rejects(withDef({ velocity: { rangeDb: 0 } }), /accent\/ghost velocity tepkisi ister/);
    rejects(withDef({ velocity: { rangeDb: 6, brightness: 0.5 } }), /parlaklık tepkisi/);
  });

  it('bırakma yalnız sampler; katman iç içe olamaz, kit katmana girmez', () => {
    rejects(
      () =>
        validateMusicProgram(
          single('inst:chip-lead', MELODY, {
            instruments: [SAMPLED, KIT, { ...CHIP, release: { seconds: 0.2 } }],
          }),
        ),
      /bırakma yalnız sampler/,
    );
    const layer = (source: unknown) => ({
      ...CHIP,
      id: 'x',
      articulations: ['sustain'],
      source: { kind: 'layer', layers: [{ source: CHIP.source }, { source }] },
    });
    rejects(withDef(layer({ kind: 'layer', layers: [] })), /iç içe/);
    rejects(withDef(layer(KIT.source)), /katmana girmez/);
  });

  it('kullanılmayan banka/kayıt ve bilinmeyen inst kimliği reddedilir', () => {
    rejects(
      () => validateMusicProgram(single('preset:grandPiano', MELODY, { instruments: [CHIP] })),
      /hiçbir sampler/,
    );
    rejects(() => validateMusicProgram(single('inst:yok', MELODY)), /instruments/);
    rejects(
      () =>
        validateMusicProgram(
          single('inst:kit', [{ bar: 0, beat: 0, beats: 1, note: 'C2' }], {
            instruments: [
              SAMPLED,
              {
                ...KIT,
                source: {
                  kind: 'drum-kit',
                  pieces: [
                    { note: 'C2', model: 'kick' },
                    { note: 'C2', model: 'snare' },
                  ],
                },
              },
            ],
          }),
        ),
      /tuş tekrar etti/,
    );
  });
});

describe('aynı nota verisi, farklı kaynak', RENDER_BLOCK, () => {
  it('prosedürel piyano ve sampler aynı olayları tüketir; ikisi de çalar', () => {
    const piano = validateMusicProgram(single('preset:grandPiano', MELODY));
    const sampled = validateMusicProgram(single('inst:sampled-keys', MELODY));
    const a = expandProgram(piano);
    const b = expandProgram(sampled);
    expect(b.events.map(strip)).toEqual(a.events.map(strip));
    expect(b.instruments?.['inst:sampled-keys']?.source.kind).toBe('sampler');
    expect(a.instruments).toBeUndefined();
    for (const program of [piano, sampled]) {
      const out = render(program);
      expect(rms(out.channels[0])).toBeGreaterThan(1e-3);
    }
  });

  it('sampler velocity katmanı seçer ve velocity tepkisi seviyeyi ölçeklendirir', () => {
    const sampled = validateMusicProgram(single('inst:sampled-keys', MELODY));
    const score = expandProgram(sampled);
    const voices = planVoices(score, score.events, {});
    expect(voices.map((v) => v.gain)).toEqual(
      score.events.map((e) =>
        e.velocity === undefined ? e.gain : e.gain * Math.pow(10, (12 * (e.velocity - 0.8)) / 20),
      ),
    );
    const soft = validateMusicProgram(
      single('inst:sampled-keys', [{ bar: 0, beat: 0, beats: 2, note: 'C4', velocity: 0.3 }]),
    );
    const hard = validateMusicProgram(
      single('inst:sampled-keys', [{ bar: 0, beat: 0, beats: 2, note: 'C4', velocity: 0.9 }]),
    );
    const ratio = rms(render(hard).channels[0]) / rms(render(soft).channels[0]);
    const zone = 0.9 / 0.3;
    const response = Math.pow(10, (12 * 0.6) / 20);
    expect(ratio / (zone * response)).toBeGreaterThan(0.9);
    expect(ratio / (zone * response)).toBeLessThan(1.1);
  });

  it('yazılmamış velocity seviyeyi değiştirmez (eski programlar bit-eşit)', () => {
    const program = validateMusicProgram(single('preset:grandPiano', MELODY.slice(0, 1)));
    const score = expandProgram(program);
    expect(score.events[0].velocity).toBeUndefined();
    expect(planVoices(score, score.events)[0].gain).toBe(score.events[0].gain);
  });

  it('transpozisyon: yazılan korunur, aralık SESLENEN perdede denetlenir', () => {
    const shifted = { ...SAMPLED, transposition: -12, range: ['C2', 'C5'] };
    const program = validateMusicProgram(
      single('inst:sampled-keys', MELODY, { instruments: [shifted, KIT, CHIP] }),
    );
    const [first] = expandProgram(program).events;
    expect(first.midi).toBe(48);
    expect(first.written).toBe(60);
    rejects(
      () =>
        expandProgram(
          validateMusicProgram(
            single('inst:sampled-keys', [{ bar: 0, beat: 0, beats: 1, note: 'D6' }], {
              instruments: [shifted, KIT, CHIP],
            }),
          ),
        ),
      /aralığı MIDI 36–72/,
    );
  });
});

describe('davul kiti', RENDER_BLOCK, () => {
  const groove: Note[] = [
    { bar: 0, beat: 0, beats: 0.5, note: 'C2' },
    { bar: 0, beat: 1, beats: 0.5, note: 'D2', articulations: ['accent'] },
    { bar: 0, beat: 2, beats: 1, note: 'A#2' },
    { bar: 0, beat: 2.5, beats: 0.5, note: 'F#2' },
    { bar: 0, beat: 3, beats: 0.5, note: 'D2', articulations: ['ghost'] },
  ];

  it('tuş parçayı seçer; kit perdesizdir ve perde analizine girmez', () => {
    const program = validateMusicProgram(single('inst:kit', groove));
    const score = expandProgram(program);
    expect(score.lanes[0].pitched).toBe(false);
    expect(score.events.every((e) => typeof e.seed === 'number')).toBe(true);
    const report = analyzeScore({ program, score });
    expect(report.pitchClasses.every((n) => n === 0)).toBe(true);
    expect(report.lanes[0]).toMatchObject({ unpitched: true, lowMidi: null });
    rejects(
      () => expandProgram(validateMusicProgram(single('inst:kit', [{ ...groove[0], note: 'E2' }]))),
      /kitinde bu tuşa parça yok/,
    );
  });

  it('kapalı hat açık hattı boğar; boğulan ses kapıda biter', () => {
    const score = expandProgram(validateMusicProgram(single('inst:kit', groove)));
    const open = score.events.find((e) => e.midi === 46) as ScoreEventV1;
    const [voice] = planVoices(score, [open]);
    const channels = 'model' in voice ? voice.model.render() : [];
    const gate = 0.5 * (60 / score.bpm);
    expect(channels[0].length / score.sampleRate).toBeCloseTo(gate + 0.005, 2);
    const alone = expandProgram(
      validateMusicProgram(single('inst:kit', [{ bar: 0, beat: 2, beats: 1, note: 'A#2' }])),
    );
    const [free] = planVoices(alone, alone.events);
    expect('model' in free && free.model.render()[0].length).toBeGreaterThan(
      channels[0].length * 4,
    );
  });

  it('accent ve ghost velocity’yi kaydırır: seviye ve tını birlikte değişir', () => {
    const score = expandProgram(validateMusicProgram(single('inst:kit', groove)));
    const snares = score.events.filter((e) => e.midi === 38);
    const [accent, ghost] = planVoices(score, snares);
    expect(accent.gain).toBeGreaterThan(ghost.gain * 2);
  });
});

describe('retro enstrüman ve katman', RENDER_BLOCK, () => {
  it('slide önceki notadan kayar; şeridin ilk notası kayamaz', () => {
    const notes: Note[] = [
      { bar: 0, beat: 0, beats: 1, note: 'C4' },
      { bar: 0, beat: 1, beats: 1, note: 'G4', articulations: ['slide'] },
    ];
    const score = expandProgram(validateMusicProgram(single('inst:chip-lead', notes)));
    const [, glide] = planVoices(score, score.events);
    expect('model' in glide).toBe(true);
    rejects(
      () =>
        expandProgram(
          validateMusicProgram(
            single('inst:chip-lead', [
              { ...notes[1], beat: 0 },
              { ...notes[0], beat: 1 },
            ]),
          ),
        ),
      /slide önceki bir nota ister/,
    );
  });

  it('katman velocity aralığına düşen kaynakları birlikte çalar', () => {
    const layered = {
      ...CHIP,
      id: 'hybrid',
      articulations: ['sustain', 'accent'],
      polyphony: 4,
      source: {
        kind: 'layer',
        layers: [
          { source: { kind: 'preset', preset: 'warmKeys' } },
          { source: CHIP.source, gainDb: -6, velocity: [0.7, 1] },
        ],
      },
    };
    const program = validateMusicProgram(
      single('inst:hybrid', MELODY, { instruments: [SAMPLED, KIT, CHIP, layered] }),
    );
    const score = expandProgram(program);
    expect(planVoices(score, score.events)).toHaveLength(5);
    expect(rms(render(program).channels[0])).toBeGreaterThan(1e-3);
  });

  it('model sesleri önbelleğe girer: ikinci render hiç ses sentezlemez, PCM aynı', () => {
    const program = validateMusicProgram(
      single('inst:kit', [
        { bar: 0, beat: 0, beats: 1, note: 'C2' },
        { bar: 1, beat: 0, beats: 1, note: 'D2' },
      ]),
    );
    const cache = new MemoryRenderCache({ maxBytes: 1 << 26 });
    const first = withRenderSession({ cache }, () => render(program));
    const writes = cache.stats.writes;
    const second = withRenderSession({ cache }, () => render(program));
    expect(cache.stats.writes).toBe(writes);
    expect(hashPcm(second.channels, second.sampleRate)).toBe(
      hashPcm(first.channels, first.sampleRate),
    );
    expect(hashPcm(render(clone(program)).channels, 44100)).toBe(
      hashPcm(first.channels, first.sampleRate),
    );
  });
});

describe('ses planı: kaynağa göre kapı ve tını', RENDER_BLOCK, () => {
  const modelLength = (voice: ReturnType<typeof planVoices>[number]) =>
    'model' in voice ? voice.model.render()[0].length : NaN;

  it('preset parlaklık tepkisi alçak geçireni velocity ile açar', () => {
    const bright = {
      id: 'bright-bass',
      role: 'bass',
      range: ['E1', 'C4'],
      polyphony: 2,
      velocity: { rangeDb: 12, brightness: 0.5 },
      articulations: ['sustain'],
      source: { kind: 'preset', preset: 'subBass' },
    };
    const score = expandProgram(
      validateMusicProgram(
        single(
          'inst:bright-bass',
          [
            { bar: 0, beat: 0, beats: 1, note: 'A2', velocity: 0.3 },
            { bar: 0, beat: 2, beats: 1, note: 'A2', velocity: 1 },
          ],
          { instruments: [SAMPLED, KIT, CHIP, bright] },
        ),
      ),
    );
    const cutoffs = planVoices(score, score.events).map((v) =>
      'params' in v ? (v.params.lowpass?.cutoff as number) : NaN,
    );
    expect(cutoffs[1] / cutoffs[0]).toBeCloseTo(Math.pow(2, 2 * 0.5 * 0.7), 9);
  });

  it('kitte mute vuruşu doğal sönümün %35’inde boğar', () => {
    const score = expandProgram(
      validateMusicProgram(
        single('inst:kit', [
          { bar: 0, beat: 0, beats: 1, note: 'D2' },
          { bar: 1, beat: 0, beats: 1, note: 'D2', articulations: ['mute'] },
        ]),
      ),
    );
    const [open, muted] = planVoices(score, score.events).map(modelLength);
    expect(muted / open).toBeGreaterThan(0.3);
    expect(muted / open).toBeLessThan(0.4);
  });

  it('sampler let-ring kaydın sonuna kadar çalar; retro legato bir sonraki notaya uzanır', () => {
    const ring = { ...SAMPLED, articulations: ['sustain', 'let-ring', 'accent', 'ghost'] };
    const sampled = expandProgram(
      validateMusicProgram(
        single(
          'inst:sampled-keys',
          [{ bar: 0, beat: 0, beats: 0.25, note: 'C4', articulations: ['let-ring'] }],
          { instruments: [ring, KIT, CHIP] },
        ),
      ),
    );
    const [voice] = planVoices(sampled, sampled.events, { samples: () => probeResolver(SOFT) });
    expect(modelLength(voice) / 44100).toBeCloseTo(1.2, 3);
    const notes: Note[] = [
      { bar: 0, beat: 0, beats: 1, note: 'C4' },
      { bar: 0, beat: 1, beats: 1, note: 'D4' },
    ];
    const plain = expandProgram(validateMusicProgram(single('inst:chip-lead', notes)));
    const legato = expandProgram(
      validateMusicProgram(
        single('inst:chip-lead', [{ ...notes[0], articulations: ['legato'] }, notes[1]]),
      ),
    );
    const first = (s: typeof plain) => modelLength(planVoices(s, s.events)[0]);
    expect((first(legato) - first(plain)) / 44100).toBeCloseTo(0.03, 3);
  });
});
