import { describe, expect, it } from 'vitest';
import { WAR } from '@/config/war';
import { baseCenter, chooseSpawn, spawnCandidates } from '@/sim/war/Deployment';
import { SIZE } from './support';

const WORLD = { width: SIZE, height: SIZE };

describe('baseCenter', () => {
  it('üsler çaprazın karşıt uçlarındadır', () => {
    const a = baseCenter(WORLD, 0);
    const b = baseCenter(WORLD, 1);
    expect(a.x + b.x).toBeCloseTo(SIZE, 6);
    expect(a.y + b.y).toBeCloseTo(SIZE, 6);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(SIZE * 0.6);
  });
});

describe('spawnCandidates', () => {
  it.each([0, 1])('%i. cephenin adayları üs halkasının içindedir ve merkeze bakar', (faction) => {
    const candidates = spawnCandidates(WORLD, faction);
    const base = baseCenter(WORLD, faction);
    expect(candidates).toHaveLength(WAR.spawn.candidates);
    for (const candidate of candidates) {
      expect(Math.hypot(candidate.x - base.x, candidate.y - base.y)).toBeLessThanOrEqual(
        WAR.bases[faction].radius + 1e-6,
      );
      const toCenter = Math.atan2(SIZE / 2 - base.y, SIZE / 2 - base.x);
      expect(Math.cos(candidate.hull - toCenter)).toBeCloseTo(1, 6);
    }
  });

  it('komşu adaylar araç gövdesinden uzaktır', () => {
    const candidates = spawnCandidates(WORLD, 0);
    for (let a = 0; a < candidates.length; a++)
      for (let b = a + 1; b < candidates.length; b++)
        expect(
          Math.hypot(candidates[a].x - candidates[b].x, candidates[a].y - candidates[b].y),
        ).toBeGreaterThan(70);
  });
});

describe('chooseSpawn', () => {
  const candidates = spawnCandidates(WORLD, 0);

  it('tehdit yoksa salt ile döndürülmüş sıradaki ilk adayı seçer', () => {
    expect(chooseSpawn(candidates, [], 0)).toBe(candidates[0]);
    expect(chooseSpawn(candidates, [], 3)).toBe(candidates[3]);
  });

  it('tehditten en uzak adayı seçer', () => {
    const near = candidates[0];
    const chosen = chooseSpawn(candidates, [{ x: near.x, y: near.y }], 0, 100_000);
    expect(chosen).not.toBe(near);
    const gap = (point: { x: number; y: number }) => Math.hypot(point.x - near.x, point.y - near.y);
    for (const candidate of candidates) expect(gap(chosen)).toBeGreaterThanOrEqual(gap(candidate));
  });

  it('yeterince boş adaylar eşittir: ardışık doğanlar aynı noktaya yığılmaz', () => {
    const picks = new Set([0, 1, 2, 3, 4].map((salt) => chooseSpawn(candidates, [], salt)));
    expect(picks.size).toBe(5);
  });

  it('aynı girdide hep aynı sonuç, boş listede hata', () => {
    const threat = [{ x: candidates[2].x, y: candidates[2].y }];
    expect(chooseSpawn(candidates, threat, 7)).toBe(chooseSpawn(candidates, threat, 7));
    expect(() => chooseSpawn([], [])).toThrow(RangeError);
  });
});
