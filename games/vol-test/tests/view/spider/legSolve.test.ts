import { describe, expect, it } from 'vitest';
import { WIDOW_LOOK } from '@/config/spiders';
import { maxFootDistance, solveLeg, type LegSolution } from '@/view/spider/legSolve';

const { femur, tibia } = WIDOW_LOOK.leg;
const hip = WIDOW_LOOK.body.hipHeight;
const solve = (distance: number, footHeight: number): LegSolution =>
  solveLeg(distance, hip, footHeight, femur, tibia, { kneeU: 0, kneeHeight: 0, footU: 0 });

describe('solveLeg', () => {
  it('iki kemiğin boyunu korur: diz, kalçadan femur kadar ve ayaktan tibia kadar uzaktır', () => {
    for (const [distance, footHeight] of [
      [43, 0],
      [35, 7],
      [47, 16.5],
      [25, 3],
    ]) {
      const sol = solve(distance, footHeight);
      expect(Math.hypot(sol.kneeU, sol.kneeHeight - hip)).toBeCloseTo(femur, 6);
      expect(Math.hypot(sol.footU - sol.kneeU, footHeight - sol.kneeHeight)).toBeCloseTo(tibia, 6);
    }
  });

  it('diz hep kalça-ayak doğrusunun ÜSTÜNDEDİR (örümcek bacağı yukarı bükülür)', () => {
    for (const footHeight of [0, 5, 11, 16.5]) {
      const sol = solve(41, footHeight);
      const lineHeight = hip + ((footHeight - hip) * sol.kneeU) / sol.footU;
      expect(sol.kneeHeight).toBeGreaterThan(lineHeight);
    }
  });

  it('ayak kalkınca diz de yükselir: havadaki adım yükseklik olarak okunur', () => {
    const planted = solve(43, 0);
    const lifted = solve(43, WIDOW_LOOK.leg.swingPeak);
    expect(lifted.kneeHeight).toBeGreaterThan(planted.kneeHeight + 3.6);
  });

  it('erişimin ötesindeki ayak sınıra çekilir ve kemikler gerilmez', () => {
    const sol = solve(1000, 0);
    expect(sol.footU).toBeCloseTo(maxFootDistance(hip, 0, femur, tibia), 9);
    expect(Math.hypot(sol.footU, hip)).toBeLessThanOrEqual(femur + tibia);
    expect(Math.hypot(sol.kneeU, sol.kneeHeight - hip)).toBeCloseTo(femur, 6);
  });

  it('kalçanın dibindeki ayak kemiklerin katlanabileceği en kısa mesafeye itilir; sonuç sonlu kalır', () => {
    const sol = solve(0, 0);
    expect(Number.isFinite(sol.kneeU)).toBe(true);
    expect(Number.isFinite(sol.kneeHeight)).toBe(true);
    expect(sol.kneeHeight).toBeGreaterThan(hip);
  });
});
