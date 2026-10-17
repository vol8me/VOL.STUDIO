import type { ScopedKey, StorageScope } from '../../persistence/scopedStorage';

/**
 * Ayar formunun MODELİ: DOM yoktur. Form (tarif) bu modeli çizer; model değeri, taslağı, hatayı ve kaydı tutar.
 * Böylece "uygula / geri al / varsayılana dön / kaydediliyor / hata" davranışı bir kez, denetimden bağımsız
 * sınanır ve aynı model başka bir sunumla (oyun içi menü, native pencere) da çalışır.
 */

export interface SettingsFieldSpec<T = unknown> {
  /** `device` (ekran/hoparlör başına) ya da `synced` (Cloud'a giden). Kapsam başına TEK atomik yazım yapılır. */
  readonly scope: StorageScope;
  readonly defaultValue: T;
  /** Hata iletisi (çevrilmiş) ya da geçerliyse `null`. Geçersiz alan uygulanmaz. */
  validate?(value: T): string | null;
}

export type SettingsFields = Readonly<Record<string, SettingsFieldSpec>>;

/** `ScopedSaveManager`ın okuma/yazma yüzü. */
export interface SettingsStore {
  load<T>(key: ScopedKey, defaultValue: T): Promise<T>;
  save<T>(key: ScopedKey, value: T): Promise<void>;
}

export interface SettingsModelOptions {
  readonly fields: SettingsFields;
  readonly store: SettingsStore;
  /** Her kapsamın tek belgesi: `{ alan: değer }`. Kapsam anahtarı öneki kapsamla uyuşmalıdır. */
  readonly keys: Readonly<Record<StorageScope, ScopedKey>>;
}

export type SettingsApplyResult =
  /** Kaydediliyor: ikinci uygulama başlatılmadı. */
  | { readonly status: 'busy' }
  /** Geçersiz alan var: hiçbir kapsama yazılmadı. */
  | { readonly status: 'invalid'; readonly errors: Readonly<Record<string, string>> }
  /** Bütün kirli kapsamlar yazıldı (kirli alan yoksa `saved` boştur). */
  | { readonly status: 'applied'; readonly saved: readonly StorageScope[] }
  /** En az bir kapsam yazılamadı; yazılamayan kapsamın taslağı kirli kalır, yazılanlar işlenmiştir. */
  | {
      readonly status: 'failed';
      readonly saved: readonly StorageScope[];
      readonly failed: readonly { readonly scope: StorageScope; readonly error: unknown }[];
    };

/** Kirli değişiklik varken kapanma/geri isteğine tüketicinin verdiği karar. */
export type SettingsCloseDecision = 'apply' | 'discard' | 'stay';

const SCOPES: readonly StorageScope[] = ['device', 'synced'];

function same(a: unknown, b: unknown): boolean {
  return Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b);
}

export class SettingsModel {
  private readonly fields: SettingsFields;
  private readonly store: SettingsStore;
  private readonly keys: Readonly<Record<StorageScope, ScopedKey>>;
  private readonly committedValues = new Map<string, unknown>();
  private readonly drafts = new Map<string, unknown>();
  private readonly errors = new Map<string, string>();
  /** Diskteki belgenin bilinmeyen alanları: ileri sürümden kalan veri yazarken silinmez. */
  private readonly foreign = new Map<StorageScope, Record<string, unknown>>();
  private readonly listeners = new Set<() => void>();
  private busy = false;
  private revision = 0;

  constructor(options: SettingsModelOptions) {
    this.fields = options.fields;
    this.store = options.store;
    this.keys = options.keys;
    for (const scope of SCOPES) {
      if (!options.keys[scope].startsWith(`${scope}.`)) {
        throw new Error(
          `SettingsModel: ${options.keys[scope]} anahtarı ${scope} kapsamında değil.`,
        );
      }
    }
    for (const [key, spec] of Object.entries(this.fields)) {
      this.committedValues.set(key, spec.defaultValue);
    }
  }

