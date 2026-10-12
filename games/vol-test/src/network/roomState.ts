/** Sunucunun gönderdiği salt-okunur oyuncu karesi; Phaser ve Colyseus tiplerinden bağımsız. */
export interface RemotePlayer {
  readonly sessionId: string;
  readonly vehicleId: number;
  readonly x: number;
  readonly y: number;
  readonly hull: number;
  readonly turret: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly alive: boolean;
  readonly respawnRemainingMs: number;
}

export interface RemoteWorld {
  readonly tick: number;
  readonly players: readonly RemotePlayer[];
}

/** Ağdan gelen state hiçbir koşulda simülasyonun sahibi değildir; bozuk alanlar gösterilmez. */
export function readRoomState(value: unknown): RemoteWorld | null {
  if (value === null || typeof value !== 'object') return null;
  const state = value as { tick?: unknown; players?: unknown };
  if (!Number.isSafeInteger(state.tick) || (state.tick as number) < 0) return null;
  if (!state.players || typeof state.players !== 'object' || Array.isArray(state.players))
    return null;
  const entries = (state.players as { entries?: unknown }).entries;
  if (typeof entries !== 'function') return null;

  const players: RemotePlayer[] = [];
  for (const [sessionId, raw] of (state.players as Map<unknown, unknown>).entries()) {
    if (typeof sessionId !== 'string' || !raw || typeof raw !== 'object') continue;
    const player = raw as Record<string, unknown>;
    const numeric = [
      player.vehicleId,
      player.x,
      player.y,
      player.hull,
      player.turret,
      player.health,
      player.maxHealth,
      player.respawnRemainingMs,
    ];
    if (
      !numeric.every((number) => typeof number === 'number' && Number.isFinite(number)) ||
      !Number.isSafeInteger(player.vehicleId) ||
      (player.vehicleId as number) < 0 ||
      (player.health as number) < 0 ||
      (player.maxHealth as number) <= 0 ||
      (player.health as number) > (player.maxHealth as number) ||
      (player.respawnRemainingMs as number) < 0 ||
      typeof player.alive !== 'boolean'
    )
      continue;
    players.push({
      sessionId,
      vehicleId: player.vehicleId as number,
      x: player.x as number,
      y: player.y as number,
      hull: player.hull as number,
      turret: player.turret as number,
      health: player.health as number,
      maxHealth: player.maxHealth as number,
      alive: player.alive,
      respawnRemainingMs: player.respawnRemainingMs as number,
    });
  }
  return { tick: state.tick as number, players };
}
