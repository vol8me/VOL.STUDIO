import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18next } from '@volstudio/core/i18n';
import { NAME_MAX_LENGTH, normalizeRoomCode } from '@volstudio/network/protocol';
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
  return { panel, submitted, names, onCancel, find };
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
    expect(find('lobby-quick').textContent).toBe(i18next.t('voltest:online.quick'));
    expect(panel.element.textContent).toContain(i18next.t('voltest:online.title'));
    panel.close();
    expect(panel.isOpen).toBe(false);
    expect(onCancel).not.toHaveBeenCalled();
    panel.close();
  });

  it('Vazgeç düğmesi ve Escape lobiyi kapatıp vazgeçmeyi bildirir', () => {
    const { panel, find, onCancel } = mount();
    panel.open();
    find('lobby-cancel').click();
    expect(onCancel).toHaveBeenCalledTimes(1);
    panel.open();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('hızlı oyun seçili maç türüyle istenir ve adı kaydettirir', () => {
    const { panel, find, submitted, names } = mount('Ada');
    panel.open();
    find('lobby-quick').click();
    expect(submitted).toEqual([{ name: 'Ada', request: { kind: 'quick', mode: 'ffa' } }]);
    expect(names).toEqual(['Ada']);
    const teams = i18next.t('voltest:online.modeKind.teams');
    [...find('lobby-mode').querySelectorAll<HTMLButtonElement>('[role="radio"]')]
      .find((button) => button.textContent === teams)!
      .click();
    find('lobby-quick').click();
    expect(submitted[1].request).toEqual({ kind: 'quick', mode: 'teams' });
  });

  it('özel oda kurmak her seferinde geçerli, yeni bir kod üretir', () => {
    const { panel, find, submitted } = mount();
    panel.open();
    find('lobby-create').click();
    find('lobby-create').click();
    const codes = submitted.map((choice) =>
      choice.request.kind === 'create' ? choice.request.code : '',
    );
    expect(codes).toHaveLength(2);
    for (const code of codes) expect(normalizeRoomCode(code)).toBe(code);
    expect(codes[0]).not.toBe(codes[1]);
  });

  it('koda katılma yazılanı olduğu gibi yollar; Enter da katılır', () => {
    const { panel, find, submitted } = mount();
    panel.open();
    const code = find<HTMLInputElement>('lobby-code');
    expect(code.maxLength).toBe(12);
    code.value = 'ab-cde';
    find('lobby-join').click();
    expect(submitted.at(-1)?.request).toEqual({ kind: 'join', code: 'ab-cde' });
    code.value = 'KMN23';
    code.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(submitted.at(-1)?.request).toEqual({ kind: 'join', code: 'KMN23' });
  });

  it('bağlanırken seçimler kilitlenir ve ikinci istek yutulur; hata seçimleri açar', () => {
    const { panel, find, submitted } = mount();
    panel.open();
    panel.setBusy(true);
    expect(find('lobby-status').textContent).toBe(i18next.t('voltest:online.connecting'));
    for (const id of ['lobby-quick', 'lobby-create', 'lobby-join'])
      expect(find<HTMLButtonElement>(id).disabled).toBe(true);
    expect(find<HTMLInputElement>('lobby-name').disabled).toBe(true);
    find('lobby-quick').click();
    expect(submitted).toHaveLength(0);

    panel.showError('voltest:online.error.full');
    expect(find('lobby-status').textContent).toBe(i18next.t('voltest:online.error.full'));
    expect(find('lobby-status').dataset.tone).toBe('danger');
    expect(find<HTMLButtonElement>('lobby-quick').disabled).toBe(false);
    find('lobby-quick').click();
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
      expect(find('lobby-quick').textContent).toBe(i18next.t('voltest:online.quick'));
    } finally {
      await i18next.changeLanguage(language);
    }
  });
});
