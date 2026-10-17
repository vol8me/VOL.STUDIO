import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18next } from '@volstudio/core/i18n';
import { NAME_MAX_LENGTH } from '@volstudio/network/protocol';
import { LobbyPanel, type LobbyChoice } from '@/hud/LobbyPanel';

const panels: LobbyPanel[] = [];

function mount(name = 'Kaptan') {
  const submitted: LobbyChoice[] = [];
  const names: string[] = [];
  const onCancel = vi.fn();
  const panel = new LobbyPanel({
    name,
    onSubmit: (choice) => submitted.push(choice),
    onName: (value) => names.push(value),
    onCancel,
  });
  document.body.append(panel.element);
  panels.push(panel);
  const find = <T extends HTMLElement = HTMLElement>(id: string): T =>
    panel.element.querySelector<T>(`[data-testid="${id}"]`)!;
  /** Cephe seçimindeki düğmeyi görünen etiketiyle bulur. */
  const factionButton = (label: string): HTMLButtonElement =>
    [...find('lobby-faction').querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(
      (button) => button.textContent === label,
    )!;
  return { panel, submitted, names, onCancel, find, factionButton };
}

afterEach(() => {
  for (const panel of panels.splice(0)) panel.destroy();
});

describe('LobbyPanel', () => {
  it('açılınca adı ve etiketleri gösterir, kapanınca vazgeçme bildirmez', () => {
    const { panel, find, onCancel } = mount('Kaptan');
    expect(panel.isOpen).toBe(false);
    panel.open();
    panel.open();
    expect(panel.isOpen).toBe(true);
    expect(find<HTMLInputElement>('lobby-name').value).toBe('Kaptan');
    expect(find<HTMLInputElement>('lobby-name').maxLength).toBe(NAME_MAX_LENGTH);
    expect(find('lobby-enter').textContent).toBe(i18next.t('voltest:online.enter'));
    expect(panel.element.textContent).toContain(i18next.t('voltest:online.title'));
    panel.close();
    expect(panel.isOpen).toBe(false);
    expect(onCancel).not.toHaveBeenCalled();
    panel.close();
  });

  it('Vazgeç düğmesi ve Escape paneli kapatıp vazgeçmeyi bildirir', () => {
    const { panel, find, onCancel } = mount();
    panel.open();
    find('lobby-cancel').click();
    expect(onCancel).toHaveBeenCalledTimes(1);
    panel.open();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('cephe seçilmezse sunucunun dengelemesi istenir ve ad kaydettirilir', () => {
    const { panel, find, submitted, names } = mount('Ada');
    panel.open();
    find('lobby-enter').click();
    expect(submitted).toEqual([{ name: 'Ada', faction: undefined }]);
    expect(names).toEqual(['Ada']);
  });

  it('seçilen cephe istenir; "dengeye göre"ye dönülebilir', () => {
    const { panel, find, submitted, factionButton } = mount();
    panel.open();
    factionButton(i18next.t('voltest:war.faction.blue')).click();
    find('lobby-enter').click();
    expect(submitted.at(-1)?.faction).toBe(1);
    factionButton(i18next.t('voltest:war.faction.amber')).click();
    find('lobby-enter').click();
    expect(submitted.at(-1)?.faction).toBe(0);
    factionButton(i18next.t('voltest:online.factionAuto')).click();
    find('lobby-enter').click();
    expect(submitted.at(-1)?.faction).toBeUndefined();
  });

  it('Enter da katılır ve yazılan adı yollar', () => {
    const { panel, find, submitted } = mount();
    panel.open();
    const name = find<HTMLInputElement>('lobby-name');
    name.value = 'Yeni Ad';
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(submitted.at(-1)?.name).toBe('Yeni Ad');
  });

  it('bağlanırken seçimler kilitlenir ve ikinci istek yutulur; hata seçimleri açar', () => {
    const { panel, find, submitted } = mount();
    panel.open();
    panel.setBusy(true);
    expect(find('lobby-status').textContent).toBe(i18next.t('voltest:online.connecting'));
    expect(find<HTMLButtonElement>('lobby-enter').disabled).toBe(true);
    expect(find<HTMLInputElement>('lobby-name').disabled).toBe(true);
    find('lobby-enter').click();
    expect(submitted).toHaveLength(0);

    panel.showError('voltest:online.error.full');
    expect(find('lobby-status').textContent).toBe(i18next.t('voltest:online.error.full'));
    expect(find('lobby-status').dataset.tone).toBe('danger');
    expect(find<HTMLButtonElement>('lobby-enter').disabled).toBe(false);
    find('lobby-enter').click();
    expect(submitted).toHaveLength(1);

    panel.setBusy(true);
    panel.setBusy(false);
    expect(find('lobby-status').textContent).toBe('');
  });

  it('dil değişince etiketleri ve durum satırını yeniler', async () => {
    const { panel, find } = mount();
    panel.open();
    panel.showError('voltest:online.error.unreachable');
    const language = i18next.language;
    try {
      await i18next.changeLanguage(language === 'en' ? 'tr' : 'en');
      expect(find('lobby-status').textContent).toBe(i18next.t('voltest:online.error.unreachable'));
      expect(find('lobby-enter').textContent).toBe(i18next.t('voltest:online.enter'));
    } finally {
      await i18next.changeLanguage(language);
    }
  });
});
