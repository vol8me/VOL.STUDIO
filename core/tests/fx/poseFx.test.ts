import { describe, expect, it } from 'vitest';
import { GhostTrail } from '../../src/fx/GhostTrail';
import { PoseShadow } from '../../src/fx/PoseShadow';
import { samplePose, type PoseSourceNode } from '../../src/fx/poseSample';
import type { PoseSprite, PoseSpriteScene } from '../../src/fx/PoseSpritePool';

interface FakeSprite extends PoseSprite {
  key: string;
  x: number;
  y: number;
  rotation: number;
  alpha: number;
  visible: boolean;
  tint: number | null;
  depth: number;
  destroyed: boolean;
}

function createScene(): { scene: PoseSpriteScene; sprites: FakeSprite[] } {
  const sprites: FakeSprite[] = [];
  const scene: PoseSpriteScene = {
    add: {
      image(_x, _y, texture) {
        const sprite: FakeSprite = {
          key: texture,
          x: 0,
          y: 0,
          rotation: 0,
          alpha: 1,
          visible: true,
          tint: null,
          depth: 0,
          destroyed: false,
          setTexture(key) {
            this.key = key;
            return this;
          },
          setPosition(x, y) {
            this.x = x;
            this.y = y;
            return this;
          },
          setRotation(radians) {
            this.rotation = radians;
            return this;
          },
          setScale() {
            return this;
          },
          setOrigin() {
            return this;
          },
          setAlpha(alpha) {
            this.alpha = alpha;
            return this;
          },
          setTint(color) {
            this.tint = color;
            return this;
          },
          setVisible(visible) {
            this.visible = visible;
            return this;
          },
          setDepth(depth) {
            this.depth = depth;
            return this;
          },
          setBlendMode() {
            return this;
          },
          destroy() {
            this.destroyed = true;
          },
        };
        sprites.push(sprite);
        return sprite;
      },
    },
  };
  return { scene, sprites };
}

interface MatrixCall {
  world: unknown;
  parent: unknown;
}

function leaf(
  key: string,
  x: number,
  y: number,
  visible = true,
  calls?: MatrixCall[],
): PoseSourceNode {
  const decomposed = {
    translateX: x,
    translateY: y,
    rotation: 0.25,
    scaleX: 2,
    scaleY: 3,
  };
  return {
    visible,
    alpha: 0.8,
    texture: { key },
    originX: 0.5,
    originY: 0.5,
    // Gerçek motor argümansız çağrıda YENİ matris ayırır; ikiz de öyle yapar
    // ki yeniden kullanımın gerçekten işlediği ölçülebilsin.
    getWorldTransformMatrix: (world, parent) => {
      calls?.push({ world, parent });
      return world ?? { decomposeMatrix: () => decomposed };
    },
  };
}

const tree = (): PoseSourceNode => ({
  list: [leaf('body', 10, 20), { list: [leaf('leg', 30, 40)] }],
});

describe('samplePose', () => {
  it('ağacı çizim sırasıyla dünya uzayına düzleştirir', () => {
    const samples = samplePose(tree());

    expect(samples.map((sample) => sample.textureKey)).toEqual(['body', 'leg']);
    expect(samples[1]).toMatchObject({ x: 30, y: 40, rotation: 0.25, scaleX: 2, scaleY: 3 });
    expect(samples[0].alpha).toBe(0.8);
  });

  it('görünmez düğümleri ve alt ağaçlarını atlar', () => {
    const samples = samplePose({
      list: [leaf('a', 0, 0), { visible: false, list: [leaf('b', 0, 0)] }, leaf('c', 0, 0, false)],
    });

    expect(samples.map((sample) => sample.textureKey)).toEqual(['a']);
  });

  it('verilen diziyi yeniden kullanır — kare başına ayırma yapmaz', () => {
    const out = samplePose(tree());
    const again = samplePose(tree(), out);

    expect(again).toBe(out);
    expect(again).toHaveLength(2);
  });

  it('verilen matrisleri YENİDEN KULLANIR — kare başına ayırma yapmaz', () => {
    const calls: MatrixCall[] = [];
    const tree: PoseSourceNode = {
      list: [leaf('a', 1, 2, true, calls), leaf('b', 3, 4, true, calls)],
    };
    const scratch = {};

    samplePose(tree, [], scratch);
    samplePose(tree, [], scratch);

    // İlk yaprak iki matrisi kaynaktan alır (argümansız iki çağrı); geri kalan
    // her sorgu o matrisleri taşır.
    const argumentless = calls.filter((call) => call.world === undefined);
    expect(argumentless).toHaveLength(2);
    expect(calls.length).toBeGreaterThan(argumentless.length);
    for (const call of calls.slice(argumentless.length)) {
      expect(call.world).toBeDefined();
      expect(call.parent).toBeDefined();
    }
  });

  it('scratch verilmezse matrisleri kaynağa bırakır', () => {
    const calls: MatrixCall[] = [];
    samplePose({ list: [leaf('a', 1, 2, true, calls)] });

    expect(calls).toEqual([{ world: undefined, parent: undefined }]);
  });

  it('dokusu ya da dönüşümü olmayan yaprağı yok sayar', () => {
    expect(samplePose({ list: [{ alpha: 1 }, { texture: { key: 'x' } }] })).toHaveLength(0);
  });
});

