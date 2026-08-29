import { Checkbox, DisposableScope, Select, Slider, Text, i18n, i18next } from '@volstudio/core';
import type { AudioSettings, AudioSettingsData } from '@/app/AudioSettings';
import type { VideoSettings, VideoSettingsData } from '@/app/VideoSettings';
import { gameAudio } from '@/app/services';
import { sfxVolumes } from '@/config/audio';
import { videoConfig, type GraphicsQuality } from '@/config/video';

export interface GameSettingsContentOptions {
  audioSettings: AudioSettings;
  videoSettings: VideoSettings;
  /** Android/dokunmatik yüzeyde native masaüstü seçenekleri gösterilmez. */
  showVideoSettings: boolean;
}

/** Ana menü ve pause ekranının paylaştığı tek ayar formu. */
export class GameSettingsContent {
  readonly element: HTMLDivElement;
  private readonly scope = new DisposableScope();
  private readonly languageText: Text;
  private readonly soundText: Text;
  private readonly languageSelect: Select;
  private readonly masterSlider: Slider;
  private readonly sfxSlider: Slider;
  private readonly musicSlider: Slider;
  private readonly ambientSlider: Slider;
  private readonly shakeCheckbox: Checkbox;
  private readonly hapticsCheckbox: Checkbox;
  private readonly shakeSlider: Slider;
  private readonly muteCheckbox: Checkbox;
  private readonly videoText: Text | null;
  private readonly displayModeText: Text | null;
  private readonly resolutionText: Text | null;
  private readonly graphicsQualityText: Text | null;
  private readonly displayModeSelect: Select | null;
  private readonly resolutionSelect: Select | null;
  private readonly graphicsQualitySelect: Select | null;

