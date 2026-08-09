import { Button } from '../primitives/Button';
import { Modal } from './Modal';
import { Text } from '../primitives/Text';
import { i18next } from '../../systems/I18n';

export interface ConfirmOptions {
  title: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Birincil buton varyantı; ikincil (iptal) buton stili buna uyar. */
  variant?: 'primary' | 'danger';
  /** Modal'ın ekleneceği kapsayıcı. Varsayılan document.body — .vol-ui-root içinde tutmak için uiRoot.element geçin. */
  container?: HTMLElement;
  /** Ek CSS class'ı — kullanıcı kendi stilini geçersiz kılmak için. */
  className?: string;
}

/** theme.css'teki .vol-modal geçiş süresiyle eşleşmelidir (--vol-transition-medium). */
const MODAL_TRANSITION_MS = 240;

/**
 * Modal tabanlı Evet/Hayır onay akışı. Tek seferlik: `show()` kendi Modal'ını
 * oluşturup açar, kapatınca yok eder. Promise onay'da true, iptal/Escape/scrim'de
 * false döner. Yalnızca başlık + iki buton — ek açıklama metni yok.
 *
 * Temizlik `transitionend` yerine timer kullanır — çünkü `transitionend`
 * `prefers-reduced-motion` veya arka plan sekmesinde hiç tetiklenmeyebilir ve
 * modal'ı DOM'da sıkışmış bırakır.
 */
export function showConfirm(options: ConfirmOptions): Promise<boolean> {
  const { title, variant = 'primary', container = document.body, className } = options;
  const confirmLabelIsI18n = options.confirmLabel === undefined;
  const cancelLabelIsI18n = options.cancelLabel === undefined;
  const confirmLabel = options.confirmLabel ?? i18next.t('core:confirm.yes');
  const cancelLabel = options.cancelLabel ?? i18next.t('core:confirm.no');

  return new Promise<boolean>((resolve) => {
    let resolved = false;
    const finish = (result: boolean): void => {
      if (resolved) return;
      resolved = true;
      resolve(result);
      modal.close();
      setTimeout(() => {
        i18next.off('languageChanged', onLanguageChanged);
        modal.destroy();
      }, MODAL_TRANSITION_MS);
    };

    const onLanguageChanged = (): void => {
      if (confirmLabelIsI18n) confirmButton.setLabel(i18next.t('core:confirm.yes'));
      if (cancelLabelIsI18n) cancelButton.setLabel(i18next.t('core:confirm.no'));
    };

    const modal = new Modal({ onClose: () => finish(false), className });

    modal.add(new Text(title, { variant: 'heading', tag: 'h2' }));

    const actions = document.createElement('div');
    actions.className = 'vol-confirm__actions';

    const cancelButton = new Button(cancelLabel, {
      fullWidth: false,
      onClick: () => finish(false),
    });
    const confirmButton = new Button(confirmLabel, {
      variant,
      fullWidth: false,
      onClick: () => finish(true),
    });

    actions.appendChild(cancelButton.element);
    actions.appendChild(confirmButton.element);
    modal.add({ element: actions });

    container.appendChild(modal.element);
    // Reflow zorla ki ilk opacity:0 durumu open()'ın onu 1'e çevirmesinden önce
    // boyansın — aksi halde tarayıcı ikisini tek karede birleştirip geçişi atlar.
    void modal.element.offsetWidth;
    modal.open();

    i18next.on('languageChanged', onLanguageChanged);
  });
}
