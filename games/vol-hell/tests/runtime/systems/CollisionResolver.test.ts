import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Vector2 } from '@volstudio/core';
import { bulletConfig } from '@/config/bullet';
import { CollisionResolver } from '@/runtime/systems/CollisionResolver';
import type { Border } from '@/runtime/entity/Border';
import type { Player } from '@/runtime/entity/Player';
import type { BulletManager } from '@/runtime/entity/BulletManager';
import type { EnemyManager } from '@/runtime/entity/EnemyManager';
import type { Turret } from '@/runtime/entity/Turret';
import type { SpatialGrid } from '@/runtime/systems/SpatialGrid';

vi.mock('@/app/services', () => ({
  gameAudio: {
    playSfx: vi.fn(),
  },
}));

interface FakeBullet {
  isAlive: boolean;
  x: number;
  y: number;
  damage: number;
  destroy: () => void;
}

interface FakeEnemy {
  isAlive: boolean;
  x: number;
  y: number;
  radius: number;
  scoreValue: number;
  lastContactDamage: number;
  takeDamage: (_amount: number) => boolean;
  tryContactDamage: (time: number) => number;
  applyPush: (_x: number, _y: number, _border: Border) => void;
}

interface FakePlayer {
  getPosition: () => Vector2;
  takeDamage: (_amount: number) => boolean;
  applyPush: (_x: number, _y: number) => void;
}

interface FakeTurret {
  isAlive: boolean;
  x: number;
  y: number;
  radius: number;
  canTakeContactDamage: (time: number) => boolean;
  takeContactDamage: (amount: number, time: number) => boolean;
}

function makePlayer(x = 0, y = 0): FakePlayer {
  const pos = new Vector2(x, y);
  return {
    getPosition: () => pos,
    takeDamage: vi.fn(() => true),
    applyPush: vi.fn((px: number, py: number) => {
      pos.x += px;
      pos.y += py;
    }),
  };
}

function makeBullet(x: number, y: number, damage = bulletConfig.damage): FakeBullet {
  return {
    isAlive: true,
    x,
    y,
    damage,
    destroy: vi.fn(),
  };
}

function makeEnemy(x: number, y: number, radius = 10, onDeath?: () => void): FakeEnemy {
  const enemy: FakeEnemy = {
    isAlive: true,
    x,
    y,
    radius,
    scoreValue: 100,
    lastContactDamage: -Infinity,
    // Gerçek `Enemy.takeDamage` ölümde `onDeath` kancasını çağırır; ödül yolu
    // artık ÇARPIŞMADA değil ÖLÜMDE. Sahte düşman de aynısını yapar.
    takeDamage: vi.fn((_amount: number) => {
      if (!enemy.isAlive) return false;
      enemy.isAlive = false;
      onDeath?.();
      return true;
    }),
    tryContactDamage: vi.fn((time: number) => {
      if (time - enemy.lastContactDamage < 500) return 0;
      enemy.lastContactDamage = time;
      return 10;
    }),
    applyPush: vi.fn(),
  };
  return enemy;
}

function makeTurret(x = 0, y = 0): FakeTurret {
  return {
    isAlive: true,
    x,
    y,
    radius: 10,
    canTakeContactDamage: vi.fn(() => true),
    takeContactDamage: vi.fn(() => true),
  };
}

