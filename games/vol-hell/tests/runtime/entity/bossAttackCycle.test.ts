import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StatBlock, createRandom } from '@volstudio/core';

const { playSfx } = vi.hoisted(() => ({
  playSfx: vi.fn<(event: string, options?: object) => Promise<void>>(() => Promise.resolve()),
}));
vi.mock('@/app/services', () => ({ gameAudio: { playSfx } }));

import { bossConfig } from '@/config/boss';
import { getEnemyDefinition } from '@/config/enemies/catalog';
import { BossController } from '@/runtime/entity/BossController';
import type { MinionSpawnRequest } from '@/runtime/entity/behaviors';
import type { Enemy } from '@/runtime/entity/Enemy';
import type { EffectManager } from '@/runtime/systems/EffectManager';
import type { TelegraphManager } from '@/runtime/systems/TelegraphManager';

/**
 * Boss durum makinesi: açılış → saldırı döngüsü → öfke → yıkım.
 *
 * Uyarılar (`TelegraphManager`) sahnede süre dolunca çözülür; burada test
 * onları elle çözer. Böylece "hasar uyarı SÖNDÜĞÜNDE, uyarı KONUMUNA göre"
 * sözleşmesi kare zamanlamasına bağlı kalmadan sınanır.
 */
interface Pending {
  options: { shape: string; radius?: number; width?: number; angle?: number; spread?: number };
  complete: (completed: boolean) => void;
  cancel: ReturnType<typeof vi.fn>;
}

const CONTACT_DAMAGE = 10;
const ORIGIN = { x: 500, y: 500 };

function setup() {
  const definition = getEnemyDefinition('sovereign');
  const stats = new StatBlock(definition.baseStats);
  const enemy = {
    x: ORIGIN.x,
    y: ORIGIN.y,
    isAlive: true,
    healthRatio: 1,
    getStats: () => stats,
    getHealthRatio: () => enemy.healthRatio,
    getContactDamage: () => CONTACT_DAMAGE,
    moveBy: vi.fn<(vx: number, vy: number, deltaMs: number) => void>(),
  };

  const pending: Pending[] = [];
  const telegraphs = {
    play: vi.fn((options: Pending['options']) => {
      let resolve!: (result: { completed: boolean }) => void;
      const promise = new Promise<{ completed: boolean }>((r) => (resolve = r));
      const entry: Pending = {
        options,
        complete: (completed) => resolve({ completed }),
        cancel: vi.fn(() => resolve({ completed: false })),
      };
      pending.push(entry);
      return { promise, cancel: entry.cancel };
    }),
  };

  const player = { x: ORIGIN.x, y: ORIGIN.y };
  const effects = { play: vi.fn<(name: string, x: number, y: number, angle?: number) => void>() };
  const damagePlayer = vi.fn<(amount: number) => void>();
  const spawnMinions = vi.fn<(parent: unknown, request: MinionSpawnRequest) => void>();

  const controller = new BossController(enemy as unknown as Enemy, definition, {
    effects: effects as unknown as EffectManager,
    telegraphs: telegraphs as unknown as TelegraphManager,
    random: createRandom(7),
    damagePlayer,
    getPlayerPosition: () => ({ ...player }) as never,
    spawnMinions,
  });

  const update = (deltaMs: number) =>
    controller.update(deltaMs, player as never, {} as never, {} as never);

  /** Sıradaki saldırıyı başlatır: bekleme süresini tek karede doldurur. */
  const trigger = () =>
    update(
      controller.getState() === 'opening'
        ? bossConfig.openingDelayMs
        : controller.getAttackIntervalMs(),
    );

  /** Bekleyen her uyarıyı çözer ve saldırının kalanının koşmasını bekler. */
  const resolveAll = async (completed = true) => {
    for (const entry of pending.splice(0)) entry.complete(completed);
    await new Promise((r) => setTimeout(r, 0));
  };

  return {
    controller,
    enemy,
    player,
    effects,
    damagePlayer,
    spawnMinions,
    telegraphs,
    pending,
    update,
    trigger,
    resolveAll,
  };
}

beforeEach(() => {
  playSfx.mockClear();
});

