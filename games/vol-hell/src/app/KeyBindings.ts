import type { SaveManager } from '@volstudio/core';
import { findBindingConflicts, type PCActionBinding } from '@volstudio/core';
import { reportPersistenceFailure } from '@/app/settingsPersistence';
import { HELL_ACTIONS, HELL_PC_BINDINGS, type HellAction } from '@/config/input';

export type HellBindings = Readonly<Record<HellAction, PCActionBinding>>;

const STORAGE_KEY = 'vol-hell:key-bindings';

/**
 * Kayıttan gelen tek bir bağı doğrular.
 *
 * `??` YETMEZ: elle düzenlenmiş bir kayıt `keyCode: "space"` ya da
 * `source: "gamepad"` taşıyabilir ve doğrulanmadan geçerse `resolvePCActions`
 * o eylemi sessizce hiç basılı saymaz — oyuncu tuşunun neden çalışmadığını
 * anlamaz. Şüpheli değer varsayılana döner.
 */
function safeBinding(value: unknown, fallback: PCActionBinding): PCActionBinding {
  if (typeof value !== 'object' || value === null) return fallback;
  const raw = value as { source?: unknown; keyCode?: unknown; button?: unknown };

  if (raw.source === 'key') {
    return typeof raw.keyCode === 'number' && Number.isInteger(raw.keyCode) && raw.keyCode > 0
      ? { source: 'key', keyCode: raw.keyCode }
      : fallback;
  }
  // `PointerButton` yalnız `'left'`tir; başka bir değer çözümlenemez bir bağdır.
  if (raw.source === 'pointerButton') {
    return raw.button === 'left' ? { source: 'pointerButton', button: 'left' } : fallback;
  }
  return fallback;
}

/** Eksik eylemleri varsayılanla tamamlar, tanınmayan anahtarları ATAR. */
function mergeWithDefaults(stored: unknown): HellBindings {
  const raw =
    typeof stored === 'object' && stored !== null
      ? (stored as Partial<Record<HellAction, unknown>>)
      : {};

  const merged = {} as Record<HellAction, PCActionBinding>;
  for (const action of HELL_ACTIONS) {
    merged[action] = safeBinding(raw[action], HELL_PC_BINDINGS[action]);
  }
  return merged;
}

/**
 * Tuş eşlemesini kalıcı hâle getirir ve çakışmayı TAKAS ile çözer.
 *
 * Eşleme zaten veriydi (`HELL_PC_BINDINGS`); burada eklenen tek şey oyuncunun
 * onu değiştirebilmesi ve değişikliğin kalıcı olması.
 *
 * **Çakışma politikası TAKASTIR ve bu bir üründür kararıdır, CORE kuralı
 * değil.** Bir tuşu başka bir eyleme vermek, o tuşu tutan eylemi bağsız
 * bırakmaz: eski bağ ona geçer. Böylece "iki eylem aynı tuşta" durumu hiç
 * oluşmaz ve oyuncu bir eylemi kazara erişilemez kılamaz.
 *
 * `AudioSettings`in debounce/kuyruk makinesi burada YOKTUR ve gerekmez: bir
 * yeniden atama tek ve ayrık bir olaydır, sürükleme değildir.
 */
export class KeyBindings {
  private data: HellBindings = mergeWithDefaults(undefined);
  private readonly listeners = new Set<(data: HellBindings) => void>();

  constructor(private readonly saveManager: SaveManager) {}

  async load(): Promise<void> {
    const stored = await this.saveManager.load<unknown>(STORAGE_KEY, {});
    this.data = mergeWithDefaults(stored);
    this.notify();
  }

  getAll(): HellBindings {
    return this.data;
  }

  /**
   * Eylemi yeni bağa taşır; çakışan eylemler ESKİ bağı devralır.
   *
   * @returns Takas edilen eylemler; boşsa çakışma yoktu.
   */
  async rebind(action: HellAction, binding: PCActionBinding): Promise<HellAction[]> {
    const conflicts = findBindingConflicts(this.data, action, binding);
    const previous = this.data[action];
    const next = { ...this.data, [action]: binding } as Record<HellAction, PCActionBinding>;
    for (const other of conflicts) next[other] = previous;

    this.data = next;
    this.notify();
    await this.persist();
    return conflicts;
  }

  /** Tek bir eylemi varsayılanına döndürür; takas aynı kuraldan geçer. */
  async reset(action: HellAction): Promise<HellAction[]> {
    return this.rebind(action, HELL_PC_BINDINGS[action]);
  }

  async resetAll(): Promise<void> {
    this.data = mergeWithDefaults(undefined);
    this.notify();
    await this.persist();
  }

  subscribe(listener: (data: HellBindings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.data);
  }

  private async persist(): Promise<void> {
    try {
      await this.saveManager.save(STORAGE_KEY, this.data);
    } catch (error) {
      // Kalıcılık hatası oyunu durdurmaz; ayar oturum boyunca geçerli kalır.
      reportPersistenceFailure('keyBindings', error);
    }
  }
}
