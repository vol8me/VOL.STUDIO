export type SteamInputContext = 'Gameplay' | 'Menu';

export interface SteamInputActionSetProbe {
  status(): Promise<{ available: boolean; inputReady: boolean; manifestOk?: boolean | null }>;
  activate(context: SteamInputContext): Promise<number>;
}

export class SteamInputActionSets {
  private ready: boolean | null = null;
  private current: SteamInputContext | null = null;
  private attempted: SteamInputContext | null = null;
  private nextAttemptAt = 0;
  private nextStatusAt = 0;
  private nextRefreshAt = 0;
  private pending: Promise<void> | null = null;
  private disposed = false;
  private generation = 0;

  constructor(private readonly probe: SteamInputActionSetProbe) {}

  tick(context: SteamInputContext, nowMs: number): void {
    if (this.disposed || this.pending) return;
    if (this.current === context && nowMs < this.nextRefreshAt) return;
    if (this.ready === false) {
      if (nowMs < this.nextStatusAt) return;
      this.ready = null;
    }
    if (this.attempted === context && nowMs < this.nextAttemptAt) return;
    if (this.ready === null) this.nextStatusAt = nowMs + 5000;
    this.attempted = context;
    this.nextAttemptAt = nowMs + 1000;
    this.pending = this.apply(context, this.generation, nowMs).finally(() => {
      this.pending = null;
    });
  }

  invalidate(): void {
    this.generation++;
    this.current = null;
    this.attempted = null;
    this.ready = null;
    this.nextAttemptAt = 0;
    this.nextRefreshAt = 0;
  }

  async flush(): Promise<void> {
    await this.pending;
  }

  dispose(): void {
    this.disposed = true;
    this.generation++;
  }

  private async apply(
    context: SteamInputContext,
    generation: number,
    nowMs: number,
  ): Promise<void> {
    try {
      if (this.ready === null) {
        const status = await this.probe.status();
        this.ready = status.available && status.inputReady && status.manifestOk === true;
      }
      if (!this.ready || this.disposed || generation !== this.generation) return;
      const count = await this.probe.activate(context);
      if (!this.disposed && generation === this.generation && count > 0) {
        this.current = context;
        this.nextRefreshAt = nowMs + 5000;
      }
    } catch (error) {
      console.warn('[SteamInput] Aksiyon seti uygulanamadı:', error);
    }
  }
}
