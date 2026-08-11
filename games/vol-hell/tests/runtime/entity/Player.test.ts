import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Phaser modülünü mock'la — gerçek Phaser.Game kurulumu bu testin kapsamı dışında.
// Player, scene.add.circle() ile bir Arc oluşturur; bunu stub'lıyoruz.
vi.mock('phaser', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('phaser');

  class FakeArc {
    x: number;
    y: number;
    scene: FakeScene;
    constructor(_x: number, _y: number, _scene: FakeScene) {
      this.x = _x;
      this.y = _y;
      this.scene = _scene;
    }
    setStrokeStyle() {
      return this;
    }
    setFillStyle() {
      return this;
    }
    setVisible() {
      return this;
    }
    destroy() {}
  }

  class FakeScene {
    add = {
      circle: vi.fn((x: number, y: number) => new FakeArc(x, y, this as unknown as FakeScene)),
    };
    tweens = {
      add: vi.fn(),
    };
    scale = { width: 800, height: 600 };
    events = { once: vi.fn() };
  }

  return {
    ...actual,
    default: {
      ...(actual.default as Record<string, unknown>),
      Scene: FakeScene,
    },
  };
});

import { Player } from '@/runtime/entity/Player';
import { playerConfig } from '@/config/player';
import { Vector2 } from '@volstudio/core';
import type { ParticlePool } from '@/runtime/systems/ParticlePool';

interface FakeArc {
  x: number;
  y: number;
  scene: FakeScene;
  setStrokeStyle: () => FakeArc;
  setFillStyle: () => FakeArc;
  setVisible: () => FakeArc;
  destroy: () => void;
}

interface FakeScene {
  add: { circle: (x: number, y: number) => FakeArc };
  tweens: { add: () => void };
  scale: { width: number; height: number };
  events: { once: () => void };
}

/** Border mock — clamp fonksiyonu pozisyonu sınır içine çeker. */
interface FakeBorder {
  bounds: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  };
  clamp: (x: number, y: number, r: number) => { x: number; y: number };
  clampX: (x: number, r: number) => number;
  clampY: (y: number, r: number) => number;
}

function makeBorder(): FakeBorder {
  const clampX = (x: number, r: number) => Math.max(60 + r, Math.min(740 - r, x));
  const clampY = (y: number, r: number) => Math.max(60 + r, Math.min(540 - r, y));
  return {
    bounds: {
      left: 60,
      right: 740,
      top: 60,
      bottom: 540,
      width: 680,
      height: 480,
      centerX: 400,
      centerY: 300,
    },
    clamp: (x: number, y: number, r: number) => ({ x: clampX(x, r), y: clampY(y, r) }),
    clampX,
    clampY,
  };
}

/** ParticlePool mock'u — acquire/release sadece stub döner. */
function makeParticlePool(): ParticlePool {
  const fakeArc = {
    x: 0,
    y: 0,
    setPosition() {
      return this;
    },
    setRadius() {
      return this;
    },
    setFillStyle() {
      return this;
    },
    setAlpha() {
      return this;
    },
    setScale() {
      return this;
    },
    setStrokeStyle() {
      return this;
    },
    setVisible() {
      return this;
    },
    setActive() {
      return this;
    },
    destroy() {},
  };
  return {
    acquire: () => fakeArc,
    release: () => {},
    destroy: () => {},
  } as unknown as ParticlePool;
}

