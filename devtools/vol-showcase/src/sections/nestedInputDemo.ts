import type { DisposableScope } from '@volstudio/core/lifecycle';
import { Button, Input, OnScreenKeyboard, PropertyField, Select } from '@volstudio/core/ui';
import { i18next } from '@volstudio/core/i18n';

/** Modal içindeki native metin/Select/CORE OSK akışı; kalıcı model değil, gerçek bileşen tüketimidir. */
export function buildNestedInputDemo(
  disposables: DisposableScope,
  container: HTMLElement,
): {
  element: HTMLElement;
  cancel(): void;
} {
  const element = document.createElement('div');
  element.className = 'vol-showcase-panel-demo vol-showcase-nested-input';
  const input = new Input({
    value: i18next.t('volui:forms.playerNameValue'),
    placeholder: i18next.t('volui:forms.playerNamePlaceholder'),
  });
  const nameField = new PropertyField({
    label: i18next.t('volui:forms.playerName'),
    control: input,
  });
  const select = new Select({
    options: [
      { value: 'normal', label: i18next.t('volui:forms.normal') },
      { value: 'hard', label: i18next.t('volui:forms.hard') },
    ],
    value: 'normal',
    container,
  });
  select.element.setAttribute('aria-label', i18next.t('volui:forms.difficultyPlaceholder'));
  let request: AbortController | undefined;
  const cancel = (): void => {
    request?.abort();
    request = undefined;
  };
  const keyboard = new Button(i18next.t('volui:forms.onScreenKeyboardOpen'), {
    fullWidth: false,
    onClick: async () => {
      cancel();
      const active = new AbortController();
      request = active;
      try {
        const result = await OnScreenKeyboard.open(
          { value: input.getValue(), maxLength: 32 },
          active.signal,
        );
        if (!active.signal.aborted && !result.canceled) input.setValue(result.value);
      } finally {
        if (request === active) request = undefined;
      }
    },
  });
  disposables.add({ dispose: cancel });
  disposables.addDestroyables(input, nameField, select, keyboard);
  element.append(nameField.element, select.element, keyboard.element);
  return { element, cancel };
}
