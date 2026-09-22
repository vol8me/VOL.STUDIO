import { describe, expect, it } from 'vitest';
import { AudioParamError } from '../../src/guard/errors';
import { MusicDecisionError } from '../../src/music/brief';
import {
  assertArticulation,
  assertInRange,
  instrumentIds,
  instrumentProfile,
  instrumentRegistryHash,
  presetOf,
} from '../../src/music/instruments';
import { describeRule, ruleId, validateRule } from '../../src/music/terms';
import {
  themeBookHash,
  themeBookRules,
  validateOverrides,
  validateThemeBook,
} from '../../src/music/themeBook';
import { validateBrief } from '../../src/program/brief';
import { edited, musicBrief, referenceBrief, referenceThemeBook } from './fixtures';

/*
 * Müzik testleri GERÇEK ses render eder; kapsam ölçümü (v8 + AST yeniden
 * eşleme) sentezi birkaç kat yavaşlatır ve 5 saniyelik varsayılan süre
 * dolar. Süre sınırı bu yüzden blok başına açıkça verilir — ölçülen bir
 * kısıt, keyfi bir sayı değil.
 */
const HEAVY = { timeout: 120_000 };

describe('MusicBriefV1', HEAVY, () => {
  it('müzik isteğini doğrular ve alanları korur', () => {
    const brief = validateBrief(musicBrief());
    expect(brief.kind).toBe('music');
    if (brief.kind !== 'music') return;
    expect(brief.playback).toBe('loop');
    expect(brief.form.sections).toEqual(['body']);
    expect(brief.assetClass).toBe('music');
  });

  it('depo fixture brief’leri geçerlidir', () => {
    for (const id of ['reference-loop', 'reference-cue', 'reference-adaptive']) {
      expect(validateBrief(referenceBrief(id)).kind).toBe('music');
    }
  });

  it.each([['playback'], ['usage'], ['form'], ['tempo'], ['meter'], ['length']])(
    '%s eksikse karar isteği üretir',
    (field) => {
      try {
        validateBrief(edited(musicBrief(), [field], undefined));
        expect.unreachable('karar isteği bekleniyordu');
      } catch (error) {
        expect(error).toBeInstanceOf(MusicDecisionError);
        expect((error as MusicDecisionError).decisions.map((d) => d.field)).toContain(field);
      }
    },
  );

  it('eksik kararlar TEK hatada toplanır', () => {
    try {
      validateBrief(edited(edited(musicBrief(), ['playback'], undefined), ['form'], undefined));
      expect.unreachable('karar isteği bekleniyordu');
    } catch (error) {
      const decisions = (error as MusicDecisionError).decisions.map((d) => d.field);
      expect(decisions).toEqual(expect.arrayContaining(['playback', 'form']));
    }
  });

  it('seamless loop ile tek seferlik cue aynı brief’e düşmez', () => {
    const loop = validateBrief(musicBrief());
    const cue = validateBrief(
      musicBrief({
        playback: 'playlistOneShot',
        usage: 'cue',
        form: { sections: ['intro', 'outro'] },
      }),
    );
    expect(loop.kind === 'music' && loop.playback).toBe('loop');
    expect(cue.kind === 'music' && cue.playback).toBe('playlistOneShot');
    expect(JSON.stringify(loop)).not.toBe(JSON.stringify(cue));
  });

  it('adaptiveLoop state ister, diğerleri state taşıyamaz', () => {
    expect(() => validateBrief(musicBrief({ playback: 'adaptiveLoop' }))).toThrow(
      MusicDecisionError,
    );
    expect(() =>
      validateBrief(
        musicBrief({
          adaptive: {
            states: [
              { id: 'a', intensity: 0 },
              { id: 'b', intensity: 1 },
            ],
          },
        }),
      ),
    ).toThrow(AudioParamError);
  });

  it('state yoğunlukları 0 ile 1 uçlarını kapsamalı', () => {
    expect(() =>
      validateBrief(
        musicBrief({
          playback: 'adaptiveLoop',
          adaptive: {
            states: [
              { id: 'a', intensity: 0.2 },
              { id: 'b', intensity: 0.8 },
            ],
          },
        }),
      ),
    ).toThrow(/en düşük state 0/);
  });

  it.each([
    ['assetClass', ['assetClass'], 'sfx'],
    ['usage', ['usage'], 'boss'],
    ['valence', ['affect', 'valence'], 4],
    ['ölçü birimi', ['meter'], [4, 5]],
    ['tonal sistem listesi', ['tonal'], { systems: [] }],
    ['yoğunluk', ['rhythmicDensity'], 'çok'],
    ['bölüm rolü', ['form'], { sections: ['chorus'] }],
    ['uzunluk', ['length'], { bars: { min: 0, max: 4 } }],
    ['kanal', ['channels'], 3],
    ['korunan bant', ['spectralPriority'], { protect: [] }],
  ])('%s hatalıysa reddedilir', (_label, path, value) => {
    expect(() => validateBrief(edited(musicBrief(), path, value))).toThrow(AudioParamError);
  });

  it('serbest kaçınma notları korunur ama denetlenmez', () => {
    const brief = validateBrief(musicBrief({ avoidNotes: ['klişe olmasın'] }));
    expect(brief.kind === 'music' && brief.avoidNotes).toEqual(['klişe olmasın']);
  });

  it('kural listesi doğrulanır', () => {
    const brief = validateBrief(musicBrief({ avoid: [{ kind: 'max-polyphony', voices: 4 }] }));
    expect(brief.kind === 'music' && brief.avoid?.[0].kind).toBe('max-polyphony');
  });
});

