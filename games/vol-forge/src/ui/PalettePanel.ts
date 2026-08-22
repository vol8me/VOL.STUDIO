import { Button, ColorPicker, NumberStepper, Select, Slider } from '@volstudio/core';
import { generatePalette, type GenerateRampSpec, type SpriteDoc } from '@volstudio/core/visual';
import type { DocumentStore } from '../state/DocumentStore';
import { ChildScope, el, t } from './dom';

const SAT_CURVES = ['flat', 'arch', 'rise'];

/**
 * Palet şeridi — §8.7.
 *
 * Veri modeliyle aynı İKİ kip: doğrudan veri ya da sentez isteği. İkisi bir
 * arada olamaz (§7.1), bu yüzden arayüz de tek bir kip gösterir.
 */
export class PalettePanel {
  readonly element: HTMLDivElement;
  private readonly scope = new ChildScope();

  constructor(private readonly store: DocumentStore) {
    this.element = el('div', 'vf-palette');
  }

  render(): void {
    this.scope.clear();
    this.element.textContent = '';

    const doc = this.store.get();
    const generating = doc.palette.generate !== undefined;

    const head = el('div', 'vf-palette__head');
    head.appendChild(
      this.scope.add(
        new Select({
          options: [
            { value: 'data', label: t('palette.modeData') },
            { value: 'generate', label: t('palette.modeGenerate') },
          ],
          value: generating ? 'generate' : 'data',
          onChange: (value) => this.switchMode(value === 'generate'),
        }),
      ).element,
    );
    if (generating) {
      head.appendChild(
        this.scope.add(new Button(t('palette.bake'), { size: 'sm', onClick: () => this.bake() }))
          .element,
      );
    }
    this.element.appendChild(head);

    if (generating) this.renderGenerate(doc);
    else this.renderData(doc);
  }

  destroy(): void {
    this.scope.clear();
    this.element.remove();
  }

  private renderData(doc: SpriteDoc): void {
    const colors = doc.palette.colors ?? [];
    const strip = el('div', 'vf-palette__strip');
    colors.forEach((color, index) => {
      const picker = this.scope.add(
        new ColorPicker({
          value: color,
          onChange: (value) => {
            const next = [...colors];
            next[index] = value;
            this.patch({ ...doc.palette, colors: next });
          },
        }),
      );
      strip.appendChild(picker.element);
    });
    this.element.appendChild(strip);

    const ramps = el('div', 'vf-palette__ramps');
    for (const ramp of doc.palette.ramps ?? []) {
      const row = el('div', 'vf-palette__ramp');
      row.appendChild(
        el('span', 'vf-field__label', `${ramp.id}${ramp.name ? ` · ${ramp.name}` : ''}`),
      );
      for (const index of ramp.indices) {
        const chip = el('span', 'vf-palette__chip');
        chip.style.backgroundColor = colors[index] ?? '#000000';
        chip.title = String(index);
        row.appendChild(chip);
      }
      ramps.appendChild(row);
    }
    this.element.appendChild(ramps);
  }

  private renderGenerate(doc: SpriteDoc): void {
    const requests = doc.palette.generate ?? [];
    const generated = generatePalette(requests);

    requests.forEach((request, index) => {
      const row = el('div', 'vf-palette__request');
      const update = (patch: Partial<GenerateRampSpec>): void => {
        const next = requests.map((item, i) => (i === index ? { ...item, ...patch } : item));
        this.patch({ generate: next });
      };

      row.appendChild(
        this.scope.add(
          new ColorPicker({
            label: t('palette.base'),
            value: request.base,
            onChange: (value) => update({ base: value }),
          }),
        ).element,
      );
      row.appendChild(
        this.scope.add(
          new NumberStepper({
            min: 1,
            max: 32,
            step: 1,
            value: request.steps,
            onChange: (value) => update({ steps: value }),
          }),
        ).element,
      );
      row.appendChild(
        this.scope.add(
          new Slider({
            min: -60,
            max: 60,
            step: 1,
            value: request.hueShift ?? 0,
            label: t('palette.hueShift'),
            onChange: (value) => update({ hueShift: value }),
          }),
        ).element,
      );
      row.appendChild(
        this.scope.add(
          new Select({
            options: SAT_CURVES.map((curve) => ({ value: curve, label: curve })),
            value: request.satCurve ?? 'arch',
            onChange: (value) => update({ satCurve: value as 'arch' }),
          }),
        ).element,
      );

      const strip = el('div', 'vf-palette__strip');
      for (const colorIndex of generated.ramps[index]?.indices ?? []) {
        const chip = el('span', 'vf-palette__chip');
        chip.style.backgroundColor = generated.colors[colorIndex];
        strip.appendChild(chip);
      }
      row.appendChild(strip);
      this.element.appendChild(row);
    });

    this.element.appendChild(
      this.scope.add(
        new Button(t('palette.addRamp'), {
          size: 'sm',
          onClick: () =>
            this.patch({
              generate: [...requests, { base: '#6b5570', steps: 4, hueShift: -18 }],
            }),
        }),
      ).element,
    );
  }

  private switchMode(toGenerate: boolean): void {
    const doc = this.store.get();
    if (toGenerate) {
      this.patch({ generate: [{ base: '#6b5570', steps: 4, hueShift: -18, satCurve: 'arch' }] });
      return;
    }
    // Sentezden veriye dönerken mevcut sonucu KORU: kullanıcı kip
    // değiştirdiğinde paletinin sıfırlanması, yaptığı işi silmek olurdu.
    const generated = generatePalette(doc.palette.generate ?? []);
    this.patch({ colors: generated.colors, ramps: generated.ramps });
  }

  private bake(): void {
    const doc = this.store.get();
    const generated = generatePalette(doc.palette.generate ?? []);
    this.patch({ colors: generated.colors, ramps: generated.ramps });
  }

  private patch(palette: SpriteDoc['palette']): void {
    // Kip geçişinde KARŞI alanı sil: `generate` ile `colors`/`ramps` bir
    // arada olamaz (§7.1) ve doğrulayıcı bunu reddeder.
    const cleaned = { ...palette };
    if (cleaned.generate !== undefined) {
      delete (cleaned as Record<string, unknown>).colors;
      delete (cleaned as Record<string, unknown>).ramps;
    } else {
      delete (cleaned as Record<string, unknown>).generate;
    }
    this.store.update((doc) => ({ ...doc, palette: cleaned }));
  }
}
