import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assembleRig, preloadRigTextures } from '../../src/rig/assembleRig';
import type { RigDefinition } from '../../src/rig/types';

/**
 * Phaser sahnesinin `assembleRig`/`preloadRigTextures` tarafından kullanılan
 * yüzeyi. Gerçek `Phaser.Game` başlatmak WebGL/canvas ister; montaj mantığı
 * bundan bağımsız doğrulanabilir.
 */
function fakeScene(loadedKeys: string[] = []) {
  const textures = new Set(loadedKeys);
  const containers: FakeContainer[] = [];
  const images: FakeImage[] = [];

  interface FakeImage {
    x: number;
    y: number;
    key: string;
    scale: number;
    setScale(value: number): void;
  }
  interface FakeContainer {
    x: number;
    y: number;
    rotation: number;
    children: unknown[];
    add(child: unknown): void;
  }

  const scene = {
    textures: { exists: (key: string) => textures.has(key) },
    load: { image: vi.fn((key: string) => textures.add(key)) },
    add: {
      container: (x: number, y: number): FakeContainer => {
        const c: FakeContainer = {
          x,
          y,
          rotation: 0,
          children: [],
          add(child) {
            this.children.push(child);
          },
        };
        containers.push(c);
        return c;
      },
      image: (x: number, y: number, key: string): FakeImage => {
        const img: FakeImage = {
          x,
          y,
          key,
          scale: 1,
          setScale(value) {
            this.scale = value;
          },
        };
        images.push(img);
        return img;
      },
    },
  };

  return { scene, containers, images, textures };
}

function rigFixture(): RigDefinition {
  return {
    entityId: 'test_unit',
    rootSizePx: { width: 200, height: 200 },
    exportScale: 2,
    parts: [
      {
        partId: 'top_cap',
        parentPartId: null,
        textureKey: 'test_unit__top_cap',
        textureUrl: '/assets/top_cap.png',
        logicalSizePx: { width: 16, height: 6.4 },
        positionPx: { x: 104, y: 32 },
        rotationDeg: 0,
      },
      {
        partId: 'leg_l',
        parentPartId: null,
        textureKey: 'test_unit__leg_l',
        textureUrl: '/assets/leg_l.png',
        logicalSizePx: { width: 10, height: 20 },
        positionPx: { x: 40, y: 120 },
        rotationDeg: 90,
      },
    ],
  };
}

const ALL_KEYS = ['test_unit__top_cap', 'test_unit__leg_l'];

describe('preloadRigTextures', () => {
  it('her parça için yükleme kuyruğuna bir istek koyar', () => {
    const { scene } = fakeScene();
    preloadRigTextures(scene as never, rigFixture());

    expect(scene.load.image).toHaveBeenCalledTimes(2);
    expect(scene.load.image).toHaveBeenCalledWith('test_unit__top_cap', '/assets/top_cap.png');
  });

  it('zaten yüklenmiş texture yeniden istenmez', () => {
    const { scene } = fakeScene(['test_unit__top_cap']);
    preloadRigTextures(scene as never, rigFixture());

    expect(scene.load.image).toHaveBeenCalledTimes(1);
    expect(scene.load.image).toHaveBeenCalledWith('test_unit__leg_l', '/assets/leg_l.png');
  });
});

