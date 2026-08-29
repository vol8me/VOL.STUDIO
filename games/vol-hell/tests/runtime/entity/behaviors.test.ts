import { describe, it, expect } from 'vitest';
import { createRandom } from '@volstudio/core';
import {
  applyRusherBehavior,
  applySeekBehavior,
  applyStandoffBehavior,
  applySwarmerBehavior,
  createMinionSpawnRequest,
  createRusherState,
  createSwarmerState,
  type MutableBehaviorContext,
  type VelocityOutput,
} from '@/runtime/entity/behaviors';
import type { RusherParams, SwarmerParams } from '@/config/enemies/types';

function makeContext(overrides: Partial<MutableBehaviorContext> = {}): MutableBehaviorContext {
  return {
    x: 0,
    y: 0,
    targetX: 100,
    targetY: 0,
    deltaMs: 16,
    speed: 100,
    random: createRandom(1),
    ...overrides,
  };
}

function makeOut(): VelocityOutput {
  return { x: 0, y: 0 };
}

const RUSHER_PARAMS: RusherParams = {
  triggerDistance: 200,
  windupMs: 300,
  dashSpeedMultiplier: 4,
  dashDurationMs: 200,
  recoverMs: 400,
  cooldownMs: 1000,
};

const SWARMER_PARAMS: SwarmerParams = {
  minionId: 'swarmling',
  spawnIntervalMs: 1000,
  maxMinions: 4,
  spawnCount: 2,
  spawnRadius: 20,
  standoffDistance: 200,
};

describe('applySeekBehavior', () => {
  it('hedefe doğru tam hızda gider', () => {
    const out = makeOut();
    applySeekBehavior(makeContext(), 10, out);
    expect(out.x).toBeCloseTo(100, 6);
    expect(out.y).toBeCloseTo(0, 6);
  });

  it('temas mesafesine gelince durur — içine girmez', () => {
    const out = makeOut();
    applySeekBehavior(makeContext({ targetX: 5 }), 10, out);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });

  it('hız vektörünün büyüklüğü stat hızına eşittir', () => {
    const out = makeOut();
    applySeekBehavior(makeContext({ targetX: 30, targetY: 40, speed: 50 }), 5, out);
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(50, 6);
  });

  it('üst üste binmiş konumda sıfır hız döner (bölme hatası yok)', () => {
    const out = makeOut();
    applySeekBehavior(makeContext({ targetX: 0, targetY: 0 }), 10, out);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });

  it('geçersiz bağlam hareket vektörüne sızmaz', () => {
    const out = makeOut();
    applySeekBehavior(
      makeContext({ x: Number.NaN, targetY: Infinity, speed: Number.NaN }),
      Number.NaN,
      out,
    );

    expect(out).toEqual({ x: 0, y: 0 });
  });
});

describe('applyStandoffBehavior', () => {
  it('mesafe fazlaysa yaklaşır', () => {
    const out = makeOut();
    applyStandoffBehavior(makeContext({ targetX: 500 }), 200, 0.1, out);
    expect(out.x).toBeGreaterThan(0);
  });

  it('mesafe azsa geri çekilir', () => {
    const out = makeOut();
    applyStandoffBehavior(makeContext({ targetX: 50 }), 200, 0.1, out);
    expect(out.x).toBeLessThan(0);
  });

  it('bant içinde durur — yaklaş/kaç titremesi olmaz', () => {
    const out = makeOut();
    applyStandoffBehavior(makeContext({ targetX: 200 }), 200, 0.1, out);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });
});

