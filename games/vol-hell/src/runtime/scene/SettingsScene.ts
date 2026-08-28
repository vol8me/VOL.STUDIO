import {
  Button,
  Checkbox,
  Panel,
  ScrollView,
  Select,
  Slider,
  Text,
  i18n,
  i18next,
  IconButton,
} from '@volstudio/core';
import { BaseScene } from './BaseScene';
import { pushBackHandler } from '@/app/backNavigation';
import { audioSettings, gameAudio } from '@/app/services';
import { sfxVolumes } from '@/config';

/** Dil kodu -> kullaniciya gosterilen ad. Bilinmeyen kod buyuk harfe duser. */
const LOCALE_LABELS: Record<string, string> = {
  tr: 'Türkçe',
  en: 'English',
};

export class SettingsScene extends BaseScene {
  private panel!: Panel;
  private scrollSurface!: ScrollView;
  private backButton!: Button;
  private closeButton!: IconButton;
  /** Android geri tuşu işleyicisinin kaydını kaldırır. */
  private stopBackHandler: (() => void) | null = null;
  private languageSelect!: Select;
  private titleText!: Text;
  private languageText!: Text;
  private soundText!: Text;
  private masterSlider!: Slider;
  private sfxSlider!: Slider;
  private musicSlider!: Slider;
  private ambientSlider!: Slider;
  private shakeCheckbox!: Checkbox;
  private hapticsCheckbox!: Checkbox;
  private shakeSlider!: Slider;
  private muteCheckbox!: Checkbox;

  constructor() {
    super({ key: 'Settings' });
  }

  protected override onLanguageChanged(): void {
    this.titleText.setContent(i18next.t('volhell:settings.title'));
    this.languageText.setContent(i18next.t('volhell:settings.language'));
    this.soundText.setContent(i18next.t('volhell:settings.sound'));
    this.backButton.setLabel(i18next.t('volhell:settings.back'));
    this.closeButton.setLabel(i18next.t('volhell:settings.back'));
    this.updateSliderLabels();
  }

