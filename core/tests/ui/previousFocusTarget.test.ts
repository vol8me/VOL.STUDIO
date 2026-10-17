import { afterEach, describe, expect, it } from 'vitest';
import { previousFocusTarget } from '../../src/ui/primitives/buttonBehavior';
import { Button } from '../../src/ui/primitives/Button';

/**
 * Katmanlar tetikleyiciyi `previousFocusTarget` ile öğrenir. Tıklama sırasında düğme `disabled` olup odak
 * gövdeye düşer (Chromium) ya da fare düğmeye hiç odak vermez ve odak en yakın odaklanabilir ataya düşer (WebKit).
 */
afterEach(() => {
  document.body.replaceChildren();
});

describe('previousFocusTarget', () => {
  it('odak gövdedeyken tıklanan düğmeyi verir', () => {
    let seen: Element | null = null;
    const button = new Button('Aç', { onClick: () => void (seen = previousFocusTarget()) });
    document.body.append(button.element);
    (document.activeElement as HTMLElement | null)?.blur();
    button.element.click();
    expect(seen).toBe(button.element);
  });

  it('odak düğmenin odaklanabilir atasındaysa (WebKit fare tıklaması) düğmeyi verir', () => {
    const panel = document.createElement('div');
    panel.tabIndex = 0;
    let seen: Element | null = null;
    const button = new Button('Aç', { onClick: () => void (seen = previousFocusTarget()) });
    panel.append(button.element);
    document.body.append(panel);
    panel.focus();
    button.element.click();
    expect(seen).toBe(button.element);
  });

  it('odak başka bir öğedeyse o öğeyi verir; tıklama dışında odağı olan öğe korunur', () => {
    const other = document.createElement('input');
    document.body.append(other);
    other.focus();
    expect(previousFocusTarget()).toBe(other);
  });
});
