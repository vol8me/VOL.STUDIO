import { i18next } from '../../i18n/I18n';
import { DisposableScope } from '../../lifecycle/DisposableScope';
import { Button } from '../primitives/Button';
import type { SettingsApplyResult, SettingsCloseDecision, SettingsModel } from './SettingsModel';

export interface SettingsControl {
  readonly element: HTMLElement;
}

export interface SettingsFormOptions {
  readonly className?: string;
  /**
   * Verilirse form modele bağlanır: taslak/hata/meşgul durumu, Uygula / Geri al / Varsayılana dön eylemleri ve
   * `addField` tarifleri çalışır. Verilmezse form yalnız sunum kabıdır.
   */
  readonly model?: SettingsModel;
}

/** Modelin bir alanını çizen denetimin yüzü: değeri dışarıdan (sessizce) ayarlanabilir. */
export interface SettingsFieldControl<T = unknown> extends SettingsControl {
  setValue(value: T): void;
  destroy?(): void;
}

/** Bir ayar alanının TARİFİ: hangi anahtar, hangi etiket, denetim nasıl kurulur. Model değeri tutar. */
export interface SettingsFieldRecipe<T = unknown> {
  readonly key: string;
  readonly label?: string;
  readonly description?: string;
  readonly stackOnNarrow?: boolean;
  /** Denetimi kurar; kullanıcı değiştirince `onChange` çağrılır (modelin taslağını günceller). */
  create(context: { readonly value: T; onChange(value: T): void }): SettingsFieldControl<T>;
}

const sameValue = (a: unknown, b: unknown): boolean =>
  Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b);

interface BoundField {
  sync(): void;
  destroy(): void;
}

type FormOutcome = 'saved' | 'failed' | 'invalid' | null;

export interface SettingsRowOptions {
  readonly label?: string;
  /** Etiketin altında ikincil açıklama; denetime `aria-describedby` ile bağlanır. */
  readonly description?: string;
  readonly control: SettingsControl;
  readonly className?: string;
  readonly stackOnNarrow?: boolean;
}

let rowSeq = 0;
const LABELABLE =
  'input, select, textarea, button, [role="slider"], [role="group"], [role="radiogroup"]';

/** Etiketi ve kontrolü tutarlı, taşmayan bir ayar satırında birleştirir. */
export class SettingsRow {
  readonly element: HTMLDivElement;
  private readonly labelElement: HTMLSpanElement | null;
  private readonly descriptionElement: HTMLDivElement | null = null;
  private readonly errorElement: HTMLDivElement;
  private readonly target: HTMLElement | null;
  private readonly id = `vol-settings-row-${++rowSeq}`;

  constructor(options: SettingsRowOptions) {
    this.element = document.createElement('div');
    this.element.className = [
      'vol-settings-row',
      options.label ? null : 'vol-settings-row--self-labeled',
      options.stackOnNarrow ? 'vol-settings-row--stack-narrow' : null,
      options.className,
    ]
      .filter(Boolean)
      .join(' ');

    if (options.label) {
      this.labelElement = document.createElement('span');
      this.labelElement.className = 'vol-settings-row__label';
      this.labelElement.textContent = options.label;
      this.element.appendChild(this.labelElement);
    } else {
      this.labelElement = null;
    }

    const control = document.createElement('div');
    control.className = 'vol-settings-row__control';
    control.appendChild(options.control.element);
    this.element.appendChild(control);

    if (options.description) {
      this.descriptionElement = document.createElement('div');
      this.descriptionElement.className = 'vol-settings-row__description';
      this.descriptionElement.id = `${this.id}-desc`;
      this.descriptionElement.textContent = options.description;
      this.element.appendChild(this.descriptionElement);
    }
    this.errorElement = document.createElement('div');
    this.errorElement.className = 'vol-settings-row__error';
    this.errorElement.id = `${this.id}-error`;
    this.errorElement.setAttribute('role', 'alert');
    this.errorElement.hidden = true;
    this.element.appendChild(this.errorElement);

    const root = options.control.element;
    this.target = root.matches(LABELABLE) ? root : root.querySelector<HTMLElement>(LABELABLE);
    this.bindTarget();
  }

  /** Doğrulama hatasını satırda gösterir ve denetimi `aria-invalid` yapar; `null` temizler. */
  setError(message: string | null): void {
    this.errorElement.textContent = message ?? '';
    this.errorElement.hidden = message === null;
    this.element.classList.toggle('vol-settings-row--invalid', message !== null);
    if (message === null) this.target?.removeAttribute('aria-invalid');
    else this.target?.setAttribute('aria-invalid', 'true');
    this.bindTarget();
  }

