import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Modal } from '../../../src/ui/overlays/Modal';

/**
 * Modal girişi: tek parçalı içerik bütün olarak, çok parçalı içerik (başlık, gövde, düğmeler) parça
 * parça sıralı girer. Sheet kendi geçişini kullanır.
 */
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runAllTimers();
  vi.useRealTimers();
  document.body.replaceChildren();
});

const part = (): { element: HTMLElement } => ({ element: document.createElement('div') });

describe('Modal girişi', () => {
  it('çok parçalı içerik 40 ms basamakla sıralı girer; içerik kabı kendisi oynamaz', () => {
    const modal = new Modal();
    const parts = [part(), part(), part()];
    for (const item of parts) modal.add(item);
    document.body.append(modal.element);
    modal.open();
    const content = modal.element.querySelector<HTMLElement>('.vol-modal__content')!;
    expect(content.classList.contains('vol-juice--enter')).toBe(false);
    expect(parts.map((item) => item.element.style.animationDelay)).toEqual(['', '40ms', '80ms']);
    expect(parts.every((item) => item.element.classList.contains('vol-juice--enter'))).toBe(true);
    vi.runAllTimers();
    expect(parts.some((item) => item.element.classList.contains('vol-juice--enter'))).toBe(false);
    modal.destroy();
  });

  it('tek parçalı içerik kabıyla birlikte girer', () => {
    const modal = new Modal();
    modal.add(part());
    document.body.append(modal.element);
    modal.open();
    const content = modal.element.querySelector<HTMLElement>('.vol-modal__content')!;
    expect(content.classList.contains('vol-juice--enter')).toBe(true);
    modal.destroy();
  });
});
