import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18next } from '../../../src/i18n/I18n';
import type {
  ClipboardAdapter,
  ClipboardReadResult,
  ClipboardWriteResult,
} from '../../../src/ui/textEntry/clipboard';
import {
  installEditMenu,
  planEditMenu,
  type EditMenuFieldState,
  type EditMenuResult,
} from '../../../src/ui/textEntry/editMenu';

/**
 * Düzenleme menüsü sözleşmesi: hangi eylem hangi alan durumunda sunulur, yapıştırma yalnız kullanıcı eylemiyle
 * panoyu okur, kes yazma başarısızsa metni silmez, izin reddi/yetenek yokluğu akışı bozmaz, eski async sonuç
 * değişmiş alana yazamaz, dokunma kaynaklı olay yerel seçime bırakılır.
 */
const FIELD: EditMenuFieldState = {
  readOnly: false,
  disabled: false,
  password: false,
  hasSelection: true,
  hasValue: true,
};
const CAPS = { canRead: true, canWrite: true };

describe('planEditMenu', () => {
  it('normal alan: dört eylem, hepsi açık', () => {
    expect(planEditMenu(FIELD, CAPS)).toEqual([
      { action: 'cut', enabled: true },
      { action: 'copy', enabled: true },
      { action: 'paste', enabled: true },
      { action: 'selectAll', enabled: true },
    ]);
  });

  it('devre dışı alanda menü yoktur', () => {
    expect(planEditMenu({ ...FIELD, disabled: true }, CAPS)).toEqual([]);
  });

  it('salt okunurda yalnız Kopyala ve Tümünü Seç sunulur (Kes/Yapıştır yok)', () => {
    const plan = planEditMenu({ ...FIELD, readOnly: true }, CAPS);
    expect(plan.map((item) => item.action)).toEqual(['copy', 'selectAll']);
    expect(plan.every((item) => item.enabled)).toBe(true);
  });

  it('parolada Kes ve Kopyala sunulur ama kapalıdır; Yapıştır ve Tümünü Seç açıktır', () => {
    const plan = planEditMenu({ ...FIELD, password: true }, CAPS);
    expect(plan).toEqual([
      { action: 'cut', enabled: false },
      { action: 'copy', enabled: false },
      { action: 'paste', enabled: true },
      { action: 'selectAll', enabled: true },
    ]);
  });

  it('salt okunur parola: Kopyala kapalı, Tümünü Seç açık', () => {
    const plan = planEditMenu({ ...FIELD, readOnly: true, password: true }, CAPS);
    expect(plan).toEqual([
      { action: 'copy', enabled: false },
      { action: 'selectAll', enabled: true },
    ]);
  });

  it('seçim yoksa Kes/Kopyala, değer yoksa Tümünü Seç kapalıdır', () => {
    const plan = planEditMenu({ ...FIELD, hasSelection: false, hasValue: false }, CAPS);
    expect(plan.map((item) => item.enabled)).toEqual([false, false, true, false]);
  });

  it('yetenek yokluğu ilgili öğeleri kapatır', () => {
    expect(
      planEditMenu(FIELD, { canRead: false, canWrite: true }).map((item) => item.enabled),
    ).toEqual([true, true, false, true]);
    expect(
      planEditMenu(FIELD, { canRead: true, canWrite: false }).map((item) => item.enabled),
    ).toEqual([false, false, true, true]);
  });
});

interface FakeClipboard extends ClipboardAdapter {
  text: string;
  writes: string[];
  reads: number;
}

