/**
 * Phaser taşımayan UI ses yüzeyi (`@volstudio/core/audio/ui`): anlamsal UI
 * olaylarının sesi ve cihaz kapsamlı ses ayarları. Web araçları (vitrin) ve oyunlar
 * bu alt yolu kullanır; kök barrel oyun runtime'ını da ihraç eder.
 */
export {
  UI_SOUND_PUBLIC_DIR,
  UI_SOUND_VARIANT_KEYS,
  uiSoundAssets,
  uiSoundFileStem,
} from './assets';
export {
  UiSoundKit,
  type UiSoundKitOptions,
  type UiSoundKitState,
  type UiSoundLoadReport,
  type UiSoundMetrics,
  type UiSoundThemeSource,
  type UiSoundPlayOptions,
} from './UiSoundKit';
export {
  DEFAULT_UI_SOUND_PALETTE,
  UI_CRITICAL_DUCK,
  uiDuckProfiles,
  UI_CRITICAL_EVENTS,
  UI_INTENT_SOUND,
  UI_MAX_VARIANTS,
  UI_MAX_VOICES,
  UI_MICRO_EVENTS,
  UI_MICRO_GAP_MS,
  UI_OUTCOME_SOUND,
  UI_RATE_JITTER,
  UI_SLIDER_RATE_RANGE,
  UI_SOUND_EVENTS,
  UI_SOUND_PALETTES,
  UI_THEME_SOUND_PALETTE,
  uiSoundPaletteFor,
  type UiSoundAssets,
  type UiSoundEvent,
  type UiSoundPalette,
} from './events';
export {
  DEFAULT_UI_AUDIO_SETTINGS,
  UI_AUDIO_CHANNELS,
  UI_AUDIO_STORAGE_KEY,
  channelGain,
  normalizeUiAudioSettings,
  type UiAudioChannel,
  type UiAudioSettings,
  type UiAudioSettingsStore,
} from './settings';
