import { Checkbox, NumberStepper, Select, Slider } from '@volstudio/core';
import { MAX_SIZE, MIN_SIZE, type SpriteDoc } from '@volstudio/core/visual';
import type { DocumentStore } from '../state/DocumentStore';
import { ChildScope, el, t } from './dom';

const OUTLINE_MODES = ['outside', 'inside', 'centered'];
const DITHER_KINDS = ['none', 'bayer2', 'bayer4', 'bayer8', 'blueNoise'];
const QUANTIZE_MODES = ['ramp', 'nearest'];

/**
 * Belge ayarları — boyut, tohum, döşeme, gölgeleme ve son işlem.
 *
 * Bunlar katman değil BELGE alanlarıdır; ağaç düzenleyicisinden ayrı
 * durmaları, "hangi ayar neyi etkiliyor" sorusunu arayüzde de ayırır.
 */
export class DocumentPanel {
  readonly element: HTMLDivElement;
  private readonly scope = new ChildScope();

  constructor(private readonly store: DocumentStore) {
    this.element = el('div', 'vf-document');
  }

  render(): void {
    this.scope.clear();
    this.element.textContent = '';
    const doc = this.store.get();

    this.element.appendChild(
      this.number(t('document.width'), doc.size[0], MIN_SIZE, MAX_SIZE, (value) =>
        this.patch({ size: [value, doc.size[1]] }),
      ),
    );
    this.element.appendChild(
      this.number(t('document.height'), doc.size[1], MIN_SIZE, MAX_SIZE, (value) =>
        this.patch({ size: [doc.size[0], value] }),
      ),
    );
    this.element.appendChild(
      this.number(t('document.seed'), doc.seed, -2147483648, 2147483647, (value) =>
        this.patch({ seed: value }),
      ),
    );
    this.element.appendChild(
      this.toggle(t('document.tileable'), doc.tileable === true, (value) =>
        this.patch({ tileable: value }),
      ),
    );
    this.element.appendChild(
      this.toggle(t('document.antialias'), doc.antialias === true, (value) =>
        this.patch({ antialias: value }),
      ),
    );

    this.element.appendChild(
      this.toggle(t('document.shadeEnabled'), doc.shade !== undefined, (value) =>
        this.patch({
          shade: value
            ? { light: [-0.55, -0.7, 0.45], strength: 0.6, ambient: 0.35, rim: 0.15, relief: 1 }
            : undefined,
        }),
      ),
    );

    if (doc.shade) {
      const shade = doc.shade;
      for (const [key, label, max] of [
        ['strength', t('document.strength'), 2],
        ['ambient', t('document.ambient'), 1],
        ['rim', t('document.rim'), 1],
        ['relief', t('document.relief'), 4],
      ] as const) {
        this.element.appendChild(
          this.slider(label, Number(shade[key] ?? 0), 0, max, (value) =>
            this.patch({ shade: { ...shade, [key]: value } }, `shade.${key}`),
          ),
        );
      }
      this.element.appendChild(
        this.toggle('AO', shade.ao != null, (value) =>
          this.patch({
            shade: { ...shade, ao: value ? { radius: 0.05, strength: 0.4 } : null },
          }),
        ),
      );
      if (shade.ao) {
        const ao = shade.ao;
        this.element.appendChild(
          this.slider(t('document.aoRadius'), ao.radius, 0, 0.3, (value) =>
            this.patch({ shade: { ...shade, ao: { ...ao, radius: value } } }, 'shade.ao.radius'),
          ),
        );
        this.element.appendChild(
          this.slider(t('document.aoStrength'), ao.strength, 0, 2, (value) =>
            this.patch(
              { shade: { ...shade, ao: { ...ao, strength: value } } },
              'shade.ao.strength',
            ),
          ),
        );
      }
    }

    const post = doc.post ?? {};
    const outline = post.outline;
    this.element.appendChild(
      this.number(t('document.outlinePx'), outline?.px ?? 0, 0, 16, (value) =>
        this.patch({
          post: { ...post, outline: value > 0 ? { ...outline, px: value } : null },
        }),
      ),
    );
    if (outline && outline.px > 0) {
      this.element.appendChild(
        this.select(t('document.outlineMode'), OUTLINE_MODES, outline.mode ?? 'outside', (value) =>
          this.patch({
            post: { ...post, outline: { ...outline, mode: value as 'outside' } },
          }),
        ),
      );
      this.element.appendChild(
        this.number(t('document.outlineColor'), outline.colorIndex ?? 0, 0, 255, (value) =>
          this.patch({ post: { ...post, outline: { ...outline, colorIndex: value } } }),
        ),
      );
    }

    this.element.appendChild(
      this.select(t('document.ditherKind'), DITHER_KINDS, post.dither?.kind ?? 'none', (value) =>
        this.patch({
          post: { ...post, dither: value === 'none' ? null : { kind: value as 'bayer4' } },
        }),
      ),
    );
    if (post.dither && post.dither.kind !== 'none') {
      const dither = post.dither;
      this.element.appendChild(
        this.slider(t('document.ditherAmount'), dither.amount ?? 0.15, 0, 1, (value) =>
          this.patch({ post: { ...post, dither: { ...dither, amount: value } } }, 'dither.amount'),
        ),
      );
    }
    this.element.appendChild(
      this.select(t('document.quantize'), QUANTIZE_MODES, post.quantize?.mode ?? 'ramp', (value) =>
        this.patch({ post: { ...post, quantize: { mode: value as 'ramp' } } }),
      ),
    );
  }

  destroy(): void {
    this.scope.clear();
    this.element.remove();
  }

  private patch(partial: Partial<SpriteDoc>, coalesceKey?: string): void {
    this.store.update((doc) => ({ ...doc, ...partial }) as SpriteDoc, { coalesceKey });
  }

  private number(
    label: string,
    value: number,
    min: number,
    max: number,
    onChange: (value: number) => void,
  ): HTMLElement {
    const control = this.scope.add(new NumberStepper({ min, max, step: 1, value, onChange }));
    return field(label, control.element);
  }

  private slider(
    label: string,
    value: number,
    min: number,
    max: number,
    onChange: (value: number) => void,
  ): HTMLElement {
    const control = this.scope.add(
      new Slider({ min, max, step: 0.01, value, formatValue: (v) => v.toFixed(2), onChange }),
    );
    return field(label, control.element);
  }

  private toggle(label: string, checked: boolean, onChange: (value: boolean) => void): HTMLElement {
    const control = this.scope.add(new Checkbox({ checked, onChange }));
    return field(label, control.element);
  }

  private select(
    label: string,
    options: readonly string[],
    value: string,
    onChange: (value: string) => void,
  ): HTMLElement {
    const control = this.scope.add(
      new Select({
        options: options.map((option) => ({ value: option, label: option })),
        value,
        onChange,
      }),
    );
    return field(label, control.element);
  }
}

function field(label: string, control: HTMLElement): HTMLElement {
  const wrap = el('div', 'vf-field');
  wrap.appendChild(el('span', 'vf-field__label', label));
  wrap.appendChild(control);
  return wrap;
}