describe('applyRusherBehavior', () => {
  it('menzil dışındayken yaklaşır, atılıma geçmez', () => {
    const state = createRusherState();
    const out = makeOut();
    applyRusherBehavior(state, makeContext({ targetX: 600 }), RUSHER_PARAMS, 20, out);

    expect(state.phase).toBe('approach');
    expect(out.x).toBeCloseTo(100, 6);
  });

  it('menzile girince telegraf fazına geçer ve yerinde durur', () => {
    const state = createRusherState();
    const out = makeOut();
    const context = makeContext({ targetX: 150 });

    applyRusherBehavior(state, context, RUSHER_PARAMS, 20, out);
    expect(state.phase).toBe('windup');

    applyRusherBehavior(state, context, RUSHER_PARAMS, 20, out);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
  });

  it('telegraf bitince atılım başlar ve hız çarpanı uygulanır', () => {
    const state = createRusherState();
    const out = makeOut();
    const context = makeContext({ targetX: 150 });

    applyRusherBehavior(state, context, RUSHER_PARAMS, 20, out); // approach -> windup
    applyRusherBehavior(
      state,
      makeContext({ targetX: 150, deltaMs: RUSHER_PARAMS.windupMs }),
      RUSHER_PARAMS,
      20,
      out,
    );

    expect(state.phase).toBe('dash');
    expect(state.dashStarted).toBe(true);
    expect(out.x).toBeCloseTo(100 * RUSHER_PARAMS.dashSpeedMultiplier, 6);
  });

  it('atılım yönü kilitlenir — oyuncu kaçsa bile takip etmez', () => {
    const state = createRusherState();
    const out = makeOut();

    applyRusherBehavior(state, makeContext({ targetX: 150 }), RUSHER_PARAMS, 20, out);
    applyRusherBehavior(
      state,
      makeContext({ targetX: 150, deltaMs: RUSHER_PARAMS.windupMs }),
      RUSHER_PARAMS,
      20,
      out,
    );

    // Oyuncu tam ters yöne geçti; atılım hâlâ eski yöne devam etmeli.
    applyRusherBehavior(state, makeContext({ targetX: -150 }), RUSHER_PARAMS, 20, out);
    expect(out.x).toBeGreaterThan(0);
  });

  it('atılım -> toparlanma -> yaklaşma döngüsü tamamlanır', () => {
    const state = createRusherState();
    const out = makeOut();
    const near = { targetX: 150 };

    applyRusherBehavior(state, makeContext(near), RUSHER_PARAMS, 20, out);
    applyRusherBehavior(
      state,
      makeContext({ ...near, deltaMs: RUSHER_PARAMS.windupMs }),
      RUSHER_PARAMS,
      20,
      out,
    );
    expect(state.phase).toBe('dash');

    applyRusherBehavior(
      state,
      makeContext({ ...near, deltaMs: RUSHER_PARAMS.dashDurationMs }),
      RUSHER_PARAMS,
      20,
      out,
    );
    expect(state.phase).toBe('recover');
    expect(out.x).toBe(0);

    applyRusherBehavior(
      state,
      makeContext({ ...near, deltaMs: RUSHER_PARAMS.recoverMs }),
      RUSHER_PARAMS,
      20,
      out,
    );
    expect(state.phase).toBe('approach');
  });

  it('cooldown dolmadan ikinci atılım başlamaz', () => {
    const state = createRusherState();
    const out = makeOut();
    const near = { targetX: 150 };

    applyRusherBehavior(state, makeContext(near), RUSHER_PARAMS, 20, out);
    applyRusherBehavior(
      state,
      makeContext({ ...near, deltaMs: RUSHER_PARAMS.windupMs }),
      RUSHER_PARAMS,
      20,
      out,
    );
    applyRusherBehavior(
      state,
      makeContext({ ...near, deltaMs: RUSHER_PARAMS.dashDurationMs }),
      RUSHER_PARAMS,
      20,
      out,
    );
    applyRusherBehavior(
      state,
      makeContext({ ...near, deltaMs: RUSHER_PARAMS.recoverMs }),
      RUSHER_PARAMS,
      20,
      out,
    );

    // Toparlanma bitti; cooldown sıfırlandı, menzilde olsa bile beklemeli.
    applyRusherBehavior(state, makeContext(near), RUSHER_PARAMS, 20, out);
    expect(state.phase).toBe('approach');

    applyRusherBehavior(
      state,
      makeContext({ ...near, deltaMs: RUSHER_PARAMS.cooldownMs }),
      RUSHER_PARAMS,
      20,
      out,
    );
    expect(state.phase).toBe('windup');
  });

  it('dashStarted yalnızca atılımın başladığı frame’de true olur', () => {
    const state = createRusherState();
    const out = makeOut();
    const near = { targetX: 150 };

    applyRusherBehavior(state, makeContext(near), RUSHER_PARAMS, 20, out);
    expect(state.dashStarted).toBe(false);

    applyRusherBehavior(
      state,
      makeContext({ ...near, deltaMs: RUSHER_PARAMS.windupMs }),
      RUSHER_PARAMS,
      20,
      out,
    );
    expect(state.dashStarted).toBe(true);

    applyRusherBehavior(state, makeContext(near), RUSHER_PARAMS, 20, out);
    expect(state.dashStarted).toBe(false);
  });
});

