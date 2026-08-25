import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EffectManager } from '@/runtime/systems/EffectManager';
import { effectsConfig, type EffectId } from '@/config/effects';

interface FakeEmitter {
  config: Record<string, unknown>;
  depth: number;
  emitted: { x: number; y: number; count: number }[];
  angleSets: { min: number; max: number }[];
  destroyed: boolean;
  setDepth: (d: number) => FakeEmitter;
  setEmitterAngle: (v: { min: number; max: number }) => FakeEmitter;
  emitParticleAt: (x: number, y: number, count: number) => void;
  getAliveParticleCount: () => number;
  destroy: () => void;
}

interface FakeScene {
  emitters: FakeEmitter[];
  generatedTextures: string[];
  shakes: { duration: number; intensity: number }[];
  textureExists: boolean;
  time: { now: number };
}

function makeScene(): { scene: FakeScene; asPhaser: never } {
  const emitters: FakeEmitter[] = [];
  const generatedTextures: string[] = [];
  const shakes: { duration: number; intensity: number }[] = [];

  const scene = {
    emitters,
    generatedTextures,
    shakes,
    textureExists: false,
    time: { now: 0 },
    textures: {
      exists: () => scene.textureExists,
    },
    cameras: {
      main: {
        shake: (duration: number, intensity: number) => shakes.push({ duration, intensity }),
      },
    },
    add: {
      graphics: () => ({
        fillStyle: vi.fn(),
        fillCircle: vi.fn(),
        generateTexture: (key: string) => {
          generatedTextures.push(key);
          scene.textureExists = true;
        },
        destroy: vi.fn(),
      }),
      particles: (_x: number, _y: number, _texture: string, config: Record<string, unknown>) => {
        const emitter: FakeEmitter = {
          config,
          depth: 0,
          emitted: [],
          angleSets: [],
          destroyed: false,
          setDepth(d: number) {
            this.depth = d;
            return this;
          },
          setEmitterAngle(v: { min: number; max: number }) {
            this.angleSets.push(v);
            return this;
          },
          emitParticleAt(x: number, y: number, count: number) {
            this.emitted.push({ x, y, count });
          },
          getAliveParticleCount: () => 3,
          destroy() {
            this.destroyed = true;
          },
        };
        emitters.push(emitter);
        return emitter;
      },
    },
  };

  return { scene: scene as unknown as FakeScene, asPhaser: scene as never };
}

const EFFECT_IDS = Object.keys(effectsConfig) as EffectId[];

