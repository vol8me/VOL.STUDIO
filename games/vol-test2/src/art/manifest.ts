import type { SvgComplexity } from './svg';
import arachnidAbdomen from './kit/arachnid-abdomen.svg';
import arachnidCarapace from './kit/arachnid-carapace.svg';
import arachnidClaw from './kit/arachnid-claw.svg';
import arachnidCoxa from './kit/arachnid-coxa.svg';
import arachnidFemur from './kit/arachnid-femur.svg';
import arachnidReactor from './kit/arachnid-reactor.svg';
import arachnidShadow from './kit/arachnid-shadow.svg';
import arachnidTibia from './kit/arachnid-tibia.svg';
import conveyorBase from './kit/conveyor-base.svg';
import conveyorBelt from './kit/conveyor-belt.svg';
import conveyorRails from './kit/conveyor-rails.svg';
import coreBase from './kit/core-base.svg';
import coreGlow from './kit/core-glow.svg';
import coreRing from './kit/core-ring.svg';
import drillBase from './kit/drill-base.svg';
import drillRotor from './kit/drill-rotor.svg';
import oreA from './kit/ore-a.svg';
import oreB from './kit/ore-b.svg';
import oreC from './kit/ore-c.svg';
import smelterBase from './kit/smelter-base.svg';
import smelterFan from './kit/smelter-fan.svg';
import smelterGlow from './kit/smelter-glow.svg';
import turretBase from './kit/turret-base.svg';
import turretFlash from './kit/turret-flash.svg';
import turretHead from './kit/turret-head.svg';
import wall from './kit/wall.svg';

/** Karmaşıklık tabanı: ölçülen değerin altında, yer tutucunun üstünde. */
export type ComplexityFloor = Partial<Omit<SvgComplexity, 'bytes'>>;

/** Tasarım birimi: 1 karo = 64. Parçalar (bacak, halka, parıltı) kendi bağlantı noktalarıyla tasarlanmıştır. */
export const TILE_UNITS = 64;

export type AssetId =
  | 'arachnid-abdomen'
  | 'arachnid-carapace'
  | 'arachnid-claw'
  | 'arachnid-coxa'
  | 'arachnid-femur'
  | 'arachnid-reactor'
  | 'arachnid-shadow'
  | 'arachnid-tibia'
  | 'conveyor-base'
  | 'conveyor-belt'
  | 'conveyor-rails'
  | 'core-base'
  | 'core-glow'
  | 'core-ring'
  | 'drill-base'
  | 'drill-rotor'
  | 'ore-a'
  | 'ore-b'
  | 'ore-c'
  | 'smelter-base'
  | 'smelter-fan'
  | 'smelter-glow'
  | 'turret-base'
  | 'turret-flash'
  | 'turret-head'
  | 'wall';

export interface LabAsset {
  readonly id: AssetId;
  /** Kaynak dosya adı (`assets/` içinde). */
  readonly file: string;
  /** Vite'ın verdiği adres; SVG gömülmez (Phaser yükleyicisi `data:` adresini base64 sanır). */
  readonly url: string;
  /** SVG `viewBox` boyutu (tasarım birimi); `assets.test.ts` dosyayla eşitliğini doğrular. */
  readonly width: number;
  readonly height: number;
  readonly floor: ComplexityFloor;
}

/**
 * Üstten bakış (kuş bakışı), karo tabanlı varlık seti: düz plaka, eğim, cıvata; ışık sol üstten.
 * Hareketli parçalar (rotor, halka, bant, bacak) ayrı dosyadır ve kendi bağlantı noktasıyla çizilir;
 * parıltılar additive çizilsin diye ayrıdır. Taban değerleri ölçülen karmaşıklığın yaklaşık %70'idir:
 * bir varlığı yer tutucuya sadeleştiren değişiklik `tests/lab/assets.test.ts`de düşer.
 */