describe('BossController — açılış ve saldırı döngüsü', () => {
  it('açılış gecikmesi dolmadan saldırmaz, dolunca SLAM uyarısı başlar', () => {
    const boss = setup();

    boss.update(bossConfig.openingDelayMs - 1);
    expect(boss.telegraphs.play).not.toHaveBeenCalled();
    expect(boss.controller.getState()).toBe('opening');

    boss.update(1);
    expect(boss.controller.getState()).toBe('attacking');
    expect(boss.pending).toHaveLength(1);
    expect(boss.pending[0].options).toMatchObject({
      shape: 'circle',
      radius: bossConfig.slam.radiusPx,
    });
    expect(playSfx).toHaveBeenCalledWith('telegraph', expect.any(Object));
  });

  it('sıra rastgele değildir: slam → volley → summon → slam', async () => {
    const boss = setup();
    const shapes: string[] = [];

    for (let round = 0; round < 4; round++) {
      expect(boss.controller.getNextAttack()).toBe(['slam', 'volley', 'summon', 'slam'][round]);
      boss.trigger();
      shapes.push(boss.pending.map((entry) => entry.options.shape).join('+'));
      await boss.resolveAll();
      expect(boss.controller.getState()).toBe('idle');
    }

    expect(shapes).toEqual(['circle', 'line+line+line', 'cone', 'circle']);
  });

  it('saldırı sürerken yeni saldırı başlamaz', () => {
    const boss = setup();
    boss.trigger();
    boss.update(bossConfig.attackIntervalMs * 3);

    expect(boss.telegraphs.play).toHaveBeenCalledTimes(1);
  });

  it('geçersiz kare süresi zamanlayıcıyı ilerletmez', () => {
    const boss = setup();
    boss.update(Number.NaN);
    boss.update(-5_000);
    boss.update(bossConfig.openingDelayMs - 1);

    expect(boss.telegraphs.play).not.toHaveBeenCalled();
  });
});

describe('BossController — SLAM', () => {
  it('uyarı söndüğünde yarıçap içindeki oyuncu vurulur', async () => {
    const boss = setup();
    boss.trigger();
    boss.player.x = ORIGIN.x + bossConfig.slam.radiusPx - 1;

    await boss.resolveAll();

    expect(boss.effects.play).toHaveBeenCalledWith('bossSlam', ORIGIN.x, ORIGIN.y);
    expect(boss.damagePlayer).toHaveBeenCalledWith(
      CONTACT_DAMAGE * bossConfig.slam.damageMultiplier,
    );
  });

  it('hasar bossun GÜNCEL konumuna değil uyarının konumuna göre çözülür', async () => {
    const boss = setup();
    boss.trigger();
    boss.enemy.x = ORIGIN.x + 2_000;

    await boss.resolveAll();

    expect(boss.damagePlayer).toHaveBeenCalledTimes(1);
  });

  it('uyarı alanından kaçan oyuncu vurulmaz', async () => {
    const boss = setup();
    boss.trigger();
    boss.player.x = ORIGIN.x + bossConfig.slam.radiusPx + 1;

    await boss.resolveAll();

    expect(boss.damagePlayer).not.toHaveBeenCalled();
  });

  it('iptal edilen uyarı hasar vermez ve boss yeni saldırıya hazır döner', async () => {
    const boss = setup();
    boss.trigger();

    await boss.resolveAll(false);

    expect(boss.damagePlayer).not.toHaveBeenCalled();
    expect(boss.controller.getState()).toBe('idle');
  });
});

describe('BossController — VOLLEY', () => {
  async function toVolley() {
    const boss = setup();
    boss.trigger();
    await boss.resolveAll(false);
    boss.player.x = ORIGIN.x + 300;
    boss.player.y = ORIGIN.y;
    boss.trigger();
    return boss;
  }

  it('üç koridor oyuncuya yönelir ve eşit aralıkla yayılır', async () => {
    const boss = await toVolley();

    const angles = boss.pending.map((entry) => entry.options.angle ?? Number.NaN);
    expect(boss.pending.map((entry) => entry.options.shape)).toEqual(['line', 'line', 'line']);
    expect(angles[1]).toBeCloseTo(0, 10);
    expect(angles[0]).toBeCloseTo(-bossConfig.volley.laneSpreadRad, 10);
    expect(angles[2]).toBeCloseTo(bossConfig.volley.laneSpreadRad, 10);
    expect(boss.pending[0].options.width).toBe(bossConfig.volley.laneWidthPx);
  });

  it('koridordaki oyuncu tek salvodan yalnız BİR kez hasar alır', async () => {
    const boss = await toVolley();

    await boss.resolveAll();

    expect(boss.damagePlayer).toHaveBeenCalledTimes(1);
    expect(boss.damagePlayer).toHaveBeenCalledWith(
      CONTACT_DAMAGE * bossConfig.volley.damageMultiplier,
    );
  });

  it('koridorların dışına kaçan oyuncu vurulmaz; her koridor efekti oynar', async () => {
    const boss = await toVolley();
    boss.player.x = ORIGIN.x;
    boss.player.y = ORIGIN.y + 400;

    await boss.resolveAll();

    expect(boss.damagePlayer).not.toHaveBeenCalled();
    const volleys = boss.effects.play.mock.calls.filter(([name]) => name === 'bossVolley');
    expect(volleys).toHaveLength(bossConfig.volley.laneCount);
  });

  it('koridorlardan biri iptal edilirse salvo hasar vermez', async () => {
    const boss = await toVolley();
    boss.pending[1].cancel();

    await boss.resolveAll();

    expect(boss.damagePlayer).not.toHaveBeenCalled();
  });
});

