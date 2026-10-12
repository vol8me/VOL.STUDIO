import { connectRoom, type NetworkRoom } from '@volstudio/network/client';
import type { PlayerInput } from '@volstudio/network/protocol';
import { readRoomState, type RemoteWorld } from './roomState';

export type NetworkConnectionStatus = 'connecting' | 'connected' | 'error' | 'left';

/** 20 Hz patch akışı sustuğunda bağlantı kullanıcıya bozuk görünür. */
const STATE_SILENCE_LIMIT_MS = 3000;

/** Bağlantı, state aboneliği ve kapanış yarışı tek yerde yönetilir. */
export class NetworkSession {
  private room: NetworkRoom | null = null;
  private closing: Promise<void> | null = null;
  private unsubscribe: (() => void) | null = null;
  private closed = false;
  private seq = 0;
  private lastTick = -1;
  private silenceMs = 0;
  private status: NetworkConnectionStatus = 'connecting';

  constructor(
    private readonly endpoint: string,
    private readonly onStatus: (status: NetworkConnectionStatus) => void,
    private readonly onWorld: (world: RemoteWorld, sessionId: string) => void,
    private readonly join: typeof connectRoom = connectRoom,
  ) {}

  get connectionStatus(): NetworkConnectionStatus {
    return this.status;
  }

  async connect(): Promise<void> {
    this.setStatus('connecting');
    try {
      const room = await this.join(this.endpoint, 'voltest');
      if (this.closed) {
        await room.dispose();
        return;
      }
      this.room = room;
      this.unsubscribe = room.onState(() => this.pull());
      this.setStatus('connected');
      this.pull();
    } catch {
      if (!this.closed) this.setStatus('error');
    }
  }

  /** Sunucuya yalnız niyet gider; durum, HP, konum ve isabet pakete eklenmez. */
  send(command: Omit<PlayerInput, 'seq'>): void {
    if (!this.room || this.closed || this.status !== 'connected') return;
    try {
      this.room.sendInput({ ...command, seq: this.seq++ });
    } catch {
      this.setStatus('error');
    }
  }

  /** Simülasyon saatini değiştirmeden, gelen state akışının sağlığını izler. */
  checkFreshness(deltaMs: number): void {
    if (this.closed || this.status !== 'connected' || !Number.isFinite(deltaMs) || deltaMs <= 0)
      return;
    this.silenceMs += deltaMs;
    if (this.silenceMs >= STATE_SILENCE_LIMIT_MS) this.setStatus('error');
  }

  async dispose(): Promise<void> {
    if (this.closed) return this.closing ?? Promise.resolve();
    this.closed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    const room = this.room;
    this.room = null;
    this.setStatus('left');
    this.closing = room?.dispose() ?? Promise.resolve();
    await this.closing;
  }

  private pull(): void {
    if (this.closed || !this.room) return;
    const state = readRoomState(this.room.getState());
    if (!state || state.tick < this.lastTick) return;
    this.lastTick = state.tick;
    this.silenceMs = 0;
    if (this.status === 'error') this.setStatus('connected');
    this.onWorld(state, this.room.sessionId);
  }

  private setStatus(status: NetworkConnectionStatus): void {
    this.status = status;
    if (!this.closed || status === 'left') this.onStatus(status);
  }
}
