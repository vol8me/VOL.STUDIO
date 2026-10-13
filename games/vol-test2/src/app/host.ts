import type { ForgeController } from './ForgeController';

/**
 * Sahne ile DOM arayüzü arasındaki tek paylaşılan nokta: şu an bağlı denetleyici. Arayüz bağlanınca
 * `attach`, kopunca `detach` çağırır; sahne her karede `controller`a bakar ve yoksa hiçbir şey çizmez.
 */
export class ForgeHost {
  controller: ForgeController | null = null;
  private readonly listeners = new Set<() => void>();

  attach(controller: ForgeController): void {
    this.controller = controller;
    this.emit();
  }

  detach(): void {
    if (this.controller === null) return;
    this.controller = null;
    this.emit();
  }

  /** Denetleyici değişince çağrılır; dönen işlev aboneliği kaldırır. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

/** Uygulama süreci başına tek paylaşılan örnek. */
export const host = new ForgeHost();