function makeResolver(opts: {
  player?: FakePlayer;
  bullets?: FakeBullet[];
  enemies?: FakeEnemy[];
  nearby?: FakeEnemy[];
  turret?: FakeTurret;
}): {
  resolver: CollisionResolver;
  player: FakePlayer;
  bullets: FakeBullet[];
  enemies: FakeEnemy[];
  bulletManager: BulletManager;
  enemyManager: EnemyManager;
  spatialGrid: SpatialGrid;
  removeBulletSpy: ReturnType<typeof vi.fn>;
} {
  const player = opts.player ?? makePlayer();
  const bullets = opts.bullets ?? [];
  const enemies = opts.enemies ?? [];
  const nearby = opts.nearby ?? enemies;

  const removeBulletSpy = vi.fn((b: FakeBullet) => {
    b.isAlive = false;
  });

  const bulletManager = {
    getBullets: () => bullets,
    removeBullet: removeBulletSpy,
  } as unknown as BulletManager;

  const enemyManager = {
    getEnemies: () => enemies,
  } as unknown as EnemyManager;

  const spatialGrid = {
    queryNearby: () => nearby,
  } as unknown as SpatialGrid;

  const border = {
    clampX: (v: number) => v,
    clampY: (v: number) => v,
  } as unknown as Border;

  const resolver = new CollisionResolver(
    player as unknown as Player,
    bulletManager as unknown as BulletManager,
    enemyManager as unknown as EnemyManager,
    spatialGrid as unknown as SpatialGrid,
    border,
    opts.turret ? { getTurret: () => opts.turret as unknown as Turret } : {},
  );

  return {
    resolver,
    player,
    bullets,
    enemies,
    bulletManager: bulletManager as unknown as BulletManager,
    enemyManager: enemyManager as unknown as EnemyManager,
    spatialGrid: spatialGrid as unknown as SpatialGrid,
    removeBulletSpy,
  };
}

