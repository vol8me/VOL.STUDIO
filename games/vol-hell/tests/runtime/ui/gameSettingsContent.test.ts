import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n, i18next, type SaveManager } from '@volstudio/core';
import { AudioSettings } from '@/app/AudioSettings';
import { VideoSettings } from '@/app/VideoSettings';
import { GameSettingsContent } from '@/runtime/ui/GameSettingsContent';
import trResources from '@/i18n/tr.json';
import enResources from '@/i18n/en.json';

const playSfx = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/app/services', () => ({ gameAudio: { playSfx } }));

function makeSaveManager(): SaveManager {
  return {
    load: vi.fn().mockResolvedValue({}),
    save: vi.fn().mockResolvedValue(undefined),
  } as unknown as SaveManager;
}

describe('GameSettingsContent', () => {
  let audio: AudioSettings;
  let video: VideoSettings;
  let content: GameSettingsContent | null;

  beforeEach(async () => {
    i18n.addResources('tr', 'volhell', trResources);
    i18n.addResources('en', 'volhell', enResources);
    if (!i18next.isInitialized) await i18n.init();
    await i18next.changeLanguage('tr');
    audio = new AudioSettings(makeSaveManager());
    video = new VideoSettings(makeSaveManager());
    content = null;
    playSfx.mockClear();
  });

  afterEach(() => {
    content?.destroy();
    audio.dispose();
    video.dispose();
    document.body.replaceChildren();
  });

  it('masaüstünde dil, tüm ses kontrolleri ve üç görüntü seçimini sunar', () => {
    content = new GameSettingsContent({
      audioSettings: audio,
      videoSettings: video,
      showVideoSettings: true,
    });
    document.body.appendChild(content.element);

    expect(content.element.querySelectorAll('input[type="range"]')).toHaveLength(5);
    expect(content.element.querySelectorAll('input[type="checkbox"]')).toHaveLength(3);
    expect(content.element.querySelectorAll('.vol-select')).toHaveLength(4);
    expect(content.element.querySelector('.vol-game-settings__video')).not.toBeNull();
  });

  it('mobil kipte yalnız masaüstü görüntü bölümünü kaldırır', () => {
    content = new GameSettingsContent({
      audioSettings: audio,
      videoSettings: video,
      showVideoSettings: false,
    });
    document.body.appendChild(content.element);

    expect(content.element.querySelector('.vol-game-settings__video')).toBeNull();
    expect(content.element.querySelectorAll('.vol-select')).toHaveLength(1);
    expect(content.element.querySelectorAll('input[type="range"]')).toHaveLength(5);
  });

  it('slider commitini modele yazar ve menü basım sesi üretir', () => {
    content = new GameSettingsContent({
      audioSettings: audio,
      videoSettings: video,
      showVideoSettings: true,
    });
    document.body.appendChild(content.element);
    const master = content.element.querySelector<HTMLInputElement>('input[type="range"]');
    if (!master) throw new Error('genel ses sliderı kurulmadı');

    master.value = '0.35';
    master.dispatchEvent(new Event('input', { bubbles: true }));
    master.dispatchEvent(new Event('change', { bubbles: true }));

    expect(audio.getMasterVolume()).toBe(0.35);
    expect(playSfx).toHaveBeenCalledWith('menuBlip', expect.any(Object));
  });

  it('haricî fullscreen değişikliğini canlı gösterir ve çözünürlüğü kilitler', async () => {
    content = new GameSettingsContent({
      audioSettings: audio,
      videoSettings: video,
      showVideoSettings: true,
    });
    document.body.appendChild(content.element);
    const selects = content.element.querySelectorAll<HTMLButtonElement>(
      '.vol-game-settings__video .vol-select',
    );

    await video.setDisplayMode('fullscreen');

    expect(selects[0]?.textContent).toContain(trResources.settings.fullscreen);
    expect(selects[1]?.disabled).toBe(true);
  });

  it('dil değişiminde seçili görüntü ve kalite etiketlerini de yeniler', async () => {
    content = new GameSettingsContent({
      audioSettings: audio,
      videoSettings: video,
      showVideoSettings: true,
    });
    document.body.appendChild(content.element);
    const selects = content.element.querySelectorAll<HTMLButtonElement>(
      '.vol-game-settings__video .vol-select',
    );

    expect(selects[0]?.textContent).toContain(trResources.settings.windowed);
    expect(selects[2]?.textContent).toContain(trResources.settings.qualityHigh);
    await i18next.changeLanguage('en');
    expect(selects[0]?.textContent).toContain(enResources.settings.windowed);
    expect(selects[2]?.textContent).toContain(enResources.settings.qualityHigh);
  });

  it('destroy tüm popup/listener yüzeyini bırakır ve ikinci çağrı güvenlidir', () => {
    const off = vi.spyOn(i18next, 'off');
    content = new GameSettingsContent({
      audioSettings: audio,
      videoSettings: video,
      showVideoSettings: true,
    });
    document.body.appendChild(content.element);

    content.destroy();
    content.destroy();
    content = null;

    expect(document.querySelector('.vol-game-settings')).toBeNull();
    expect(document.querySelector('.vol-select__listbox')).toBeNull();
    expect(off).toHaveBeenCalledWith('languageChanged', expect.any(Function));
    off.mockRestore();
  });
});