function fakeClipboard(overrides: Partial<ClipboardAdapter> = {}, text = 'PANO'): FakeClipboard {
  const clip: FakeClipboard = {
    canRead: true,
    canWrite: true,
    text,
    writes: [],
    reads: 0,
    readText(): Promise<ClipboardReadResult> {
      clip.reads += 1;
      return Promise.resolve({ ok: true, text: clip.text });
    },
    writeText(value: string): Promise<ClipboardWriteResult> {
      clip.writes.push(value);
      clip.text = value;
      return Promise.resolve({ ok: true });
    },
    ...overrides,
  };
  return clip;
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const items = (): HTMLButtonElement[] =>
  Array.from(
    document.querySelectorAll<HTMLButtonElement>('.vol-edit-menu .vol-context-menu__item'),
  );
const menus = (): number => document.querySelectorAll('.vol-edit-menu').length;
const ITEM = { cut: 0, copy: 1, paste: 2, selectAll: 3 } as const;

function mount<T extends HTMLInputElement | HTMLTextAreaElement>(
  field: T,
  value: string,
  selection: [number, number] = [0, 0],
): T {
  document.body.appendChild(field);
  field.value = value;
  field.focus();
  field.setSelectionRange(selection[0], selection[1]);
  return field;
}

function contextMenuAt(target: Element, x = 5, y = 5): MouseEvent {
  const event = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
  });
  target.dispatchEvent(event);
  return event;
}

let dispose: (() => void) | null = null;
function install(clip: ClipboardAdapter, onResult?: (result: EditMenuResult) => void): void {
  dispose = installEditMenu(document, { clipboard: clip, onResult });
}

afterEach(async () => {
  dispose?.();
  dispose = null;
  await flush();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('installEditMenu: açılış', () => {
  it('metin alanında sağ tık yerel menüyü susturur ve dört öğeli menü açar (TR etiketler)', () => {
    install(fakeClipboard());
    const input = mount(document.createElement('input'), 'merhaba', [0, 3]);
    const event = contextMenuAt(input);
    expect(event.defaultPrevented).toBe(true);
    expect(menus()).toBe(1);
    expect(items().map((item) => item.textContent)).toEqual([
      i18next.t('core:editMenu.cut'),
      i18next.t('core:editMenu.copy'),
      i18next.t('core:editMenu.paste'),
      i18next.t('core:editMenu.selectAll'),
    ]);
    expect(document.querySelector('.vol-edit-menu')?.getAttribute('role')).toBe('menu');
    expect(document.querySelector('.vol-edit-menu')?.getAttribute('aria-label')).toBe(
      i18next.t('core:editMenu.label'),
    );
  });

  it('metin alanı olmayan hedefte ve seçilemeyen türlerde menü açmaz, olaya dokunmaz', () => {
    install(fakeClipboard());
    const box = document.createElement('div');
    const number = document.createElement('input');
    number.type = 'number';
    document.body.append(box, number);
    expect(contextMenuAt(box).defaultPrevented).toBe(false);
    expect(contextMenuAt(number).defaultPrevented).toBe(false);
    expect(menus()).toBe(0);
  });

  it('devre dışı alanda menü açılmaz', () => {
    install(fakeClipboard());
    const input = document.createElement('input');
    input.disabled = true;
    document.body.appendChild(input);
    contextMenuAt(input);
    expect(menus()).toBe(0);
  });

  it('dokunma kaynaklı bağlam olayına dokunulmaz (yerel seçim çubuğu kalır)', () => {
    install(fakeClipboard());
    const input = mount(document.createElement('input'), 'abc');
    const down = new MouseEvent('pointerdown', { bubbles: true });
    Object.defineProperty(down, 'pointerType', { value: 'touch' });
    input.dispatchEvent(down);
    expect(contextMenuAt(input).defaultPrevented).toBe(false);
    expect(menus()).toBe(0);

    const mouseDown = new MouseEvent('pointerdown', { bubbles: true });
    Object.defineProperty(mouseDown, 'pointerType', { value: 'mouse' });
    input.dispatchEvent(mouseDown);
    contextMenuAt(input);
    expect(menus()).toBe(1);
  });

  it('işaretçi alan içindeyse oraya, klavyeden (0,0) gelirse alanın alt-sol köşesine açılır', async () => {
    install(fakeClipboard());
    const input = mount(document.createElement('input'), 'abc');
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      right: 210,
      top: 20,
      bottom: 50,
      width: 200,
      height: 30,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    });
    contextMenuAt(input, 60, 30);
    const anchor = document.querySelector<HTMLElement>('.vol-edit-menu-anchor');
    expect([anchor?.style.left, anchor?.style.top]).toEqual(['60px', '30px']);

    dispose?.();
    await flush();
    install(fakeClipboard());
    contextMenuAt(input, 0, 0);
    const keyboardAnchor = document.querySelector<HTMLElement>('.vol-edit-menu-anchor');
    expect([keyboardAnchor?.style.left, keyboardAnchor?.style.top]).toEqual(['10px', '50px']);
  });

  it('yeni açılış öncekini kapatır; aynı anda tek menü vardır', async () => {
    install(fakeClipboard());
    const first = mount(document.createElement('input'), 'a');
    const second = mount(document.createElement('textarea'), 'b');
    contextMenuAt(first);
    contextMenuAt(second);
    await flush();
    expect(menus()).toBe(1);
    expect(document.querySelectorAll('.vol-edit-menu-anchor')).toHaveLength(1);
  });
});

