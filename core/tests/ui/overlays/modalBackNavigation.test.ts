import { afterEach, describe, expect, it } from 'vitest';
import { FocusNavController } from '../../../src/ui/focus/FocusNavController';
import { Modal } from '../../../src/ui/overlays/Modal';

const modals: Modal[] = [];
let nav: FocusNavController | undefined;

function modal(): { modal: Modal; button: HTMLButtonElement } {
  const modal = new Modal();
  const button = document.createElement('button');
  modal.add({ element: button });
  document.body.append(modal.element);
  modals.push(modal);
  return { modal, button };
}

afterEach(() => {
  nav?.destroy();
  nav = undefined;
  for (const modal of modals.splice(0).reverse()) modal.destroy();
});

describe('Modal ve CORE geri gezinmesi', () => {
  it('FocusNav Escape ile üst katmanı kapatınca alttaki modal aynı olayı yeniden işlemez', () => {
    nav = new FocusNavController();
    nav.start();
    const lower = modal();
    const upper = modal();
    lower.modal.open();
    upper.modal.open();
    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    upper.button.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(upper.modal.isOpen()).toBe(false);
    expect(lower.modal.isOpen()).toBe(true);
    expect(document.activeElement).toBe(lower.button);
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }));
    lower.button.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(lower.modal.isOpen()).toBe(false);
  });

  it('düzenleme alanının tükettiği Escape modalı kapatmaz', () => {
    const { modal: dialog } = modal();
    const input = document.createElement('input');
    dialog.add({ element: input });
    dialog.open();
    input.addEventListener('keydown', (event) => event.preventDefault());
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(dialog.isOpen()).toBe(true);
  });
});
