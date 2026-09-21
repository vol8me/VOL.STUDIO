import { describe, expect, it } from 'vitest';

import { measureFmAlias } from '../src/analysis/fmAlias';
import { FM_ALIAS_LIMITS, assessFmAlias, type FmAliasLevel } from '../src/analysis/fmRisk';
import type { FmParams, Waveform } from '../src/types';

/**
 * FM alias regresyon paketi: risk tahmini her koşuda ÖLÇÜMLE yüzleşir.
 *
 * Sözleşme "yanlış güvenli yok": kuralın `safe` dediği yerde ölçülen alias
 * güvenli eşiğin, `caution` dediği yerde dikkat eşiğinin üstüne çıkmaz. Tam
 * ızgara (1200 nokta) `scripts/fm-alias-report.ts` ile koşulur; burada sınıf
 * sınırlarını ve bilinen en kötü noktaları taşıyan alt küme ölçülür.
 */

const SEVERITY: Record<FmAliasLevel, number> = { safe: 0, caution: 1, risky: 2 };

function measuredLevel(db: number): FmAliasLevel {
  if (db <= FM_ALIAS_LIMITS.levels.safeMaxDb) return 'safe';
  return db <= FM_ALIAS_LIMITS.levels.cautionMaxDb ? 'caution' : 'risky';
}

type Case = [Exclude<Waveform, 'noise' | 'pink' | 'brown'>, number, FmParams];

const CASES: Case[] = [
  // Sinüs modülatör, feedback yok — ızgaranın en kötüleri ve eski decimator'un
  // katladığı yüksek index'li örnekler.
  ['sine', 1760, { index: 20, ratio: 3.5 }],
  ['sine', 5000, { index: 20, ratio: 2 }],
  ['sine', 917.1, { index: 25, ratio: 1 }],
  ['sine', 3571.7, { index: 8, ratio: 1 }],
  // Hafif feedback: güvenli sınırın iki yanı.
  ['sine', 440, { index: 5, ratio: 1, feedback: 0.1 }],
  ['sine', 1760, { index: 20, ratio: 1, feedback: 0.1 }],
  // Ağır feedback.
  ['sine', 110, { index: 0.5, ratio: 0.5, feedback: 0.3 }],
  ['sine', 440, { index: 2, ratio: 1, feedback: 0.3 }],
  // Üçgen.
  ['sine', 440, { modulatorWave: 'triangle', index: 2, ratio: 1 }],
  ['sine', 1760, { modulatorWave: 'triangle', index: 20, ratio: 1 }],
  ['sine', 440, { modulatorWave: 'triangle', index: 0.5, ratio: 1, feedback: 0.1 }],
  // Kenarlı modülatörler.
  ['sine', 110, { modulatorWave: 'sawtooth', index: 0.5, ratio: 1 }],
  ['sine', 440, { modulatorWave: 'sawtooth', index: 2, ratio: 1 }],
  ['sine', 1760, { modulatorWave: 'square', index: 10, ratio: 2 }],
  ['sine', 440, { modulatorWave: 'pulse', index: 5, ratio: 1, feedback: 0.3 }],
  // Sinüs olmayan taşıyıcı: kural onu kenarlı modülatör kadar riskli sayar.
  ['sawtooth', 220, { index: 2, ratio: 1 }],
  ['square', 880, { index: 1, ratio: 2 }],
];

describe('FM alias — ölçülmüş risk sınırları', () => {
  it('sinüs modülatör, feedback yok: index koruması içinde alias −80 dB altında', () => {
    // Eski 4. derece Butterworth decimator'da fc 917 Hz / I 25 → −20.8 dB,
    // fc 3572 Hz / I 8 → −22.4 dB ölçülmüştü (iç Nyquist'e izinli yan bantlar
    // 24–40 kHz'ten işitilir banda katlanıyordu).
    for (const [wave, frequency, fm] of CASES.slice(0, 4)) {
      expect(measureFmAlias(wave, frequency, fm).aliasToSignalDb, `${frequency} Hz`).toBeLessThan(
        -80,
      );
    }
  });

  it.each(CASES)('%s %s Hz %o — tahmin ölçümden iyimser değil', (wave, frequency, fm) => {
    const predicted = assessFmAlias({ frequency, fm, wave }).level;
    const measured = measuredLevel(measureFmAlias(wave, frequency, fm).aliasToSignalDb);
    expect(SEVERITY[predicted]).toBeGreaterThanOrEqual(SEVERITY[measured]);
  });

  it('kural boş değil: güvenli bölge güvenli, riskli bölge riskli ölçülür', () => {
    const safe = CASES.filter(
      ([w, f, fm]) => assessFmAlias({ frequency: f, fm, wave: w }).level === 'safe',
    );
    const risky = CASES.filter(
      ([w, f, fm]) => assessFmAlias({ frequency: f, fm, wave: w }).level === 'risky',
    );
    expect(safe.length).toBeGreaterThan(3);
    expect(risky.length).toBeGreaterThan(3);
    const riskyMeasured = risky.filter(
      ([w, f, fm]) => measuredLevel(measureFmAlias(w, f, fm).aliasToSignalDb) === 'risky',
    );
    expect(riskyMeasured.length).toBeGreaterThan(0);
  });

  it('motorun index korumasını uygular ve örnek oranıyla ölçeklenir', () => {
    // fc 3572 Hz, oran 1: koruma index'i ~8.1'de keser; 25 istemek sapmayı büyütmez.
    const guarded = assessFmAlias({ frequency: 3571.7, fm: { index: 25, ratio: 1 } });
    expect(guarded.effectiveIndex).toBeLessThan(8.2);
    const edge = { modulatorWave: 'sawtooth', index: 0.2, ratio: 1 } as const;
    // 440 Hz × 0.2 = 88 Hz sapma: 44.1 kHz'te güvenli sınırın (110 Hz) altında,
    // 22.05 kHz'te sınır yarıya iner (55 Hz) ve güvenli değildir.
    expect(assessFmAlias({ frequency: 440, fm: edge }).level).toBe('safe');
    expect(assessFmAlias({ frequency: 440, fm: edge, sampleRate: 22050 }).level).not.toBe('safe');
  });

  it('sınır tablosu makine-okunurdur (JSON gidiş-dönüş)', () => {
    expect(JSON.parse(JSON.stringify(FM_ALIAS_LIMITS))).toEqual(FM_ALIAS_LIMITS);
  });
});