describe('applySwarmerBehavior', () => {
  it('aralık dolmadan doğurma istemez', () => {
    const state = createSwarmerState();
    const request = createMinionSpawnRequest();
    const out = makeOut();

    const result = applySwarmerBehavior(state, makeContext(), SWARMER_PARAMS, out, request);
    expect(result).toBeNull();
  });

  it('aralık dolunca istenen sayıda minion ister', () => {
    const state = createSwarmerState();
    const request = createMinionSpawnRequest();
    const out = makeOut();

    const result = applySwarmerBehavior(
      state,
      makeContext({ deltaMs: SWARMER_PARAMS.spawnIntervalMs }),
      SWARMER_PARAMS,
      out,
      request,
    );

    expect(result).not.toBeNull();
    expect(result!.minionId).toBe(SWARMER_PARAMS.minionId);
    expect(result!.count).toBe(SWARMER_PARAMS.spawnCount);
    expect(result!.angles).toHaveLength(SWARMER_PARAMS.spawnCount);
    expect(result!.radius).toBe(SWARMER_PARAMS.spawnRadius);
  });

  it('kapasite doluysa doğurmaz ama biriken süreyi korur', () => {
    const state = createSwarmerState();
    state.aliveMinions = SWARMER_PARAMS.maxMinions;
    const request = createMinionSpawnRequest();
    const out = makeOut();

    const result = applySwarmerBehavior(
      state,
      makeContext({ deltaMs: SWARMER_PARAMS.spawnIntervalMs }),
      SWARMER_PARAMS,
      out,
      request,
    );

    expect(result).toBeNull();
    expect(state.spawnTimerMs).toBe(SWARMER_PARAMS.spawnIntervalMs);
  });

  it('kalan kapasite kadar doğurur — limiti aşmaz', () => {
    const state = createSwarmerState();
    state.aliveMinions = SWARMER_PARAMS.maxMinions - 1;
    const request = createMinionSpawnRequest();
    const out = makeOut();

    const result = applySwarmerBehavior(
      state,
      makeContext({ deltaMs: SWARMER_PARAMS.spawnIntervalMs }),
      SWARMER_PARAMS,
      out,
      request,
    );

    expect(result!.count).toBe(1);
  });

  it('doğum açıları seed’li — aynı seed aynı açıları verir', () => {
    const runOnce = (seed: number): number[] => {
      const state = createSwarmerState();
      const request = createMinionSpawnRequest();
      const out = makeOut();
      const result = applySwarmerBehavior(
        state,
        makeContext({ deltaMs: SWARMER_PARAMS.spawnIntervalMs, random: createRandom(seed) }),
        SWARMER_PARAMS,
        out,
        request,
      );
      return [...result!.angles];
    };

    expect(runOnce(5)).toEqual(runOnce(5));
    expect(runOnce(5)).not.toEqual(runOnce(6));
  });

  it('oyuncudan uzaktayken yaklaşır, standoff mesafesinde durur', () => {
    const state = createSwarmerState();
    const request = createMinionSpawnRequest();
    const out = makeOut();

    applySwarmerBehavior(state, makeContext({ targetX: 800 }), SWARMER_PARAMS, out, request);
    expect(out.x).toBeGreaterThan(0);

    applySwarmerBehavior(
      state,
      makeContext({ targetX: SWARMER_PARAMS.standoffDistance }),
      SWARMER_PARAMS,
      out,
      request,
    );
    expect(out.x).toBe(0);
  });

  it('geçersiz delta doğurma sayacını NaN yapmaz', () => {
    const state = createSwarmerState();
    const request = createMinionSpawnRequest();
    const out = makeOut();

    const result = applySwarmerBehavior(
      state,
      makeContext({ deltaMs: Number.NaN }),
      SWARMER_PARAMS,
      out,
      request,
    );

    expect(result).toBeNull();
    expect(Number.isFinite(state.spawnTimerMs)).toBe(true);
  });
});
