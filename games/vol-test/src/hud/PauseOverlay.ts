import { i18next } from '@volstudio/core/i18n';
import { Button, Modal, Text } from '@volstudio/core/ui';

/**
 * Duraklatma katmanı. Modal kapanınca (düğme, Escape, Android geri) `onResume`
 * çağrılır. Scrim kapatmaz: duraklatma düğmesine dokunuşun ardından gelen
 * uyumluluk `click`i yeni açılan scrim'e düşüp katmanı anında kapatırdı.
 */
export class PauseOverlay {
  private readonly modal: Modal;
  private readonly title: Text;
  private readonly resume: Button;
  private closingFromGame = false;

  constructor(onResume: () => void) {
    this.modal = new Modal({
      className: 'vt-pause',
      closeOnScrimClick: false,
      onClose: () => {
        if (!this.closingFromGame) onResume();
      },
    });
    this.title = new Text('', { variant: 'heading', tag: 'h2' });
    this.resume = new Button('', { variant: 'primary', onClick: () => this.modal.close() });
    this.resume.element.dataset.testid = 'pause-resume';
    this.modal.add(this.title).add(this.resume);
    this.refreshLabels();
  }

  /** Modal kendini DOM'a eklemez; HUD bu öğeyi kendi köküne bağlar. */
  get element(): HTMLElement {
    return this.modal.element;
  }

  get isOpen(): boolean {
    return this.modal.isOpen();
  }

  open(): void {
    if (!this.modal.isOpen()) this.modal.open();
  }

  /** Oyun tarafından kapatma (kol Start'ı): `onResume` tekrar çağrılmaz. */
  close(): void {
    if (!this.modal.isOpen()) return;
    this.closingFromGame = true;
    this.modal.close();
    this.closingFromGame = false;
  }

  refreshLabels(): void {
    this.title.setContent(i18next.t('voltest:pause.title'));
    this.resume.setLabel(i18next.t('voltest:pause.resume'));
  }

  destroy(): void {
    this.modal.destroy();
    this.title.destroy();
    this.resume.destroy();
    this.modal.element.remove();
  }
}
