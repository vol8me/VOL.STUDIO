import type { VolThemeOverrides } from './types';

/**
 * `aurum` teması: premium, `default`tan bilinçle uzak bir kimlik. Mor-siyah mürekkep
 * yüzeyler (zemin tonu ~290°), fildişi metin, şampanya altını marka, yeşim destek,
 * ametist vurgu, yakut tehlike; mücevher kutusu hissi. `default` çelik zemin + kor
 * turuncusudur; ikisi marka, destek ve vurgu ailesinde de ayrışır.
 *
 * Tema yalnız renk (ve ışıma/kenar yoğunluğu, scrim) değiştirir; font, boşluk ve
 * geometri tokenlarına dokunmaz. Nadirlik renkleri kimliktir ve temayla değişmez.
 * Bu dosya `core/scripts/gen-theme.mjs` tarafından doğrudan yüklenir: düz sabit,
 * yalnız tür içe aktarımı. Değerler gerçek metin/zemin çiftlerinde ölçülür
 * (`core/tests/ui/themes/aurum.test.ts` ve tema kapısı): metin ≥4.5:1, ikon ve odak
 * halkası ≥3:1, üzerinde metin taşıyan dolgular ≥4.5:1, güçlü kenarlık ≥3:1.
 * Altın açık bir dolgudur: üzerindeki `onBrand` koyu mürekkeptir.
 */
export const VOL_AURUM_OVERRIDES: VolThemeOverrides = {
  // yüzey
  uiBg: '#0e0818',
  uiBgSubtle: '#150e21',
  uiSurface1: '#1d1530',
  uiSurface2: '#271c3c',
  uiSurface3: '#342752',
  uiBorderSoft: '#45386a',
  uiBorderStrong: '#7a69a3',

  // metin
  uiText: '#f5efe3',
  uiTextSecondary: '#d6ccbd',
  uiTextMuted: '#b3a8c2',
  uiTextDisabled: '#756b86',
  uiIcon: '#cbc0d9',

  // marka: şampanya altını
  brandSolid: '#c9a14a',
  brandHover: '#dcb560',
  brandPressed: '#b08a35',
  brandSubtle: '#2e2410',
  brandBorder: '#8e7230',
  onBrand: '#1b1406',

  // destek: yeşim
  supportSolid: '#2f9880',
  supportHover: '#3aa690',
  supportPressed: '#2a8f78',
  supportSubtle: '#11302a',
  supportBorder: '#2b6b5d',
  onSupport: '#021410',

  // vurgu: ametist
  accentSolid: '#a64a92',
  accentHover: '#a94892',
  accentPressed: '#873676',
  accentSubtle: '#321636',
  accentBorder: '#c46bb1',
  onAccent: '#fff4fb',

  // anlamsal
  successSolid: '#2e9467',
  successSubtle: '#11301f',
  successBorder: '#2a7a56',
  onSuccess: '#03150b',
  warningSolid: '#e3a63a',
  warningSubtle: '#3a2a0d',
  warningBorder: '#7a5a1e',
  onWarning: '#1c1304',
  dangerSolid: '#c23b55',
  dangerSubtle: '#3a1520',
  dangerBorder: '#8e2c40',
  onDanger: '#fff0f3',
  infoSolid: '#3a6fba',
  infoSubtle: '#14233e',
  infoBorder: '#2f5ea0',
  onInfo: '#f0f6ff',

  // etkileşim
  hoverFill: '#221a38',
  pressedFill: '#2b2144',
  selectedFill: '#392c58',
  focusRing: '#ffe9a3',
  focusHalo: '#ffe9a333',
  disabledFill: '#1a1230',
  disabledBorder: '#2f2745',
  disabledText: '#756b86',

  // kaplama
  inverseSurface: '#f1ebe0',
  inverseText: '#1a1424',
  overlayPanel: '#140f1fd9',
  scrim: '#07040cb8',
  hairlineAlpha: '#fff0d414',
  selectionGlow: '#d27bd033',

  // yüzey rolleri
  page: '#0e0818',
  well: '#09050f',
  panel: '#1d1530',
  plate: '#271c3c',
  plateTopLight: '#ffeab81f',
  wellInnerShadow: '#00000099',

  // çerçeve
  frameHairline: '#52447a',
  frameCorner: '#c9a14a',
  frameHeader: '#241a38',
  frameDivider: '#3a2d5a',

  // emissive ışıma
  glowBrand: '#e3b95a66',
  glowSupport: '#3fbf9f4d',
  glowSuccess: '#4ac28a4d',
  glowWarning: '#f0b94d66',
  glowDanger: '#e0526d66',
};