describe('Player', () => {
  let scene: FakeScene;
  let particles: ParticlePool;

  beforeEach(() => {
    const sceneRef: {
      tweens: { add: () => void };
      add: { circle: (x: number, y: number) => FakeArc };
    } = {
      add: { circle: vi.fn() },
      tweens: { add: vi.fn() },
    };
    const arcFactory = (x: number, y: number): FakeArc => {
      const arc: FakeArc = {
        x,
        y,
        scene: sceneRef as unknown as FakeScene,
        setStrokeStyle: () => arc,
        setFillStyle: () => arc,
        setVisible: () => arc,
        destroy: () => {},
      };
      return arc;
    };
    sceneRef.add.circle = vi.fn(arcFactory);
    scene = {
      add: { circle: sceneRef.add.circle },
      tweens: { add: vi.fn() },
      scale: { width: 800, height: 600 },
      events: { once: vi.fn() },
    } as unknown as FakeScene;
    particles = makeParticlePool();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makePlayer(x: number, y: number): Player {
    return new Player(scene as unknown as never, x, y, particles);
  }

  it('constructor — ekran ortasında başlar, max can ile', () => {
    const player = makePlayer(400, 300);
    const pos = player.getPosition();
    expect(pos.x).toBe(400);
    expect(pos.y).toBe(300);
    expect(player.getHealth()).toBe(playerConfig.maxHealth);
    expect(player.getHealthRatio()).toBe(1);
    expect(player.isAlive()).toBe(true);
  });

  it("takeDamage — canı azaltır, 0'ın altına düşmez", () => {
    const player = makePlayer(0, 0);
    // Önce invulnerability'i kaldırmak için bekle (constructor'da invulnerable değil)
    player.takeDamage(30);
    expect(player.getHealth()).toBe(playerConfig.maxHealth - 30);
    expect(player.getHealthRatio()).toBeCloseTo(0.7, 2);
    expect(player.isAlive()).toBe(true);
  });

  it("takeDamage — ölümcül hasar canı 0'da tutar", () => {
    const player = makePlayer(0, 0);
    player.takeDamage(playerConfig.maxHealth + 50);
    expect(player.getHealth()).toBe(0);
    expect(player.isAlive()).toBe(false);
  });

  it('tryDash — ilk çağrıda true döner (şarj dolu)', () => {
    const player = makePlayer(0, 0);
    expect(player.tryDash(new Vector2(1, 0))).toBe(true);
  });

  it('tryDash — şarj boşken false döner', () => {
    const player = makePlayer(0, 0);
    expect(player.tryDash(new Vector2(1, 0))).toBe(true);
    // Şarj boşaldı, ikinci dash reddedilir
    expect(player.tryDash(new Vector2(1, 0))).toBe(false);
  });

  it('setMoveDirection + update — oyuncuyu hareket ettirir', () => {
    const player = makePlayer(100, 100);
    const dir = new Vector2(1, 0); // sağa
    player.setMoveDirection(dir);
    player.update(1000); // 1 saniye
    const pos = player.getPosition();
    // moveSpeed = 220 piksel/saniye, 1 saniye → 220 piksel sağa
    expect(pos.x).toBeCloseTo(100 + playerConfig.moveSpeed, 0);
    expect(pos.y).toBeCloseTo(100, 0);
  });

  it('update — dash sırasında dashSpeed kullanır', () => {
    const player = makePlayer(100, 100);
    player.tryDash(new Vector2(1, 0));
    player.update(100); // 0.1 saniye
    const pos = player.getPosition();
    // dashSpeed = 600 piksel/saniye, 0.1 saniye → 60 piksel
    expect(pos.x).toBeCloseTo(100 + playerConfig.dashSpeed * 0.1, 0);
  });

  it('destroy — hata fırlatmaz', () => {
    const player = makePlayer(0, 0);
    player.tryDash(new Vector2(1, 0));
    expect(() => player.destroy()).not.toThrow();
  });

  // === BUG-1: Dash yönü input tarafından overwrite edilmemeli ===
  it('BUG-1: dash sırasında setMoveDirection reddedilir — dash yönü korunur', () => {
    const player = makePlayer(100, 100);
    const border = makeBorder();
    player.setBorder(border as unknown as never);

    // Dash'i sağa başlat
    player.tryDash(new Vector2(1, 0));
    expect(player.canDash()).toBe(false);

    // Input sol istikamet gelsin — dash yönü korunmalı
    player.setMoveDirection(new Vector2(-1, 0));
    player.update(50); // dash devam ediyor (150ms)

    // Dash sağa devam etmeli, sola değil
    const pos = player.getPosition();
    expect(pos.x).toBeGreaterThan(100);
  });

  it('BUG-1: dash bittikten sonra setMoveDirection tekrar kabul edilir', () => {
    const player = makePlayer(100, 100);
    const border = makeBorder();
    player.setBorder(border as unknown as never);

    player.tryDash(new Vector2(1, 0));
    player.update(playerConfig.dashDurationMs); // dash biter — player sağa hareket etti
    const posAfterDashX = player.getX();

    // Artık input kabul edilmeli
    player.setMoveDirection(new Vector2(-1, 0));
    player.update(100);
    const pos = player.getPosition();
    // Sola hareket etmeli — posAfterDash'tan küçük olmalı
    expect(pos.x).toBeLessThan(posAfterDashX);
  });

  // === BUG-2: Player.update sonrası pozisyon güncel olmalı ===
  it('BUG-2: update sonrası getPosition güncel pozisyon döner', () => {
    const player = makePlayer(100, 100);
    const border = makeBorder();
    player.setBorder(border as unknown as never);

    const beforeX = player.getX();
    player.setMoveDirection(new Vector2(1, 0));
    player.update(1000);
    const after = player.getPosition();

    expect(after.x).not.toBe(beforeX);
    expect(after.x).toBeCloseTo(100 + playerConfig.moveSpeed, 0);
  });

  // === BUG-3: tryDash update'ten önce çağrılmalı — aynı frame'de dash hareketi ===
  it('BUG-3: tryDash + update aynı frame — dash hareketi hemen uygulanır', () => {
    const player = makePlayer(100, 100);
    const border = makeBorder();
    player.setBorder(border as unknown as never);

    // Önce input yönü set et, sonra dash, sonra update
    player.setMoveDirection(new Vector2(0, 0)); // hareketsiz
    player.tryDash(new Vector2(1, 0)); // dash sağa
    player.update(50); // ilk frame

    const pos = player.getPosition();
    // Dash hemen hareket etmeli — 50ms'de dashSpeed kadar
    expect(pos.x).toBeGreaterThan(100);
    const expectedDelta = playerConfig.dashSpeed * 0.05;
    expect(pos.x).toBeCloseTo(100 + expectedDelta, 0);
  });

  it('BUG-3: tryDash update sonrası çağrılırsa 1 frame gecikme — regresyon test', () => {
    const player = makePlayer(100, 100);
    const border = makeBorder();
    player.setBorder(border as unknown as never);

    // Yanlış sıra: update önce, dash sonra (eski bug senaryosu)
    player.setMoveDirection(new Vector2(0, 0));
    player.update(50); // önce update — dash yok, normal hız
    const posAfterUpdate = player.getPosition();

    // Dash şimdi tetiklendi ama bu frame'de hareket etmez
    player.tryDash(new Vector2(1, 0));
    const posAfterDash = player.getPosition();

    // Pozisyon değişmemeli — dash henüz uygulanmadı
    expect(posAfterDash.x).toBe(posAfterUpdate.x);
  });

  it('K1: analog hareket büyüklüğü korunur — yarım itilen çubuk yarım hız verir', () => {
    const player = makePlayer(100, 100);
    const border = makeBorder();
    player.setBorder(border as unknown as never);

    // normalizeAnalog çıktısı gibi 0..1 arası büyüklük taşıyan bir yön
    const halfPush = new Vector2(0.5, 0);
    player.setMoveDirection(halfPush);
    player.update(1000);

    expect(player.getPosition().x).toBeCloseTo(100 + playerConfig.moveSpeed * 0.5, 0);
  });

  it('K1: move() çağıranın vektörünü mutasyona uğratmaz', () => {
    const player = makePlayer(100, 100);
    const border = makeBorder();
    player.setBorder(border as unknown as never);

    const dir = new Vector2(0.5, 0);
    player.setMoveDirection(dir);
    player.update(16);

    // Hem dışarıdaki vektör hem içerideki kopya birim uzunluğa çekilmemeli
    expect(dir.length()).toBeCloseTo(0.5, 5);
  });

  it('K1: büyüklük 1i aşarsa hıza kelepçelenir', () => {
    const player = makePlayer(100, 100);
    const border = makeBorder();
    player.setBorder(border as unknown as never);

    player.setMoveDirection(new Vector2(5, 0));
    player.update(1000);

    expect(player.getPosition().x).toBeCloseTo(100 + playerConfig.moveSpeed, 0);
  });
});
