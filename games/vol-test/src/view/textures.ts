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
import { FX } from '@/config/fx';
import { tankSpecs, treadView } from '@/config/tankView';
import { SPIDER_PARTS, type SpiderPartId } from '@/config/spiders';
import {
  HOVER_IDS,
  LEAPER_IDS,
  MECH_IDS,
  WALKER_IDS,
  type HoverId,
  type LeaperId,
  type MechId,
  type TankId,
  type WalkerId,
} from '@/config/vehicles';
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
  /** Duyarga gövdesi: çalışma anında çizilen, uca doğru incelen çubuk (renk araçtan verilir). */
  antenna: 'fx-antenna',
  flash: 'tank-flash',
  spark: 'fx-spark',
  treadPrint: 'fx-tread-print',
  footPrint: 'fx-foot-print',
  /** Mech'in bot izi: topuk ve burun levhası, aralarında sıkışmış zemin. */
  bootPrint: 'fx-boot-print',
  scorch: 'fx-scorch',
  blast: 'fx-blast',
  ring: 'fx-ring',
  skid: 'fx-skid',
  treadBase: 'tank-tread-base',
  /** Enkaz levha kıymığı: `<anahtar>-<varyant>`. */
  shard: 'fx-shard',
} as const;

/** Levha kıymığı doku anahtarı (varyant 0..`DEBRIS.shardVariants`-1). */
export function shardTexture(variant: number): string {
  return `${TEXTURE.shard}-${variant}`;
}

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

/** Süzülen araçların parçaları: pervane döner, gövde ve itici ayrı katmandır; `gun` yan toplardır. */
export type HoverPart = 'hull' | 'pod' | 'fan' | 'turret' | 'gun';
const HOVER_BASE_PARTS: readonly HoverPart[] = ['hull', 'pod', 'fan', 'turret'];
/** Yan topları (`HoverArt.guns`) olan araçlar bir parça daha yükler. */
const HOVER_PARTS: Readonly<Record<HoverId, readonly HoverPart[]>> = {
  manta: HOVER_BASE_PARTS,
  barracuda: HOVER_BASE_PARTS,
  leviathan: [...HOVER_BASE_PARTS, 'gun'],
};

/**
 * Bacaklı robotun parçaları: gövde, uyluk/baldır şeritleri, eklem diski, ayak ve silah kolu. İki
 * bacaklı mech ve dört bacaklı sıçrayıcı bu çekirdek kümeyi paylaşır; sıçrayıcı hayvandır ve ayrıca
 * boyun ekseninde dönen `head` ile gövdeden savrulan `tail` parçalarını taşır.
 */
export type MechPart = 'hull' | 'thigh' | 'shin' | 'joint' | 'foot' | 'arm' | 'head' | 'tail';
const MECH_PARTS: readonly MechPart[] = ['hull', 'thigh', 'shin', 'joint', 'foot', 'arm'];
const LEAPER_PARTS: readonly MechPart[] = [...MECH_PARTS, 'head', 'tail'];
/** Bir bacaklı robotun yüklediği parçalar: mech çekirdek kümeyi, sıçrayıcı kafa ve kuyruğu da taşır. */
function robotParts(id: MechId | LeaperId): readonly MechPart[] {
  return (LEAPER_IDS as readonly string[]).includes(id) ? LEAPER_PARTS : MECH_PARTS;
}
/** Bacaklı robot ailesinin kimlikleri (mech ve sıçrayıcı). */
const ROBOT_IDS: readonly (MechId | LeaperId)[] = [...MECH_IDS, ...LEAPER_IDS];

export function mechTexture(id: MechId | LeaperId, part: MechPart): string {
  return `${id}-${part}`;
}

/** Bacaklı robotun parçasının atlas kare adı (`<araç>/<parça>`). */
export function mechFrame(id: MechId | LeaperId, part: MechPart): string {
  return `${id}/${part}`;
}

export function hoverTexture(id: HoverId, part: HoverPart): string {
  return `${id}-${part}`;
}

