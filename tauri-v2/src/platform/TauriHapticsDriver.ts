import type { HapticPattern, HapticsDriver } from '@volstudio/core';
import {
  impactFeedback,
  notificationFeedback,
  selectionFeedback,
} from '@tauri-apps/plugin-haptics';

export class TauriHapticsDriver implements HapticsDriver {
  async play(pattern: HapticPattern): Promise<void> {
    switch (pattern) {
      case 'tap':
        await impactFeedback('light');
        return;
      case 'select':
        await selectionFeedback();
        return;
      case 'success':
      case 'warning':
      case 'error':
        await notificationFeedback(pattern);
    }
  }
}
