import type { Random } from '@volstudio/core/random';
import { KIND, START_RESOURCES, BUILDING, WORLD } from '@/config/forge';
import type { ForgeState } from './state';

/** Seedli cevher yamaları; çekirdek çevresi temiz kalır. Aynı tohum aynı arazi demektir. */
export function generateTerrain(s: ForgeState, random: Random): void {
  const center = s.coreCenter;
  for (let field = 0; field < WORLD.oreFields; field++) {
    const radius =
      WORLD.oreFieldRadius.min +
      random.next() * (WORLD.oreFieldRadius.max - WORLD.oreFieldRadius.min);
    const cx = radius + random.next() * (s.width - 2 * radius);
    const cy = radius + random.next() * (s.height - 2 * radius);
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(s.width - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(s.height - 1, Math.ceil(cy + radius));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const limit = radius * radius * (0.65 + 0.35 * random.next());
        if (dx * dx + dy * dy > limit) continue;
        const ox = x + 0.5 - center.x;
        const oy = y + 0.5 - center.y;
        const fromCore = Math.sqrt(ox * ox + oy * oy);
        if (fromCore < WORLD.coreClearRadius) continue;
        s.ore[s.index(x, y)] = 1;
      }
    }
  }
}

/** Çekirdeği merkeze koyar ve başlangıç kaynaklarını verir. */
export function placeCore(s: ForgeState): void {
  const origin = s.coreOrigin;
  for (let dy = 0; dy < WORLD.coreSize; dy++) {
    for (let dx = 0; dx < WORLD.coreSize; dx++) {
      const tile = s.index(origin.x + dx, origin.y + dy);
      s.kind[tile] = KIND.core;
      s.team[tile] = 1;
      s.ore[tile] = 0;
      s.touchStructure(tile);
    }
  }
  s.coreHp = BUILDING[KIND.core].hp;
  s.inventory[1] = START_RESOURCES.ore;
  s.inventory[2] = START_RESOURCES.plate;
}