describe('installEditMenu: eylemler', () => {
  it('Kopyala seçili aralığı panoya yazar, alanı değiştirmez ve menü temizlenir', async () => {
    const clip = fakeClipboard();
    const results: EditMenuResult[] = [];
    install(clip, (result) => results.push(result));
    const input = mount(document.createElement('input'), 'merhaba dünya', [0, 7]);
    contextMenuAt(input);
    items()[ITEM.copy].click();
    await flush();
    expect(clip.writes).toEqual(['merhaba']);
    expect(input.value).toBe('merhaba dünya');
    expect(results).toEqual([{ action: 'copy', ok: true }]);
    expect(menus()).toBe(0);
    expect(document.querySelector('.vol-edit-menu-anchor')).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('Kes panoya yazar, seçimi siler ve `input` olayı yayar', async () => {
    const clip = fakeClipboard();
    install(clip);
    const input = mount(document.createElement('input'), 'merhaba dünya', [0, 8]);
    const seen: Array<[string, string | null]> = [];
    input.addEventListener('input', (event) => seen.push([event.inputType, event.data]));
    contextMenuAt(input);
    items()[ITEM.cut].click();
    await flush();
    expect(clip.writes).toEqual(['merhaba ']);
    expect(input.value).toBe('dünya');
    expect(input.selectionStart).toBe(0);
    expect(seen).toEqual([['deleteByCut', null]]);
  });

  it('Kes: pano yazması başarısızsa metin SİLİNMEZ', async () => {
    const clip = fakeClipboard({
      writeText: () => Promise.resolve({ ok: false, reason: 'denied' }),
    });
    const results: EditMenuResult[] = [];
    install(clip, (result) => results.push(result));
    const input = mount(document.createElement('input'), 'merhaba', [0, 3]);
    contextMenuAt(input);
    items()[ITEM.cut].click();
    await flush();
    expect(input.value).toBe('merhaba');
    expect(results).toEqual([{ action: 'cut', ok: false, reason: 'denied' }]);
  });

  it('Yapıştır seçimi değiştirir, imleci sona koyar ve `input` olayı yayar', async () => {
    const clip = fakeClipboard({}, 'XY');
    install(clip);
    const input = mount(document.createElement('input'), 'abcdef', [1, 3]);
    const types: string[] = [];
    input.addEventListener('input', (event) => types.push(event.inputType));
    contextMenuAt(input);
    items()[ITEM.paste].click();
    await flush();
    expect(input.value).toBe('aXYdef');
    expect(input.selectionStart).toBe(3);
    expect(input.selectionEnd).toBe(3);
    expect(types).toEqual(['insertFromPaste']);
  });

  it('Yapıştır tek satırlı alanda satır sonlarını boşluğa çevirir, çok satırlıda korur', async () => {
    const clip = fakeClipboard({}, 'a\nb\r\nc');
    install(clip);
    const input = mount(document.createElement('input'), '');
    contextMenuAt(input);
    items()[ITEM.paste].click();
    await flush();
    expect(input.value).toBe('a b c');

    const area = mount(document.createElement('textarea'), '');
    contextMenuAt(area);
    await flush();
    items()[ITEM.paste].click();
    await flush();
    // Tarayıcı metin alanı değerinde satır sonunu \n'e normalleştirir.
    expect(area.value).toBe('a\nb\nc');
  });

  it('Yapıştır `maxLength`i aşmaz ve vekil çiftin yarısını bırakmaz', async () => {
    const clip = fakeClipboard({}, 'ab😀cd');
    install(clip);
    const input = document.createElement('input');
    input.maxLength = 3;
    mount(input, '');
    contextMenuAt(input);
    items()[ITEM.paste].click();
    await flush();
    // 'ab' + 😀'in ilk yarısı sığmaz → yarım vekil atılır.
    expect(input.value).toBe('ab');

    const full = document.createElement('input');
    full.maxLength = 3;
    mount(full, 'abc', [3, 3]);
    contextMenuAt(full);
    await flush();
    items()[ITEM.paste].click();
    await flush();
    expect(full.value).toBe('abc');
  });

  it('Yapıştır yalnız menü öğesi tıklanınca panoyu okur', async () => {
    const clip = fakeClipboard();
    install(clip);
    const input = mount(document.createElement('input'), 'abc');
    contextMenuAt(input);
    await flush();
    expect(clip.reads).toBe(0);
    items()[ITEM.paste].click();
    await flush();
    expect(clip.reads).toBe(1);
  });

  it('izin reddi akışı bozmaz: alan değişmez, menü kapanır, sonuç bildirilir', async () => {
    const clip = fakeClipboard({
      readText: () => Promise.resolve({ ok: false, reason: 'denied' }),
    });
    const results: EditMenuResult[] = [];
    install(clip, (result) => results.push(result));
    const input = mount(document.createElement('input'), 'abc', [1, 1]);
    contextMenuAt(input);
    items()[ITEM.paste].click();
    await flush();
    expect(input.value).toBe('abc');
    expect(results).toEqual([{ action: 'paste', ok: false, reason: 'denied' }]);
    expect(menus()).toBe(0);
    expect(document.activeElement).toBe(input);
  });

  it('yetenek yoksa Kes/Kopyala/Yapıştır kapalıdır ve tıklama hiçbir şey yapmaz', async () => {
    const clip = fakeClipboard({ canRead: false, canWrite: false });
    install(clip);
    const input = mount(document.createElement('input'), 'abc', [0, 2]);
    contextMenuAt(input);
    expect(items().map((item) => item.disabled)).toEqual([true, true, true, false]);
    items()[ITEM.paste].click();
    await flush();
    expect(clip.reads + clip.writes.length).toBe(0);
    expect(input.value).toBe('abc');
  });

  it('Tümünü Seç alanı odaklayıp tüm metni seçer', async () => {
    install(fakeClipboard());
    const input = mount(document.createElement('input'), 'merhaba', [2, 2]);
    contextMenuAt(input);
    items()[ITEM.selectAll].click();
    await flush();
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 7]);
    expect(document.activeElement).toBe(input);
  });

  it('salt okunur alan: yalnız Kopyala ve Tümünü Seç; Kopyala çalışır, alan değişmez', async () => {
    const clip = fakeClipboard();
    install(clip);
    const input = document.createElement('input');
    input.readOnly = true;
    mount(input, 'sabit', [0, 3]);
    contextMenuAt(input);
    expect(items()).toHaveLength(2);
    items()[0].click();
    await flush();
    expect(clip.writes).toEqual(['sab']);
    expect(input.value).toBe('sabit');
  });

  it('parola alanı: Kes/Kopyala kapalı, panoya parola çıkmaz', async () => {
    const clip = fakeClipboard();
    install(clip);
    const input = document.createElement('input');
    input.type = 'password';
    mount(input, 'sifre123', [0, 8]);
    contextMenuAt(input);
    expect(items().map((item) => item.disabled)).toEqual([true, true, false, false]);
    items()[ITEM.cut].click();
    items()[ITEM.copy].click();
    await flush();
    expect(clip.writes).toEqual([]);
    expect(input.value).toBe('sifre123');
  });

  it('eski sonuç: menü açıldıktan sonra değer değişirse yapıştırma uygulanmaz', async () => {
    let release: (value: ClipboardReadResult) => void = () => undefined;
    const clip = fakeClipboard({
      readText: () => new Promise<ClipboardReadResult>((resolve) => (release = resolve)),
    });
    const results: EditMenuResult[] = [];
    install(clip, (result) => results.push(result));
    const input = mount(document.createElement('input'), 'abc', [1, 1]);
    contextMenuAt(input);
    items()[ITEM.paste].click();
    await flush();
    input.value = 'tamamen başka';
    release({ ok: true, text: 'X' });
    await flush();
    expect(input.value).toBe('tamamen başka');
    expect(results).toEqual([{ action: 'paste', ok: false, reason: 'stale' }]);
  });

  it('eski sonuç: Kes sürerken alan değişirse eski aralık SİLİNMEZ', async () => {
    let release: (value: ClipboardWriteResult) => void = () => undefined;
    const clip = fakeClipboard({
      writeText: () => new Promise<ClipboardWriteResult>((resolve) => (release = resolve)),
    });
    const results: EditMenuResult[] = [];
    install(clip, (result) => results.push(result));
    const input = mount(document.createElement('input'), 'merhaba', [0, 3]);
    contextMenuAt(input);
    items()[ITEM.cut].click();
    await flush();
    input.value = 'başka metin';
    release({ ok: true });
    await flush();
    expect(input.value).toBe('başka metin');
    expect(results).toEqual([{ action: 'cut', ok: false, reason: 'stale' }]);
  });

  it('eski sonuç: alan sökülmüşse hiçbir şey yazılmaz', async () => {
    let release: (value: ClipboardReadResult) => void = () => undefined;
    const clip = fakeClipboard({
      readText: () => new Promise<ClipboardReadResult>((resolve) => (release = resolve)),
    });
    const results: EditMenuResult[] = [];
    install(clip, (result) => results.push(result));
    const input = mount(document.createElement('input'), 'abc');
    contextMenuAt(input);
    items()[ITEM.paste].click();
    await flush();
    input.remove();
    release({ ok: true, text: 'X' });
    await flush();
    expect(input.value).toBe('abc');
    expect(results).toEqual([{ action: 'paste', ok: false, reason: 'stale' }]);
  });
});

