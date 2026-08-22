import { afterEach, describe, expect, it, vi } from 'vitest';
import { IntentPanel } from '../../src/ui/IntentPanel';

afterEach(() => {
  vi.useRealTimers();
});

describe('tek ekran niyet akışı', () => {
  it('yedi tıklanabilir tarifi gösterir ve ayrı oluştur düğümü taşımaz', () => {
    const panel = new IntentPanel(() => ({ kind: 'empty' }));
    expect(panel.element.querySelector('textarea')).not.toBeNull();
    expect(panel.element.querySelectorAll('.vf-intent__card')).toHaveLength(7);
    expect(panel.element.querySelector('.vol-button--primary')).toBeNull();
    panel.destroy();
  });

  it('yazı durduğunda tarifi canlı uygular', () => {
    vi.useFakeTimers();
    const apply = vi.fn(() => ({ kind: 'object', object: 'worm' }) as const);
    const panel = new IntentPanel(apply);
    const prompt = panel.element.querySelector<HTMLTextAreaElement>('textarea')!;
    prompt.value = 'solucan';
    prompt.dispatchEvent(new Event('input', { bubbles: true }));

    expect(apply).not.toHaveBeenCalled();
    expect(panel.element.textContent).toContain('çözümleniyor');
    vi.advanceTimersByTime(320);
    expect(apply).toHaveBeenCalledWith({ prompt: 'solucan' });
    expect(panel.element.textContent).toContain('Solucan');
    panel.destroy();
  });

  it('katalog kartını ikinci onay beklemeden ve prompt ile birlikte uygular', () => {
    const apply = vi.fn(() => ({ kind: 'preset', preset: 'terrainCells' }) as const);
    const panel = new IntentPanel(apply);
    const prompt = panel.element.querySelector<HTMLTextAreaElement>('textarea')!;
    prompt.value = 'mor 256';
    panel.element.querySelector<HTMLButtonElement>('[data-preset="terrainCells"]')!.click();

    expect(apply).toHaveBeenCalledWith({ preset: 'terrainCells', prompt: 'mor 256' });
    expect(
      panel.element.querySelector('[data-preset="terrainCells"]')?.getAttribute('aria-pressed'),
    ).toBe('true');
    panel.destroy();
  });

  it('bilinmeyen niyeti başarı gibi göstermeden açıkça bildirir', () => {
    vi.useFakeTimers();
    const panel = new IntentPanel(() => ({ kind: 'unknown' }));
    const prompt = panel.element.querySelector<HTMLTextAreaElement>('textarea')!;
    prompt.value = 'xyzzy';
    prompt.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(320);

    const status = panel.element.querySelector<HTMLElement>('.vf-intent__status')!;
    expect(status.dataset.tone).toBe('warning');
    expect(status.textContent).toContain('değiştirilmedi');
    panel.destroy();
  });

  it('Ctrl+Enter bekleyen canlı zamanlayıcıyı iptal edip hemen uygular', () => {
    vi.useFakeTimers();
    const apply = vi.fn(() => ({ kind: 'modifiers' }) as const);
    const panel = new IntentPanel(apply);
    const prompt = panel.element.querySelector<HTMLTextAreaElement>('textarea')!;
    prompt.value = 'mor';
    prompt.dispatchEvent(new Event('input', { bubbles: true }));
    prompt.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }),
    );
    vi.runAllTimers();
    expect(apply).toHaveBeenCalledTimes(1);
    panel.destroy();
  });
});
