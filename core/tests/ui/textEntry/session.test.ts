import { afterEach, describe, expect, it, vi } from 'vitest';
import { Input } from '../../../src/ui/primitives/Input';
import { TextArea } from '../../../src/ui/primitives/TextArea';
import { triggerBack } from '../../../src/platform/backNavigation';
import {
  registerTextEntryModeProbe,
  setTextEntryModeProbe,
  setTextEntryProvider,
  type TextEntryResult,
} from '../../../src/ui/textEntry/textEntry';

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

afterEach(() => {
  setTextEntryProvider(null);
  setTextEntryModeProbe(null);
  document.body.replaceChildren();
});

describe.each([
  { name: 'Input', Field: Input },
  { name: 'TextArea', Field: TextArea },
])('$name metin oturumu', ({ Field }) => {
  it('başka düğmeye gerçek odak geçişi eski cevabı ve odak çalmayı iptal eder', async () => {
    let complete!: (result: TextEntryResult) => void;
    let signal: AbortSignal | undefined;
    setTextEntryModeProbe(() => true);
    setTextEntryProvider({
      open: (_request, ownerSignal) => {
        signal = ownerSignal;
        return new Promise((resolve) => {
          complete = resolve;
        });
      },
    });
    const onCommit = vi.fn();
    const field = new Field({ value: 'ilk', onCommit });
    const button = document.createElement('button');
    document.body.append(field.element, button);
    field.focus();
    button.focus();
    complete({ value: 'geç', canceled: false });
    await flush();
    expect(signal?.aborted).toBe(true);
    expect(field.getValue()).toBe('ilk');
    expect(onCommit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
    field.destroy();
  });
  it.each([
    'destroy',
    'disable',
    'replace',
    'notify',
    'blur',
    'provider',
    'session',
    'owner',
  ] as const)('%s eski cevabı ve bildirimleri iptal eder', async (action) => {
    const pending: Array<(result: TextEntryResult) => void> = [];
    const signals: Array<AbortSignal | undefined> = [];
    setTextEntryModeProbe(() => true);
    setTextEntryProvider({
      open: (_request, signal?: AbortSignal) => {
        signals.push(signal);
        return new Promise((resolve) => pending.push(resolve));
      },
    });
    const onInput = vi.fn();
    const onCommit = vi.fn();
    const field = new Field({ value: 'ilk', onInput, onCommit });
    document.body.append(field.element);
    field.focus();
    const native =
      field.element instanceof HTMLInputElement
        ? field.element
        : field.element.querySelector('textarea')!;
    if (action === 'destroy') {
      field.destroy();
      document.body.append(field.element);
    }
    if (action === 'disable') {
      field.setDisabled(true);
      field.setDisabled(false);
    }
    if (action === 'replace') field.setValue('yeni');
    if (action === 'notify') field.setValueAndNotify('yeni');
    if (action === 'blur') native.dispatchEvent(new FocusEvent('blur'));
    if (action === 'provider')
      setTextEntryProvider({ open: () => Promise.resolve({ value: 'ikinci', canceled: false }) });
    if (action === 'session') {
      const next = new Input();
      document.body.append(next.element);
      next.focus();
    }
    const releaseOwner = action === 'owner' ? registerTextEntryModeProbe(() => true) : undefined;
    onInput.mockClear();
    onCommit.mockClear();
    pending[0]({ value: 'geç', canceled: false });
    await flush();
    expect(field.getValue()).toBe(action === 'replace' || action === 'notify' ? 'yeni' : 'ilk');
    expect(onInput).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
    expect(signals[0]?.aborted).toBe(true);
    expect(document.activeElement).not.toBe(native);
    field.destroy();
    releaseOwner?.();
  });

  it('güncel cevap değeri ve bildirimleri tamamlar', async () => {
    let resolve!: (result: TextEntryResult) => void;
    setTextEntryModeProbe(() => true);
    setTextEntryProvider({
      open: () =>
        new Promise((done) => {
          resolve = done;
        }),
    });
    const onInput = vi.fn();
    const onCommit = vi.fn();
    const field = new Field({ value: 'ilk', onInput, onCommit });
    document.body.append(field.element);
    field.focus();
    resolve({ value: 'son', canceled: false });
    await flush();
    expect(field.getValue()).toBe('son');
    expect(onInput).toHaveBeenCalledExactlyOnceWith('son');
    expect(onCommit).toHaveBeenCalledExactlyOnceWith('son');
    field.destroy();
  });

  it('doğrudan değiştirilen DOM değeri eski cevaba odak da vermez', async () => {
    let resolve!: (result: TextEntryResult) => void;
    setTextEntryModeProbe(() => true);
    setTextEntryProvider({
      open: () =>
        new Promise((done) => {
          resolve = done;
        }),
    });
    const field = new Field({ value: 'ilk' });
    document.body.append(field.element);
    field.focus();
    const native =
      field.element instanceof HTMLInputElement
        ? field.element
        : field.element.querySelector('textarea')!;
    native.value = 'dış';
    resolve({ value: 'geç', canceled: false });
    await flush();
    expect(field.getValue()).toBe('dış');
    expect(document.activeElement).not.toBe(native);
    field.destroy();
  });

  it('eski sağlayıcı reddi yeni oturumu ve iptal kaynaklarını korur', async () => {
    const pending: Array<{
      resolve: (result: TextEntryResult) => void;
      reject: (error: unknown) => void;
      signal?: AbortSignal;
    }> = [];
    setTextEntryModeProbe(() => true);
    setTextEntryProvider({
      open: (_request, signal?: AbortSignal) =>
        new Promise((resolve, reject) => {
          pending.push({ resolve, reject, signal });
        }),
    });
    const field = new Field({ value: 'ilk' });
    document.body.append(field.element);
    const native =
      field.element instanceof HTMLInputElement
        ? field.element
        : field.element.querySelector('textarea')!;
    field.focus();
    field.focus();
    expect(pending[0].signal?.aborted).toBe(true);
    pending[0].reject(new Error('geç ret'));
    await flush();
    expect(pending[1].signal?.aborted).toBe(false);
    pending[1].resolve({ value: 'son', canceled: false });
    await flush();
    expect(field.getValue()).toBe('son');
    native.dispatchEvent(new FocusEvent('blur'));
    expect(pending[1].signal?.aborted).toBe(false);
    field.destroy();
  });

  it('yerel klavye yok edilen sahibin modal ve geri kaynağını bırakır', async () => {
    setTextEntryModeProbe(() => true);
    const field = new Field({ value: 'ilk' });
    document.body.append(field.element);
    field.focus();
    expect(document.querySelector('.vol-osk')).not.toBeNull();
    field.destroy();
    await flush();
    expect(document.querySelector('.vol-osk')).toBeNull();
    expect(triggerBack()).toBe(false);
  });

  it('güncel sağlayıcı reddi değeri değiştirmeden odağı geri verir', async () => {
    setTextEntryModeProbe(() => true);
    setTextEntryProvider({
      open: () => Promise.reject(new Error('sağlayıcı')),
    });
    const onCommit = vi.fn();
    const field = new Field({ value: 'ilk', onCommit });
    document.body.append(field.element);
    field.focus();
    await flush();
    const native =
      field.element instanceof HTMLInputElement
        ? field.element
        : field.element.querySelector('textarea')!;
    expect(field.getValue()).toBe('ilk');
    expect(onCommit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(native);
    field.destroy();
  });
});
