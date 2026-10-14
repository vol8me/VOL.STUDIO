import type { MessageKey } from '@/i18n/keys';
import { DisposableScope } from '@volstudio/core/lifecycle';
import type { GraphicsQuality } from '@volstudio/core/graphics';
import { i18next } from '@volstudio/core/i18n';
import { Button, Modal, SegmentedControl, SettingsForm, SettingsRow } from '@volstudio/core/ui';
import type { GameSettings } from '@/app/GameSettings';
import { ScreenFrame } from '@/menu/ScreenFrame';
import { SettingsPanel } from './SettingsPanel';
import type { EffectLevel, EffectProfile } from '@/config/quality';

/** Duraklatma menüsünde sürdür düğmesinin altında duran, sürücüye özgü eylem. */
export interface PauseAction {
  readonly id: string;
  /** Düğme etiketinin i18n anahtarı. */
  readonly labelKey: MessageKey;
  readonly variant?: 'default' | 'danger';
  /** Menü açık kalır (dünya durur); eylem kendi katmanını üstüne açar ya da sahneyi yeniden kurar. */
  readonly run: () => void;
}

/**
 * Duraklatma katmanı (canlı dünyada "Menü": dünya durmaz, yalnız girdi kesilir): ana menü ve ayarlarla aynı sol şerit (`ScreenFrame` `sheet`). Başlık şeridi,
 * kayan gövde (efekt kalitesi ve ayar satırları) ve eylem şeridi (devam, sürücü eylemleri) üç ekranda
 * aynı iskeletten gelir. `Modal` yalnız odak tuzağını, Escape'i ve Android geri sözleşmesini verir; kapanınca
 * (düğme, Escape, geri) `onResume` çağrılır. Scrim kapatmaz: duraklatma düğmesine dokunuşun ardından
 * gelen uyumluluk `click`i yeni açılan scrim'e düşüp katmanı anında kapatırdı.
 */
export class PauseOverlay {
  private readonly scope = new DisposableScope();
  private readonly modal: Modal;
  private readonly frame: ScreenFrame;
  private readonly resume: Button;
  private readonly qualityRow: SettingsRow;
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
    private readonly live = false,
  ) {
    this.modal = new Modal({
      className: 'vt-pause',
      closeOnScrimClick: false,
      initialFocus: () => this.resume.element,
      onClose: () => {
        if (!this.closingFromGame) onResume();
      },
    });
    this.frame = this.scope.addDestroyable(new ScreenFrame({ testid: 'pause', variant: 'sheet' }));
    this.resume = this.scope.addDestroyable(
      new Button('', { variant: 'primary', onClick: () => this.modal.close() }),
    );
    this.resume.element.dataset.testid = 'pause-resume';
    this.qualityPicker = this.scope.addDestroyable(
      new SegmentedControl({
        options: this.qualityOptions(),
        value: quality.getLevel(),
        onCommit: (value) => {
          if (quality.isLevel(value)) quality.setLevel(value);
        },
      }),
    );
    this.qualityPicker.element.dataset.testid = 'pause-quality';
    this.scope.addSubscription(quality.onChange((level) => this.qualityPicker.setValue(level)));
    this.qualityRow = this.scope.addDestroyable(
      new SettingsRow({ label: i18next.t('voltest:pause.quality'), control: this.qualityPicker }),
    );
    this.settingsPanel = settings ? new SettingsPanel(settings, displayAvailable) : null;

    const form = this.scope.addDestroyable(new SettingsForm({ className: 'vt-settings__form' }));
    form.add(this.qualityRow);
    for (const element of this.settingsPanel?.elements ?? []) form.element.append(element);
    this.frame.body.add(form);

    this.actionList = document.createElement('div');
    this.actionList.className = 'vt-pause__actions';
    // Devam ana eylemdir ve ilk sıradadır; sürücü eylemleri (katıl, ayrıl, ana menü) altında dizilir.
    this.frame.footer.classList.add('vt-pause__footer');
    this.frame.footer.append(this.resume.element, this.actionList);
    this.modal.add({ element: this.frame.element });
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
    this.frame.setTitle(
      i18next.t(this.live ? 'voltest:pause.liveTitle' : 'voltest:pause.title'),
      this.live ? i18next.t('voltest:pause.liveNote') : '',
    );
    this.resume.setLabel(
      i18next.t(this.live ? 'voltest:pause.liveResume' : 'voltest:pause.resume'),
    );
    this.qualityRow.setLabel(i18next.t('voltest:pause.quality'));
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
    this.modal.element.remove();
  }
}