describe('CollisionResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mermi düşmanı vurunca takeDamage çağrılır ve mermi kaldırılır', () => {
    const onDeath = vi.fn();
    const enemy = makeEnemy(0, 0, 10, onDeath);
    const bullet = makeBullet(0, 0);

    const { resolver, removeBulletSpy } = makeResolver({
      bullets: [bullet],
      enemies: [enemy],
    });

    resolver.resolve(0);

    expect(enemy.takeDamage).toHaveBeenCalledWith(bullet.damage);
    expect(removeBulletSpy).toHaveBeenCalledWith(bullet);
    expect(bullet.isAlive).toBe(false);
    // Ödül yolu çarpışmada DEĞİL ölümde: `Enemy.onDeath` bir kez tetiklenir.
    // Böylece kule/zincir/ateş ölümleri de aynı ödülü alır.
    expect(onDeath).toHaveBeenCalledTimes(1);
  });

  it('aynı karede ikinci mermi ölü düşmana çarpmaz ve kaldırılmaz', () => {
    const onDeath = vi.fn();
    const enemy = makeEnemy(0, 0, 10, onDeath);
    const bullet1 = makeBullet(0, 0);
    const bullet2 = makeBullet(0, 0);

    const { resolver, removeBulletSpy } = makeResolver({
      bullets: [bullet1, bullet2],
      enemies: [enemy],
    });

    resolver.resolve(0);

    expect(enemy.takeDamage).toHaveBeenCalledTimes(1);
    expect(onDeath).toHaveBeenCalledTimes(1);
    expect(removeBulletSpy).toHaveBeenCalledTimes(1);
    expect(removeBulletSpy).toHaveBeenCalledWith(bullet1);
    expect(bullet2.isAlive).toBe(true);
  });

  it('ölü düşman oyuncuya hasar veremez', () => {
    const enemy = makeEnemy(0, 0);
    enemy.isAlive = false;
    const player = makePlayer(0, 0);

    const { resolver } = makeResolver({
      player,
      enemies: [enemy],
      nearby: [enemy],
    });

    resolver.resolve(0);

    expect(enemy.tryContactDamage).not.toHaveBeenCalled();
    expect(player.takeDamage).not.toHaveBeenCalled();
    expect(enemy.applyPush).not.toHaveBeenCalled();
    expect(player.applyPush).not.toHaveBeenCalled();
  });

  it('oyuncu düşmanla örtüşünce her ikisi de itilir', () => {
    // Hafif örtüşmede iki gövde de deterministik biçimde itilir.
    const enemy = makeEnemy(10, 0, 20);
    const player = makePlayer(0, 0);

    const { resolver } = makeResolver({
      player,
      enemies: [enemy],
      nearby: [enemy],
    });

    resolver.resolve(0);

    expect(enemy.applyPush).toHaveBeenCalled();
    expect(player.applyPush).toHaveBeenCalled();
  });

  it('tam merkez çakışmasında da sonlu, deterministik ayırma uygular', () => {
    const enemy = makeEnemy(0, 0, 20);
    const player = makePlayer(0, 0);
    const { resolver } = makeResolver({ player, enemies: [enemy], nearby: [enemy] });

    resolver.resolve(0);

    expect(enemy.applyPush).toHaveBeenCalled();
    expect(player.applyPush).toHaveBeenCalled();
    const [pushX, pushY] = vi.mocked(player.applyPush).mock.calls[0];
    expect(Number.isFinite(pushX)).toBe(true);
    expect(Number.isFinite(pushY)).toBe(true);
  });

  it('mermi segmenti üzerindeki düşmanı endpoint dışında da vurur', () => {
    const enemy = makeEnemy(50, 0, 3);
    const bullet = { ...makeBullet(100, 0), previousPositionX: 0, previousPositionY: 0 };
    const { resolver, removeBulletSpy } = makeResolver({
      bullets: [bullet],
      enemies: [enemy],
      nearby: [enemy],
    });

    resolver.resolve(0);

    expect(enemy.takeDamage).toHaveBeenCalledWith(bullet.damage);
    expect(removeBulletSpy).toHaveBeenCalledWith(bullet);
  });

  it('ömrü dolan mermi son segment çarpışmasından önce atılmaz', () => {
    const enemy = makeEnemy(50, 0, 3);
    const bullet = {
      ...makeBullet(100, 0),
      previousPositionX: 0,
      previousPositionY: 0,
      isExpired: true,
    };
    const { resolver, removeBulletSpy } = makeResolver({
      bullets: [bullet],
      enemies: [enemy],
      nearby: [enemy],
    });

    resolver.resolve(0);

    expect(enemy.takeDamage).toHaveBeenCalledOnce();
    expect(removeBulletSpy).toHaveBeenCalledOnce();
  });

  it('aynı frame kalabalık temasında oyuncu yalnızca bir paket alır', () => {
    const enemies = [makeEnemy(0, 0), makeEnemy(0, 0)];
    const player = makePlayer(0, 0);
    const { resolver } = makeResolver({ player, enemies, nearby: enemies });

    resolver.resolve(1_000);

    expect(player.takeDamage).toHaveBeenCalledTimes(1);
  });

  it('temas hasarı cooldown’a uygun şekilde uygulanır', () => {
    const enemy = makeEnemy(0, 0);
    const player = makePlayer(0, 0);

    const { resolver } = makeResolver({
      player,
      enemies: [enemy],
      nearby: [enemy],
    });

    resolver.resolve(0);
    expect(player.takeDamage).toHaveBeenCalledWith(10);

    vi.clearAllMocks();
    resolver.resolve(100);
    expect(player.takeDamage).not.toHaveBeenCalled();
  });

  it('kalabalık aynı karede kuleye yalnızca bir temas paketi ulaştırır', () => {
    const enemies = Array.from({ length: 6 }, () => makeEnemy(0, 0));
    const turret = makeTurret();
    const { resolver } = makeResolver({
      player: makePlayer(1_000, 1_000),
      enemies,
      nearby: enemies,
      turret,
    });

    resolver.resolve(1_000);

    expect(turret.takeContactDamage).toHaveBeenCalledTimes(1);
    expect(turret.takeContactDamage).toHaveBeenCalledWith(10, 1_000);
    expect(
      enemies.filter((enemy) => vi.mocked(enemy.tryContactDamage).mock.calls.length > 0),
    ).toHaveLength(1);
  });

  it('kule temas kapısı kapalıyken düşman cooldown’unu tüketmez', () => {
    const enemy = makeEnemy(0, 0);
    const turret = makeTurret();
    vi.mocked(turret.canTakeContactDamage).mockReturnValue(false);
    const { resolver } = makeResolver({
      player: makePlayer(1_000, 1_000),
      enemies: [enemy],
      nearby: [enemy],
      turret,
    });

    resolver.resolve(1_100);

    expect(enemy.tryContactDamage).not.toHaveBeenCalled();
    expect(turret.takeContactDamage).not.toHaveBeenCalled();
  });

  it('çakışma yoksa push çağrılmaz', () => {
    const enemy = makeEnemy(1000, 1000);
    const player = makePlayer(0, 0);

    const { resolver } = makeResolver({
      player,
      enemies: [enemy],
      nearby: [enemy],
    });

    resolver.resolve(0);

    expect(enemy.applyPush).not.toHaveBeenCalled();
    expect(player.applyPush).not.toHaveBeenCalled();
  });
});
