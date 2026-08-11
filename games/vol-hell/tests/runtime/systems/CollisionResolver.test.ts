import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Vector2 } from '@volstudio/core';
import { bulletConfig } from '@/config/bullet';
import { CollisionResolver } from '@/runtime/systems/CollisionResolver';
import type { Border } from '@/runtime/entity/Border';
import type { Player } from '@/runtime/entity/Player';
import type { BulletManager } from '@/runtime/entity/BulletManager';
import type { EnemyManager } from '@/runtime/entity/EnemyManager';
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

function makeEnemy(x: number, y: number, radius = 10): FakeEnemy {
  const enemy: FakeEnemy = {
    isAlive: true,
    x,
    y,
    radius,
    scoreValue: 100,
    lastContactDamage: -Infinity,
    takeDamage: vi.fn((_amount: number) => {
      enemy.isAlive = false;
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

function makeResolver(opts: {
  player?: FakePlayer;
  bullets?: FakeBullet[];
  enemies?: FakeEnemy[];
  nearby?: FakeEnemy[];
  onEnemyKilled?: (score: number) => void;
  onPlayerDamaged?: () => void;
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
    {
      onEnemyKilled: opts.onEnemyKilled,
      onPlayerDamaged: opts.onPlayerDamaged,
    },
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
    const enemy = makeEnemy(0, 0);
    const bullet = makeBullet(0, 0);
    const onEnemyKilled = vi.fn();

    const { resolver, removeBulletSpy } = makeResolver({
      bullets: [bullet],
      enemies: [enemy],
      onEnemyKilled,
    });

    resolver.resolve(0);

    expect(enemy.takeDamage).toHaveBeenCalledWith(bullet.damage);
    expect(removeBulletSpy).toHaveBeenCalledWith(bullet);
    expect(bullet.isAlive).toBe(false);
    expect(onEnemyKilled).toHaveBeenCalledWith(enemy.scoreValue);
  });

  it('aynı karede ikinci mermi ölü düşmana çarpmaz ve kaldırılmaz', () => {
    const enemy = makeEnemy(0, 0);
    const bullet1 = makeBullet(0, 0);
    const bullet2 = makeBullet(0, 0);
    const onEnemyKilled = vi.fn();

    const { resolver, removeBulletSpy } = makeResolver({
      bullets: [bullet1, bullet2],
      enemies: [enemy],
      onEnemyKilled,
    });

    resolver.resolve(0);

    expect(enemy.takeDamage).toHaveBeenCalledTimes(1);
    expect(onEnemyKilled).toHaveBeenCalledTimes(1);
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
    // dist 0 ise bölme hatasından kaçınmak için çakışma çözülmez; hafif örtüşme yeterli.
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

  it('temas hasarı cooldown’a uygun şekilde uygulanır', () => {
    const enemy = makeEnemy(0, 0);
    const player = makePlayer(0, 0);
    const onPlayerDamaged = vi.fn();

    const { resolver } = makeResolver({
      player,
      enemies: [enemy],
      nearby: [enemy],
      onPlayerDamaged,
    });

    resolver.resolve(0);
    expect(player.takeDamage).toHaveBeenCalledWith(10);
    expect(onPlayerDamaged).toHaveBeenCalled();

    vi.clearAllMocks();
    resolver.resolve(100);
    expect(player.takeDamage).not.toHaveBeenCalled();
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