  constructor(options: GameSettingsContentOptions) {
    this.element = document.createElement('div');
    this.element.className = 'vol-game-settings';

    this.languageText = new Text(i18next.t('volhell:settings.language'), { variant: 'muted' });
    this.languageSelect = new Select({
      options: i18n.getLocales().map((locale) => ({
        value: locale,
        label: this.localeLabel(locale),
      })),
      value: i18n.getLocale(),
      onCommit: (locale) => void i18n.changeLanguage(locale),
    });
    this.element.append(this.languageText.element, this.languageSelect.element);

    this.soundText = new Text(i18next.t('volhell:settings.sound'), { variant: 'heading' });
    this.masterSlider = this.makeAudioSlider(
      () => options.audioSettings.getMasterVolume(),
      (value) => options.audioSettings.setMasterVolume(value),
      'master',
    );
    this.sfxSlider = this.makeAudioSlider(
      () => options.audioSettings.getSfxVolume(),
      (value) => options.audioSettings.setSfxVolume(value),
      'sfx',
    );
    this.musicSlider = this.makeAudioSlider(
      () => options.audioSettings.getMusicVolume(),
      (value) => options.audioSettings.setMusicVolume(value),
      'music',
    );
    this.ambientSlider = this.makeAudioSlider(
      () => options.audioSettings.getAmbientVolume(),
      (value) => options.audioSettings.setAmbientVolume(value),
      'ambient',
    );
    this.shakeCheckbox = new Checkbox({
      checked: options.audioSettings.isScreenShakeEnabled(),
      label: i18next.t('volhell:settings.shake'),
      onCommit: (checked) => {
        void options.audioSettings.setScreenShakeEnabled(checked);
        this.playCommitSound();
      },
    });
    this.hapticsCheckbox = new Checkbox({
      checked: options.audioSettings.isHapticsEnabled(),
      label: i18next.t('volhell:settings.haptics'),
      onCommit: (checked) => {
        void options.audioSettings.setHapticsEnabled(checked);
        this.playCommitSound();
      },
    });
    this.shakeSlider = this.makeAudioSlider(
      () => options.audioSettings.getScreenShakeIntensity(),
      (value) => options.audioSettings.setScreenShakeIntensity(value),
      'shakeIntensity',
    );
    this.muteCheckbox = new Checkbox({
      checked: options.audioSettings.isMuted(),
      label: i18next.t('volhell:settings.mute'),
      onCommit: (checked) => {
        void options.audioSettings.setMuted(checked);
        if (!checked) this.playCommitSound();
      },
    });

    const audioSection = this.makeSection('vol-game-settings__audio');
    audioSection.append(
      this.soundText.element,
      this.masterSlider.element,
      this.sfxSlider.element,
      this.musicSlider.element,
      this.ambientSlider.element,
      this.shakeCheckbox.element,
      this.hapticsCheckbox.element,
      this.shakeSlider.element,
      this.muteCheckbox.element,
    );
    this.element.appendChild(audioSection);

    if (options.showVideoSettings) {
      this.videoText = new Text(i18next.t('volhell:settings.video'), { variant: 'heading' });
      this.displayModeText = new Text(i18next.t('volhell:settings.displayMode'), {
        variant: 'muted',
      });
      this.resolutionText = new Text(i18next.t('volhell:settings.resolution'), {
        variant: 'muted',
      });
      this.graphicsQualityText = new Text(i18next.t('volhell:settings.graphicsQuality'), {
        variant: 'muted',
      });
      this.displayModeSelect = new Select({
        options: [
          { value: 'windowed', label: i18next.t('volhell:settings.windowed') },
          { value: 'fullscreen', label: i18next.t('volhell:settings.fullscreen') },
        ],
        value: options.videoSettings.getDisplayMode(),
        onCommit: (value) => {
          void options.videoSettings.setDisplayMode(value as 'windowed' | 'fullscreen');
          this.playCommitSound();
        },
      });
      this.resolutionSelect = new Select({
        options: videoConfig.resolutions.map((preset) => ({
          value: preset.id,
          label: `${preset.width} × ${preset.height}`,
        })),
        value: options.videoSettings.getResolutionId(),
        disabled: options.videoSettings.getDisplayMode() === 'fullscreen',
        onCommit: (value) => {
          void options.videoSettings.setResolution(value);
          this.playCommitSound();
        },
      });
      this.graphicsQualitySelect = new Select({
        options: (Object.keys(videoConfig.quality) as GraphicsQuality[]).map((quality) => ({
          value: quality,
          label: this.qualityLabel(quality),
        })),
        value: options.videoSettings.getGraphicsQuality(),
        onCommit: (value) => {
          void options.videoSettings.setGraphicsQuality(value as GraphicsQuality);
          this.playCommitSound();
        },
      });

      const videoSection = this.makeSection('vol-game-settings__video');
      videoSection.append(
        this.videoText.element,
        this.displayModeText.element,
        this.displayModeSelect.element,
        this.resolutionText.element,
        this.resolutionSelect.element,
        this.graphicsQualityText.element,
        this.graphicsQualitySelect.element,
      );
      this.element.appendChild(videoSection);
    } else {
      this.videoText = null;
      this.displayModeText = null;
      this.resolutionText = null;
      this.graphicsQualityText = null;
      this.displayModeSelect = null;
      this.resolutionSelect = null;
      this.graphicsQualitySelect = null;
    }

    this.scope.addDestroyables(
      this.languageText,
      this.languageSelect,
      this.soundText,
      this.masterSlider,
      this.sfxSlider,
      this.musicSlider,
      this.ambientSlider,
      this.shakeCheckbox,
      this.hapticsCheckbox,
      this.shakeSlider,
      this.muteCheckbox,
    );
    for (const component of [
      this.videoText,
      this.displayModeText,
      this.resolutionText,
      this.graphicsQualityText,
      this.displayModeSelect,
      this.resolutionSelect,
      this.graphicsQualitySelect,
    ]) {
      if (component) this.scope.addDestroyable(component);
    }

    const onLanguageChanged = (): void => this.refreshLabels();
    i18next.on('languageChanged', onLanguageChanged);
    this.scope.addSubscription(() => i18next.off('languageChanged', onLanguageChanged));
    this.scope.addSubscription(options.audioSettings.onChange((data) => this.syncAudio(data)));
    this.scope.addSubscription(options.videoSettings.onChange((data) => this.syncVideo(data)));
  }

  destroy(): void {
    this.scope.dispose();
    this.element.remove();
  }

