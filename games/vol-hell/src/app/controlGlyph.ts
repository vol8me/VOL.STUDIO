import {
  InputPresentationController,
  setTextEntryModeProbe,
  clearTextEntryModeProbe,
  type GlyphName,
} from '@volstudio/core';
import { getSessionKindValue } from '@/app/platform';

let presentation: InputPresentationController | null = null;

function controller(): InputPresentationController {
  return (presentation ??= new InputPresentationController({
    initialMode: getSessionKindValue() === 'gamescope' ? 'gamepad' : 'pc',
    context: () => ({ steamDeckSession: getSessionKindValue() === 'gamescope' }),
  }));
}

export function startControlGlyphs(): () => void {
  const current = controller();
  current.start();
  const probe = () => current.mode === 'gamepad';
  setTextEntryModeProbe(probe);
  return () => {
    clearTextEntryModeProbe(probe);
    current.destroy();
    if (presentation === current) presentation = null;
  };
}

export function controlGlyph(name: GlyphName, label: string): HTMLElement {
  const keys: Partial<Record<GlyphName, string>> = {
    faceDown: 'enter',
    faceRight: 'escape',
    start: 'escape',
    leftBumper: 'q',
    rightBumper: 'e',
  };
  return controller().createGlyph({
    padName: name,
    keyboardName: name === 'rightTrigger' ? 'mouseLeft' : keys[name] ? 'key' : undefined,
    key: keys[name],
    label,
  });
}
