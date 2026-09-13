import { vibrate, type HapticPattern } from '../../platform/haptics';

export type HapticFeedback = HapticPattern | false;

export function playHapticFeedback(
  feedback: HapticFeedback | undefined,
  defaultPattern: HapticPattern,
): void {
  if (feedback !== false) vibrate(feedback ?? defaultPattern);
}