  protected createScene(): void {
    this.backButton = new Button(i18next.t('volhell:settings.back'), {
      onClick: () => this.goBack(),
    });

    // Kalıcı kapatma düğmesi. "GERİ" panelin EN ALTINDA duruyor ve yatay
    // telefonda görünür yüksekliğin dışına düşebiliyor. Düğme panelin çocuğu
    // olursa panel daraldıkça içeriğin üstüne biner; oyun içi duraklatma
    // düğmesi gibi ekranın güvenli sağ üst köşesinde bağımsız yaşar.
    this.closeButton = new IconButton('✕', {
      label: i18next.t('volhell:settings.back'),
      onClick: () => this.goBack(),
    });
    this.closeButton.element.classList.add('vol-settings-close');

    // Android geri tuşu ayarlardan çıkışın İKİNCİ yoludur; panel kısa
    // ekranlarda kaydırıldığı için "GERİ" düğmesi görünmeyebiliyor.
    this.stopBackHandler?.();
    this.stopBackHandler = pushBackHandler(() => {
      this.goBack();
      return true;
    });

    const currentLocale = i18n.getLocale();
    // Secenekler i18n'in kayitli dillerinden turetilir; hardcode liste ucuncu
    // bir dil eklendiginde Select'i bos degere dusururdu.
    this.languageSelect = new Select({
      options: i18n.getLocales().map((locale) => ({
        value: locale,
        label: LOCALE_LABELS[locale] ?? locale.toUpperCase(),
      })),
      value: currentLocale,
      onCommit: (value) => {
        void this.changeLanguage(value);
      },
    });

    this.titleText = new Text(i18next.t('volhell:settings.title'), { variant: 'title', tag: 'h1' });
    this.languageText = new Text(i18next.t('volhell:settings.language'), { variant: 'muted' });
    this.soundText = new Text(i18next.t('volhell:settings.sound'), { variant: 'muted' });

    this.masterSlider = new Slider({
      min: 0,
      max: 1,
      step: 0.05,
      value: audioSettings.getMasterVolume(),
      label: i18next.t('volhell:settings.master'),
      onCommit: (value) => {
        void audioSettings.setMasterVolume(value);
        void gameAudio.playSfx('menuBlip', { volume: sfxVolumes.menuBlip });
      },
    });

    this.sfxSlider = new Slider({
      min: 0,
      max: 1,
      step: 0.05,
      value: audioSettings.getSfxVolume(),
      label: i18next.t('volhell:settings.sfx'),
      onCommit: (value) => {
        void audioSettings.setSfxVolume(value);
        void gameAudio.playSfx('menuBlip', { volume: sfxVolumes.menuBlip });
      },
    });

    this.musicSlider = new Slider({
      min: 0,
      max: 1,
      step: 0.05,
      value: audioSettings.getMusicVolume(),
      label: i18next.t('volhell:settings.music'),
      onCommit: (value) => {
        void audioSettings.setMusicVolume(value);
        void gameAudio.playSfx('menuBlip', { volume: sfxVolumes.menuBlip });
      },
    });

    this.shakeCheckbox = new Checkbox({
      checked: audioSettings.isScreenShakeEnabled(),
      label: i18next.t('volhell:settings.shake'),
      onCommit: (checked) => {
        void audioSettings.setScreenShakeEnabled(checked);
        void gameAudio.playSfx('menuBlip', { volume: sfxVolumes.menuBlip });
      },
    });

    // Titreşim yalnızca destekleyen cihazda anlamlı; masaüstünde de gösterilir
    // ama `vibrate()` sessizce düşer (bkz. core/src/platform/haptics.ts).
    this.hapticsCheckbox = new Checkbox({
      checked: audioSettings.isHapticsEnabled(),
      label: i18next.t('volhell:settings.haptics'),
      onCommit: (checked) => {
        void audioSettings.setHapticsEnabled(checked);
        void gameAudio.playSfx('menuBlip', { volume: sfxVolumes.menuBlip });
      },
    });

    this.shakeSlider = new Slider({
      min: 0,
      max: 1,
      step: 0.05,
      value: audioSettings.getScreenShakeIntensity(),
      label: i18next.t('volhell:settings.shakeIntensity'),
      onCommit: (value) => {
        void audioSettings.setScreenShakeIntensity(value);
        void gameAudio.playSfx('menuBlip', { volume: sfxVolumes.menuBlip });
      },
    });

    this.ambientSlider = new Slider({
      min: 0,
      max: 1,
      step: 0.05,
      value: audioSettings.getAmbientVolume(),
      label: i18next.t('volhell:settings.ambient'),
      onCommit: (value) => {
        void audioSettings.setAmbientVolume(value);
        void gameAudio.playSfx('menuBlip', { volume: sfxVolumes.menuBlip });
      },
    });

    this.muteCheckbox = new Checkbox({
      checked: audioSettings.isMuted(),
      label: i18next.t('volhell:settings.mute'),
      onCommit: (checked) => {
        void audioSettings.setMuted(checked);
        if (!checked) {
          void gameAudio.playSfx('menuBlip', { volume: sfxVolumes.menuBlip });
        }
      },
    });

    this.panel = new Panel({ className: 'settings-panel' })
      .add(this.titleText)
      .add(this.languageText)
      .add(this.languageSelect)
      .add(this.soundText)
      .add(this.masterSlider)
      .add(this.sfxSlider)
      .add(this.musicSlider)
      .add(this.ambientSlider)
      .add(this.shakeCheckbox)
      .add(this.hapticsCheckbox)
      .add(this.shakeSlider)
      .add(this.muteCheckbox)
      .add(this.backButton);

    // Kaydırma panelin dar görünen kutusuna bağlanırsa ekranın boş yanları
    // dokunuşu hiç kabul etmez. Tam ekran CORE ScrollView jest yüzeyidir;
    // panel yalnızca okunabilir içerik genişliğini belirler.
    this.scrollSurface = new ScrollView({ direction: 'vertical' });
    this.scrollSurface.element.classList.add('settings-scroll-surface');
    this.scrollSurface.add(this.panel);

    this.ui.mount(this.scrollSurface.element);
    this.ui.mount(this.closeButton.element);

    this.showOnNextFrame(() => this.panel.show());
  }

  private updateSliderLabels(): void {
    this.masterSlider.setLabel(i18next.t('volhell:settings.master'));
    this.sfxSlider.setLabel(i18next.t('volhell:settings.sfx'));
    this.musicSlider.setLabel(i18next.t('volhell:settings.music'));
    this.ambientSlider.setLabel(i18next.t('volhell:settings.ambient'));
    this.shakeCheckbox.setLabel(i18next.t('volhell:settings.shake'));
    this.hapticsCheckbox.setLabel(i18next.t('volhell:settings.haptics'));
    this.shakeSlider.setLabel(i18next.t('volhell:settings.shakeIntensity'));
    this.muteCheckbox.setLabel(i18next.t('volhell:settings.mute'));
  }

  private goBack(): void {
    void gameAudio.playSfx('back', { volume: sfxVolumes.back });
    this.scene.start('MainMenu');
  }

  private async changeLanguage(locale: string): Promise<void> {
    await i18n.changeLanguage(locale);
  }

  protected override onSceneShutdown(): void {
    // Ayarlar menüsünden ayrılırken çalan kısa SFX'ler diğer sahneye taşınmasın.
    this.stopBackHandler?.();
    this.stopBackHandler = null;
    gameAudio.stopAllSfx();
    this.closeButton.destroy();
    this.backButton.destroy();
    this.languageSelect.destroy();
    this.masterSlider.destroy();
    this.sfxSlider.destroy();
    this.musicSlider.destroy();
    this.ambientSlider.destroy();
    this.shakeCheckbox.destroy();
    this.hapticsCheckbox.destroy();
    this.shakeSlider.destroy();
    this.muteCheckbox.destroy();
    this.panel.destroy();
    this.scrollSurface.destroy();
  }
}