/** Süzülen araç ve mech klasörleri (`assets/vehicles/<araç>/`); tek elemanlı süslü parantez eşleşmediğinden desen genel kalır. */
const HOVER_PART_URLS = import.meta.glob('../assets/vehicles/*/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Readonly<Record<string, string>>;

const SHARED_PARTS: ReadonlyArray<readonly [string, string]> = [
  [TEXTURE.tread, treadUrl],
  [TEXTURE.treadEnd, treadEndUrl],
  [TEXTURE.core, coreUrl],
  [TEXTURE.flash, flashUrl],
];

/** Örümceklerin el çizimi SVG parçaları: `assets/vehicles/<araç>/<parça>.svg`. */
const SPIDER_PART_URLS = import.meta.glob('../assets/vehicles/{arachnid,widow,goliath}/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Readonly<Record<string, string>>;

/** Bir örümcek parçasının doku anahtarı (atlasa çizilmeden önce) ve atlas kare adı. */
function spiderTexture(look: WalkerId, part: SpiderPartId): string {
  return `spider-${look}-${part}`;
}
export function spiderFrame(look: WalkerId, part: SpiderPartId): string {
  return `${look}/${part}`;
}

/** Süzülen aracın parçasının atlas kare adı (`<araç>/<parça>`). */
export function hoverFrame(id: HoverId, part: HoverPart): string {
  return `${id}/${part}`;
}

/**
 * Örümceklerin ve süzülen aracın tek doku atlası: bütün parçalar bir tuvalde, kare adı `<araç>/<parça>`dır.
 * Bu araçlar tek dokuda toplanır, çünkü bir karede çok sayıda ayrı doku GL toplu çiziminde parçaları
 * yanlış dokuyla karıştırıp keser (ölçüm: `DESIGN.md`).
 */
export const VEHICLE_ATLAS = 'vehicle-atlas';
/** Atlas karelerinin arası (px): doğrusal süzmede komşu kareden sızmayı önler. */
const ATLAS_GAP = 4;
const ATLAS_WIDTH = 2048;

/** Örümcek parçasının atlas karesiyle bir görüntü nesnesi yaratır. */
export function addSpiderImage(
  scene: Phaser.Scene,
  look: WalkerId,
  part: SpiderPartId,
  x = 0,
  y = 0,
): Phaser.GameObjects.Image {
  return scene.add.image(x, y, VEHICLE_ATLAS, spiderFrame(look, part));
}

/** Bacaklı robot (mech ya da sıçrayıcı) parçasının atlas karesiyle bir görüntü nesnesi yaratır. */
export function addMechImage(
  scene: Phaser.Scene,
  id: MechId | LeaperId,
  part: MechPart,
  x = 0,
  y = 0,
): Phaser.GameObjects.Image {
  return scene.add.image(x, y, VEHICLE_ATLAS, mechFrame(id, part));
}

/** Süzülen araç parçasının atlas karesiyle bir görüntü nesnesi yaratır. */
export function addHoverImage(
  scene: Phaser.Scene,
  id: HoverId,
  part: HoverPart,
  x = 0,
  y = 0,
): Phaser.GameObjects.Image {
  return scene.add.image(x, y, VEHICLE_ATLAS, hoverFrame(id, part));
}

/**
 * Örümcek ve süzülen araç parçalarını TEK atlasa çizer ve ayrı dokuları söker. Neden: bir karede 14+
 * ayrı doku GL toplu çizim sınırında yanlış dokuyla karışıp parçaları kesiyordu (süzülen aracın
 * pervaneleri yarım ya da kara çiziliyordu); tek atlas toplu çizimi tek doku yapar, araçlar aynı atlası
 * paylaştığı için sahneye doku eklemez (ölçüm: `DESIGN.md`).
 * Ayrıca büyük SVG'ler GL'ye `Image` olarak doğrudan yüklenince parça parça rasterlenir; önce 2B
 * tuvale çizmek rasterlamayı tamamlar. Kareler satır satır dizilir.
 */
function bakeVehicleAtlas(scene: Phaser.Scene): void {
  const placed: Array<{
    frame: string;
    key: string;
    image: HTMLImageElement;
    x: number;
    y: number;
  }> = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  const sources = [
    ...WALKER_IDS.flatMap((look) =>
      SPIDER_PARTS.map((part) => ({
        key: spiderTexture(look, part),
        frame: spiderFrame(look, part),
      })),
    ),
    ...HOVER_IDS.flatMap((id) =>
      HOVER_PARTS[id].map((part) => ({ key: hoverTexture(id, part), frame: hoverFrame(id, part) })),
    ),
    ...ROBOT_IDS.flatMap((id) =>
      robotParts(id).map((part) => ({ key: mechTexture(id, part), frame: mechFrame(id, part) })),
    ),
  ];
  for (const { key, frame } of sources) {
    const image = scene.textures.get(key).getSourceImage();
    if (!(image instanceof HTMLImageElement)) return;
    if (x + image.width > ATLAS_WIDTH) {
      x = 0;
      y += rowHeight + ATLAS_GAP;
      rowHeight = 0;
    }
    placed.push({ frame, key, image, x, y });
    x += image.width + ATLAS_GAP;
    rowHeight = Math.max(rowHeight, image.height);
  }
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_WIDTH;
  canvas.height = y + rowHeight;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('Araç atlası için 2B canvas bağlamı alınamadı');
  for (const { image, x: left, y: top } of placed) g.drawImage(image, left, top);
  for (const { key } of placed) scene.textures.remove(key);
  const atlas = scene.textures.addCanvas(VEHICLE_ATLAS, canvas);
  if (!atlas) throw new Error('Araç atlası dokusu eklenemedi');
  for (const { frame, image, x: left, y: top } of placed)
    atlas.add(frame, 0, left, top, image.width, image.height);
}

/** Örümcek parçalarını yükleme kuyruğuna ekler (BootScene `preload`). */
export function queueSpiderTextures(loader: Phaser.Loader.LoaderPlugin): void {
  for (const look of WALKER_IDS) {
    for (const part of SPIDER_PARTS) {
      const url = SPIDER_PART_URLS[`../assets/vehicles/${look}/${part}.svg`];
      loader.svg(spiderTexture(look, part), url, { scale: TEXTURE_SCALE });
    }
  }
}

/** Süzülen araç ve mech parçalarını yükleme kuyruğuna ekler (BootScene `preload`). */
export function queueHoverTextures(loader: Phaser.Loader.LoaderPlugin): void {
  for (const id of HOVER_IDS) {
    for (const part of HOVER_PARTS[id])
      loader.svg(hoverTexture(id, part), HOVER_PART_URLS[`../assets/vehicles/${id}/${part}.svg`], {
        scale: TEXTURE_SCALE,
      });
  }
  for (const id of ROBOT_IDS) {
    for (const part of robotParts(id))
      loader.svg(mechTexture(id, part), HOVER_PART_URLS[`../assets/vehicles/${id}/${part}.svg`], {
        scale: TEXTURE_SCALE,
      });
  }
}

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
  bakeVehicleAtlas(scene);
  for (const spec of tankSpecs())
    createTreadTexture(
      scene,
      TEXTURE.tread,
      treadBandTexture(spec.id),
      TEXTURE_SCALE,
      treadView(spec),
    );
  // Duyarga: tabanda kalın, uca doğru incelen açık gri çubuk; ince bir üst parlaması ona silindir hissi verir.
  canvasTexture(scene, TEXTURE.antenna, 32, 4, (g) => {
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.moveTo(0, 0.5);
    g.lineTo(32, 1.5);
    g.lineTo(32, 2.5);
    g.lineTo(0, 3.5);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.fillRect(0, 1.2, 30, 0.8);
  });
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
  canvasTexture(scene, TEXTURE.treadPrint, 8 * FX.marks.grousers, 16, (g) => {
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.fillRect(0, 2, 8 * FX.marks.grousers, 12);
    g.fillStyle = 'rgba(255,255,255,1)';
    for (let step = 0; step < FX.marks.grousers; step++) g.fillRect(step * 8, 3, 3, 10);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillRect(0, 0, 8 * FX.marks.grousers, 2);
    g.fillRect(0, 14, 8 * FX.marks.grousers, 2);
  });
  // Örümcek ayak izi: sivri pençenin zemine açtığı küçük, yuvarlak delik. Koyu çekirdek, yumuşak
  // kenar ve çevresinde ezilmiş toprağın ince halkası; yönsüzdür, bacak ucu gibi küçük ve diktir.
  canvasTexture(scene, TEXTURE.footPrint, 16, 16, (g) => {
    const lip = g.createRadialGradient(8, 8, 3.4, 8, 8, 7.4);
    lip.addColorStop(0, 'rgba(255,255,255,0.0)');
    lip.addColorStop(0.45, 'rgba(255,255,255,0.32)');
    lip.addColorStop(1, 'rgba(255,255,255,0.0)');
    g.fillStyle = lip;
    g.beginPath();
    g.arc(8, 8, 7.4, 0, Math.PI * 2);
    g.fill();
    const core = g.createRadialGradient(8, 8, 0.4, 8, 8, 3.6);
    core.addColorStop(0, 'rgba(255,255,255,1)');
    core.addColorStop(0.7, 'rgba(255,255,255,0.95)');
    core.addColorStop(1, 'rgba(255,255,255,0.0)');
    g.fillStyle = core;
    g.beginPath();
    g.arc(8, 8, 3.6, 0, Math.PI * 2);
    g.fill();
  });
  // Mech bot izi: yola paralel uzun levha. Orta oluk, enine pabuç çukurları ve kenarlara itilmiş toprak
  // sırtı; ucu hafif daralır. Genişlik ve boy ölçeği izi basan ayaktan gelir.
  canvasTexture(scene, TEXTURE.bootPrint, 32, 16, (g) => {
    g.fillStyle = 'rgba(255,255,255,0.42)';
    g.beginPath();
    g.moveTo(1, 2);
    g.lineTo(26, 2);
    g.lineTo(31, 5);
    g.lineTo(31, 11);
    g.lineTo(26, 14);
    g.lineTo(1, 14);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.95)';
    for (let at = 3; at < 28; at += 4) g.fillRect(at, 3.5, 2, 9);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillRect(1, 0.5, 29, 1.5);
    g.fillRect(1, 14, 29, 1.5);
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(14, 7.4, 17, 1.2);
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
  // Enkaz kıymıkları: açılı, kenarı açık ve iç yüzü koyulaşan gri levhalar; renk çalışma anında verilir.
  const shards: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
    [
      [2, 14],
      [6, 3],
      [17, 1],
      [22, 9],
      [14, 21],
    ],
    [
      [1, 8],
      [10, 2],
      [21, 6],
      [23, 17],
      [9, 22],
      [3, 17],
    ],
    [
      [3, 20],
      [4, 8],
      [14, 2],
      [22, 14],
      [12, 22],
    ],
  ];
  shards.forEach((points, variant) => {
    canvasTexture(scene, shardTexture(variant), 24, 24, (g) => {
      const fill = g.createLinearGradient(0, 0, 24, 24);
      fill.addColorStop(0, '#f2f2f2');
      fill.addColorStop(1, '#6c6c6c');
      g.beginPath();
      points.forEach(([x, y], index) => (index === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
      g.closePath();
      g.fillStyle = fill;
      g.fill();
      g.lineWidth = 1.4;
      g.strokeStyle = 'rgba(20,20,20,0.9)';
      g.stroke();
      g.beginPath();
      g.moveTo(points[0][0], points[0][1]);
      g.lineTo(points[1][0], points[1][1]);
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 1;
      g.stroke();
    });
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
