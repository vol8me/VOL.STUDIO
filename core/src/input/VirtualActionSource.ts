/**
 * Ekran üstü düğmelerin eylem kaydı. Eylem adı bilmez; `TAction` çağıranındır.
 *
 * **Ayrı provider DEĞİL:** `InputManager` karede tek provider seçer. Ayrı
 * olsaydı parmakla hareket ederken dash'e basmak birini yutardı; ikisi aynı
 * karede geçerli olmalı, bu yüzden dokunmatik sağlayıcının kümesine karışır.
 *
 * **Mandal:** `pointerdown` ve `pointerup` aynı 16 ms'lik pencereye sığabilir;
 * salt "basılı mı" bayrağı o dokunuşu tümden düşürürdü. Hiç OKUNMADAN
 * bırakılan basım bir kare daha yaşar, okunmuş olan anında düşer.
 */
export class VirtualActionSource<TAction extends string> {
  /** Parmağın şu an fiziksel olarak üstünde olduğu eylemler. */
  readonly #held = new Set<TAction>();
  /** Basılıyken en az bir kez okunmuş eylemler — bırakılınca mandal gerekmez. */
  readonly #observed = new Set<TAction>();
  /** Okunmadan bırakılmış eylemler; tam bir kare daha bildirilir. */
  readonly #latched = new Set<TAction>();

  /** Düğme basıldı. Aynı eylemi iki kez basmak zararsızdır. */
  press(action: TAction): void {
    this.#held.add(action);
  }

  /** Düğme bırakıldı. Hiç okunmadıysa eylem bir kare daha bildirilir. */
  release(action: TAction): void {
    const wasHeld = this.#held.delete(action);
    const wasObserved = this.#observed.delete(action);
    if (wasHeld && !wasObserved) {
      this.#latched.add(action);
    }
  }

  /** Mandal DA temizlenir: duraklatmadan önce okunmamış dash sonradan tetiklenmez. */
  clear(): void {
    this.#held.clear();
    this.#observed.clear();
    this.#latched.clear();
  }

  /**
   * `InputProvider.isActive` bunu kullanır. Mandal DÂHİLDİR: salt `#held`e
   * bakmak tek karelik dokunuşta sağlayıcıyı pasif gösterir ve basım yutulur.
   */
  get hasPressed(): boolean {
    return this.#held.size > 0 || this.#latched.size > 0;
  }

  /**
   * Yazar ve mandalı TÜKETİR — tek çağrıda. Ayrı bir `commit()` olsaydı yanlış
   * sıra sessizce yinelenen ya da düşen basım üretirdi.
   */
  applyTo(actions: Record<TAction, boolean>): void {
    for (const action of this.#held) {
      actions[action] = true;
      this.#observed.add(action);
    }
    for (const action of this.#latched) {
      actions[action] = true;
    }
    this.#latched.clear();
  }
}
