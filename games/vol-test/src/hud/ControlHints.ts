import { i18next } from '@volstudio/core/i18n';
import {
  Text,
  type ControlGlyphBinding,
  type InputPresentationController,
} from '@volstudio/core/ui';

type HintKey = 'move' | 'aim' | 'fire' | 'boost' | 'zoom' | 'grid' | 'pause';

/** Eylem → glif bağları; kola özgü olmayan klavye glifleri kol kipinde gizlenir. */
const HINTS: ReadonlyArray<readonly [HintKey, readonly Omit<ControlGlyphBinding, 'label'>[]]> = [
  [
    'move',
    [
      { padName: 'stickLeft', keyboardName: 'key', key: 'w' },
      { keyboardName: 'key', key: 'a' },
      { keyboardName: 'key', key: 's' },
      { keyboardName: 'key', key: 'd' },
    ],
  ],
  ['aim', [{ padName: 'stickRight', keyboardName: 'mouseMove' }]],
  ['fire', [{ padName: 'rightTrigger', keyboardName: 'mouseLeft' }]],
  ['boost', [{ padName: 'leftTrigger', keyboardName: 'key', key: 'shift' }]],
  [
    'zoom',
    [
      { padName: 'leftBumper', keyboardName: 'key', key: 'q' },
      { padName: 'rightBumper', keyboardName: 'key', key: 'e' },
      { keyboardName: 'mouseScroll' },
    ],
  ],
  ['grid', [{ padName: 'select', keyboardName: 'key', key: 'g' }]],
  ['pause', [{ padName: 'start', keyboardName: 'key', key: 'escape' }]],
];

/**
 * Kontrol ipuçları: CORE `Glyph` (girdi kipine göre canlı) ve CORE `Text`.
 * Bileşen yalnız satırları dizer; görünüm CORE'undur.
 */
export class ControlHints {
  readonly element: HTMLElement;
  private readonly labels = new Map<HintKey, Text>();

  constructor(presentation: InputPresentationController) {
    this.element = document.createElement('div');
    this.element.className = 'vt-hud__hints';
    this.element.dataset.testid = 'control-hints';
    for (const [key, bindings] of HINTS) {
      const row = document.createElement('div');
      row.className = 'vt-hud__hint';
      for (const binding of bindings) {
        row.append(presentation.createGlyph({ ...binding, label: binding.key ?? key }));
      }
      const label = new Text('', { variant: 'muted', tag: 'span' });
      this.labels.set(key, label);
      row.append(label.element);
      this.element.append(row);
    }
    this.refreshLabels();
  }

  refreshLabels(): void {
    for (const [key, label] of this.labels) label.setContent(i18next.t(`voltest:controls.${key}`));
  }

  setVisible(visible: boolean): void {
    this.element.hidden = !visible;
  }

  destroy(): void {
    for (const label of this.labels.values()) label.destroy();
    this.element.remove();
  }
}
