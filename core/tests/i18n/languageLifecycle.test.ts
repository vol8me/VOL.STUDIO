import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n, i18next } from '../../src/i18n/I18n';
import { PauseResumeButton } from '../../src/ui/buttons/PauseResumeButton';
import { Carousel } from '../../src/ui/layout/Carousel';
import { DataTable } from '../../src/ui/data/DataTable';
import { DPad } from '../../src/ui/touch/DPad';
import { EventLog } from '../../src/ui/data/EventLog';
import { Bar } from '../../src/ui/feedback/Bar';
import { ResourceBar } from '../../src/ui/feedback/ResourceBar';
import { RoundCounter } from '../../src/ui/feedback/RoundCounter';
import { XPBar } from '../../src/ui/feedback/XPBar';
import { CommandPalette } from '../../src/ui/overlays/CommandPalette';
import { showConfirm } from '../../src/ui/overlays/Confirm';
import { DialogueBox } from '../../src/ui/overlays/DialogueBox';
import { NumberStepper } from '../../src/ui/primitives/NumberStepper';
import { Select } from '../../src/ui/primitives/Select';
import { OnScreenKeyboard } from '../../src/ui/textEntry/OnScreenKeyboard';

/**
 * `languageChanged` dinleyicisi YAŞAM DÖNGÜSÜ: bir bileşen dile abone olduysa sökülünce de
 * (açık katman, açık klavye, açık seçici dahil) aboneliğini bırakmalı; bırakmazsa her
 * oluşturulan örnek dil değişiminde ölü DOM'u güncellemeye çalışır ve sızar.
 */
const live = new Map<unknown, number>();
let restore: (() => void) | null = null;

function liveListeners(): number {
  let total = 0;
  for (const count of live.values()) total += count;
  return total;
}

beforeEach(() => {
  live.clear();
  const originalOn = i18next.on.bind(i18next);
  const originalOff = i18next.off.bind(i18next);
  i18next.on = ((event: string, listener: unknown) => {
    if (event === 'languageChanged') live.set(listener, (live.get(listener) ?? 0) + 1);
    return originalOn(event as never, listener as never);
  }) as typeof i18next.on;
  i18next.off = ((event: string, listener: unknown) => {
    if (event === 'languageChanged' && live.has(listener)) {
      const next = (live.get(listener) ?? 1) - 1;
      if (next <= 0) live.delete(listener);
      else live.set(listener, next);
    }
    return originalOff(event, listener as never);
  }) as typeof i18next.off;
  restore = () => {
    i18next.on = originalOn;
    i18next.off = originalOff;
  };
});

afterEach(async () => {
  restore?.();
  restore = null;
  document.body.replaceChildren();
  await i18next.changeLanguage('tr');
});

type Disposable = { destroy(): void };

const FACTORIES: Array<[string, () => Disposable]> = [
  ['Bar', () => new Bar({ max: 100, value: 50 })],
  [
    'XPBar',
    () => new XPBar({ level: 1, xp: 10, xpForLevel: (level) => level * 100, animateMs: 0 }),
  ],
  [
    'ResourceBar',
    () => new ResourceBar({ resources: [{ key: 'gold', label: 'Altın', value: 100, icon: 'G' }] }),
  ],
  ['RoundCounter', () => new RoundCounter({ totalRounds: 10 })],
  ['PauseResumeButton', () => new PauseResumeButton()],
  [
    'Carousel',
    () => new Carousel({ slides: [{ id: 's1', element: document.createElement('div') }] }),
  ],
  ['DPad', () => new DPad()],
  ['DataTable', () => new DataTable({ columns: [{ key: 'name', header: 'Ad' }], rows: [] })],
  ['EventLog', () => new EventLog({ showFilters: true })],
  ['NumberStepper', () => new NumberStepper()],
  ['Select', () => new Select({ options: [{ value: 'a', label: 'A' }] })],
  ['DialogueBox (kontrollü)', () => new DialogueBox({ showControls: true })],
  ['CommandPalette', () => new CommandPalette()],
];