  private makeSection(className: string): HTMLDivElement {
    const section = document.createElement('div');
    section.className = `vol-game-settings__section ${className}`;
    return section;
  }

  private makeAudioSlider(
    get: () => number,
    set: (value: number) => Promise<void>,
    labelKey: 'ambient' | 'master' | 'music' | 'sfx' | 'shakeIntensity',
  ): Slider {
    return new Slider({
      min: 0,
      max: 1,
      step: 0.05,
      value: get(),
      label: i18next.t(`volhell:settings.${labelKey}`),
      formatValue: (value) => `${Math.round(value * 100)}%`,
      onCommit: (value) => {
        void set(value);
        this.playCommitSound();
      },
    });
  }

  private refreshLabels(): void {
    this.languageText.setContent(i18next.t('volhell:settings.language'));
    this.languageSelect.setOptions(
      i18n.getLocales().map((locale) => ({ value: locale, label: this.localeLabel(locale) })),
    );
    this.languageSelect.setValue(i18n.getLocale());
    this.soundText.setContent(i18next.t('volhell:settings.sound'));
    this.masterSlider.setLabel(i18next.t('volhell:settings.master'));
    this.sfxSlider.setLabel(i18next.t('volhell:settings.sfx'));
    this.musicSlider.setLabel(i18next.t('volhell:settings.music'));
    this.ambientSlider.setLabel(i18next.t('volhell:settings.ambient'));
    this.shakeCheckbox.setLabel(i18next.t('volhell:settings.shake'));
    this.hapticsCheckbox.setLabel(i18next.t('volhell:settings.haptics'));
    this.shakeSlider.setLabel(i18next.t('volhell:settings.shakeIntensity'));
    this.muteCheckbox.setLabel(i18next.t('volhell:settings.mute'));
    this.videoText?.setContent(i18next.t('volhell:settings.video'));
    this.displayModeText?.setContent(i18next.t('volhell:settings.displayMode'));
    this.resolutionText?.setContent(i18next.t('volhell:settings.resolution'));
    this.graphicsQualityText?.setContent(i18next.t('volhell:settings.graphicsQuality'));
    this.displayModeSelect?.setOptions([
      { value: 'windowed', label: i18next.t('volhell:settings.windowed') },
      { value: 'fullscreen', label: i18next.t('volhell:settings.fullscreen') },
    ]);
    this.graphicsQualitySelect?.setOptions(
      (Object.keys(videoConfig.quality) as GraphicsQuality[]).map((quality) => ({
        value: quality,
        label: this.qualityLabel(quality),
      })),
    );
  }

  private syncAudio(data: AudioSettingsData): void {
    this.masterSlider.setValue(data.masterVolume);
    this.sfxSlider.setValue(data.sfxVolume);
    this.musicSlider.setValue(data.musicVolume);
    this.ambientSlider.setValue(data.ambientVolume);
    this.shakeCheckbox.setChecked(data.screenShakeEnabled);
    this.hapticsCheckbox.setChecked(data.hapticsEnabled);
    this.shakeSlider.setValue(data.screenShakeIntensity);
    this.muteCheckbox.setChecked(data.muted);
  }

  private syncVideo(data: VideoSettingsData): void {
    this.displayModeSelect?.setValue(data.displayMode);
    this.resolutionSelect?.setValue(data.resolution);
    this.resolutionSelect?.setDisabled(data.displayMode === 'fullscreen');
    this.graphicsQualitySelect?.setValue(data.graphicsQuality);
  }

  private localeLabel(locale: string): string {
    if (locale === 'tr') return i18next.t('volhell:settings.localeTr');
    if (locale === 'en') return i18next.t('volhell:settings.localeEn');
    return locale.toUpperCase();
  }

  private qualityLabel(quality: GraphicsQuality): string {
    if (quality === 'low') return i18next.t('volhell:settings.qualityLow');
    if (quality === 'balanced') return i18next.t('volhell:settings.qualityBalanced');
    return i18next.t('volhell:settings.qualityHigh');
  }

  private playCommitSound(): void {
    void gameAudio.playSfx('menuBlip', { volume: sfxVolumes.menuBlip });
  }
}
