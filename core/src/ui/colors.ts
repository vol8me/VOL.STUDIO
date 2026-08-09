export const VOL_COLORS = {
  // yüzey
  uiBg: '#0d1115',
  uiBgSubtle: '#12181e',
  uiSurface1: '#182028',
  uiSurface2: '#212a33',
  uiSurface3: '#2a3540',
  uiBorderSoft: '#34414d',
  uiBorderStrong: '#495865',

  // metin
  uiText: '#e8eef5',
  uiTextSecondary: '#b5c1cc',
  uiTextMuted: '#83919d',
  uiTextDisabled: '#5d6a75',
  uiIcon: '#9aa7b3',

  // marka
  brandSolid: '#b85518',
  brandHover: '#d67434',
  brandPressed: '#a04a18',
  brandSubtle: '#352217',
  brandBorder: '#864a2c',
  onBrand: '#fff6f0',

  // destek
  supportSolid: '#246a79',
  supportHover: '#2c7483',
  supportPressed: '#1b505c',
  supportSubtle: '#15292f',
  supportBorder: '#2d5863',
  onSupport: '#eafbfd',

  // vurgu
  accentSolid: '#565dbe',
  accentHover: '#5c63c8',
  accentPressed: '#3d438f',
  accentSubtle: '#23274d',
  accentBorder: '#6269c4',
  onAccent: '#f5f6ff',

  // anlamsal: başarı
  successSolid: '#307a57',
  successSubtle: '#163126',
  successBorder: '#2c6b4d',
  onSuccess: '#eaf7f0',

  // anlamsal: uyarı
  warningSolid: '#d2a03c',
  warningSubtle: '#3b2c12',
  warningBorder: '#6e5526',
  onWarning: '#1e1605',

  // anlamsal: tehlike
  dangerSolid: '#b94a4a',
  dangerSubtle: '#3a1e21',
  dangerBorder: '#8e3636',
  onDanger: '#fff0f0',

  // anlamsal: bilgi
  infoSolid: '#356eb0',
  infoSubtle: '#18283e',
  infoBorder: '#2c557f',
  onInfo: '#eaf3fb',

  // etkileşim
  hoverFill: '#19222a',
  pressedFill: '#202b34',
  selectedFill: '#2a3844',
  focusRing: '#ffd37a',
  focusHalo: '#fff1c133',
  disabledFill: '#1b2128',
  disabledBorder: '#2a333c',
  disabledText: '#5c6772',

  // kaplama
  inverseSurface: '#eaf0f6',
  inverseText: '#11161a',
  overlayPanel: '#11171dd9',
  scrim: '#05070ab8',
  hairlineAlpha: '#ffffff14',
  selectionGlow: '#7c84ff33',
} as const;

export type VolColorToken = keyof typeof VOL_COLORS;
