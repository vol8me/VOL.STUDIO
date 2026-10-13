import type { MessageKey } from '@/i18n/keys';
import { DisposableScope } from '@volstudio/core/lifecycle';
import type { GraphicsQuality } from '@volstudio/core/graphics';
import { i18next } from '@volstudio/core/i18n';
import { Button, Modal, SegmentedControl, Text } from '@volstudio/core/ui';
import type { GameSettings } from '@/app/GameSettings';
import { SettingsPanel } from './SettingsPanel';
import type { EffectLevel, EffectProfile } from '@/config/quality';

/** Duraklatma menüsünde sürdür düğmesinin üstünde duran, sürücüye özgü eylem. */
export interface PauseAction {
  readonly id: string;
  /** Düğme etiketinin i18n anahtarı. */
  readonly labelKey: MessageKey;
  readonly variant?: 'default' | 'danger';
  /** Menü açık kalır (dünya durur); eylem kendi katmanını üstüne açar ya da sahneyi yeniden kurar. */
  readonly run: () => void;
}

/**
 * Duraklatma katmanı: başlık, efekt kalitesi seçimi (CORE `SegmentedControl`
 * → CORE `GraphicsQuality`) ve devam düğmesi. Modal kapanınca (düğme, Escape, Android geri) `onResume`
 * çağrılır. Scrim kapatmaz: duraklatma düğmesine dokunuşun ardından gelen
 * uyumluluk `click`i yeni açılan scrim'e düşüp katmanı anında kapatırdı.
 */
export class PauseOverlay {
  private readonly scope = new DisposableScope();
  private readonly modal: Modal;
  private readonly title: Text;
  private readonly resume: Button;
  private readonly qualityLabel: Text;
  private readonly qualityPicker: SegmentedControl;
  private readonly settingsPanel: SettingsPanel | null;
  private readonly actionList: HTMLDivElement;
  private actionButtons: Array<{ action: PauseAction; button: Button }> = [];
  private closingFromGame = false;

  constructor(
    onResume: () => void,
    private readonly quality: GraphicsQuality<EffectLevel, EffectProfile>,
    settings?: GameSettings,
    displayAvailable = false,
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
    this.scope.addSubscription(quality.onChange((level) => this.qualityPicker.setValue(level)));
    this.modal.add(this.title).add(this.qualityLabel).add(this.qualityPicker);
    this.settingsPanel = settings ? new SettingsPanel(settings, displayAvailable) : null;
    for (const element of this.settingsPanel?.elements ?? []) this.modal.add({ element });
    this.actionList = document.createElement('div');
    this.actionList.className = 'vt-pause__actions';
    // Eylemler ve devam düğmesi tek yapışkan altlıktadır: panel 800 px yükseklikte kayarken ikisi de erişilebilir kalır.
    const footer = document.createElement('div');
    footer.className = 'vt-pause__footer';
    footer.append(this.actionList, this.resume.element);
    this.modal.add({ element: footer });
    this.refreshLabels();
  }

  /** Sürücünün eylemlerini yeniden kurar; eskiler sökülür. */
  setActions(actions: readonly PauseAction[]): void {
    for (const { button } of this.actionButtons) button.destroy();
    this.actionList.replaceChildren();
    this.actionButtons = actions.map((action) => {
      const button = new Button(i18next.t(action.labelKey), {
        variant: action.variant,
        onClick: () => action.run(),
      });
      button.element.dataset.testid = `pause-${action.id}`;
      this.actionList.append(button.element);
      return { action, button };
    });
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
    this.settingsPanel?.refreshLabels();
    this.title.setContent(i18next.t('voltest:pause.title'));
    this.resume.setLabel(i18next.t('voltest:pause.resume'));
    this.qualityLabel.setContent(i18next.t('voltest:pause.quality'));
    this.qualityPicker.setOptions(this.qualityOptions());
    this.qualityPicker.setValue(this.quality.getLevel());
    this.qualityPicker.setAriaLabel(i18next.t('voltest:pause.quality'));
    for (const { action, button } of this.actionButtons)
      button.setLabel(i18next.t(action.labelKey));
  }

  private qualityOptions(): Array<{ value: EffectLevel; label: string }> {
    return this.quality.getLevels().map((level) => ({
      value: level,
      label: i18next.t(`voltest:pause.qualityLevel.${level}`),
    }));
  }

  destroy(): void {
    this.scope.dispose();
    this.settingsPanel?.destroy();
    for (const { button } of this.actionButtons) button.destroy();
    this.modal.destroy();
    this.title.destroy();
    this.resume.destroy();
    this.qualityLabel.destroy();
    this.qualityPicker.destroy();
    this.modal.element.remove();
  }
}
