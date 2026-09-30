import type { GraphicsQuality } from '@volstudio/core/graphics';
import { i18next } from '@volstudio/core/i18n';
import { Button, Modal, SegmentedControl, Text } from '@volstudio/core/ui';
import type { EffectLevel, EffectProfile } from '@/config/quality';

/**
 * Duraklatma katmanı: başlık, efekt kalitesi seçimi (CORE `SegmentedControl`
 * → CORE `GraphicsQuality`) ve devam düğmesi. Modal kapanınca (düğme, Escape, Android geri) `onResume`
 * çağrılır. Scrim kapatmaz: duraklatma düğmesine dokunuşun ardından gelen
 * uyumluluk `click`i yeni açılan scrim'e düşüp katmanı anında kapatırdı.
 */
export class PauseOverlay {
  private readonly modal: Modal;
  private readonly title: Text;
  private readonly resume: Button;
  private readonly qualityLabel: Text;
  private readonly qualityPicker: SegmentedControl;
  private closingFromGame = false;

  constructor(
    onResume: () => void,
    private readonly quality: GraphicsQuality<EffectLevel, EffectProfile>,
  ) {
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
    this.qualityLabel = new Text('', { variant: 'muted', tag: 'span' });
    this.qualityPicker = new SegmentedControl({
      options: this.qualityOptions(),
      value: quality.getLevel(),
      onCommit: (value) => {
        if (quality.isLevel(value)) quality.setLevel(value);
      },
    });
    this.qualityPicker.element.dataset.testid = 'pause-quality';
    this.modal.add(this.title).add(this.qualityLabel).add(this.qualityPicker).add(this.resume);
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
    this.qualityLabel.setContent(i18next.t('voltest:pause.quality'));
    this.qualityPicker.setOptions(this.qualityOptions());
    this.qualityPicker.setValue(this.quality.getLevel());
    this.qualityPicker.setAriaLabel(i18next.t('voltest:pause.quality'));
  }

  private qualityOptions(): Array<{ value: EffectLevel; label: string }> {
    return this.quality.getLevels().map((level) => ({
      value: level,
      label: i18next.t(`voltest:pause.qualityLevel.${level}`),
    }));
  }

  destroy(): void {
    this.modal.destroy();
    this.title.destroy();
    this.resume.destroy();
    this.qualityLabel.destroy();
    this.qualityPicker.destroy();
    this.modal.element.remove();
  }
}