describe('languageChanged: sökülünce abonelik bırakılır', () => {
  for (const [name, make] of FACTORIES) {
    it(`${name}: oluşturma + destroy dinleyici sayısını eski haline döndürür`, () => {
      const before = liveListeners();
      const instance = make();
      instance.destroy();
      expect(liveListeners()).toBe(before);
    });
  }

  it('açık Select (popup açık) destroy edilince abonelik kalmaz', () => {
    const select = new Select({ options: [{ value: 'a', label: 'A' }] });
    document.body.append(select.element);
    select.element.click();
    select.destroy();
    expect(liveListeners()).toBe(0);
  });

  it('açık CommandPalette destroy edilince abonelik kalmaz', () => {
    const palette = new CommandPalette();
    palette.open();
    palette.destroy();
    expect(liveListeners()).toBe(0);
  });

  it('açık onay (Confirm modal) yanıtlanınca abonelik kalmaz', async () => {
    vi.useFakeTimers();
    try {
      const promise = showConfirm({ title: 'Silinsin mi?' });
      expect(liveListeners()).toBeGreaterThan(0);
      document.querySelector<HTMLButtonElement>('.vol-confirm__actions button:last-child')?.click();
      vi.advanceTimersByTime(400);
      await promise;
      expect(liveListeners()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('açık ekran klavyesi: dil değişince işlev tuşları çevrilir, kapanınca abonelik kalmaz', async () => {
    const controller = new AbortController();
    const result = OnScreenKeyboard.open({ value: '' }, controller.signal);
    const label = (action: string): string | null | undefined =>
      document.querySelector(`.vol-osk__key[data-action="${action}"]`)?.textContent;
    const space = (): string | null | undefined =>
      document.querySelector('.vol-osk__key[data-value=" "]')?.textContent;
    expect(label('done')).toBe(i18next.t('core:keyboard.done'));
    expect(space()).toBe('Boşluk');
    const focused = document.activeElement;

    await i18next.changeLanguage('en');
    expect(label('done')).toBe(i18next.t('core:keyboard.done'));
    expect(label('done')).not.toBe('Bitti');
    expect(space()).toBe(i18next.t('core:keyboard.space'));
    // Düzen dile bağlıdır (tr: Türkçe Q, diğerleri: QWERTY); dil değişince tuşlar yeniden kurulabilir,
    // ama odak AYNI anlamlı tuşta kalır (yazı odağı kaybolmaz).
    expect(document.activeElement).toBeInstanceOf(HTMLButtonElement);
    expect((document.activeElement as HTMLButtonElement).dataset.value).toBe(
      (focused as HTMLButtonElement).dataset.value,
    );

    controller.abort();
    await result;
    expect(liveListeners()).toBe(0);
  });
});

describe('açık bileşenler dil değişince güncellenir', () => {
  it('XPBar varsayılan etiketi çevrilmiştir ve dil değişince güncellenir', async () => {
    const bar = new XPBar({ level: 2, xp: 30, xpForLevel: () => 100, animateMs: 0 });
    document.body.append(bar.element);
    const text = (): string => bar.element.querySelector('.vol-bar__label')?.textContent ?? '';
    expect(text()).toBe('Sv. 2 — 30 / 100');
    await i18next.changeLanguage('en');
    expect(text()).toBe('Lv. 2 — 30 / 100');
    // Erişilebilir ad görünen etiketten gelir (aria-labelledby).
    const labelId = bar.element.getAttribute('aria-labelledby');
    expect(document.getElementById(labelId ?? '')?.textContent).toBe('Lv. 2 — 30 / 100');
    bar.destroy();
  });

  it('DialogueBox kontrol düğmesi adları çevrilmiştir ve dil değişince güncellenir', async () => {
    const box = new DialogueBox({ showControls: true });
    document.body.append(box.element);
    const names = (): string[] =>
      [...box.element.querySelectorAll('.vol-dialogue__control')].map(
        (element) => element.getAttribute('aria-label') ?? '',
      );
    expect(names()).toEqual(['Yazımı hızlandır', 'Satırı tamamla']);
    await i18next.changeLanguage('en');
    expect(names()).toEqual(['Speed up typing', 'Finish the line']);
    box.destroy();
  });
});

describe('eksik anahtar görünür başarısızlık üretir', () => {
  it('bilinmeyen anahtar boş metin DEĞİL, anahtarın kendisini gösterir', () => {
    // Kullanıcı arayüzünde "core:yok.anahtar" görünür: gözden kaçmaz, boş etiket olmaz.
    expect(i18next.t('core:yok.anahtar' as never)).toBe('yok.anahtar');
  });

  it('dinamik anahtar doğrulaması console.error ile bildirir (tDynamic/assertKey)', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(i18n.tDynamic('core:yok.anahtar')).toBe('yok.anahtar');
      expect(error).toHaveBeenCalledWith(expect.stringContaining('core:yok.anahtar'));
      error.mockClear();
      expect(i18n.tDynamic('core:confirm.yes')).toBe('Evet');
      expect(error).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });
});
