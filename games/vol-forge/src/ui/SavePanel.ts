import { Button, Input, Select } from '@volstudio/core';
import { PRESET_CATEGORIES, type PresetCategory } from '@volstudio/core/visual';
import type { DocumentStore } from '../state/DocumentStore';
import { saveOutput } from '../io/forgeClient';
import { NAME_PATTERN } from '../../server/paths';
import { ChildScope, el, t } from './dom';

/**
 * Kaydetme şeridi — §8.11.
 *
 * Kategori SABİT listedir; serbest metin, zamanla `metal`/`metaller` gibi
 * ayrışan klasörler üretirdi. Ad kalıbı sunucudakiyle AYNI kaynaktan gelir
 * (`server/paths.ts`) — iki yerde yazılmış iki kalıp kaçınılmaz olarak
 * ayrışır ve kullanıcı sunucunun reddettiği bir adı arayüzde geçerli görür.
 *
 * **Sorun varken kaydetme kapalıdır**: çıktı klasörü hiçbir zaman geçersiz
 * bir belge almaz.
 */
export class SavePanel {
  readonly element: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly scope = new ChildScope();
  private readonly button: Button;
  private category: PresetCategory = 'material';
  private name = '';

  constructor(
    private readonly store: DocumentStore,
    private readonly hasIssues: () => boolean,
  ) {
    this.element = el('div', 'vf-save');

    const categorySelect = this.scope.add(
      new Select({
        options: PRESET_CATEGORIES.map((value) => ({ value, label: value })),
        value: this.category,
        onChange: (value) => {
          this.category = value as PresetCategory;
        },
      }),
    );
    const nameInput = this.scope.add(
      new Input({
        placeholder: t('save.name'),
        onInput: (value: string) => {
          this.name = value;
          this.refresh();
        },
      }),
    );
    this.button = this.scope.add(
      new Button(t('save.button'), {
        variant: 'primary',
        size: 'sm',
        onClick: () => void this.save(),
      }),
    );

    this.element.appendChild(categorySelect.element);
    this.element.appendChild(nameInput.element);
    this.element.appendChild(this.button.element);

    this.status = el('div', 'vf-save__status');
    this.element.appendChild(this.status);
    this.refresh();
  }

  /** Kaydetmenin açık olup olmadığını yeniden değerlendirir. */
  refresh(): void {
    const blocked = this.hasIssues();
    const validName = NAME_PATTERN.test(this.name);
    this.button.setDisabled(blocked || !validName);
    if (blocked) this.status.textContent = t('issues.blocked');
    else if (!validName && this.name.length > 0) this.status.textContent = t('save.namePattern');
    else this.status.textContent = '';
  }

  destroy(): void {
    this.scope.clear();
    this.element.remove();
  }

  private async save(): Promise<void> {
    try {
      const result = await saveOutput(this.category, this.name, this.store.get());
      this.status.textContent = t('save.ok', { path: result.pngPath });
    } catch (error) {
      this.status.textContent = t('save.fail', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
