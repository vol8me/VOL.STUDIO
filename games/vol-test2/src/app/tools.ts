import { TOOLS, type ToolId } from '@/config/game';
import { ACK_APPLIED_UNKNOWN } from '@/net/session';
import { COMMAND, RESULT, type ForgeCommand } from '@/sim/commands';

/** Aracın tile'a uygulayacağı komut: `remove` siler, diğerleri o türü verilen yönde yerleştirir. */
export function commandFor(tool: ToolId, x: number, y: number, rot: number): ForgeCommand {
  const entry = TOOLS.find((candidate) => candidate.id === tool);
  if (!entry || entry.kind === null) return { type: COMMAND.remove, x, y };
  return { type: COMMAND.place, x, y, kind: entry.kind, rot };
}

/** Komut sonucu → i18n anahtarı (`voltest2:result.*`). Başarı ve belirsiz sonuç mesaj üretmez. */
export function resultKey(result: number): string | null {
  switch (result) {
    case RESULT.ok:
    case ACK_APPLIED_UNKNOWN:
      return null;
    case RESULT.outOfBounds:
      return 'result.outOfBounds';
    case RESULT.occupied:
      return 'result.occupied';
    case RESULT.needsOre:
      return 'result.needsOre';
    case RESULT.tooPoor:
      return 'result.tooPoor';
    case RESULT.empty:
      return 'result.empty';
    case RESULT.protected:
      return 'result.protected';
    case RESULT.badKind:
      return 'result.badKind';
    case RESULT.duplicate:
      return 'result.duplicate';
    case RESULT.rateLimited:
      return 'result.rateLimited';
    case RESULT.unavailable:
      return 'result.unavailable';
    default:
      return 'result.malformed';
  }
}

/** Dört yön: 0 doğu, 1 güney, 2 batı, 3 kuzey (simülasyonun `DX/DY` sırası). */
export const DIRECTION_KEYS = ['dir.east', 'dir.south', 'dir.west', 'dir.north'] as const;

export function nextRotation(rot: number): number {
  return (rot + 1) & 3;
}

/** Tuş → araç: `1`-`6` araçları seçer. Tanınmayan tuş `null`. */
export function toolForKey(key: string): ToolId | null {
  return TOOLS.find((tool) => tool.hotkey === key)?.id ?? null;
}
