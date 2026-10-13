import type Phaser from 'phaser';
import coreUrl from '@/assets/vehicles/shared/core.svg?url';
import flashUrl from '@/assets/vehicles/shared/flash.svg?url';
import treadEndUrl from '@/assets/vehicles/shared/tread-end.svg?url';
import treadUrl from '@/assets/vehicles/shared/tread.svg?url';
import bulwarkFeelerUrl from '@/assets/vehicles/bulwark/feeler.svg?url';
import bulwarkHullUrl from '@/assets/vehicles/bulwark/hull.svg?url';
import bulwarkTurretUrl from '@/assets/vehicles/bulwark/turret.svg?url';
import dartFeelerUrl from '@/assets/vehicles/dart/feeler.svg?url';
import dartHullUrl from '@/assets/vehicles/dart/hull.svg?url';
import dartTurretUrl from '@/assets/vehicles/dart/turret.svg?url';
import strikerFeelerUrl from '@/assets/vehicles/striker/feeler.svg?url';
import strikerHullUrl from '@/assets/vehicles/striker/hull.svg?url';
import strikerTurretUrl from '@/assets/vehicles/striker/turret.svg?url';
import { tankSpecs, treadView } from '@/config/tankView';
import type { TankId } from '@/config/vehicles';
import { createTreadTexture } from './TreadTexture';

/**
 * SVG parçalar bu çarpanla rasterlenir ve sahnede tersiyle ölçeklenir. En
 * yakın zoom (1.9) ve 2× DPR'de bile doku ekrandan küçük kalmaz.
 */
export const TEXTURE_SCALE = 4;

/** Bütün araçların paylaştığı dokular ve çalışma anında çizilen efekt dokuları. */
export const TEXTURE = {
  tread: 'tank-tread',
  treadEnd: 'tank-tread-end',
  core: 'tank-core',
  flash: 'tank-flash',
  spark: 'fx-spark',
  treadPrint: 'fx-tread-print',
  scorch: 'fx-scorch',
  blast: 'fx-blast',
  ring: 'fx-ring',
  skid: 'fx-skid',
  treadBase: 'tank-tread-base',
} as const;

/** Araca özgü parçaların doku anahtarı: parça SVG'si araç klasöründedir. */
export type TankPart = 'hull' | 'turret' | 'feeler';

export function tankTexture(id: TankId, part: TankPart): string {
  return `${id}-${part}`;
}

/** Aracın palet bandı kare sayfası: bant boyu araca göre değişir. */
export function treadBandTexture(id: TankId): string {
  return `${id}-tread-band`;
}

const TANK_PART_URLS: Readonly<Record<TankId, Readonly<Record<TankPart, string>>>> = {
  striker: { hull: strikerHullUrl, turret: strikerTurretUrl, feeler: strikerFeelerUrl },
  bulwark: { hull: bulwarkHullUrl, turret: bulwarkTurretUrl, feeler: bulwarkFeelerUrl },
  dart: { hull: dartHullUrl, turret: dartTurretUrl, feeler: dartFeelerUrl },
};

const SHARED_PARTS: ReadonlyArray<readonly [string, string]> = [
  [TEXTURE.tread, treadUrl],
  [TEXTURE.treadEnd, treadEndUrl],
  [TEXTURE.core, coreUrl],
  [TEXTURE.flash, flashUrl],
];

/** Tank parçalarını yükleme kuyruğuna ekler (BootScene `preload`). */
export function queueTankTextures(loader: Phaser.Loader.LoaderPlugin): void {
  for (const [key, url] of SHARED_PARTS) loader.svg(key, url, { scale: TEXTURE_SCALE });
  for (const spec of tankSpecs()) {
    for (const [part, url] of Object.entries(TANK_PART_URLS[spec.id]))
      loader.svg(tankTexture(spec.id, part as TankPart), url, { scale: TEXTURE_SCALE });
  }
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
  for (const spec of tankSpecs())
    createTreadTexture(
      scene,
      TEXTURE.tread,
      treadBandTexture(spec.id),
      TEXTURE_SCALE,
      treadView(spec),
    );
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
  // Kayma çizgisi boyuna gerilir: satırlar boyunca sabit, enine yumuşak kenarlı
  // ve damarlı (palet pabuçlarının kumda sürüklenen izleri).
  canvasTexture(scene, TEXTURE.skid, 16, 8, (g) => {
    const rows = [0.3, 0.7, 0.85, 1, 0.8, 1, 0.7, 0.3];
    rows.forEach((alpha, row) => {
      g.fillStyle = `rgba(255,255,255,${alpha})`;
      g.fillRect(0, row, 16, 1);
    });
  });
  // Palet izinin bir pabuç adımı: x yolu, y paletin enidir. Sıkışmış kum
  // tabanı, enine pabuç (grouser) çukuru ve kenarlara itilmiş kum sırtı.
  canvasTexture(scene, TEXTURE.treadPrint, 8, 16, (g) => {
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.fillRect(0, 2, 8, 12);
    g.fillStyle = 'rgba(255,255,255,1)';
    g.fillRect(0, 3, 3, 10);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillRect(0, 0, 8, 2);
    g.fillRect(0, 14, 8, 2);
  });
  // Yanık: merkezde koyu, dışa doğru lekeli sönen iz. Lekeler sabit bir
  // karma dizisiyle yerleşir; doku her açılışta aynıdır.
  canvasTexture(scene, TEXTURE.scorch, 64, 64, (g) => {
    const core = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    core.addColorStop(0, 'rgba(255,255,255,0.95)');
    core.addColorStop(0.45, 'rgba(255,255,255,0.6)');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = core;
    g.fillRect(0, 0, 64, 64);
    for (let index = 0; index < 18; index++) {
      const angle = index * 2.39996;
      const reach = 12 + ((index * 37) % 17);
      const x = 32 + Math.cos(angle) * reach;
      const y = 32 + Math.sin(angle) * reach;
      const blot = g.createRadialGradient(x, y, 0, x, y, 4 + (index % 4));
      blot.addColorStop(0, 'rgba(255,255,255,0.5)');
      blot.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = blot;
      g.fillRect(x - 8, y - 8, 16, 16);
    }
  });
  // Şok halkası: ince, iki yanı yumuşak ışık halkası (dış yarıçap 30 px).
  canvasTexture(scene, TEXTURE.ring, 64, 64, (g) => {
    const band = g.createRadialGradient(32, 32, 22, 32, 32, 31);
    band.addColorStop(0, 'rgba(255,255,255,0)');
    band.addColorStop(0.6, 'rgba(255,255,255,1)');
    band.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = band;
    g.fillRect(0, 0, 64, 64);
  });
  // Patlama parlaması: yumuşak kenarlı ışık diski.
  canvasTexture(scene, TEXTURE.blast, 64, 64, (g) => {
    const light = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    light.addColorStop(0, 'rgba(255,255,255,1)');
    light.addColorStop(0.3, 'rgba(255,255,255,0.85)');
    light.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = light;
    g.fillRect(0, 0, 64, 64);
  });
}