  /** Kalıcı belgeleri okur; bozuk, tür uyumsuz ya da geçersiz alan varsayılana iner. Taslaklar atılır. */
  async load(): Promise<void> {
    const loaded = new Map<StorageScope, unknown>();
    for (const scope of SCOPES)
      loaded.set(scope, await this.store.load<unknown>(this.keys[scope], {}));
    this.drafts.clear();
    this.errors.clear();
    for (const scope of SCOPES) {
      const raw = loaded.get(scope);
      const record =
        typeof raw === 'object' && raw !== null && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : {};
      const extra: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(record))
        if (!(key in this.fields)) extra[key] = value;
      this.foreign.set(scope, extra);
      for (const [key, spec] of Object.entries(this.fields)) {
        if (spec.scope !== scope) continue;
        const candidate = record[key];
        const usable =
          candidate !== undefined &&
          typeof candidate === typeof spec.defaultValue &&
          (spec.validate?.(candidate) ?? null) === null;
        this.committedValues.set(key, usable ? candidate : spec.defaultValue);
      }
    }
    this.emit();
  }

  /** Görünen değer: taslak varsa taslak, yoksa kayıtlı değer. */
  get<T = unknown>(key: string): T {
    this.spec(key);
    return (this.drafts.has(key) ? this.drafts.get(key) : this.committedValues.get(key)) as T;
  }

  /** Kalıcı (son uygulanan) değer. */
  committed<T = unknown>(key: string): T {
    this.spec(key);
    return this.committedValues.get(key) as T;
  }

  /** Taslağı değiştirir ve doğrular; geçersiz değer taslakta durur ama uygulanmaz. */
  set(key: string, value: unknown): void {
    this.spec(key);
    this.applyDraft(key, value);
    this.emit();
  }

  /** Alanın doğrulama hatası ya da `null`. */
  error(key: string): string | null {
    this.spec(key);
    return this.errors.get(key) ?? null;
  }

  /** Kayıtlı değerden farklı bir taslak var mı (tek alan ya da herhangi biri). */
  isDirty(key?: string): boolean {
    if (key !== undefined) {
      this.spec(key);
      return this.drafts.has(key);
    }
    return this.drafts.size > 0;
  }

  dirtyKeys(): readonly string[] {
    return [...this.drafts.keys()];
  }

  /** Görünen değer varsayılandan farklı mı (satırın "varsayılana dön" düğmesi için). */
  isModified(key: string): boolean {
    const spec = this.spec(key);
    return !same(this.get(key), spec.defaultValue);
  }

  /** Alanı varsayılana döndürür (taslak olarak; kalıcı olması için uygulanmalıdır). */
  reset(key: string): void {
    this.set(key, this.spec(key).defaultValue);
  }

  resetAll(): void {
    for (const key of Object.keys(this.fields)) this.applyDraft(key, this.spec(key).defaultValue);
    this.emit();
  }

  /** Bütün taslakları atar (son uygulanan değerlere dönülür). */
  revert(): void {
    this.drafts.clear();
    this.errors.clear();
    this.emit();
  }

  isBusy(): boolean {
    return this.busy;
  }

  /**
   * Kirli alanları kapsam başına TEK yazımla kalıcılaştırır. Aynı anda tek uygulama koşar (ikincisi `busy`).
   * Bir kapsam yazılamazsa onun taslağı kirli kalır, hata döner; diğer kapsam bağımsız işlenir. Yazım sürerken
   * yapılan yeni düzenleme, yazılan anlık görüntüden farklıysa kirli kalır (kaybolmaz, yanlış işlenmez).
   */
  async apply(): Promise<SettingsApplyResult> {
    if (this.busy) return { status: 'busy' };
    const invalid = Object.fromEntries(this.errors);
    if (Object.keys(invalid).length > 0) return { status: 'invalid', errors: invalid };

    const snapshot = new Map(this.drafts);
    const dirtyScopes = SCOPES.filter((scope) =>
      [...snapshot.keys()].some((key) => this.spec(key).scope === scope),
    );
    this.busy = true;
    this.emit();
    const saved: StorageScope[] = [];
    const failed: { scope: StorageScope; error: unknown }[] = [];
    try {
      for (const scope of dirtyScopes) {
        const document: Record<string, unknown> = { ...this.foreign.get(scope) };
        for (const [key, spec] of Object.entries(this.fields)) {
          if (spec.scope !== scope) continue;
          document[key] = snapshot.has(key) ? snapshot.get(key) : this.committedValues.get(key);
        }
        try {
          await this.store.save(this.keys[scope], document);
        } catch (error) {
          failed.push({ scope, error });
          continue;
        }
        saved.push(scope);
        for (const [key, value] of snapshot) {
          if (this.spec(key).scope !== scope) continue;
          this.committedValues.set(key, value);
          // Yazım sürerken aynı alan yeniden düzenlendiyse taslak (yeni değer) kirli kalır.
          if (same(this.drafts.get(key), value)) this.drafts.delete(key);
        }
      }
    } finally {
      this.busy = false;
      this.revision += 1;
      this.emit();
    }
    return failed.length > 0 ? { status: 'failed', saved, failed } : { status: 'applied', saved };
  }

  /**
   * Escape/geri isteği: kirli değişiklik yoksa kapanır. Varsa KARAR tüketicidedir (model karar vermez):
   * `apply` uygular ve yalnız başarılıysa kapanır, `discard` taslağı atıp kapanır, `stay` açık bırakır.
   * Kaydedilirken kapanma yoktur.
   */
  async requestClose(
    decide: (dirty: readonly string[]) => Promise<SettingsCloseDecision> | SettingsCloseDecision,
  ): Promise<boolean> {
    if (this.busy) return false;
    if (!this.isDirty()) return true;
    const decision = await decide(this.dirtyKeys());
    if (decision === 'discard') {
      this.revert();
      return true;
    }
    if (decision === 'apply') return (await this.apply()).status === 'applied';
    return false;
  }

  /** Değişim bildirimi (değer, hata, kirli, meşgul); abonelikten çıkış fonksiyonu döner. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Her uygulama bitişinde artar: sunum "kaydedildi" duyurusunu yinelemeden bağlar. */
  get applyCount(): number {
    return this.revision;
  }

  private applyDraft(key: string, value: unknown): void {
    if (same(value, this.committedValues.get(key))) this.drafts.delete(key);
    else this.drafts.set(key, value);
    const problem = this.spec(key).validate?.(value) ?? null;
    if (problem === null) this.errors.delete(key);
    else this.errors.set(key, problem);
  }

  private spec(key: string): SettingsFieldSpec {
    const spec = this.fields[key];
    if (!spec) throw new Error(`SettingsModel: bilinmeyen alan "${key}".`);
    return spec;
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
