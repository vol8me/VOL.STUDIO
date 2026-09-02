import { describe, expect, it } from 'vitest';
import { arenaConfig } from '@/config/arena';
import { Arena } from '@/runtime/entity/Arena';
import { createFakeScene } from '../../support/phaserFakes';

function makeArena() {
  const scene = createFakeScene();
  const arena = new Arena(scene as never);
  return { arena, ground: scene.graphics[0], impact: scene.graphics[1] };
}

describe('Arena', () => {
  it('ızgarayı ve sınırı yapılandırmadaki ölçülerle çizer', () => {
    const { ground } = makeArena();

    const verticalLines = Math.ceil(arenaConfig.widthPx / arenaConfig.gridStepPx) - 1;
    const horizontalLines = Math.ceil(arenaConfig.heightPx / arenaConfig.gridStepPx) - 1;
    const moves = ground.calls.filter((call) => call.op === 'moveTo');

    expect(moves).toHaveLength(verticalLines + horizontalLines);
    expect(ground.calls.filter((call) => call.op === 'strokeRect')).toEqual([
      { op: 'strokeRect', args: [0, 0, arenaConfig.widthPx, arenaConfig.heightPx] },
    ]);
    expect(ground.calls.filter((call) => call.op === 'lineStyle')).toEqual([
      { op: 'lineStyle', args: [1, arenaConfig.gridColor, 1] },
      { op: 'lineStyle', args: [arenaConfig.borderWidthPx, arenaConfig.borderColor, 1] },
    ]);
  });

  it('çarpma yankısını duvarın ekseninde çizer ve süresi dolunca temizler', () => {
    const { arena, impact } = makeArena();

    arena.strike({ x: 0, y: 400, normalX: 1, normalY: 0, strength01: 1 });
    arena.update(16);

    const moveTo = impact.calls.find((call) => call.op === 'moveTo');
    const lineTo = impact.calls.find((call) => call.op === 'lineTo');
    // Dikey duvar: x sabit, y ekseninde uzanır.
    expect(moveTo?.args[0]).toBe(0);
    expect(lineTo?.args[0]).toBe(0);
    expect(lineTo?.args[1]).toBeGreaterThan(moveTo?.args[1] ?? 0);

    impact.calls.length = 0;
    // Yankı GERÇEK karelerle tükenir; tek bir dev delta kelepçelenir.
    for (let elapsed = 0; elapsed <= arenaConfig.impact.durationMs; elapsed += 16) {
      arena.update(16);
    }
    expect(impact.calls.at(-1)?.op).toBe('clear');

    impact.calls.length = 0;
    arena.update(16);
    expect(impact.calls).toHaveLength(0);
  });

  it('tek bir dev kare yankıyı yutmaz', () => {
    const { arena, impact } = makeArena();

    arena.strike({ x: 0, y: 400, normalX: 1, normalY: 0, strength01: 1 });
    // Sekme sonrası ilk kare yüzlerce ms olabilir; kelepçesiz bir yankı orada
    // tamamen tükenir ve çarpma hiç görülmezdi.
    arena.update(2000);

    expect(impact.calls.some((call) => call.op === 'strokePath')).toBe(true);
    expect(impact.calls.filter((call) => call.op === 'clear')).toHaveLength(1);
  });

  it('yatay duvarda yankı x ekseninde uzanır', () => {
    const { arena, impact } = makeArena();

    arena.strike({ x: 500, y: 0, normalX: 0, normalY: 1, strength01: 0.5 });
    arena.update(16);

    const moveTo = impact.calls.find((call) => call.op === 'moveTo');
    const lineTo = impact.calls.find((call) => call.op === 'lineTo');
    expect(moveTo?.args[1]).toBe(0);
    expect(lineTo?.args[1]).toBe(0);
    expect(lineTo?.args[0]).toBeGreaterThan(moveTo?.args[0] ?? 0);
  });

  it('destroy her iki katmanı da yok eder', () => {
    const { arena, ground, impact } = makeArena();

    arena.destroy();

    expect(ground.destroyed).toBe(true);
    expect(impact.destroyed).toBe(true);
  });
});