describe('GhostTrail', () => {
  const OPTIONS = {
    maxGhosts: 2,
    lifespanMs: 100,
    captureIntervalMs: 40,
    startAlpha: 0.5,
    endAlpha: 0,
    tint: 0xff0000,
    depth: -10,
  };

  it('geçersiz yapılandırmayı reddeder', () => {
    const { scene } = createScene();
    expect(() => new GhostTrail(scene, { ...OPTIONS, maxGhosts: 0 })).toThrow(/maxGhosts/);
    expect(() => new GhostTrail(scene, { ...OPTIONS, lifespanMs: 0 })).toThrow(/lifespanMs/);
  });

  it('yakalama aralığı dolmadan yeni hayalet bırakmaz', () => {
    const { scene } = createScene();
    const trail = new GhostTrail(scene, OPTIONS);

    trail.capture(tree());
    expect(trail.activeCount).toBe(1);

    trail.update(10);
    trail.capture(tree());
    expect(trail.activeCount).toBe(1);

    trail.update(40);
    trail.capture(tree());
    expect(trail.activeCount).toBe(2);
  });

  it('hayaleti ömrü boyunca söndürür ve süresi dolunca gizler', () => {
    const { scene, sprites } = createScene();
    const trail = new GhostTrail(scene, OPTIONS);

    trail.capture(tree());
    expect(sprites.every((sprite) => sprite.tint === OPTIONS.tint)).toBe(true);
    expect(sprites[0].alpha).toBeCloseTo(0.8 * 0.5, 6);

    trail.update(50);
    expect(sprites[0].alpha).toBeLessThan(0.8 * 0.5);
    expect(sprites[0].visible).toBe(true);

    trail.update(60);
    expect(trail.activeCount).toBe(0);
    expect(sprites.every((sprite) => !sprite.visible)).toBe(true);
  });

  it('dolu havuzda EN ESKİ hayaleti geri dönüştürür', () => {
    const { scene, sprites } = createScene();
    const trail = new GhostTrail(scene, OPTIONS);

    trail.capture(tree());
    trail.update(40);
    trail.capture(tree());
    trail.update(40);
    trail.capture(tree());

    expect(trail.activeCount).toBe(2);
    // İki hayalet × iki parça: sprite sayısı havuz sınırında kalır.
    expect(sprites).toHaveLength(4);
  });

  it('boş poz hayalet üretmez ve yakalama sayacını TÜKETMEZ', () => {
    const { scene } = createScene();
    const trail = new GhostTrail(scene, OPTIONS);

    trail.capture({ list: [] });
    expect(trail.activeCount).toBe(0);

    // Sayaç tüketilseydi bu yakalama aralık dolmadığı için atlanırdı.
    trail.capture(tree());
    expect(trail.activeCount).toBe(1);
  });

  it('clear tüm izi siler, destroy sprite kümesini yok eder, tekrarı güvenlidir', () => {
    const { scene, sprites } = createScene();
    const trail = new GhostTrail(scene, OPTIONS);

    trail.capture(tree());
    trail.clear();
    expect(trail.activeCount).toBe(0);

    trail.destroy();
    trail.destroy();
    expect(sprites.every((sprite) => sprite.destroyed)).toBe(true);

    // Yok edilmiş iz sessizleşir.
    trail.capture(tree());
    trail.update(16);
    expect(trail.activeCount).toBe(0);
  });
});

describe('PoseShadow', () => {
  it('pozu ofsetle ve tek renkle çizer', () => {
    const { scene, sprites } = createScene();
    const shadow = new PoseShadow(scene, {
      offsetX: 5,
      offsetY: 7,
      alpha: 0.3,
      depth: -20,
    });

    shadow.update(tree());

    expect(sprites).toHaveLength(2);
    expect(sprites[0]).toMatchObject({ x: 15, y: 27, tint: 0x000000, depth: -20 });
    expect(sprites[0].alpha).toBeCloseTo(0.8 * 0.3, 6);
  });

  it('kaynak küçüldüğünde fazla sprite GİZLENİR, yok edilmez', () => {
    const { scene, sprites } = createScene();
    const shadow = new PoseShadow(scene, { offsetX: 0, offsetY: 0, alpha: 1, depth: 0 });

    shadow.update(tree());
    shadow.update({ list: [leaf('body', 0, 0)] });

    expect(sprites).toHaveLength(2);
    expect(sprites[1].visible).toBe(false);
    expect(sprites[1].destroyed).toBe(false);
  });

  it('destroy tekrarlanabilir ve sonrasında çizim yapmaz', () => {
    const { scene, sprites } = createScene();
    const shadow = new PoseShadow(scene, { offsetX: 0, offsetY: 0, alpha: 1, depth: 0 });

    shadow.update(tree());
    shadow.destroy();
    shadow.destroy();
    shadow.update(tree());

    // Yok edilmiş gölge yeni sprite açmaz; mevcutları da bırakmaz.
    expect(sprites).toHaveLength(2);
    expect(sprites.every((sprite) => sprite.destroyed)).toBe(true);
  });
});
