import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { VirtualActionSource, i18n, i18next } from '@volstudio/core';
import { arenaConfig } from '@/config/arena';
import { arachnidUiConfig } from '@/config/ui';
import type { ArachnidAction } from '@/config/input';
import tr from '@/i18n/tr.json';
import en from '@/i18n/en.json';
import '@/i18next-augment';
import { ArachnidTouchControls } from '@/runtime/ui/ArachnidTouchControls';

describe('ArachnidTouchControls', () => {
  let parent: HTMLDivElement;
  let controls: ArachnidTouchControls | null;
  let actionSource: VirtualActionSource<ArachnidAction>;

  beforeAll(async () => {
    i18n.addResources('tr', 'arachnid', tr);
    i18n.addResources('en', 'arachnid', en);
    await i18n.init();
  });

  beforeEach(async () => {
    await i18next.changeLanguage('tr');
    parent = document.createElement('div');
    document.body.appendChild(parent);
    actionSource = new VirtualActionSource<ArachnidAction>();
    controls = new ArachnidTouchControls(parent, { actionSource });
  });

  afterEach(() => {
    controls?.destroy();
    controls = null;
    document.body.replaceChildren();
  });

  const dash = () => parent.querySelector<HTMLButtonElement>('.vol-arachnid-touch__dash');
  const press = (type: 'pointerdown' | 'pointerup') =>
    dash()?.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true }));

  it('sol bölgeye HİÇBİR eleman koymaz — hareket çubuğu Phaser tarafında doğar', () => {
    const root = parent.querySelector<HTMLElement>('.vol-arachnid-touch');

    expect(root).not.toBeNull();
    // Katmanda yalnız atılım düğmesi vardır.
    expect(root?.children).toHaveLength(1);
    expect(root?.firstElementChild).toBe(dash());
  });

  it('bölge ölçülerini ve HUD boşluklarını CSS değişkeni olarak yayımlar', () => {
    const root = parent.querySelector<HTMLElement>('.vol-arachnid-touch');

    expect(root?.style.getPropertyValue('--vol-arachnid-dash-zone')).toBe(
      `${arachnidUiConfig.touch.dashZoneWidthRatio * 100}%`,
    );
    // Üstteki tam ekran düğmesi ve alttaki telemetri dokunulabilir kalmalı.
    expect(root?.style.getPropertyValue('--vol-arachnid-touch-top')).toBe(
      `${arenaConfig.viewportGutterPx.top}px`,
    );
    expect(root?.style.getPropertyValue('--vol-arachnid-touch-bottom')).toBe(
      `${arenaConfig.viewportGutterPx.bottom}px`,
    );
  });

  it('basım eylem kaynağına yazılır, bırakma düşürür', () => {
    const actions = { dash: false };

    press('pointerdown');
    actionSource.applyTo(actions);
    expect(actions.dash).toBe(true);
    expect(dash()?.classList.contains('vol-touch-button--pressed')).toBe(true);

    press('pointerup');
    const after = { dash: false };
    actionSource.applyTo(after);
    expect(after.dash).toBe(false);
    expect(dash()?.classList.contains('vol-touch-button--pressed')).toBe(false);
  });

  it('erişilebilirlik adı dil değişimini izler', async () => {
    expect(dash()?.getAttribute('aria-label')).toBe('Atılma');

    await i18next.changeLanguage('en');
    expect(dash()?.getAttribute('aria-label')).toBe('Dash');
  });

  it('destroy katmanı toplar ve ikinci çağrıda güvenlidir', () => {
    controls?.destroy();
    controls?.destroy();

    expect(parent.querySelector('.vol-arachnid-touch')).toBeNull();
  });
});
