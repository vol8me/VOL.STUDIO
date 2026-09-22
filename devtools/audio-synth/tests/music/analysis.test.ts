import { describe, expect, it } from 'vitest';
import { AudioParamError } from '../../src/guard/errors';
import { analyzeScore, reportHash } from '../../src/music/analyze';
import { densityBand, MUSIC_ANALYSIS_POLICY } from '../../src/music/policy';
import { validateMusicProgram, type MusicProgramV1 } from '../../src/music/program';
import { expandProgram } from '../../src/music/score';
import {
  describeTransitions,
  isSupportedKind,
  validateTransition,
} from '../../src/music/transitions';
import { validateThemeBook } from '../../src/music/themeBook';
import { validateBrief } from '../../src/program/brief';
import type { MusicBriefV1 } from '../../src/music/brief';
import {
  musicBrief,
  referenceBrief,
  referenceProgram,
  referenceThemeBook,
  unitProgram,
} from './fixtures';

/*
 * Müzik testleri GERÇEK ses render eder; kapsam ölçümü (v8 + AST yeniden
 * eşleme) sentezi birkaç kat yavaşlatır ve 5 saniyelik varsayılan süre
 * dolar. Süre sınırı bu yüzden blok başına açıkça verilir — ölçülen bir
 * kısıt, keyfi bir sayı değil.
 */
const HEAVY = { timeout: 120_000 };

function analyze(
  document: Record<string, unknown>,
  options: { brief?: unknown; themeBook?: unknown } = {},
) {
  const program = validateMusicProgram(document);
  const brief = options.brief ? (validateBrief(options.brief) as MusicBriefV1) : undefined;
  return analyzeScore({
    program,
    score: expandProgram(program),
    ...(brief ? { brief } : {}),
    ...(options.themeBook ? { themeBook: validateThemeBook(options.themeBook) } : {}),
  });
}

describe('sembolik analiz', HEAVY, () => {
  it('ses render ETMEDEN ölçer', () => {
    const report = analyze(unitProgram());
    expect(report.totals.events).toBeGreaterThan(0);
    expect(report.totals.notesPerBar).toBeGreaterThan(0);
    expect(report.lanes).toHaveLength(3);
    expect(report.sections).toHaveLength(1);
    expect(report.pitchClasses).toHaveLength(12);
    expect(report.pitchClasses.reduce((a, b) => a + b, 0)).toBe(report.totals.events);
  });

  it('rapor içerikten türer (aynı program aynı özet)', () => {
    expect(reportHash(analyze(unitProgram()))).toBe(reportHash(analyze(unitProgram())));
  });

  it('motif tekrarını kaynağına göre sayar', () => {
    const report = analyze(
      referenceProgram('reference-loop') as unknown as Record<string, unknown>,
    );
    expect(report.motifs).toHaveLength(1);
    expect(report.motifs[0].instances).toBe(report.totals.motifInstances);
    expect(report.motifs[0].chain).toBe('transpose');
  });

  it('bölüm ölçümleri hedef enerji sırasını izler', () => {
    const report = analyze(
      referenceProgram('reference-cue') as unknown as Record<string, unknown>,
      {
        brief: referenceBrief('reference-cue'),
      },
    );
    const contrast = report.brief.find((c) => c.name === 'section-contrast');
    expect(contrast?.ok).toBe(true);
    expect(contrast?.value).toBeGreaterThanOrEqual(MUSIC_ANALYSIS_POLICY.sectionContrastAgreement);
  });

  it('"sparse" brief ile yoğun score uyuşmazlığı bulgu üretir', () => {
    const report = analyze(unitProgram(), {
      brief: musicBrief({ rhythmicDensity: 'sparse' }),
    });
    const density = report.brief.find((c) => c.name === 'rhythmic-density');
    expect(density?.ok).toBe(false);
    expect(density?.detail).toContain('sparse');
    expect(report.verdict.pass).toBe(false);
    expect(report.verdict.failures).toContain('brief rhythmic-density');
    expect(densityBand('sparse').max).toBeLessThan(densityBand('dense').min + 1);
  });

  it('brief uyumu tempo, ölçü, uzunluk, form ve sistemi sınar', () => {
    const report = analyze(unitProgram(), {
      brief: musicBrief({
        tempo: { bpm: { min: 60, max: 80 } },
        length: { bars: { min: 8, max: 16 } },
        form: { sections: ['intro'] },
        tonal: { systems: ['lydian'] },
        meter: [3, 4],
      }),
    });
    const failing = report.brief.filter((c) => !c.ok).map((c) => c.name);
    expect(failing).toEqual(
      expect.arrayContaining(['tempo', 'length', 'form', 'tonal-system', 'meter']),
    );
  });

  it('adaptive state uyumu brief ile karşılaştırılır', () => {
    const program = referenceProgram('reference-adaptive') as unknown as Record<string, unknown>;
    const report = analyze(program, { brief: referenceBrief('reference-adaptive') });
    expect(report.brief.find((c) => c.name === 'adaptive-states')?.ok).toBe(true);
  });

  it('ThemeBook kuralları ihlal edilince düşer, override ile geçer', () => {
    const program = unitProgram();
    const book = {
      ...referenceThemeBook(),
      avoid: [{ kind: 'max-polyphony', voices: 1 }],
      register: [],
      palette: { prefer: [], forbid: [] },
    };
    const strict = analyze(program, { themeBook: book });
    expect(strict.rules.find((r) => r.ruleId === 'max-polyphony')?.ok).toBe(false);
    expect(strict.verdict.pass).toBe(false);

    const overridden = analyze(
      { ...program, themeOverrides: [{ rule: 'max-polyphony', reason: 'akor yatağı bilinçli' }] },
      { themeBook: book },
    );
    const finding = overridden.rules.find((r) => r.ruleId === 'max-polyphony');
    expect(finding?.ok).toBe(true);
    expect(finding?.overridden).toBe(true);
    expect(finding?.detail).toContain('override');
    expect(overridden.verdict.pass).toBe(true);
  });

  it.each([
    [
      'forbid-instrument',
      { kind: 'forbid-instrument', instrument: 'preset:warmKeys' },
      'forbid-instrument:preset:warmKeys',
    ],
    ['forbid-role', { kind: 'forbid-role', role: 'bass' }, 'forbid-role:bass'],
    ['forbid-system', { kind: 'forbid-system', system: 'minor' }, 'forbid-system:minor'],
    [
      'max-density lane',
      { kind: 'max-density', notesPerBar: 0.5, scope: 'lane' },
      'max-density:lane',
    ],
    [
      'register-limit',
      { kind: 'register-limit', role: 'keys', lowMidi: 20, highMidi: 30 },
      'register-limit:keys',
    ],
    [
      'forbid-interval harmonic',
      { kind: 'forbid-interval', semitones: 3, scope: 'harmonic' },
      'forbid-interval:harmonic:3',
    ],
    [
      'forbid-interval melodic',
      { kind: 'forbid-interval', semitones: 3, scope: 'melodic' },
      'forbid-interval:melodic:3',
    ],
  ])('%s kuralı ihlali raporlanır', (_label, rule, id) => {
    const book = {
      ...referenceThemeBook(),
      avoid: [rule],
      register: [],
      palette: { prefer: [], forbid: [] },
    };
    const report = analyze(unitProgram(), { themeBook: book });
    const finding = report.rules.find((r) => r.ruleId === id);
    expect(finding).toBeDefined();
    expect(finding?.ok).toBe(false);
  });

  it('denetlenmeyen serbest notlar raporda adıyla sayılır', () => {
    const report = analyze(unitProgram(), {
      brief: musicBrief({ avoidNotes: ['klişe kapanış'] }),
      themeBook: referenceThemeBook(),
    });
    expect(report.unchecked.some((line) => line.includes('klişe kapanış'))).toBe(true);
    expect(report.unchecked.some((line) => line.startsWith('themeBook.notes'))).toBe(true);
  });

  it('SFX koruma bandı sembolik vekille ölçülür', () => {
    const report = analyze(unitProgram(), {
      brief: musicBrief({ spectralPriority: { protect: [{ fromHz: 20, toHz: 20000 }] } }),
    });
    const check = report.brief.find((c) => c.name === 'spectral-priority');
    expect(check?.ok).toBe(false);
    expect(check?.value).toBe(1);
    expect(check?.detail).toContain('vekil');
  });

  it('brief kaçınma kuralları da denetlenir', () => {
    const report = analyze(unitProgram(), {
      brief: musicBrief({ avoid: [{ kind: 'max-polyphony', voices: 1 }] }),
    });
    expect(report.brief.find((c) => c.name === 'brief-avoid:max-polyphony')?.ok).toBe(false);
  });
});

