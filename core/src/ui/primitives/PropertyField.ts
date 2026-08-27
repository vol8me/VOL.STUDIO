import { i18next } from '../../systems/I18n';
import { DisposableScope } from '../../lifecycle/DisposableScope';
import { Icon } from './Icon';

let propertyFieldId = 0;

export interface PropertyFieldOptions {
  label: string;
  control: HTMLElement | { element: HTMLElement };
  description?: string;
  disabledReason?: string;
  onReset?: () => void;
  resetLabel?: string;
  className?: string;
}

/** Inspector'larda etiket, kontrol, açıklama ve reset düzenini standardize eder. */
export class PropertyField {
  readonly element: HTMLDivElement;
  readonly control: HTMLElement;
  private readonly labelElement: HTMLLabelElement;
  private readonly descriptionElement: HTMLDivElement;
  private readonly statusElement: HTMLDivElement;
  private readonly resetButton: HTMLButtonElement | null;
  private readonly resetLabelIsI18n: boolean;
  private readonly scope = new DisposableScope();
  private readonly onLanguageChanged: () => void;

  constructor(options: PropertyFieldOptions) {
    const id = `vol-property-field-${++propertyFieldId}`;
    this.control =
      options.control instanceof HTMLElement ? options.control : options.control.element;
    this.element = document.createElement('div');
    this.element.className = ['vol-property-field', options.className].filter(Boolean).join(' ');

    const header = document.createElement('div');
    header.className = 'vol-property-field__header';
    this.labelElement = document.createElement('label');
    this.labelElement.className = 'vol-property-field__label';
    this.labelElement.textContent = options.label;
    header.appendChild(this.labelElement);

    this.resetLabelIsI18n = options.resetLabel === undefined;
    if (options.onReset) {
      this.resetButton = document.createElement('button');
      this.resetButton.type = 'button';
      this.resetButton.className = 'vol-property-field__reset';
      this.resetButton.appendChild(new Icon({ name: 'reset' }).element);
      this.resetButton.setAttribute(
        'aria-label',
        options.resetLabel ?? i18next.t('core:propertyField.reset'),
      );
      this.scope.addListener(this.resetButton, 'click', () => options.onReset?.());
      header.appendChild(this.resetButton);
    } else {
      this.resetButton = null;
    }
    this.element.appendChild(header);

    const controlSlot = document.createElement('div');
    controlSlot.className = 'vol-property-field__control';
    controlSlot.appendChild(this.control);
    this.element.appendChild(controlSlot);

    const focusTarget = this.focusTarget();
    if (focusTarget) {
      if (!focusTarget.id) focusTarget.id = `${id}-control`;
      this.labelElement.htmlFor = focusTarget.id;
    }

    this.descriptionElement = document.createElement('div');
    this.descriptionElement.className = 'vol-property-field__description';
    this.descriptionElement.id = `${id}-description`;
    this.element.appendChild(this.descriptionElement);

    this.statusElement = document.createElement('div');
    this.statusElement.className = 'vol-property-field__status';
    this.statusElement.id = `${id}-status`;
    this.element.appendChild(this.statusElement);

    this.setDescription(options.description);
    this.setDisabledReason(options.disabledReason);
    this.bindDescribedBy(focusTarget);

    this.onLanguageChanged = () => {
      if (this.resetButton && this.resetLabelIsI18n) {
        this.resetButton.setAttribute('aria-label', i18next.t('core:propertyField.reset'));
      }
    };
    i18next.on('languageChanged', this.onLanguageChanged);
    this.scope.addSubscription(() => i18next.off('languageChanged', this.onLanguageChanged));
  }

  setLabel(label: string): void {
    this.labelElement.textContent = label;
  }

  setDescription(description?: string): void {
    this.descriptionElement.textContent = description ?? '';
    this.descriptionElement.hidden = !description;
  }

  setDisabledReason(reason?: string): void {
    this.statusElement.textContent = reason ?? '';
    this.statusElement.hidden = !reason;
    this.element.classList.toggle('vol-property-field--disabled', Boolean(reason));
  }

  destroy(): void {
    this.scope.dispose();
    this.element.remove();
  }

  private focusTarget(): HTMLElement | null {
    if (this.control.matches('button, input, select, textarea, [tabindex]')) return this.control;
    return this.control.querySelector<HTMLElement>('button, input, select, textarea, [tabindex]');
  }

  private bindDescribedBy(target: HTMLElement | null): void {
    if (!target) return;
    const ids = [
      ...new Set(
        `${target.getAttribute('aria-describedby') ?? ''} ${this.descriptionElement.id} ${
          this.statusElement.id
        }`
          .trim()
          .split(/\s+/),
      ),
    ];
    target.setAttribute('aria-describedby', ids.join(' '));
  }
}