describe('installEditMenu: kapanış ve yaşam döngüsü', () => {
  it('Escape menüyü kapatır, odak alana döner, çapa ve menü kalmaz', async () => {
    install(fakeClipboard());
    const input = mount(document.createElement('input'), 'abc', [0, 2]);
    contextMenuAt(input);
    const first = items().find((item) => !item.disabled);
    expect(document.activeElement).toBe(first);
    first?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flush();
    expect(menus()).toBe(0);
    expect(document.querySelector('.vol-edit-menu-anchor')).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('başka bir yere tıklayınca menü kapanır ve odak o yerde kalır', async () => {
    install(fakeClipboard());
    const input = mount(document.createElement('input'), 'abc');
    const other = document.createElement('input');
    document.body.appendChild(other);
    contextMenuAt(input);
    await flush();
    other.focus();
    document.body.click();
    await flush();
    expect(menus()).toBe(0);
    expect(document.activeElement).toBe(other);
  });

  it('kaldırıcı dinleyicileri bırakır ve açık menüyü kapatır', async () => {
    install(fakeClipboard());
    const input = mount(document.createElement('input'), 'abc');
    contextMenuAt(input);
    expect(menus()).toBe(1);
    dispose?.();
    dispose = null;
    await flush();
    expect(menus()).toBe(0);
    expect(contextMenuAt(input).defaultPrevented).toBe(false);
  });

  it('pano içeriği konsola yazılmaz', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => undefined),
    );
    install(fakeClipboard({}, 'GİZLİ-7731'));
    const input = mount(document.createElement('input'), 'abc', [0, 2]);
    contextMenuAt(input);
    items()[ITEM.paste].click();
    await flush();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
