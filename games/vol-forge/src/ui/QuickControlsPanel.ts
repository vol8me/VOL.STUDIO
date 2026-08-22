import { Button, ColorPicker, NumberStepper, SegmentedControl, Select } from '@volstudio/core';
import type { GenerateRampSpec, SpriteDoc } from '@volstudio/core/visual';
import type { DocumentStore } from '../state/DocumentStore';
import { ChildScope, el, t } from './dom';

const COMMON_SIZES = [64, 128, 256, 512, 1024, 2048] as const;
const MIN_SIZE = 8;
const MAX_SIZE = 2048;

/** Üretimde sürekli gereken, belge bağımsız küçük kontrol kümesi. */
export class QuickControlsPanel {
  readonly element: HTMLDivElement;
  private readonly scope = new ChildScope();

  constructor(
    private readonly store: DocumentStore,
    private readonly onVariation: () => void,
  ) {
    this.element = el('div', 'vf-quick');
  }

  render(): void {
    this.scope.clear();
    this.element.textContent = '';
    const doc = this.store.get();

    this.element.appendChild(el('h2', 'vf-panel-title', t('quick.title')));
    this.element.appendChild(el('div', 'vf-field-label', t('quick.size')));

    const isCommonSquare =
      doc.size[0] === doc.size[1] &&
      COMMON_SIZES.includes(doc.size[0] as (typeof COMMON_SIZES)[number]);
    const sizePreset = this.scope.add(
      new Select({
        options: [
          ...COMMON_SIZES.map((size) => ({ value: String(size), label: `${size} × ${size}` })),
          { value: 'custom', label: t('quick.customSize') },
        ],
        value: isCommonSquare ? String(doc.size[0]) : 'custom',
        onChange: (value) => {
          if (value === 'custom') return;
          const size = Number(value);
          this.store.update((current) => ({ ...current, size: [size, size] }), {
            source: 'quick',
          });
          this.render();
        },
      }),
    );
    sizePreset.element.classList.add('vf-quick__size-preset');
    sizePreset.element.setAttribute('aria-label', t('quick.size'));
    this.element.appendChild(sizePreset.element);

    const dimensions = el('div', 'vf-quick__dimensions');
    dimensions.appendChild(
      this.scope.add(
        new NumberStepper({
          label: t('quick.width'),
          min: MIN_SIZE,
          max: MAX_SIZE,
          value: doc.size[0],
          onChange: (width) =>
            this.store.update((current) => ({ ...current, size: [width, current.size[1]] }), {
              source: 'quick',
            }),
        }),
      ).element,
    );
    dimensions.appendChild(
      this.scope.add(
        new NumberStepper({
          label: t('quick.height'),
          min: MIN_SIZE,
          max: MAX_SIZE,
          value: doc.size[1],
          onChange: (height) =>
            this.store.update((current) => ({ ...current, size: [current.size[0], height] }), {
              source: 'quick',
            }),
        }),
      ).element,
    );
    this.element.appendChild(dimensions);

    this.element.appendChild(el('div', 'vf-field-label', t('quick.finish')));
    const finish = doc.antialias === true ? 'smooth' : 'pixel';
    const finishControl = this.scope.add(
      new SegmentedControl({
        options: [
          { value: 'pixel', label: t('quick.pixel') },
          { value: 'smooth', label: t('quick.smooth') },
        ],
        value: finish,
        onChange: (value) => this.setFinish(value === 'smooth'),
      }),
    );
    finishControl.element.setAttribute('aria-label', t('quick.finish'));
    this.element.appendChild(finishControl.element);

    const generate = doc.palette.generate;
    if (generate?.[0]) {
      this.element.appendChild(el('div', 'vf-field-label', t('quick.color')));
      const colorPicker = this.scope.add(
        new ColorPicker({
          value: generate[0].base,
          swatches: ['#a96878', '#8b67c6', '#477fa8', '#3f9a9a', '#64824d', '#b86b42'],
          onChange: (value) => this.setBaseColor(value),
        }),
      );
      colorPicker.element.setAttribute('aria-label', t('quick.color'));
      this.element.appendChild(colorPicker.element);
    }

    this.element.appendChild(el('div', 'vf-field-label', t('quick.seed')));
    this.element.appendChild(
      this.scope.add(
        new NumberStepper({
          min: -2_147_483_648,
          max: 2_147_483_647,
          value: doc.seed,
          onChange: (seed) =>
            this.store.update((current) => ({ ...current, seed: seed | 0 }), { source: 'quick' }),
        }),
      ).element,
    );

    const variation = this.scope.add(
      new Button(t('quick.variation'), {
        iconLeft: '↻',
        onClick: this.onVariation,
      }),
    );
    variation.element.classList.add('vf-quick__variation');
    this.element.appendChild(variation.element);
  }

  destroy(): void {
    this.scope.clear();
    this.element.remove();
  }

  private setFinish(smooth: boolean): void {
    this.store.update(
      (doc) => {
        const post = doc.post ?? {};
        return {
          ...doc,
          antialias: smooth,
          post: {
            ...post,
            dither: smooth ? null : post.dither ?? { kind: 'bayer4', amount: 0.08 },
            quantize: { mode: smooth ? 'nearest' : 'ramp' },
          },
        } as SpriteDoc;
      },
      { source: 'quick' },
    );
  }

  private setBaseColor(value: string): void {
    this.store.update(
      (doc) => {
        const requests = doc.palette.generate;
        if (!requests?.[0]) return doc;
        const first: GenerateRampSpec = { ...requests[0], base: value };
        return { ...doc, palette: { generate: [first, ...requests.slice(1)] } };
      },
      { coalesceKey: 'quick.baseColor', source: 'quick' },
    );
  }
}
