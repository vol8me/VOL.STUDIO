import type Phaser from 'phaser';
import coreUrl from '@/assets/tank/core.svg?url';
import feelerUrl from '@/assets/tank/feeler.svg?url';
import flashUrl from '@/assets/tank/flash.svg?url';
import hullUrl from '@/assets/tank/hull.svg?url';
import treadEndUrl from '@/assets/tank/tread-end.svg?url';
import treadUrl from '@/assets/tank/tread.svg?url';
import turretUrl from '@/assets/tank/turret.svg?url';

/**
 * SVG parçalar bu çarpanla rasterlenir ve sahnede tersiyle ölçeklenir. En
 * yakın zoom (1.9) ve 2× DPR'de bile doku ekrandan küçük kalmaz.
 */
export const TEXTURE_SCALE = 4;

export const TEXTURE = {
  hull: 'tank-hull',
  turret: 'tank-turret',
  tread: 'tank-tread',
  treadEnd: 'tank-tread-end',
  core: 'tank-core',
  feeler: 'tank-feeler',
  flash: 'tank-flash',
  spark: 'fx-spark',
  mark: 'fx-mark',
  treadBase: 'tank-tread-base',
} as const;

const SVG_PARTS: ReadonlyArray<readonly [string, string]> = [
  [TEXTURE.hull, hullUrl],
  [TEXTURE.turret, turretUrl],
  [TEXTURE.tread, treadUrl],
  [TEXTURE.treadEnd, treadEndUrl],
  [TEXTURE.core, coreUrl],
  [TEXTURE.feeler, feelerUrl],
  [TEXTURE.flash, flashUrl],
];

/** Tank parçalarını yükleme kuyruğuna ekler (BootScene `preload`). */
export function queueTankTextures(loader: Phaser.Loader.LoaderPlugin): void {
  for (const [key, url] of SVG_PARTS) loader.svg(key, url, { scale: TEXTURE_SCALE });
}

function canvasTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  paint: (g: CanvasRenderingContext2D) => void,
): void {
  if (scene.textures.exists(key)) return;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) throw new Error(`"${key}" dokusu için 2B canvas bağlamı alınamadı`);
  paint(g);
  scene.textures.addCanvas(key, canvas);
}

/** Çalışma anında çizilen efekt dokuları. */
export function createRuntimeTextures(scene: Phaser.Scene): void {
  canvasTexture(scene, TEXTURE.spark, 16, 16, (g) => {
    const gradient = g.createRadialGradient(8, 8, 0, 8, 8, 8);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gradient;
    g.fillRect(0, 0, 16, 16);
  });
  // Palet bandının altındaki koyu taban: bandı zeminler ve `PoseShadow`a
  // paletin gerçek boyunu verir (TileSprite gölgesi tek doku karesidir).
  canvasTexture(scene, TEXTURE.treadBase, 8, 8, (g) => {
    g.fillStyle = '#0e1115';
    g.fillRect(0, 0, 8, 8);
  });
  canvasTexture(scene, TEXTURE.mark, 4, 8, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 4, 8);
  });
}
