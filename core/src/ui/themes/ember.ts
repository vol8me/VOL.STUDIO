import type { VolThemeOverrides } from './types';

/**
 * `ember` teması: sıcak kömür yüzeyler, kor turuncusu marka. Tema yalnız renk
 * (ve ışıma/kenar yoğunluğu, scrim) değiştirir; font, boşluk ve geometri
 * tokenlarına dokunmaz. Nadirlik renkleri kimliktir ve temayla değişmez.
 *
 * Bu dosya `core/scripts/gen-theme.mjs` tarafından doğrudan yüklenir: düz sabit,
 * yalnız tür içe aktarımı. Değerler gerçek metin/zemin çiftlerinde ölçülmüştür
 * (`core/tests/ui/themes/ember.test.ts`): metin ≥4.5:1, ikon ve odak halkası
 * ≥3:1, üzerinde metin taşıyan marka dolguları ≥4.5:1, güçlü kenarlık ≥3:1.
 * Marka `hover` bilinçli olarak varsayılandan farklı ele alınır: üstündeki
 * `onBrand` metni AA'yı korusun diye hover yalnızca bir kademe açılır.
 */
export const VOL_EMBER_OVERRIDES: VolThemeOverrides = {
  // yüzey
  uiBg: '#140e0b',
  uiBgSubtle: '#1a120e',
  uiSurface1: '#221813',
  uiSurface2: '#2c1f18',
  uiSurface3: '#382820',
  uiBorderSoft: '#5a4434',
  uiBorderStrong: '#8c6c55',

  // metin
  uiText: '#f6ece4',
  uiTextSecondary: '#d2c0b2',
  uiTextMuted: '#b3a193',
  uiTextDisabled: '#7a6a5d',
  uiIcon: '#c9b4a4',

  // marka
  brandSolid: '#a8420f',
  brandHover: '#b84c16',
  brandPressed: '#8f380b',
  brandSubtle: '#3a1e12',
  brandBorder: '#8c4a2a',
  onBrand: '#fff7f1',

  // etkileşim
  hoverFill: '#271b15',
  pressedFill: '#33231a',
  selectedFill: '#3a2a21',
  focusRing: '#ffc761',
  focusHalo: '#ffc76133',
  disabledFill: '#1e1511',
  disabledBorder: '#3a2a20',
  disabledText: '#7a6a5d',

  // kaplama
  inverseSurface: '#f3e6da',
  inverseText: '#1c120d',
  overlayPanel: '#1a110dd9',
  scrim: '#0a0605b8',
  hairlineAlpha: '#ffd8b814',
  selectionGlow: '#ff8a3d33',

  // yüzey rolleri
  page: '#140e0b',
  well: '#0f0a08',
  panel: '#221813',
  plate: '#2c1f18',
  plateTopLight: '#ffd8b81f',
  wellInnerShadow: '#00000080',

  // çerçeve
  frameHairline: '#5a4434',
  frameCorner: '#b4673a',
  frameHeader: '#2a1d16',
  frameDivider: '#3a2a21',

  // emissive ışıma: kor tonlu
  glowBrand: '#ff8a3d66',
  glowSupport: '#3f8b9a4d',
  glowSuccess: '#4a9a704d',
  glowWarning: '#e3b24d66',
  glowDanger: '#d2605a66',
};