  /** Görünür etiketi ve açıklama/hata kimliklerini denetime bağlar (kendi adı olan denetime dokunmaz). */
  private bindTarget(): void {
    const target = this.target;
    if (!target) return;
    if (
      this.labelElement &&
      !target.hasAttribute('aria-label') &&
      !target.hasAttribute('aria-labelledby') &&
      !target.closest('label')
    ) {
      this.labelElement.id = `${this.id}-label`;
      // Düğme görünümlü denetimde (Select) değer metni adın parçası kalsın.
      target.id ||= `${this.id}-control`;
      const own = target.tagName === 'BUTTON' ? ` ${target.id}` : '';
      target.setAttribute('aria-labelledby', `${this.labelElement.id}${own}`);
    }
    const described = [
      this.descriptionElement ? this.descriptionElement.id : null,
      this.errorElement.hidden ? null : this.errorElement.id,
    ].filter(Boolean);
    if (described.length > 0) target.setAttribute('aria-describedby', described.join(' '));
    else target.removeAttribute('aria-describedby');
  }

  setLabel(label: string): void {
    if (this.labelElement) this.labelElement.textContent = label;
  }

  destroy(): void {
    this.element.remove();
  }
}

/**
 * SettingsRow koleksiyonunu dikey form ritminde tutan sunum kabı. Bir `SettingsModel` verilirse form onun
 * TARİFİ olur: durum modelde, çizim burada (bkz. `addField`).
 */
export class SettingsForm {
  readonly element: HTMLDivElement;
  private busy = false;
  private readonly model: SettingsModel | null;
  private readonly scope = new DisposableScope();
  private readonly fields: BoundField[] = [];
  private actionsElement: HTMLDivElement | null = null;
  private statusElement: HTMLDivElement | null = null;
  private applyButton: Button | null = null;
  private revertButton: Button | null = null;
  private resetAllButton: Button | null = null;
  private outcome: FormOutcome = null;

  constructor(options: SettingsFormOptions = {}) {
    this.element = document.createElement('div');
    this.element.className = ['vol-settings-form', options.className].filter(Boolean).join(' ');
    this.model = options.model ?? null;
    if (this.model) this.buildActions(this.model);
  }

  /** Modeldeki bir alanı tarifiyle çizer: denetim ↔ taslak çift yönlü, hata ve "varsayılana dön" satırda. */
  addField<T>(recipe: SettingsFieldRecipe<T>): SettingsRow {
    const model = this.requireModel();
    // Denetimin şu an GÖSTERDİĞİ değer: kullanıcı değişikliğinden dönen model bildirimi denetime geri yazılmaz.
    let shown: unknown = model.get(recipe.key);
    const control = recipe.create({
      value: model.get<T>(recipe.key),
      onChange: (value) => {
        shown = value;
        model.set(recipe.key, value);
      },
    });
    const row = new SettingsRow({
      label: recipe.label,
      description: recipe.description,
      control,
      stackOnNarrow: recipe.stackOnNarrow,
    });
    const reset = new Button(i18next.t('core:settingsForm.resetRow'), {
      size: 'sm',
      fullWidth: false,
      onClick: () => model.reset(recipe.key),
    });
    reset.element.classList.add('vol-settings-row__reset');
    reset.element.setAttribute(
      'aria-label',
      i18next.t('core:settingsForm.resetRowNamed', { label: recipe.label ?? recipe.key }),
    );
    (row.element.querySelector('.vol-settings-row__control') ?? row.element).appendChild(
      reset.element,
    );
    this.add(row);

    const field: BoundField = {
      sync: () => {
        const value = model.get<T>(recipe.key);
        if (!sameValue(value, shown)) {
          shown = value;
          control.setValue(value);
        }
        row.setError(model.error(recipe.key));
        row.element.classList.toggle('vol-settings-row--dirty', model.isDirty(recipe.key));
        reset.element.hidden = !model.isModified(recipe.key);
        reset.setDisabled(model.isBusy());
      },
      destroy: () => {
        reset.destroy();
        control.destroy?.();
        row.destroy();
      },
    };
    this.fields.push(field);
    field.sync();
    return row;
  }

