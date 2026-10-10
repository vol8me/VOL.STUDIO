import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScopedKey } from '../../../src/persistence/scopedStorage';
import { i18next } from '../../../src/i18n/I18n';
import { DEFAULT_UI_AUDIO_SETTINGS, type UiAudioSettings } from '../../../src/audio/ui/settings';
import { createAudioSettingsRows } from '../../../src/ui/layout/AudioSettingsRows';
import { SettingsForm } from '../../../src/ui/layout/SettingsForm';
import {
  SettingsModel,
  type SettingsFields,
  type SettingsStore,
} from '../../../src/ui/layout/SettingsModel';
import { Checkbox } from '../../../src/ui/primitives/Checkbox';
import { Select } from '../../../src/ui/primitives/Select';

/**
 * Ayar formu (UI-05.4): model (taslak, hata, kapsam başına atomik yazım, meşgul) ve tarif (satır, eylem çubuğu,
 * duyuru) ayrı sınanır; ses satırları ses sistemi portuna bağlıdır.
 */
const KEYS = { device: 'device.test:settings', synced: 'synced.test:settings' } as const;

const FIELDS: SettingsFields = {
  quality: { scope: 'device', defaultValue: 'high' },
  fps: { scope: 'device', defaultValue: true },
  language: { scope: 'synced', defaultValue: 'tr' },
  name: {
    scope: 'synced',
    defaultValue: 'Oyuncu',
    validate: (value) => (String(value).trim() === '' ? 'Ad boş olamaz' : null),
  },
};

interface Deferred {
  resolve(): void;
  reject(error: Error): void;
}

class MemoryStore implements SettingsStore {
  readonly data = new Map<string, unknown>();
  readonly writes: { key: string; value: unknown }[] = [];
  failing = new Set<string>();
  /** Doluysa yazım bu söz çözülene kadar bekler. */
  holds: Deferred[] = [];
  holdWrites = false;

  load<T>(key: ScopedKey, defaultValue: T): Promise<T> {
    return Promise.resolve((this.data.has(key) ? this.data.get(key) : defaultValue) as T);
  }

  async save<T>(key: ScopedKey, value: T): Promise<void> {
    if (this.holdWrites) {
      await new Promise<void>((resolve, reject) => this.holds.push({ resolve, reject }));
    }
    if (this.failing.has(key)) throw new Error('disk dolu');
    this.writes.push({ key, value });
    this.data.set(key, structuredClone(value));
  }
}

const model = (store = new MemoryStore()) =>
  new SettingsModel({ fields: FIELDS, store, keys: KEYS });

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('SettingsModel taslak ve yükleme', () => {
  it('boş depoda varsayılanlar gelir; bozuk, tür uyumsuz ve geçersiz kayıtlı alan varsayılana iner', async () => {
    const store = new MemoryStore();
    store.data.set(KEYS.device, { quality: 7, fps: false });
    store.data.set(KEYS.synced, { language: 'en', name: '   ' });
    const settings = model(store);
    await settings.load();
    expect(settings.get('quality')).toBe('high');
    expect(settings.get('fps')).toBe(false);
    expect(settings.get('language')).toBe('en');
    expect(settings.get('name')).toBe('Oyuncu');

    store.data.set(KEYS.device, 'bozuk');
    await settings.load();
    expect(settings.get('fps')).toBe(true);
    expect(settings.isDirty()).toBe(false);
  });

  it('set taslak üretir; kayıtlı değere dönmek kirliği kaldırır; geri al taslakları atar', async () => {
    const settings = model();
    await settings.load();
    settings.set('quality', 'low');
    expect(settings.get('quality')).toBe('low');
    expect(settings.committed('quality')).toBe('high');
    expect(settings.isDirty('quality')).toBe(true);
    settings.set('quality', 'high');
    expect(settings.isDirty()).toBe(false);

    settings.set('quality', 'low');
    settings.set('language', 'en');
    expect(settings.dirtyKeys()).toEqual(['quality', 'language']);
    settings.revert();
    expect(settings.isDirty()).toBe(false);
    expect(settings.get('quality')).toBe('high');
  });

  it('varsayılana dön taslak olarak uygulanır; isModified varsayılandan sapmayı söyler', async () => {
    const store = new MemoryStore();
    store.data.set(KEYS.device, { quality: 'low', fps: true });
    const settings = model(store);
    await settings.load();
    expect(settings.isModified('quality')).toBe(true);
    settings.reset('quality');
    expect(settings.get('quality')).toBe('high');
    expect(settings.isDirty('quality')).toBe(true);
    expect(settings.committed('quality')).toBe('low');
    expect(settings.isModified('quality')).toBe(false);
    settings.revert();
    settings.resetAll();
    expect(settings.get('quality')).toBe('high');
    expect(store.writes).toHaveLength(0);
  });

  it('bilinmeyen alan ve kapsam öneki uyuşmazlığı reddedilir', () => {
    expect(() => model().get('yok')).toThrow(/bilinmeyen alan/);
    expect(
      () =>
        new SettingsModel({
          fields: FIELDS,
          store: new MemoryStore(),
          keys: { device: 'synced.x', synced: 'synced.y' } as never,
        }),
    ).toThrow(/kapsamında değil/);
  });
});