describe('assembleRig', () => {
  let harness: ReturnType<typeof fakeScene>;

  beforeEach(() => {
    harness = fakeScene(ALL_KEYS);
  });

  it('texture yüklenmemişse eksik parçaları adıyla bildirir', () => {
    const { scene } = fakeScene(['test_unit__top_cap']);

    expect(() => assembleRig(scene as never, rigFixture())).toThrow(/leg_l/);
    expect(() => assembleRig(scene as never, rigFixture())).toThrow(/preloadRigTextures/);
  });

  it('hiçbir texture yoksa tüm eksikleri tek hatada listeler', () => {
    const { scene } = fakeScene();

    expect(() => assembleRig(scene as never, rigFixture())).toThrow(/top_cap, leg_l/);
  });

  it('her parça için partId ile erişilebilir bir pivot döner', () => {
    const rig = assembleRig(harness.scene as never, rigFixture());

    expect([...rig.parts.keys()]).toEqual(['top_cap', 'leg_l']);
  });

  it('pivotları rig merkezine göreli konumlandırır', () => {
    const rig = assembleRig(harness.scene as never, rigFixture());

    const topCap = rig.parts.get('top_cap') as unknown as { x: number; y: number };
    expect(topCap.x).toBe(4);
    expect(topCap.y).toBe(-68);
  });

  it('parçanın kendi rotasyonunu pivota radyan olarak uygular', () => {
    const rig = assembleRig(harness.scene as never, rigFixture());

    const leg = rig.parts.get('leg_l') as unknown as { rotation: number };
    expect(leg.rotation).toBeCloseTo(Math.PI / 2, 10);
  });

  it("sprite'ı pivot içinde ortalar ve 1/exportScale ile ölçekler", () => {
    assembleRig(harness.scene as never, rigFixture());

    const topCapSprite = harness.images[0];
    expect(topCapSprite?.x).toBe(8);
    expect(topCapSprite?.y).toBe(3.2);
    expect(topCapSprite?.scale).toBe(0.5);
  });

  it('tüm pivotları tek bir kök container altında toplar', () => {
    const rig = assembleRig(harness.scene as never, rigFixture());

    const root = rig.container as unknown as { children: unknown[] };
    expect(root.children).toHaveLength(2);
  });

  it('çizim sırası rig.parts sırasını korur', () => {
    assembleRig(harness.scene as never, rigFixture());

    expect(harness.images.map((img) => img.key)).toEqual(ALL_KEYS);
  });
});

describe('eklemli rig montajı', () => {
  function part(over: { partId: string; parentPartId?: string | null; x?: number; y?: number }) {
    return {
      partId: over.partId,
      parentPartId: over.parentPartId ?? null,
      textureKey: `robot__${over.partId}`,
      textureUrl: `/assets/${over.partId}.png`,
      logicalSizePx: { width: 10, height: 10 },
      positionPx: { x: over.x ?? 100, y: over.y ?? 100 },
      rotationDeg: 0,
    };
  }

  function rigOf(parts: ReturnType<typeof part>[]): RigDefinition {
    return {
      entityId: 'robot',
      rootSizePx: { width: 200, height: 200 },
      exportScale: 1,
      parts,
    };
  }

  /** Sahte container'ın çocuk dizisi `children` adını taşır (Phaser'da `list`). */
  const childrenOf = (c: unknown) => (c as { children: unknown[] }).children;

  const keysOf = (parts: ReturnType<typeof part>[]) => parts.map((p) => p.textureKey);

  it("alt parça KÖKE değil ÜST PARÇANIN container'ına eklenir", () => {
    const parts = [
      part({ partId: 'kol', x: 100, y: 100 }),
      part({ partId: 'onkol', parentPartId: 'kol', x: 140, y: 100 }),
    ];
    const { scene } = fakeScene(keysOf(parts));

    const { container, parts: built } = assembleRig(scene as never, rigOf(parts));

    // Kök yalnızca ÜST parçayı taşır; alt parça onun içindedir.
    expect((container as unknown as { children: unknown[] }).children).toHaveLength(1);
    expect((container as unknown as { children: unknown[] }).children[0]).toBe(built.get('kol'));
    expect(childrenOf(built.get('kol'))).toContain(built.get('onkol'));
  });

  it('üç seviyeli zincir sırayla kurulur (kol → önkol → el)', () => {
    const parts = [
      part({ partId: 'kol' }),
      part({ partId: 'onkol', parentPartId: 'kol' }),
      part({ partId: 'el', parentPartId: 'onkol' }),
    ];
    const { scene } = fakeScene(keysOf(parts));

    const { parts: built } = assembleRig(scene as never, rigOf(parts));

    expect(childrenOf(built.get('kol'))).toContain(built.get('onkol'));
    expect(childrenOf(built.get('onkol'))).toContain(built.get('el'));
  });

  it('ebeveyn kurulmamışsa açık hata verir (savunma dalı)', () => {
    // `buildRigDefinition` bunu zaten engelliyor; ama `assembleRig` elle
    // kurulmuş bir RigDefinition da alabilir ve o durumda parça sessizce
    // düşerdi.
    const parts = [part({ partId: 'onkol', parentPartId: 'olmayan' })];
    const { scene } = fakeScene(keysOf(parts));

    expect(() => assembleRig(scene as never, rigOf(parts))).toThrow(
      /ebeveyni "olmayan" kurulmamış/,
    );
  });
});
