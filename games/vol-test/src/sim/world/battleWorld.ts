import { LAKE_SPECS } from '@/config/lakes';
import { WORLD } from '@/config/world';
import { World } from './World';

/**
 * Kalıcı savaş dünyası: sabit ölçü ve sabit göller. Sunucu odası ve istemci sahnesi dünyayı yalnız
 * buradan kurar; böylece iki taraf aynı coğrafyada yürür ve öngörü sunucuyla ayrışmaz.
 */
export function createBattleWorld(): World {
  return new World(WORLD.width, WORLD.height, WORLD.gridStep, LAKE_SPECS);
}
