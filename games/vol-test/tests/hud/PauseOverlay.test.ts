import { afterEach, describe, expect, it } from 'vitest';
import { FocusNavController } from '@volstudio/core/ui';
import { LocalStorageAdapter, ScopedSaveManager, triggerBack } from '@volstudio/core';
import { GameSettings } from '@/app/GameSettings';
import { PauseOverlay } from '@/hud/PauseOverlay';

let overlay: PauseOverlay | undefined;
let navigation: FocusNavController | undefined;
let settings: GameSettings | undefined;

afterEach(() => {
  overlay?.destroy();
  navigation?.destroy();
  settings?.dispose();
});

describe('PauseOverlay geri sahipliği', () => {
  it('ayarlar ve geliştiriciden geri yalnız alt ekranı kapatır; ikinci geri oyunu sürdürür', () => {
    settings = new GameSettings(
      new ScopedSaveManager({
        device: new LocalStorageAdapter(),
        synced: new LocalStorageAdapter(),
      }),
      navigator.userAgent,
    );
    let resumes = 0;
    overlay = new PauseOverlay(() => resumes++, settings);
    document.body.append(overlay.element);
    navigation = new FocusNavController();
    navigation.start();
    for (const view of ['settings', 'dev']) {
      overlay.open();
      const button = overlay.element.querySelector<HTMLButtonElement>(
        `[data-testid="pause-${view}"]`,
      )!;
      button.click();
      expect(overlay.element.querySelector<HTMLElement>(`[data-testid="${view}"]`)!.hidden).toBe(
        false,
      );
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      // Metin odağı düzenleme sahibidir; bu basış alt ekranın geri düğmesinden gelir.
      const back = overlay.element.querySelector<HTMLElement>(`[data-testid="${view}-back"]`)!;
      back.focus();
      back.dispatchEvent(event);
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }));
      expect(event.defaultPrevented).toBe(true);
      expect(overlay.isOpen).toBe(true);
      expect(overlay.element.querySelector<HTMLElement>(`[data-testid="${view}"]`)!.hidden).toBe(
        true,
      );
      expect(document.activeElement).toBe(button);
      expect(triggerBack()).toBe(true);
      expect(overlay.isOpen).toBe(false);
    }
    expect(resumes).toBe(2);
    overlay.destroy();
    expect(triggerBack()).toBe(false);
  });
});
