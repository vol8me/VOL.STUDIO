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
  private readonly categorySelect: Select;
  private readonly nameInput: Input;
  private category: PresetCategory = 'material';
  private name = '';

  constructor(
    private readonly store: DocumentStore,
    private readonly hasIssues: () => boolean,
  ) {
    this.element = el('div', 'vf-save');

    this.categorySelect = this.scope.add(
      new Select({
        options: PRESET_CATEGORIES.map((value) => ({
          value,
          label: t(`category.${value}`),
        })),
        value: this.category,
        onChange: (value) => {
          this.category = value as PresetCategory;
        },
      }),
    );
    this.nameInput = this.scope.add(
      new Input({
        placeholder: t('save.name'),
        onInput: (value: string) => {
          this.name = value;
          this.refresh();
        },
      }),
    );
    this.categorySelect.element.setAttribute('aria-label', t('save.category'));
    this.nameInput.element.setAttribute('aria-label', t('save.name'));
    this.button = this.scope.add(
      new Button(t('save.button'), {
        variant: 'primary',
        size: 'sm',
        onClick: () => void this.save(),
      }),
    );

    this.element.appendChild(this.field(t('save.category'), this.categorySelect.element));
    this.element.appendChild(this.field(t('save.name'), this.nameInput.element));
    this.element.appendChild(this.button.element);

    this.status = el('div', 'vf-save__status');
    this.element.appendChild(this.status);
    this.refresh();
  }

  /** Kaydetmenin açık olup olmadığını yeniden değerlendirir. */
  refresh(): void {
    delete this.status.dataset.tone;
    const blocked = this.hasIssues();
    const validName = NAME_PATTERN.test(this.name);
    this.button.setDisabled(blocked || !validName);
    if (blocked) this.status.textContent = t('issues.blocked');
    else if (this.name.length === 0) this.status.textContent = t('save.nameRequired');
    else if (!validName) this.status.textContent = t('save.namePattern');
    else this.status.textContent = '';
    this.button.element.title = this.status.textContent ?? '';
  }

  /** Niyet tarifinin kategorisini kaydetme hedefiyle eşitler. */
  setCategory(category: PresetCategory): void {
    this.category = category;
    this.categorySelect.setValue(category);
  }

  setName(name: string): void {
    this.name = name;
    this.nameInput.setValue(name);
    this.refresh();
  }

  destroy(): void {
    this.scope.clear();
    this.element.remove();
  }

  private async save(): Promise<void> {
    try {
      const result = await saveOutput(this.category, this.name, this.store.get());
      this.status.dataset.tone = result.qaPass ? 'success' : 'warning';
      this.status.textContent = t(result.qaPass ? 'save.ok' : 'save.qaWarning', {
        path: result.pngPath,
      });
    } catch (error) {
      this.status.dataset.tone = 'error';
      this.status.textContent = t('save.fail', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private field(label: string, control: HTMLElement): HTMLElement {
    const field = el('div', 'vf-save__field');
    field.appendChild(el('span', 'vf-save__label', label));
    field.appendChild(control);
    return field;
  }
}