describe('SettingsModel uygulama', () => {
  it('geçersiz alan varken hiçbir kapsama yazılmaz ve hata alan başına döner', async () => {
    const store = new MemoryStore();
    const settings = model(store);
    await settings.load();
    settings.set('quality', 'low');
    settings.set('name', '  ');
    expect(settings.error('name')).toBe('Ad boş olamaz');
    expect(await settings.apply()).toEqual({
      status: 'invalid',
      errors: { name: 'Ad boş olamaz' },
    });
    expect(store.writes).toHaveLength(0);
    settings.set('name', 'Ada');
    expect(settings.error('name')).toBeNull();
  });

  it('her kirli kapsam TEK yazımla gider; belge kapsamın bütün alanlarını ve bilinmeyen alanları taşır', async () => {
    const store = new MemoryStore();
    store.data.set(KEYS.device, { quality: 'high', fps: true, gelecek: 42 });
    const settings = model(store);
    await settings.load();
    settings.set('quality', 'low');
    settings.set('language', 'en');
    settings.set('name', 'Ada');

    expect(await settings.apply()).toEqual({ status: 'applied', saved: ['device', 'synced'] });
    expect(store.writes).toEqual([
      { key: KEYS.device, value: { gelecek: 42, quality: 'low', fps: true } },
      { key: KEYS.synced, value: { language: 'en', name: 'Ada' } },
    ]);
    expect(settings.isDirty()).toBe(false);
    expect(settings.committed('quality')).toBe('low');

    settings.set('fps', false);
    await settings.apply();
    expect(store.writes).toHaveLength(3);
    expect(store.writes[2].key).toBe(KEYS.device);
  });

  it('kirli alan yokken yazım yapılmaz', async () => {
    const store = new MemoryStore();
    const settings = model(store);
    await settings.load();
    expect(await settings.apply()).toEqual({ status: 'applied', saved: [] });
    expect(store.writes).toHaveLength(0);
  });

  it('bir kapsam yazılamazsa onun taslağı kirli kalır, diğer kapsam işlenir; yeniden deneme tamamlar', async () => {
    const store = new MemoryStore();
    store.failing.add(KEYS.synced);
    const settings = model(store);
    await settings.load();
    settings.set('quality', 'low');
    settings.set('language', 'en');

    const result = await settings.apply();
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.saved).toEqual(['device']);
      expect(result.failed.map((entry) => entry.scope)).toEqual(['synced']);
    }
    expect(settings.committed('quality')).toBe('low');
    expect(settings.committed('language')).toBe('tr');
    expect(settings.dirtyKeys()).toEqual(['language']);
    expect(settings.isBusy()).toBe(false);

    store.failing.clear();
    expect(await settings.apply()).toEqual({ status: 'applied', saved: ['synced'] });
    expect(settings.isDirty()).toBe(false);
  });

  it('kaydedilirken ikinci uygulama başlamaz (busy); yazım sürerken yapılan yeni düzenleme kirli kalır', async () => {
    const store = new MemoryStore();
    store.holdWrites = true;
    const settings = model(store);
    await settings.load();
    settings.set('quality', 'low');

    const first = settings.apply();
    expect(settings.isBusy()).toBe(true);
    expect(await settings.apply()).toEqual({ status: 'busy' });
    settings.set('quality', 'medium');
    store.holds[0].resolve();
    expect(await first).toEqual({ status: 'applied', saved: ['device'] });

    expect(store.writes).toHaveLength(1);
    expect(settings.committed('quality')).toBe('low');
    expect(settings.get('quality')).toBe('medium');
    expect(settings.isDirty('quality')).toBe(true);
    expect(settings.isBusy()).toBe(false);
  });

  it('abonelere her değişimde ve uygulama bitişinde haber verilir; abonelikten çıkılır', async () => {
    const settings = model();
    await settings.load();
    const listener = vi.fn();
    const stop = settings.subscribe(listener);
    settings.set('quality', 'low');
    expect(listener).toHaveBeenCalledTimes(1);
    const before = settings.applyCount;
    await settings.apply();
    expect(settings.applyCount).toBe(before + 1);
    stop();
    listener.mockClear();
    settings.set('quality', 'high');
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('SettingsModel kapanış kararı (Escape/geri)', () => {
  it('kirli değişiklik yoksa karar sorulmadan kapanır', async () => {
    const settings = model();
    await settings.load();
    const decide = vi.fn();
    expect(await settings.requestClose(decide)).toBe(true);
    expect(decide).not.toHaveBeenCalled();
  });

  it('karar tüketicidedir: stay açık bırakır, discard taslağı atar, apply yalnız başarıda kapatır', async () => {
    const store = new MemoryStore();
    const settings = model(store);
    await settings.load();
    settings.set('quality', 'low');

    const decide = vi.fn().mockResolvedValue('stay');
    expect(await settings.requestClose(decide)).toBe(false);
    expect(decide).toHaveBeenCalledWith(['quality']);
    expect(settings.isDirty()).toBe(true);

    store.failing.add(KEYS.device);
    expect(await settings.requestClose(() => 'apply')).toBe(false);
    expect(settings.isDirty()).toBe(true);
    store.failing.clear();
    expect(await settings.requestClose(() => 'apply')).toBe(true);
    expect(settings.isDirty()).toBe(false);

    settings.set('fps', false);
    expect(await settings.requestClose(() => 'discard')).toBe(true);
    expect(settings.get('fps')).toBe(true);
  });

  it('kaydedilirken kapanma yoktur ve karar sorulmaz', async () => {
    const store = new MemoryStore();
    store.holdWrites = true;
    const settings = model(store);
    await settings.load();
    settings.set('quality', 'low');
    const pending = settings.apply();
    const decide = vi.fn();
    expect(await settings.requestClose(decide)).toBe(false);
    expect(decide).not.toHaveBeenCalled();
    store.holds[0].resolve();
    await pending;
  });
});

describe('SettingsForm model bağı', () => {
  async function build() {
    const store = new MemoryStore();
    const settings = model(store);
    await settings.load();
    const form = new SettingsForm({ model: settings });
    const language = form.addField<string>({
      key: 'language',
      label: 'Dil',
      create: ({ value, onChange }) => {
        const select = new Select({
          options: [
            { value: 'tr', label: 'Türkçe' },
            { value: 'en', label: 'English' },
          ],
          value,
          onCommit: onChange,
        });
        return { element: select.element, setValue: (next) => select.setValue(next) };
      },
    });
    const name = form.addField<string>({
      key: 'name',
      label: 'Ad',
      create: ({ value, onChange }) => {
        const input = document.createElement('input');
        input.value = value;
        input.addEventListener('input', () => onChange(input.value));
        return {
          element: input,
          setValue: (next) => {
            input.value = next;
          },
        };
      },
    });
    const fps = form.addField<boolean>({
      key: 'fps',
      create: ({ value, onChange }) => {
        const checkbox = new Checkbox({ label: 'FPS', checked: value, onCommit: onChange });
        return { element: checkbox.element, setValue: (next) => checkbox.setChecked(next) };
      },
    });
    document.body.append(form.element);
    const buttons = () => {
      const bar = form.element.querySelector('.vol-settings-form__actions')!;
      const [resetAll, revert, apply] = [...bar.querySelectorAll<HTMLButtonElement>('button')];
      return { resetAll, revert, apply };
    };
    const status = () => form.element.querySelector('.vol-settings-form__status')!.textContent;
    return { store, settings, form, language, name, fps, buttons, status };
  }

  it('eylem çubuğu formun sonundadır; temizken Uygula ve Geri al kapalıdır', async () => {
    const { form, buttons } = await build();
    expect(form.element.lastElementChild?.classList.contains('vol-settings-form__actions')).toBe(
      true,
    );
    expect(buttons().apply.disabled).toBe(true);
    expect(buttons().revert.disabled).toBe(true);
    expect(form.element.querySelector('.vol-settings-form__status')?.getAttribute('role')).toBe(
      'status',
    );
  });

  it('denetim değişince taslak oluşur, satır kirli işaretlenir, sayaç duyurulur; model değişince denetim güncellenir', async () => {
    const { settings, language, name, buttons, status } = await build();
    const input = name.element.querySelector('input')!;
    input.value = 'Ada';
    input.dispatchEvent(new Event('input'));
    expect(settings.get('name')).toBe('Ada');
    expect(name.element.classList.contains('vol-settings-row--dirty')).toBe(true);
    expect(buttons().apply.disabled).toBe(false);
    expect(status()).toBe('1 kaydedilmemiş değişiklik');

    settings.set('language', 'en');
    expect(status()).toBe('2 kaydedilmemiş değişiklik');
    expect(language.element.textContent).toContain('English');

    buttons().revert.click();
    expect(input.value).toBe('Oyuncu');
    expect(language.element.textContent).toContain('Türkçe');
    expect(status()).toBe('');
    expect(buttons().apply.disabled).toBe(true);
  });

  it('durum satırı sayıya göre tekil/çoğul seçer (İngilizce: 1 change, 2 changes)', async () => {
    await i18next.changeLanguage('en');
    try {
      const { settings, status } = await build();
      settings.set('name', 'Ada');
      expect(status()).toBe('1 unsaved change');
      settings.set('language', 'en');
      expect(status()).toBe('2 unsaved changes');
    } finally {
      await i18next.changeLanguage('tr');
    }
  });

  it('geçersiz değer satırda role=alert hatası ve aria-invalid üretir; Uygula yazmaz ve nedenini söyler', async () => {
    const { store, name, buttons, status } = await build();
    const input = name.element.querySelector('input')!;
    input.value = '';
    input.dispatchEvent(new Event('input'));
    expect(name.element.querySelector('[role="alert"]')?.textContent).toBe('Ad boş olamaz');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    buttons().apply.click();
    await vi.waitFor(() => expect(status()).toBe('Önce vurgulanan ayarları düzeltin.'));
    expect(store.writes).toHaveLength(0);
  });

  it('satırdaki "Varsayılan" düğmesi yalnız varsayılandan sapmada görünür ve alanı varsayılana döndürür', async () => {
    const { settings, language } = await build();
    const reset = language.element.querySelector<HTMLButtonElement>('.vol-settings-row__reset')!;
    expect(reset.hidden).toBe(true);
    expect(reset.getAttribute('aria-label')).toBe('Varsayılana döndür: Dil');
    settings.set('language', 'en');
    expect(reset.hidden).toBe(false);
    reset.click();
    expect(settings.get('language')).toBe('tr');
    expect(reset.hidden).toBe(true);
  });

  it('Uygula: kaydediliyor duyurulur ve form aria-busy olur, ikinci tık yazım başlatmaz; sonra "Kaydedildi"', async () => {
    const { store, settings, form, buttons, status } = await build();
    store.holdWrites = true;
    settings.set('fps', false);
    buttons().apply.click();
    expect(form.element.getAttribute('aria-busy')).toBe('true');
    expect(status()).toBe('Kaydediliyor…');
    expect(buttons().apply.disabled).toBe(true);
    buttons().apply.click();
    store.holds[0].resolve();
    await vi.waitFor(() => expect(status()).toBe('Kaydedildi'));
    expect(form.element.hasAttribute('aria-busy')).toBe(false);
    expect(store.writes).toHaveLength(1);

    settings.set('fps', true);
    expect(status()).toBe('1 kaydedilmemiş değişiklik');
  });

  it('yazım hatasında değişiklikler durur ve hata duyurulur', async () => {
    const { store, settings, buttons, status } = await build();
    store.failing.add(KEYS.device);
    settings.set('fps', false);
    buttons().apply.click();
    await vi.waitFor(() => expect(status()).toBe('Kaydedilemedi. Değişiklikleriniz duruyor.'));
    expect(settings.isDirty('fps')).toBe(true);
    expect(buttons().apply.disabled).toBe(false);
  });

  it('Varsayılana dön bütün alanları taslak olarak varsayılana çeker; kapanış kararı modele iner', async () => {
    const { store, settings, form, buttons } = await build();
    store.data.set(KEYS.synced, { language: 'en', name: 'Ada' });
    await settings.load();
    expect(settings.get('language')).toBe('en');
    buttons().resetAll.click();
    expect(settings.get('language')).toBe('tr');
    expect(settings.isDirty()).toBe(true);
    expect(await form.requestClose(() => 'stay')).toBe(false);
    expect(await form.requestClose(() => 'discard')).toBe(true);
    expect(settings.get('language')).toBe('en');
  });

  it('modelsiz form eylem çubuğu kurmaz ve addField hata verir; destroy idempotenttir', async () => {
    const plain = new SettingsForm();
    expect(plain.element.querySelector('.vol-settings-form__actions')).toBeNull();
    expect(() =>
      plain.addField({ key: 'x', create: () => ({ element: document.body, setValue: () => {} }) }),
    ).toThrow(/model/);
    const { form } = await build();
    form.destroy();
    form.destroy();
    expect(form.element.isConnected).toBe(false);
  });
});

describe('ses ayar satırları ses sistemine bağlıdır', () => {
  function port() {
    let current: UiAudioSettings = { ...DEFAULT_UI_AUDIO_SETTINGS };
    const setSettings = vi.fn((patch: Partial<UiAudioSettings>) => {
      current = { ...current, ...patch };
      return current;
    });
    return {
      get settings() {
        return current;
      },
      setSettings,
      set(next: Partial<UiAudioSettings>) {
        current = { ...current, ...next };
      },
    };
  }

  it('beş seviye ve sessize alma satırı kurulur; kaydırıcı kazancı anında sisteme yazar', () => {
    const audio = port();
    const { rows } = createAudioSettingsRows(audio);
    expect(rows).toHaveLength(6);
    const labels = rows
      .slice(0, 5)
      .map((row) => row.element.querySelector('.vol-settings-row__label')?.textContent);
    expect(labels).toEqual(['Ana ses', 'Arayüz sesi', 'Efektler', 'Müzik', 'Konuşma']);

    const music = rows[3].element.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(music.getAttribute('aria-labelledby')).toBe(
      rows[3].element.querySelector('.vol-settings-row__label')!.id,
    );
    music.value = '0.4';
    music.dispatchEvent(new Event('input', { bubbles: true }));
    expect(audio.setSettings).toHaveBeenLastCalledWith({ music: 0.4 });
    expect(audio.settings.music).toBe(0.4);
  });

  it('sessize alma anahtarı switch rolündedir ve sisteme yazar; refresh dış değişimi sessizce yansıtır', () => {
    const audio = port();
    const created = createAudioSettingsRows(audio);
    document.body.append(created.rows[5].element);
    const toggle = created.rows[5].element.querySelector<HTMLInputElement>('input')!;
    expect(created.rows[5].element.querySelector('[role="switch"]')).not.toBeNull();
    toggle.click();
    expect(audio.setSettings).toHaveBeenLastCalledWith({ muted: true });

    audio.setSettings.mockClear();
    audio.set({ master: 0.2, muted: false });
    created.refresh();
    expect(audio.setSettings).not.toHaveBeenCalled();
    expect(
      created.rows[0].element.querySelector<HTMLInputElement>('input[type="range"]')!.value,
    ).toBe('0.2');
    expect(created.rows[5].element.querySelector<HTMLInputElement>('input')!.checked).toBe(false);
    created.destroy();
    created.destroy();
  });
});
