/**
 * Ekran üstü düğmelerin ürettiği eylemleri taşıyan kayıt.
 *
 * **Neden ayrı bir provider değil?** `InputManager` her karede TEK bir
 * `InputProvider` seçer (bkz. `InputManager.resolveActiveProvider`). Dokunmatik
 * düğmeler ayrı bir provider olsaydı, oyuncu parmağıyla hareket ederken dash
 * düğmesine bastığında yalnızca biri kazanırdı: ya hareket ya da dash. Oysa
 * ikisi AYNI karede geçerli olmalı. Bu yüzden düğmeler kendi provider'ı olmaz;
 * dokunmatik sağlayıcının eylem kümesine KARIŞIRLAR.
 *
 * **Neden bir mandal (latch) var?** Bir dokunuş iki kare arasına sığabilir:
 * `pointerdown` ve `pointerup` aynı 16 ms'lik pencerede gelirse, basit bir
 * "şu an basılı mı" bayrağı o dokunuşu tamamen düşürür ve oyuncu düğmeye
 * bastığı hâlde hiçbir şey olmaz. Bu yüzden HİÇ OKUNMADAN bırakılan bir basım
 * bir kare daha yaşatılır; okunduktan sonra bırakılan basım ise anında düşer
 * (basılı tutmak, tuşu basılı tutmakla aynı davranır).
 *
 * Sınıf hiçbir eylem adı bilmez; `TAction` çağıranın sözlüğüdür.
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

  /**
   * Sahne kapanışı/duraklatma gibi durumlarda tüm basımları düşürür.
   *
   * Mandal da temizlenir: duraklatmadan önce okunmamış bir dash, oyun geri
   * geldiğinde tetiklenmemelidir.
   */
  clear(): void {
    this.#held.clear();
    this.#observed.clear();
    this.#latched.clear();
  }

  /**
   * Bildirilecek bir basım var mı — `InputProvider.isActive` bunu kullanır.
   *
   * Mandal dâhildir: yalnızca `#held`e bakmak, tek karelik dokunuşta
   * sağlayıcıyı pasif gösterir ve `InputManager` PC'ye düşerek basımı yutardı.
   */
  get hasPressed(): boolean {
    return this.#held.size > 0 || this.#latched.size > 0;
  }

  /**
   * Basılı eylemleri karenin action kaydına yazar ve mandalı TÜKETİR.
   *
   * Okuma ile mandal tüketimi tek çağrıda birleşiktir; ayrı bir `commit()`
   * olsaydı çağıranın sırayı yanlış kurması sessizce ya yinelenen ya da
   * düşen basımlar üretirdi.
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
