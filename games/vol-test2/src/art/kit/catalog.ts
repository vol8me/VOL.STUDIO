// Üretildi: `pnpm art` (scripts/art). Elle düzenlenmez; tests/art/kit.test.ts eşitliği sınar.
import arachnidAbdomen from './arachnid-abdomen.svg';
import arachnidCarapace from './arachnid-carapace.svg';
import arachnidFemur from './arachnid-femur.svg';
import arachnidReactor from './arachnid-reactor.svg';
import arachnidShadow from './arachnid-shadow.svg';
import arachnidTibia from './arachnid-tibia.svg';
import conveyorBase from './conveyor-base.svg';
import conveyorBelt from './conveyor-belt.svg';
import conveyorRails from './conveyor-rails.svg';
import coreBase from './core-base.svg';
import coreGlow from './core-glow.svg';
import coreRing from './core-ring.svg';
import decalCrack from './decal-crack.svg';
import decalDrift from './decal-drift.svg';
import decalPebbles from './decal-pebbles.svg';
import decalReed from './decal-reed.svg';
import decalRipple from './decal-ripple.svg';
import decalTuft from './decal-tuft.svg';
import drillBase from './drill-base.svg';
import drillRotor from './drill-rotor.svg';
import fxBuild from './fx-build.svg';
import fxChip from './fx-chip.svg';
import fxGlow from './fx-glow.svg';
import fxPuff from './fx-puff.svg';
import fxRing from './fx-ring.svg';
import fxSpark from './fx-spark.svg';
import nestBase from './nest-base.svg';
import nestGlow from './nest-glow.svg';
import oreA from './ore-a.svg';
import oreB from './ore-b.svg';
import oreC from './ore-c.svg';
import smelterBase from './smelter-base.svg';
import smelterFan from './smelter-fan.svg';
import smelterGlow from './smelter-glow.svg';
import tankBeam from './tank-beam.svg';
import tankHull from './tank-hull.svg';
import tankLight from './tank-light.svg';
import tankTread from './tank-tread.svg';
import tankTurret from './tank-turret.svg';
import turretBase from './turret-base.svg';
import turretFlash from './turret-flash.svg';
import turretHead from './turret-head.svg';
import wall from './wall.svg';
import wallCrack1 from './wall-crack-1.svg';
import wallCrack2 from './wall-crack-2.svg';
import wallCrack3 from './wall-crack-3.svg';
import wxDrop from './wx-drop.svg';
import wxFlake from './wx-flake.svg';
import wxLeaf from './wx-leaf.svg';
import wxMote from './wx-mote.svg';

export interface KitEntry {
  /** Vite'ın verdiği adres; SVG gömülmez (Phaser yükleyicisi `data:` adresini base64 sanır). */
  readonly url: string;
  /** SVG `viewBox` boyutu (tasarım birimi). */
  readonly width: number;
  readonly height: number;
}

export const KIT = {
  'arachnid-abdomen': { url: arachnidAbdomen, width: 143, height: 125 },
  'arachnid-carapace': { url: arachnidCarapace, width: 134, height: 125 },
  'arachnid-femur': { url: arachnidFemur, width: 72, height: 32 },
  'arachnid-reactor': { url: arachnidReactor, width: 64, height: 64 },
  'arachnid-shadow': { url: arachnidShadow, width: 192, height: 192 },
  'arachnid-tibia': { url: arachnidTibia, width: 84, height: 30 },
  'conveyor-base': { url: conveyorBase, width: 64, height: 64 },
  'conveyor-belt': { url: conveyorBelt, width: 48, height: 32 },
  'conveyor-rails': { url: conveyorRails, width: 64, height: 64 },
  'core-base': { url: coreBase, width: 192, height: 192 },
  'core-glow': { url: coreGlow, width: 192, height: 192 },
  'core-ring': { url: coreRing, width: 192, height: 192 },
  'decal-crack': { url: decalCrack, width: 64, height: 64 },
  'decal-drift': { url: decalDrift, width: 64, height: 64 },
  'decal-pebbles': { url: decalPebbles, width: 64, height: 64 },
  'decal-reed': { url: decalReed, width: 64, height: 64 },
  'decal-ripple': { url: decalRipple, width: 64, height: 64 },
  'decal-tuft': { url: decalTuft, width: 64, height: 64 },
  'drill-base': { url: drillBase, width: 64, height: 64 },
  'drill-rotor': { url: drillRotor, width: 48, height: 48 },
  'fx-build': { url: fxBuild, width: 96, height: 96 },
  'fx-chip': { url: fxChip, width: 16, height: 16 },
  'fx-glow': { url: fxGlow, width: 64, height: 64 },
  'fx-puff': { url: fxPuff, width: 64, height: 64 },
  'fx-ring': { url: fxRing, width: 128, height: 128 },
  'fx-spark': { url: fxSpark, width: 32, height: 32 },
  'nest-base': { url: nestBase, width: 192, height: 192 },
  'nest-glow': { url: nestGlow, width: 192, height: 192 },
  'ore-a': { url: oreA, width: 64, height: 64 },
  'ore-b': { url: oreB, width: 64, height: 64 },
  'ore-c': { url: oreC, width: 64, height: 64 },
  'smelter-base': { url: smelterBase, width: 64, height: 64 },
  'smelter-fan': { url: smelterFan, width: 20, height: 20 },
  'smelter-glow': { url: smelterGlow, width: 64, height: 64 },
  'tank-beam': { url: tankBeam, width: 64, height: 16 },
  'tank-hull': { url: tankHull, width: 128, height: 96 },
  'tank-light': { url: tankLight, width: 160, height: 120 },
  'tank-tread': { url: tankTread, width: 32, height: 20 },
  'tank-turret': { url: tankTurret, width: 112, height: 56 },
  'turret-base': { url: turretBase, width: 64, height: 64 },
  'turret-flash': { url: turretFlash, width: 48, height: 48 },
  'turret-head': { url: turretHead, width: 64, height: 40 },
  wall: { url: wall, width: 64, height: 64 },
  'wall-crack-1': { url: wallCrack1, width: 64, height: 64 },
  'wall-crack-2': { url: wallCrack2, width: 64, height: 64 },
  'wall-crack-3': { url: wallCrack3, width: 64, height: 64 },
  'wx-drop': { url: wxDrop, width: 6, height: 28 },
  'wx-flake': { url: wxFlake, width: 16, height: 16 },
  'wx-leaf': { url: wxLeaf, width: 20, height: 20 },
  'wx-mote': { url: wxMote, width: 16, height: 16 },
} as const satisfies Record<string, KitEntry>;

export type AssetId = keyof typeof KIT;