describe('ThemeBookV1', HEAVY, () => {
  it('depo kitabını doğrular ve özetler', () => {
    const book = validateThemeBook(referenceThemeBook());
    expect(book.themeBookId).toBe('reference-theme');
    expect(themeBookHash(book)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('palet ve register kuralları tek kural listesine katılır', () => {
    const rules = themeBookRules(validateThemeBook(referenceThemeBook()));
    const ids = rules.map(ruleId);
    expect(ids).toContain('forbid-instrument:preset:honkyTonkPiano');
    expect(ids).toContain('register-limit:bass');
    expect(ids).toContain('max-polyphony');
  });

  it('aynı kural iki kez yazılamaz', () => {
    const book = referenceThemeBook();
    const avoid = [...(book.avoid as unknown[]), { kind: 'max-polyphony', voices: 3 }];
    expect(() => validateThemeBook({ ...book, avoid })).toThrow(/aynı kural/);
  });

  it.each([
    ['şema', ['schema'], 'MusicThemeBookV2'],
    ['kimlik', ['themeBookId'], 'Referans'],
    ['sürüm', ['version'], 0],
    ['sistem listesi', ['tonal'], { systems: [], roots: ['A2'] }],
    ['ölçü listesi', ['rhythm'], { meters: [], bpm: { min: 80, max: 120 } }],
    ['register bandı', ['register'], [{ role: 'bass', lowMidi: 80, highMidi: 20 }]],
    ['spektral bant', ['spectral'], [{ role: 'bass', centroidHz: { min: 2000, max: 20 } }]],
  ])('%s hatalıysa reddedilir', (_label, path, value) => {
    expect(() => validateThemeBook(edited(referenceThemeBook(), path, value))).toThrow(
      AudioParamError,
    );
  });

  it('override belgeleri gerekçe ister', () => {
    expect(validateOverrides([{ rule: 'max-polyphony', reason: 'yoğun final' }], 'o')).toHaveLength(
      1,
    );
    expect(() => validateOverrides([{ rule: 'max-polyphony' }], 'o')).toThrow(AudioParamError);
  });

  it('kural sözlüğü okunur açıklama üretir', () => {
    expect(
      describeRule(validateRule({ kind: 'forbid-interval', semitones: 1, scope: 'harmonic' }, 'r')),
    ).toContain('aynı anda');
    expect(describeRule(validateRule({ kind: 'forbid-system', system: 'lydian' }, 'r'))).toContain(
      'lydian',
    );
    expect(describeRule(validateRule({ kind: 'forbid-role', role: 'pad' }, 'r'))).toContain('pad');
    expect(
      describeRule(validateRule({ kind: 'max-density', notesPerBar: 8, scope: 'lane' }, 'r')),
    ).toContain('şerit');
    expect(
      describeRule(
        validateRule({ kind: 'register-limit', role: 'keys', lowMidi: 40, highMidi: 80 }, 'r'),
      ),
    ).toContain('keys');
    expect(() =>
      validateRule({ kind: 'forbid-interval', semitones: 0, scope: 'harmonic' }, 'r'),
    ).toThrow(AudioParamError);
  });
});

describe('enstrüman kaydı', HEAVY, () => {
  it('yalnız aralık ve rol beyan eden enstrümanları listeler', () => {
    const ids = instrumentIds();
    expect(ids.length).toBeGreaterThan(20);
    expect(ids).toContain('preset:subBass');
    expect(ids.every((id) => id.startsWith('preset:'))).toBe(true);
    expect(ids).not.toContain('preset:laserShot');
  });

  it('profil ölçülür ve ikinci çağrıda aynı kalır', () => {
    const first = instrumentProfile('preset:subBass');
    const second = instrumentProfile('preset:subBass');
    expect(second).toBe(first);
    expect(first.role).toBe('bass');
    expect(first.range.lowMidi).toBeLessThan(first.range.highMidi);
    expect(first.spectral).toHaveLength(3);
    expect(first.envelope.kind === 'transient' || first.envelope.kind === 'sustained').toBe(true);
  });

  it('kayıt özeti ölçüm İÇERMEZ (aynı katalog aynı özet)', () => {
    expect(instrumentRegistryHash()).toBe(instrumentRegistryHash());
  });

  it('enstrüman olmayan kimlik reddedilir', () => {
    expect(() => presetOf('grandPiano')).toThrow(/preset:/);
    expect(() => presetOf('preset:yokBöyleBirŞey')).toThrow(AudioParamError);
    expect(() => presetOf('preset:laserShot')).toThrow(/müzik enstrümanı değil/);
  });

  it('aralık dışı nota ve desteklenmeyen artikülasyon adıyla reddedilir', () => {
    const profile = instrumentProfile('preset:subBass');
    expect(assertInRange(profile, profile.range.lowMidi, 'x')).toBe(profile.range.lowMidi);
    expect(() => assertInRange(profile, profile.range.highMidi + 1, 'x')).toThrow(/aralığı MIDI/);
    const pluck = instrumentProfile('preset:harp');
    expect(assertArticulation(pluck, pluck.articulations[0], 'x')).toBe(pluck.articulations[0]);
    if (!pluck.articulations.includes('sustain')) {
      expect(() => assertArticulation(pluck, 'sustain', 'x')).toThrow(/yalnız/);
    }
  });
});
