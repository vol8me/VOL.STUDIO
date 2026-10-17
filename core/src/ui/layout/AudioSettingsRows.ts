import { i18next } from '../../i18n/I18n';
import type { UiAudioSettings } from '../../audio/ui/settings';
import { Checkbox } from '../primitives/Checkbox';
import { Slider } from '../primitives/Slider';
import { SettingsRow } from './SettingsForm';

/**
 * Ses sisteminin yüzü: `UiSoundKit` bunu yapısal olarak karşılar. Ayar satırları ses sistemine DOĞRUDAN bağlıdır:
 * kaydırıcıyı sürüklemek kazancı anında değiştirir (taslak/uygula yok; ses ayarı canlı duyulur) ve kalıcılığı kit
 * kendi cihaz kapsamlı anahtarıyla yapar. Satır başka bir kaynaktan (örn. ses laboratuvarı) değişirse
 * `refresh()` denetimleri günceller.
 */
export interface AudioSettingsPort {
  readonly settings: UiAudioSettings;
  setSettings(patch: Partial<UiAudioSettings>): UiAudioSettings;
}

export interface AudioSettingsRows {
  readonly rows: readonly SettingsRow[];
  /** Portun güncel ayarını denetimlere yansıtır (sessiz: yeni niyet/ses üretmez). */
  refresh(): void;
  destroy(): void;
}

const percent = (value: number): string => `${Math.round(value * 100)}%`;

/** Ana seviye, kanal seviyeleri (arayüz, efekt, müzik, konuşma) ve sessize alma satırları. */
export function createAudioSettingsRows(port: AudioSettingsPort): AudioSettingsRows {
  // Anahtarlar statik yazılır: kullanılmayan-anahtar denetimi şablonlu anahtarı göremez.
  const levels: readonly { key: Exclude<keyof UiAudioSettings, 'muted'>; label: string }[] = [
    { key: 'master', label: i18next.t('core:settingsForm.audio.master') },
    { key: 'ui', label: i18next.t('core:settingsForm.audio.ui') },
    { key: 'sfx', label: i18next.t('core:settingsForm.audio.sfx') },
    { key: 'music', label: i18next.t('core:settingsForm.audio.music') },
    { key: 'speech', label: i18next.t('core:settingsForm.audio.speech') },
  ];

  const sliders = new Map<string, Slider>();
  const readouts = new Map<string, HTMLElement>();
  const rows: SettingsRow[] = [];
  for (const { key, label } of levels) {
    // Etiketsiz kaydırıcı değer yazmaz; satırda yüzde okuması denetimin yanında durur (görsel; AT değeri
    // kaydırıcının kendisinden okur).
    const wrap = document.createElement('div');
    wrap.className = 'vol-audio-level';
    const readout = document.createElement('span');
    readout.className = 'vol-audio-level__value';
    readout.setAttribute('aria-hidden', 'true');
    readout.textContent = percent(port.settings[key]);
    const slider = new Slider({
      min: 0,
      max: 1,
      step: 0.05,
      value: port.settings[key],
      formatValue: percent,
      onInput: (value) => {
        readout.textContent = percent(value);
        port.setSettings({ [key]: value });
      },
    });
    wrap.append(slider.element, readout);
    sliders.set(key, slider);
    readouts.set(key, readout);
    rows.push(new SettingsRow({ label, control: { element: wrap }, stackOnNarrow: true }));
  }

  const muted = new Checkbox({
    label: i18next.t('core:settingsForm.audio.muted'),
    variant: 'switch',
    checked: port.settings.muted,
    onCommit: (checked) => port.setSettings({ muted: checked }),
  });
  rows.push(new SettingsRow({ control: muted }));

  return {
    rows,
    refresh: () => {
      const current = port.settings;
      for (const { key } of levels) {
        sliders.get(key)?.setValue(current[key]);
        const readout = readouts.get(key);
        if (readout) readout.textContent = percent(current[key]);
      }
      muted.setChecked(current.muted);
    },
    destroy: () => {
      for (const slider of sliders.values()) slider.destroy();
      muted.destroy();
      for (const row of rows) row.destroy();
    },
  };
}
