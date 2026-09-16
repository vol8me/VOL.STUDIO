import { describe, expect, it } from 'vitest';
import {
  MAX_BAND_ERROR_UNITS,
  MAX_NORMAL_ANGLE_DEG,
  MAX_NORMAL_LENGTH_ERROR,
  measureDistanceContract,
} from '../support/distanceContract';

/*
 * C6'nın TAM korpusu (§8.1): 200 seed. Birim kapısında aynı iddianın dört
 * seedlik alt kümesi koşar; buradaki korpus sözleşmenin seed'e bağlı olmadığını
 * gösterir. Seedler sabit ve sürümlüdür — koşu başına yeniden üretilmez.
 */
const CORPUS = Array.from({ length: 200 }, (_, index) => 1000 + index * 7919);

describe('WorldDomain mesafe sözleşmesi — 200 seed korpusu', () => {
  it('bant hatası, işaret, bant üyeliği ve normal sözleşmesi bütün korpusta tutar', () => {
    const report = measureDistanceContract(CORPUS);

    expect(report.seeds).toBe(200);
    expect(report.bandSamples).toBeGreaterThan(200_000);
    expect(report.bandMaxAbsError).toBeLessThanOrEqual(MAX_BAND_ERROR_UNITS);
    expect(report.bandFailures).toBe(0);
    expect(report.signMismatches).toBe(0);
    expect(report.bandMembershipMismatches).toBe(0);
    expect(report.normalMaxLengthError).toBeLessThanOrEqual(MAX_NORMAL_LENGTH_ERROR);
    expect(report.normalMaxAngleDeg).toBeLessThanOrEqual(MAX_NORMAL_ANGLE_DEG);
    console.log(`[C6] 200 seed: ${JSON.stringify(report)}`);
  });
});