describe('BossController — SUMMON', () => {
  it('sürü koni İÇİNE, uçlara oturmadan doğar', async () => {
    const boss = setup();
    for (let i = 0; i < 2; i++) {
      boss.trigger();
      await boss.resolveAll(false);
    }
    boss.player.x = ORIGIN.x;
    boss.player.y = ORIGIN.y + 300;
    boss.trigger();
    expect(boss.pending[0].options.shape).toBe('cone');

    await boss.resolveAll();

    expect(boss.effects.play).toHaveBeenCalledWith('bossSummon', ORIGIN.x, ORIGIN.y);
    expect(boss.spawnMinions).toHaveBeenCalledTimes(1);
    const [parent, request] = boss.spawnMinions.mock.calls[0];
    expect(parent).toBe(boss.controller.getEnemy());
    expect(request).toMatchObject({
      minionId: bossConfig.summon.minionId,
      count: bossConfig.summon.count,
      radius: bossConfig.summon.radiusPx,
    });

    const base = Math.PI / 2;
    const half = bossConfig.summon.spreadRad / 2;
    for (const angle of request.angles) {
      expect(angle).toBeGreaterThan(base - half);
      expect(angle).toBeLessThan(base + half);
    }
  });
});

describe('BossController — öfke, hareket ve yıkım', () => {
  it('can eşiğin altına inince öfke BİR kez tetiklenir ve tempo artar', () => {
    const boss = setup();
    const calm = boss.controller.getAttackIntervalMs();
    boss.enemy.healthRatio = bossConfig.enrageHealthRatio - 0.01;

    boss.update(0);
    boss.update(0);

    expect(boss.controller.isEnraged()).toBe(true);
    const spawns = boss.effects.play.mock.calls.filter(([name]) => name === 'bossSpawn');
    expect(spawns).toHaveLength(1);
    expect(playSfx.mock.calls.filter(([name]) => name === 'bossEnrage')).toHaveLength(1);
    expect(boss.controller.getAttackIntervalMs()).toBeCloseTo(
      calm * bossConfig.enrageIntervalMultiplier,
      6,
    );
  });

  it('saldırı dışında oyuncuya göre konum alır, saldırı sırasında durur', () => {
    const boss = setup();
    boss.player.x = ORIGIN.x + 3_000;

    boss.update(16);
    const [vx, vy] = boss.enemy.moveBy.mock.calls[0];
    expect(Math.hypot(vx, vy)).toBeGreaterThan(0);

    boss.trigger();
    boss.enemy.moveBy.mockClear();
    boss.update(16);
    expect(boss.enemy.moveBy.mock.calls[0].slice(0, 2)).toEqual([0, 0]);
  });

  it('destroy bekleyen uyarıyı iptal eder; saldırı sonradan hasar uygulamaz', async () => {
    const boss = setup();
    boss.trigger();
    const [entry] = boss.pending;

    boss.controller.destroy();
    await boss.resolveAll();

    expect(entry.cancel).toHaveBeenCalledTimes(1);
    expect(boss.damagePlayer).not.toHaveBeenCalled();
    expect(boss.controller.isAlive).toBe(false);
    expect(boss.controller.getState()).toBe('idle');
  });

  it('boss uyarı sürerken ölürse hasar uygulanmaz', async () => {
    const boss = setup();
    boss.trigger();
    boss.enemy.isAlive = false;

    await boss.resolveAll();

    expect(boss.damagePlayer).not.toHaveBeenCalled();
  });
});