describe('EffectManager', () => {
  let scene: FakeScene;
  let asPhaser: never;

  beforeEach(() => {
    const made = makeScene();
    scene = made.scene;
    asPhaser = made.asPhaser;
  });

  it('partikül dokusunu bir kez üretir', () => {
    new EffectManager(asPhaser);
    expect(scene.generatedTextures).toHaveLength(1);
  });

  it('doku zaten varsa yeniden üretmez — sahne restart’ında kopya oluşmaz', () => {
    scene.textureExists = true;
    new EffectManager(asPhaser);
    expect(scene.generatedTextures).toHaveLength(0);
  });

  it('partikülü olan her efekt için bir emitter kurar', () => {
    new EffectManager(asPhaser);
    const withParticles = EFFECT_IDS.filter((id) => effectsConfig[id].particles);
    expect(scene.emitters).toHaveLength(withParticles.length);
  });

  it('emitter’lar kapalı başlar — akış yok, yalnızca olayla patlar', () => {
    new EffectManager(asPhaser);
    for (const emitter of scene.emitters) {
      expect(emitter.config.emitting).toBe(false);
    }
  });

  it('play verilen konumda config’teki sayıda partikül patlatır', () => {
    const effects = new EffectManager(asPhaser);
    effects.play('enemyDeath', 120, 240);

    const emitted = scene.emitters.flatMap((e) => e.emitted);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual({
      x: 120,
      y: 240,
      count: effectsConfig.enemyDeath.particles!.count,
    });
  });

  it('yönlü efektte açı, verilen yönün etrafına yayılır', () => {
    const effects = new EffectManager(asPhaser);
    effects.play('bulletTrail', 0, 0, 90);

    const spread = effectsConfig.bulletTrail.particles!.angleSpread!;
    const angleSets = scene.emitters.flatMap((e) => e.angleSets);
    expect(angleSets).toContainEqual({ min: 90 - spread, max: 90 + spread });
  });

  it('açı verilmezse emitter açısı değiştirilmez', () => {
    const effects = new EffectManager(asPhaser);
    effects.play('bulletTrail', 0, 0);
    expect(scene.emitters.flatMap((e) => e.angleSets)).toHaveLength(0);
  });

  it('efekt derinliği config’ten uygulanır', () => {
    new EffectManager(asPhaser);
    const depths = scene.emitters.map((e) => e.depth);
    expect(depths).toContain(effectsConfig.enemyHit.particles!.depth);
    expect(depths).toContain(effectsConfig.bulletTrail.particles!.depth);
  });

  it('sarsıntısı olan efekt kamerayı sarsar, ölçek uygulanır', () => {
    const effects = new EffectManager(asPhaser, { getShakeScale: () => 0.5 });
    effects.play('playerHit', 0, 0);

    const shake = effectsConfig.playerHit.shake!;
    expect(scene.shakes).toEqual([
      { duration: shake.durationMs, intensity: shake.intensity * 0.5 },
    ]);
  });

  it('sarsıntı kapalıysa (null) kamera sarsılmaz', () => {
    const effects = new EffectManager(asPhaser, { getShakeScale: () => null });
    effects.play('playerHit', 0, 0);
    expect(scene.shakes).toHaveLength(0);
  });

  it('ölçek sağlayıcı verilmezse sarsıntı uygulanmaz', () => {
    const effects = new EffectManager(asPhaser);
    effects.play('playerHit', 0, 0);
    expect(scene.shakes).toHaveLength(0);
  });

  it('sarsıntı cooldown’u spam’i keser, süre dolunca tekrar sarsar', () => {
    const effects = new EffectManager(asPhaser, { getShakeScale: () => 1 });
    const shake = effectsConfig.enemyDeath.shake!;

    effects.play('enemyDeath', 0, 0);
    effects.play('enemyDeath', 0, 0);
    expect(scene.shakes).toHaveLength(1);

    scene.time.now = shake.cooldownMs;
    effects.play('enemyDeath', 0, 0);
    expect(scene.shakes).toHaveLength(2);
  });

  it('sarsıntı cooldown’u efekt başına ayrıdır', () => {
    const effects = new EffectManager(asPhaser, { getShakeScale: () => 1 });
    effects.play('enemyDeath', 0, 0);
    effects.play('playerHit', 0, 0);
    expect(scene.shakes).toHaveLength(2);
  });

  it('sarsıntısı olmayan efekt kamerayı sarsmaz', () => {
    const effects = new EffectManager(asPhaser, { getShakeScale: () => 1 });
    effects.play('bulletBounce', 0, 0);
    expect(scene.shakes).toHaveLength(0);
  });

  it('aktif partikül sayısı tüm emitter’ların toplamıdır', () => {
    const effects = new EffectManager(asPhaser);
    expect(effects.getActiveParticleCount()).toBe(scene.emitters.length * 3);
  });

  it('destroy tüm emitter’ları yok eder', () => {
    const effects = new EffectManager(asPhaser);
    effects.destroy();

    expect(scene.emitters.every((e) => e.destroyed)).toBe(true);
    expect(effects.getActiveParticleCount()).toBe(0);
  });

  it('geçersiz konum/açı ve shake ölçeği partikül zincirini bozmaz', () => {
    const effects = new EffectManager(asPhaser, { getShakeScale: () => Number.NaN });

    effects.play('enemyDeath', Number.NaN, 0, Infinity);
    effects.play('enemyDeath', 0, 0, Infinity);

    expect(scene.emitters.flatMap((e) => e.emitted)).toHaveLength(1);
    expect(scene.emitters.flatMap((e) => e.angleSets)).toHaveLength(0);
    expect(scene.shakes).toHaveLength(0);
  });
});
