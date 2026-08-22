import type { SpriteDoc } from '@volstudio/core/visual';

export type DocumentChangeSource = 'intent' | 'quick' | 'output';
export type DocumentListener = (doc: SpriteDoc, options: ChangeOptions) => void;
export type Unsubscribe = () => void;

export interface DocumentStoreOptions {
  /** Geri alma yığınının azami derinliği. */
  limit?: number;
  /** Aynı anahtarla gelen ardışık değişikliklerin birleştirileceği pencere. */
  coalesceMs?: number;
  /** Saat — test bunu enjekte eder. */
  now?: () => number;
}

export interface ChangeOptions {
  /**
   * Aynı sürüklemeye ait değişiklikleri birleştiren anahtar; genellikle
   * "yol + parametre". Verilmezse her değişiklik ayrı bir geri alma adımıdır.
   */
  coalesceKey?: string;
  /**
   * Sürekli etkileşimi üreten ürün kontrolü.
   *
   * Renk girdisi ilk `input` olayında kendi DOM'unu yeniden kurarsa
   * tarayıcı etkin sürüklemeyi kaybeder. Editör bu kaynağı bir tur atlar;
   * kontrol kendi değerini zaten çizmiştir. Başka panelden ve geçmişten
   * gelen değişikliklerde bütün yüzey yine eşitlenir.
   */
  source?: DocumentChangeSource;
}

const DEFAULT_LIMIT = 50;
const DEFAULT_COALESCE_MS = 400;

/**
 * Forge üretim belgesinin TEK doğruluk kaynağı.
 *
 * Belge değişmezdir: her düzenleme yeni bir kök üretir, dolayısıyla geri alma
 * tam anlık görüntü yığınına indirgenir. Belgeler birkaç kilobayt olduğu ve
 * yol üzerindeki düğümler yapısal olarak paylaşıldığı için fark tabanlı bir
 * geçmiş burada kazanç değil karmaşıklık olurdu.
 *
 * **Kaydırıcı sürüklemesi TEK adıma iner.** Aksi hâlde tek bir sürükleme
 * yüzlerce girdi üretir ve geri alma kullanılamaz hâle gelir: aynı anahtarla
 * pencere içinde gelen ardışık değişiklikler yığına AYRI girmez, çünkü
 * sürüklemenin başındaki anlık görüntü zaten sürükleme öncesi durumdur.
 */
export class DocumentStore {
  private doc: SpriteDoc;
  private readonly past: SpriteDoc[] = [];
  private readonly future: SpriteDoc[] = [];
  private readonly listeners = new Set<DocumentListener>();
  private readonly limit: number;
  private readonly coalesceMs: number;
  private readonly now: () => number;
  private lastKey: string | null = null;
  private lastTime = -Infinity;

  constructor(initial: SpriteDoc, options: DocumentStoreOptions = {}) {
    this.doc = initial;
    this.limit = options.limit ?? DEFAULT_LIMIT;
    this.coalesceMs = options.coalesceMs ?? DEFAULT_COALESCE_MS;
    this.now = options.now ?? (() => Date.now());
  }

  get(): SpriteDoc {
    return this.doc;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Geri alma yığınındaki adım sayısı — test ve arayüz göstergesi için. */
  get undoDepth(): number {
    return this.past.length;
  }

  set(next: SpriteDoc, options: ChangeOptions = {}): void {
    if (next === this.doc) return;

    const time = this.now();
    const key = options.coalesceKey ?? null;
    const merged = key !== null && key === this.lastKey && time - this.lastTime <= this.coalesceMs;

    if (!merged) {
      this.past.push(this.doc);
      // Sınır aşılınca EN ESKİ adım düşer; sonsuz geçmiş tutmak uzun bir
      // oturumda belleği sessizce büyütürdü.
      if (this.past.length > this.limit) this.past.shift();
    }

    // Yeni bir değişiklik ileri geçmişi geçersiz kılar — dallanan bir geçmiş
    // kullanıcı için öngörülemez olurdu.
    this.future.length = 0;
    this.lastKey = key;
    this.lastTime = time;
    this.doc = next;
    this.emit(options);
  }

  update(mutate: (doc: SpriteDoc) => SpriteDoc, options: ChangeOptions = {}): void {
    this.set(mutate(this.doc), options);
  }

  undo(): boolean {
    const previous = this.past.pop();
    if (previous === undefined) return false;
    this.future.push(this.doc);
    this.doc = previous;
    // Geri alma birleştirme zincirini KIRAR: geri alıp aynı kaydırıcıya
    // dokunmak yeni bir adım açmalı, eskisini yeniden yazmamalı.
    this.lastKey = null;
    this.emit({});
    return true;
  }

  redo(): boolean {
    const next = this.future.pop();
    if (next === undefined) return false;
    this.past.push(this.doc);
    this.doc = next;
    this.lastKey = null;
    this.emit({});
    return true;
  }

  subscribe(listener: DocumentListener): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(options: ChangeOptions): void {
    for (const listener of this.listeners) listener(this.doc, options);
  }
}
