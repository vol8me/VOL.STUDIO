import { afterEach, describe, expect, it, vi } from 'vitest';
import { Wizard, type WizardStep } from '../../../src/ui/layout/Wizard';

const mounted: Wizard[] = [];

function step(id: string, validate?: WizardStep['validate']): WizardStep {
  return {
    id,
    title: `Başlık ${id}`,
    content: { element: document.createElement('div') },
    validate,
  };
}

function make(steps: WizardStep[]): Wizard {
  const wizard = new Wizard({ steps });
  document.body.appendChild(wizard.element);
  mounted.push(wizard);
  return wizard;
}

const nav = (w: Wizard, kind: 'back' | 'next') =>
  w.element.querySelector<HTMLButtonElement>(`.vol-wizard__nav-button--${kind}`)!;

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.destroy();
  vi.useRealTimers();
});

describe('Wizard erişilebilirlik', () => {
  it('geçerli adım aria-current="step" taşır ve adım değişince taşınır', () => {
    const wizard = make([step('a'), step('b')]);
    const indicators = [...wizard.element.querySelectorAll('.vol-wizard__indicator')];
    expect(indicators.map((i) => i.getAttribute('aria-current'))).toEqual(['step', null]);
    wizard.goToStep(1);
    expect(indicators.map((i) => i.getAttribute('aria-current'))).toEqual([null, 'step']);
  });

  it('adım değişimi okuyucuya duyulur; ilk açılış susar', () => {
    const wizard = make([step('a'), step('b')]);
    const status = wizard.element.querySelector('[role="status"]')!;
    expect(status.textContent).toBe('');
    wizard.goToStep(1);
    expect(status.textContent).toContain('2');
    expect(status.textContent).toContain('Başlık b');
  });

  it('ilk adıma dönünce odaktaki Geri düğmesi odağı kaybetmez', () => {
    const wizard = make([step('a'), step('b')]);
    wizard.goToStep(1);
    nav(wizard, 'back').focus();
    wizard.goToStep(0);
    expect(nav(wizard, 'back').disabled).toBe(true);
    expect(document.activeElement).toBe(nav(wizard, 'next'));
  });

  it('async doğrulama sırasında kilitlenen İleri düğmesi odağı geri alır', async () => {
    let resolve: (value: boolean) => void = () => undefined;
    const wizard = make([step('a', () => new Promise<boolean>((r) => (resolve = r))), step('b')]);
    const next = nav(wizard, 'next');
    next.focus();
    next.click();
    expect(next.disabled).toBe(true);
    // jsdom, devre dışı kalan odaklı öğede odağı gövdeye atar (tarayıcı gibi)
    (document.activeElement as HTMLElement | null)?.blur();
    resolve(true);
    await vi.waitFor(() => expect(wizard.getCurrentIndex()).toBe(1));
    expect(document.activeElement).toBe(next);
  });
});