const LIST: readonly LabAsset[] = [
  {
    id: 'arachnid-abdomen',
    file: 'arachnid-abdomen.svg',
    url: arachnidAbdomen,
    width: 88,
    height: 72,
    floor: { elements: 46, pathCommands: 102 },
  },
  {
    id: 'arachnid-carapace',
    file: 'arachnid-carapace.svg',
    url: arachnidCarapace,
    width: 64,
    height: 64,
    floor: { elements: 39, pathCommands: 53 },
  },
  {
    id: 'arachnid-claw',
    file: 'arachnid-claw.svg',
    url: arachnidClaw,
    width: 24,
    height: 16,
    floor: { elements: 4, pathCommands: 7 },
  },
  {
    id: 'arachnid-coxa',
    file: 'arachnid-coxa.svg',
    url: arachnidCoxa,
    width: 20,
    height: 20,
    floor: { elements: 4, pathCommands: 4 },
  },
  {
    id: 'arachnid-femur',
    file: 'arachnid-femur.svg',
    url: arachnidFemur,
    width: 56,
    height: 16,
    floor: { elements: 9, pathCommands: 15 },
  },
  {
    id: 'arachnid-reactor',
    file: 'arachnid-reactor.svg',
    url: arachnidReactor,
    width: 48,
    height: 48,
    floor: { elements: 9, gradients: 2 },
  },
  {
    id: 'arachnid-shadow',
    file: 'arachnid-shadow.svg',
    url: arachnidShadow,
    width: 128,
    height: 128,
    floor: { elements: 5, gradients: 1 },
  },
  {
    id: 'arachnid-tibia',
    file: 'arachnid-tibia.svg',
    url: arachnidTibia,
    width: 64,
    height: 16,
    floor: { elements: 9, pathCommands: 23 },
  },
  {
    id: 'conveyor-base',
    file: 'conveyor-base.svg',
    url: conveyorBase,
    width: 64,
    height: 64,
    floor: { elements: 23, pathCommands: 54 },
  },
  {
    id: 'conveyor-belt',
    file: 'conveyor-belt.svg',
    url: conveyorBelt,
    width: 64,
    height: 64,
    floor: { elements: 17, pathCommands: 37 },
  },
  {
    id: 'conveyor-rails',
    file: 'conveyor-rails.svg',
    url: conveyorRails,
    width: 64,
    height: 64,
    floor: { elements: 27, pathCommands: 74 },
  },
  {
    id: 'core-base',
    file: 'core-base.svg',
    url: coreBase,
    width: 192,
    height: 192,
    floor: { elements: 93, pathCommands: 222, clipPaths: 2 },
  },
  {
    id: 'core-glow',
    file: 'core-glow.svg',
    url: coreGlow,
    width: 160,
    height: 160,
    floor: { elements: 10, gradients: 2 },
  },
  {
    id: 'core-ring',
    file: 'core-ring.svg',
    url: coreRing,
    width: 160,
    height: 160,
    floor: { elements: 52, pathCommands: 134 },
  },
  {
    id: 'drill-base',
    file: 'drill-base.svg',
    url: drillBase,
    width: 64,
    height: 64,
    floor: { elements: 26, pathCommands: 52 },
  },
  {
    id: 'drill-rotor',
    file: 'drill-rotor.svg',
    url: drillRotor,
    width: 48,
    height: 48,
    floor: { elements: 17, pathCommands: 63 },
  },
  {
    id: 'ore-a',
    file: 'ore-a.svg',
    url: oreA,
    width: 64,
    height: 64,
    floor: { elements: 63, pathCommands: 130 },
  },
  {
    id: 'ore-b',
    file: 'ore-b.svg',
    url: oreB,
    width: 64,
    height: 64,
    floor: { elements: 57, pathCommands: 107 },
  },
  {
    id: 'ore-c',
    file: 'ore-c.svg',
    url: oreC,
    width: 64,
    height: 64,
    floor: { elements: 63, pathCommands: 126 },
  },
  {
    id: 'smelter-base',
    file: 'smelter-base.svg',
    url: smelterBase,
    width: 64,
    height: 64,
    floor: { elements: 32, pathCommands: 77 },
  },
  {
    id: 'smelter-fan',
    file: 'smelter-fan.svg',
    url: smelterFan,
    width: 16,
    height: 16,
    floor: { elements: 7, pathCommands: 21 },
  },
  {
    id: 'smelter-glow',
    file: 'smelter-glow.svg',
    url: smelterGlow,
    width: 64,
    height: 64,
    floor: { elements: 11, gradients: 2 },
  },
  {
    id: 'turret-base',
    file: 'turret-base.svg',
    url: turretBase,
    width: 64,
    height: 64,
    floor: { elements: 23, pathCommands: 38 },
  },
  {
    id: 'turret-flash',
    file: 'turret-flash.svg',
    url: turretFlash,
    width: 32,
    height: 32,
    floor: { elements: 8, pathCommands: 9, gradients: 2 },
  },
  {
    id: 'turret-head',
    file: 'turret-head.svg',
    url: turretHead,
    width: 64,
    height: 64,
    floor: { elements: 23, pathCommands: 39 },
  },
  {
    id: 'wall',
    file: 'wall.svg',
    url: wall,
    width: 64,
    height: 64,
    floor: { elements: 22, pathCommands: 51 },
  },
];

export const ASSETS: Readonly<Record<AssetId, LabAsset>> = Object.fromEntries(
  LIST.map((asset) => [asset.id, asset]),
) as Record<AssetId, LabAsset>;

export const ASSET_LIST: readonly LabAsset[] = LIST;

/** Taban ihlallerini yazar; boşsa varlık yeterince karmaşıktır. */
export function floorViolations(measured: SvgComplexity, ...floors: ComplexityFloor[]): string[] {
  const problems: string[] = [];
  for (const floor of floors) {
    for (const [key, minimum] of Object.entries(floor) as [keyof ComplexityFloor, number][]) {
      if (measured[key] < minimum) problems.push(`${key}: ${measured[key]} < ${minimum}`);
    }
  }
  return problems;
}
