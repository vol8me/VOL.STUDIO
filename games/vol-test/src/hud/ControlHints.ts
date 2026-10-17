import { i18next } from '@volstudio/core/i18n';
import type { SkillId } from '@/config/skills';
import {
  Text,
  type ControlGlyphBinding,
  type InputPresentationController,
} from '@volstudio/core/ui';

type HintKey = 'move' | 'aim' | 'fire' | 'boost' | 'brake' | 'zoom' | 'grid' | 'pause';

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
  ['brake', [{ padName: 'faceRight', keyboardName: 'key', key: 'space' }]],
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
  private readonly rows = new Map<HintKey, HTMLElement>();
  private skill: SkillId | null = null;

  /** `live`: dünya sunucuda aktığı için son satır "Duraklat" değil "Menü" der. */
  constructor(
    presentation: InputPresentationController,
    private readonly live = false,
  ) {
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
      this.rows.set(key, row);
      row.append(label.element);
      this.element.append(row);
    }
    this.refreshLabels();
  }

  refreshLabels(): void {
    for (const [key, label] of this.labels) {
      const name =
        key === 'pause' && this.live
          ? 'menu'
          : key === 'brake' && this.skill
            ? (`skill.${this.skill}` as const)
            : key;
      label.setContent(i18next.t(`voltest:controls.${name}`));
    }
  }

  /** Tank dışında Shift hızlanması yoktur; Space fren değil aracın yeteneğidir (`null`: tank). */
  setSkill(skill: SkillId | null): void {
    if (skill === this.skill) return;
    this.skill = skill;
    const boost = this.rows.get('boost');
    if (boost) boost.hidden = skill !== null;
    this.refreshLabels();
  }

  /** Girdi kipine göre: dokunmatikte klavye/kol ipuçları hiç gösterilmez. */
  setVisible(visible: boolean): void {
    this.element.hidden = !visible;
  }

  /** Giriş süresi dolunca ipuçları solar (yer kaplamaz, okuyucuya da kapanır). */
  setFaded(faded: boolean): void {
    this.element.classList.toggle('vt-hud__hints--faded', faded);
  }

  get faded(): boolean {
    return this.element.classList.contains('vt-hud__hints--faded');
  }

  destroy(): void {
    for (const label of this.labels.values()) label.destroy();
    this.element.remove();
  }
}