describe('geçiş sözleşmesi', HEAVY, () => {
  it('motorun yaptığı geçişler kabul edilir', () => {
    const transition = validateTransition(
      { id: 'to-next', kind: 'crossfade', seconds: 2, bars: 1, to: 'reference-loop' },
      't',
    );
    expect(transition.kind).toBe('crossfade');
    expect(isSupportedKind('crossfade')).toBe(true);
  });

  it.each([['stinger'], ['section-jump']])('%s unsupported-by-runtime ile reddedilir', (kind) => {
    expect(() => validateTransition({ id: 'x', kind, seconds: 1 }, 't')).toThrow(
      /unsupported-by-runtime/,
    );
    expect(isSupportedKind(kind as 'stinger')).toBe(false);
  });

  it('bar hizası yalnız crossfade içindir ve farklı tempoda yoktur', () => {
    expect(() =>
      validateTransition({ id: 'x', kind: 'fade-stop', seconds: 1, bars: 1 }, 't'),
    ).toThrow(/bar hizası yalnız crossfade/);
    expect(() =>
      validateTransition(
        {
          id: 'x',
          kind: 'crossfade',
          seconds: 1,
          bars: 2,
          to: 'other',
          tempoRelation: 'different',
        },
        't',
      ),
    ).toThrow(/unsupported-by-runtime/);
    expect(() => validateTransition({ id: 'x', kind: 'crossfade', seconds: 1 }, 't')).toThrow(
      AudioParamError,
    );
  });

  it('tonal ilişki beyanı raporda "motor uygulamıyor" diye işaretlenir', () => {
    const transitions = [
      validateTransition(
        { id: 'a', kind: 'crossfade', seconds: 1, to: 'other', tonalRelation: 'relative' },
        't',
      ),
      validateTransition({ id: 'b', kind: 'fade-stop', seconds: 1 }, 't'),
    ];
    const findings = describeTransitions(transitions);
    expect(findings[0].enforcedByRuntime).toBe(false);
    expect(findings[0].detail).toContain('motor ton bilmez');
    expect(findings[1].enforcedByRuntime).toBe(true);
  });

  it('program geçişleri rapora girer', () => {
    const program = referenceProgram('reference-cue') as unknown as MusicProgramV1;
    const report = analyze(program as unknown as Record<string, unknown>);
    expect(report.transitions).toHaveLength(1);
    expect(report.transitions[0].id).toBe('to-loop');
  });
});
