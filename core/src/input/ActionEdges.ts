/**
 * Kenar algılayıcı: eylemin bu karede basılmaya BAŞLAYIP başlamadığını söyler.
 * `InputManager` düzey (basılı mı) verir; menü açma, zoom kademesi, duraklatma
 * gibi tek seferlik eylemler kenar ister. Kare başına bir kez `update` çağrılır.
 */
export class ActionEdges<TAction extends string> {
  private readonly held = new Set<TAction>();
  private readonly pressed = new Set<TAction>();

  update(actions: Readonly<Record<TAction, boolean>>, watched: readonly TAction[]): void {
    this.pressed.clear();
    for (const action of watched) {
      const down = actions[action];
      if (down && !this.held.has(action)) this.pressed.add(action);
      if (down) this.held.add(action);
      else this.held.delete(action);
    }
  }

  /**
   * Eylemi bırakılana dek basılı sayar: başka bir katmanın (ör. Escape'i
   * dinleyen modal) zaten işlediği basış ikinci kez tetiklenmez.
   */
  suppress(action: TAction): void {
    this.held.add(action);
    this.pressed.delete(action);
  }

  wasPressed(action: TAction): boolean {
    return this.pressed.has(action);
  }

  reset(): void {
    this.held.clear();
    this.pressed.clear();
  }
}
