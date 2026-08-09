import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ParticlePool } from '@/runtime/systems/ParticlePool';

interface FakeArc {
  x: number;
  y: number;
  radius: number;
  color: number;
  alpha: number;
  visible: boolean;
  active: boolean;
  scale: number;
  killedTweens: boolean;
  destroyed: boolean;
  setPosition: (x: number, y: number) => FakeArc;
  setRadius: (r: number) => FakeArc;
  setFillStyle: (c: number, a: number) => FakeArc;
  setAlpha: (a: number) => FakeArc;
  setScale: (s: number) => FakeArc;
  setStrokeStyle: () => FakeArc;
  setVisible: (v: boolean) => FakeArc;
  setActive: (a: boolean) => FakeArc;
  destroy: () => void;
}

interface FakeScene {
  add: { circle: ReturnType<typeof vi.fn> };
  tweens: { add: ReturnType<typeof vi.fn>; killTweensOf: ReturnType<typeof vi.fn> };
}

function makeArc(x: number, y: number, radius: number, color: number, alpha: number): FakeArc {
  const arc: FakeArc = {
    x,
    y,
    radius,
    color,
    alpha,
    visible: true,
    active: true,
    scale: 1,
    killedTweens: false,
    destroyed: false,
    setPosition(x: number, y: number) {
      this.x = x;
      this.y = y;
      return this;
    },
    setRadius(r: number) {
      this.radius = r;
      return this;
    },
    setFillStyle(c: number, a: number) {
      this.color = c;
      this.alpha = a;
      return this;
    },
    setAlpha(a: number) {
      this.alpha = a;
      return this;
    },
    setScale(s: number) {
      this.scale = s;
      return this;
    },
    setStrokeStyle() {
      return this;
    },
    setVisible(v: boolean) {
      this.visible = v;
      return this;
    },
    setActive(a: boolean) {
      this.active = a;
      return this;
    },
    destroy() {
      this.destroyed = true;
    },
  };
  return arc;
}

function makeScene(): { scene: FakeScene; tweens: FakeScene['tweens']; created: FakeArc[] } {
  const created: FakeArc[] = [];
  const tweens = {
    add: vi.fn(),
    killTweensOf: vi.fn((arc: FakeArc) => {
      arc.killedTweens = true;
    }),
  };
  const scene = {
    add: {
      circle: vi.fn((x: number, y: number, radius: number, color: number, alpha: number) => {
        const arc = makeArc(x, y, radius, color, alpha);
        created.push(arc);
        return arc;
      }),
    },
    tweens,
  };
  return { scene: scene as unknown as FakeScene, tweens, created };
}

describe('ParticlePool', () => {
  let scene: FakeScene;
  let created: FakeArc[];

  beforeEach(() => {
    const s = makeScene();
    scene = s.scene;
    created = s.created;
  });

  it('başlangıçta önceden ayrılmış partikül yaratır', () => {
    new ParticlePool(scene as unknown as never, 3);
    expect(created.length).toBe(3);
    for (const arc of created) {
      expect(arc.visible).toBe(false);
      expect(arc.active).toBe(false);
    }
  });

  it('acquire — havuzdan partikül alır ve önceki tween’leri temizler', () => {
    const pool = new ParticlePool(scene as unknown as never, 2);
    const arc = pool.acquire(10, 20, 5, 0xff0000, 0.8) as unknown as FakeArc;
    expect(arc).toBe(created[1]);
    expect(arc.x).toBe(10);
    expect(arc.y).toBe(20);
    expect(arc.visible).toBe(true);
    expect(arc.active).toBe(true);
    expect(scene.tweens.killTweensOf).toHaveBeenCalledWith(arc);
  });

  it('release — partikülü geri verirken çalışan tween’leri öldürür', () => {
    const pool = new ParticlePool(scene as unknown as never, 1);
    const arc = pool.acquire(0, 0, 4, 0xffffff, 1) as unknown as FakeArc;
    arc.killedTweens = false;
    pool.release(arc as unknown as Phaser.GameObjects.Arc);
    expect(arc.visible).toBe(false);
    expect(arc.active).toBe(false);
    expect(arc.alpha).toBe(0);
    expect(arc.killedTweens).toBe(true);
  });

  it('yeniden kullanımda eski tween kill edilir ve partikül sıfırlanır', () => {
    const pool = new ParticlePool(scene as unknown as never, 1);
    const arc = pool.acquire(0, 0, 4, 0xffffff, 1) as unknown as FakeArc;
    pool.release(arc as unknown as Phaser.GameObjects.Arc);
    arc.killedTweens = false;
    const reused = pool.acquire(100, 200, 8, 0x00ff00, 0.5) as unknown as FakeArc;
    expect(reused).toBe(arc);
    expect(reused.x).toBe(100);
    expect(reused.y).toBe(200);
    expect(reused.radius).toBe(8);
    expect(reused.visible).toBe(true);
    expect(reused.killedTweens).toBe(true);
  });

  it('destroy — aktif ve havuzdaki tüm partikülleri yok eder ve tween’leri temizler', () => {
    const pool = new ParticlePool(scene as unknown as never, 2);
    const active = pool.acquire(1, 2, 3, 0xffffff, 1) as unknown as FakeArc;
    pool.destroy();
    expect(active.destroyed).toBe(true);
    for (const arc of created) {
      expect(arc.destroyed).toBe(true);
      expect(arc.killedTweens).toBe(true);
    }
  });
});