  /** Taslağı uygular; sonuç durum satırında duyurulur. Kaydedilirken ikinci çağrı `busy` döner. */
  async applyModel(): Promise<SettingsApplyResult> {
    const model = this.requireModel();
    const result = await model.apply();
    if (result.status === 'applied') this.outcome = result.saved.length > 0 ? 'saved' : null;
    else if (result.status === 'failed') this.outcome = 'failed';
    else if (result.status === 'invalid') this.outcome = 'invalid';
    this.refresh();
    return result;
  }

  /** Escape/geri: kirli değişiklikte karar tüketicidedir (`apply` / `discard` / `stay`). */
  requestClose(
    decide: (dirty: readonly string[]) => Promise<SettingsCloseDecision> | SettingsCloseDecision,
  ): Promise<boolean> {
    return this.requireModel().requestClose(decide);
  }

  private requireModel(): SettingsModel {
    if (!this.model) throw new Error('SettingsForm: bu işlem için `model` verilmeli.');
    return this.model;
  }

  private buildActions(model: SettingsModel): void {
    const bar = document.createElement('div');
    bar.className = 'vol-settings-form__actions';
    const status = document.createElement('div');
    status.className = 'vol-settings-form__status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    this.applyButton = new Button(i18next.t('core:settingsForm.apply'), {
      variant: 'primary',
      fullWidth: false,
      onClick: () => void this.applyModel(),
    });
    this.revertButton = new Button(i18next.t('core:settingsForm.revert'), {
      fullWidth: false,
      onClick: () => model.revert(),
    });
    this.resetAllButton = new Button(i18next.t('core:settingsForm.resetAll'), {
      fullWidth: false,
      onClick: () => model.resetAll(),
    });
    bar.append(
      status,
      this.resetAllButton.element,
      this.revertButton.element,
      this.applyButton.element,
    );
    this.element.appendChild(bar);
    this.actionsElement = bar;
    this.statusElement = status;
    // Düzenleme eski sonucu eskitir; uygulama sonucu `applyModel` içinde yeniden kurulur.
    this.scope.addSubscription(
      model.subscribe(() => {
        if (!model.isBusy()) this.outcome = null;
        this.refresh();
      }),
    );
    this.refresh();
  }

  private refresh(): void {
    const model = this.model;
    if (!model || !this.statusElement) return;
    const dirty = model.dirtyKeys().length;
    const busy = model.isBusy();
    if (busy) this.element.setAttribute('aria-busy', 'true');
    else this.element.removeAttribute('aria-busy');
    this.applyButton?.setDisabled(busy || dirty === 0);
    this.applyButton?.setLoading(busy);
    this.revertButton?.setDisabled(busy || dirty === 0);
    this.resetAllButton?.setDisabled(busy);
    for (const field of this.fields) field.sync();
    let text = '';
    if (busy) text = i18next.t('core:settingsForm.saving');
    else if (this.outcome === 'failed') text = i18next.t('core:settingsForm.saveFailed');
    else if (this.outcome === 'invalid') text = i18next.t('core:settingsForm.invalid');
    else if (dirty > 0) text = i18next.t('core:settingsForm.unsaved', { count: dirty });
    else if (this.outcome === 'saved') text = i18next.t('core:settingsForm.saved');
    this.statusElement.textContent = text;
    this.statusElement.classList.toggle(
      'vol-settings-form__status--error',
      this.outcome === 'failed' || this.outcome === 'invalid',
    );
  }

  /**
   * Kaydetme gibi bekleyen bir işi tek seferde çalıştırır: sürerken form `aria-busy` olur ve ikinci çağrı
   * işi başlatmaz (`false` döner). Kaydedilmemiş değişim kararı tüketicinindir; burada karar verilmez.
   */
  async runExclusive(task: () => Promise<void> | void): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    this.element.setAttribute('aria-busy', 'true');
    try {
      await task();
    } finally {
      this.busy = false;
      this.element.removeAttribute('aria-busy');
    }
    return true;
  }

  isBusy(): boolean {
    return this.busy;
  }

  add(row: SettingsRow): this {
    // Eylem çubuğu varsa satırlar onun ÜSTÜNE girer; çubuk her zaman formun sonunda kalır.
    this.element.insertBefore(row.element, this.actionsElement);
    return this;
  }

  destroy(): void {
    this.scope.dispose();
    for (const field of this.fields.splice(0)) field.destroy();
    this.applyButton?.destroy();
    this.revertButton?.destroy();
    this.resetAllButton?.destroy();
    this.element.remove();
  }
}
