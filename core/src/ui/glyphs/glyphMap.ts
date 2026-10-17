import { GAMEPAD_BUTTON } from '../../input/gamepad';

/** Glif aileleri. `keyboard` Kenney paketindeki "Keyboard & Mouse" birleşiğidir; fare dosyaları da onda yaşar. */
export type GlyphFamily = 'valve' | 'xbox' | 'playstation' | 'nintendo' | 'keyboard';

/**
 * Mantıksal girdi slotları. Konumsal standart düzen esastır: `faceDown`
 * gamepad standardının 0. düğmesidir; Switch'te bu B'ye karşılık gelir.
 * `key` yalnız `keyboard` ailesinde anlamlıdır ve `Glyph`'in `key`
 * seçeneğiyle birlikte kullanılır.
 */
export type GlyphName =
  | 'faceDown'
  | 'faceRight'
  | 'faceLeft'
  | 'faceUp'
  | 'leftBumper'
  | 'rightBumper'
  | 'leftTrigger'
  | 'rightTrigger'
  | 'select'
  | 'start'
  | 'guide'
  | 'quickAccess'
  | 'gripLeftInner'
  | 'gripLeftOuter'
  | 'gripRightInner'
  | 'gripRightOuter'
  | 'stickLeft'
  | 'stickRight'
  | 'stickLeftPress'
  | 'stickRightPress'
  | 'dpadUp'
  | 'dpadDown'
  | 'dpadLeft'
  | 'dpadRight'
  | 'trackpadLeft'
  | 'trackpadRight'
  | 'key'
  | 'mouse'
  | 'mouseLeft'
  | 'mouseRight'
  | 'mouseScroll'
  | 'mouseMove';

/** Aile → slot → `assets/glyphs/<aile>/<dosya>.svg` gövdeleri. Dosya adları kaynak paketteki hâlleridir. */
const GLYPH_FILES: Readonly<Record<GlyphFamily, Readonly<Partial<Record<GlyphName, string>>>>> = {
  valve: {
    faceDown: 'steamdeck_button_a',
    faceRight: 'steamdeck_button_b',
    faceLeft: 'steamdeck_button_x',
    faceUp: 'steamdeck_button_y',
    leftBumper: 'steamdeck_button_l1',
    rightBumper: 'steamdeck_button_r1',
    leftTrigger: 'steamdeck_button_l2',
    rightTrigger: 'steamdeck_button_r2',
    select: 'steamdeck_button_view',
    start: 'steamdeck_button_options',
    guide: 'steamdeck_button_guide',
    quickAccess: 'steamdeck_button_quickaccess',
    gripLeftInner: 'steamdeck_button_l4',
    gripLeftOuter: 'steamdeck_button_l5',
    gripRightInner: 'steamdeck_button_r4',
    gripRightOuter: 'steamdeck_button_r5',
    stickLeft: 'steamdeck_stick_l',
    stickRight: 'steamdeck_stick_r',
    stickLeftPress: 'steamdeck_stick_l_press',
    stickRightPress: 'steamdeck_stick_r_press',
    dpadUp: 'steamdeck_dpad_up',
    dpadDown: 'steamdeck_dpad_down',
    dpadLeft: 'steamdeck_dpad_left',
    dpadRight: 'steamdeck_dpad_right',
    trackpadLeft: 'steamdeck_trackpad_l',
    trackpadRight: 'steamdeck_trackpad_r',
  },
  xbox: {
    faceDown: 'xbox_button_a',
    faceRight: 'xbox_button_b',
    faceLeft: 'xbox_button_x',
    faceUp: 'xbox_button_y',
    leftBumper: 'xbox_lb',
    rightBumper: 'xbox_rb',
    leftTrigger: 'xbox_lt',
    rightTrigger: 'xbox_rt',
    select: 'xbox_button_view',
    start: 'xbox_button_menu',
    stickLeft: 'xbox_stick_l',
    stickRight: 'xbox_stick_r',
    stickLeftPress: 'xbox_stick_l_press',
    stickRightPress: 'xbox_stick_r_press',
    dpadUp: 'xbox_dpad_up',
    dpadDown: 'xbox_dpad_down',
    dpadLeft: 'xbox_dpad_left',
    dpadRight: 'xbox_dpad_right',
  },
  playstation: {
    faceDown: 'playstation_button_cross',
    faceRight: 'playstation_button_circle',
    faceLeft: 'playstation_button_square',
    faceUp: 'playstation_button_triangle',
    leftBumper: 'playstation_trigger_l1',
    rightBumper: 'playstation_trigger_r1',
    leftTrigger: 'playstation_trigger_l2',
    rightTrigger: 'playstation_trigger_r2',
    select: 'playstation5_button_create',
    start: 'playstation5_button_options',
    stickLeft: 'playstation_stick_l',
    stickRight: 'playstation_stick_r',
    stickLeftPress: 'playstation_stick_l_press',
    stickRightPress: 'playstation_stick_r_press',
    dpadUp: 'playstation_dpad_up',
    dpadDown: 'playstation_dpad_down',
    dpadLeft: 'playstation_dpad_left',
    dpadRight: 'playstation_dpad_right',
  },
  nintendo: {
    // Konumsal eşleme: Switch'te sağ yüz düğmesi A, alt yüz düğmesi B'dir.
    faceDown: 'switch_button_b',
    faceRight: 'switch_button_a',
    faceLeft: 'switch_button_y',
    faceUp: 'switch_button_x',
    leftBumper: 'switch_button_l',
    rightBumper: 'switch_button_r',
    leftTrigger: 'switch_button_zl',
    rightTrigger: 'switch_button_zr',
    select: 'switch_button_minus',
    start: 'switch_button_plus',
    guide: 'switch_button_home',
    stickLeft: 'switch_stick_l',
    stickRight: 'switch_stick_r',
    stickLeftPress: 'switch_stick_l_press',
    stickRightPress: 'switch_stick_r_press',
    dpadUp: 'switch_dpad_up',
    dpadDown: 'switch_dpad_down',
    dpadLeft: 'switch_dpad_left',
    dpadRight: 'switch_dpad_right',
  },
  keyboard: {
    key: 'keyboard',
    mouse: 'mouse',
    mouseLeft: 'mouse_left',
    mouseRight: 'mouse_right',
    mouseScroll: 'mouse_scroll',
    mouseMove: 'mouse_move',
  },
};

/**
 * `key` slotunun adlandırılmış tuş eşlemesi — harf ve rakamlar doğrudan
 * dosya adı olarak çözülür (`keyboard_<küçük harf>.svg`), bu tablo yalnız
 * adlı tuşları taşır.
 */
const NAMED_KEY_FILES: Readonly<Record<string, string>> = {
  escape: 'keyboard_escape',
  esc: 'keyboard_escape',
  enter: 'keyboard_enter',
  return: 'keyboard_enter',
  space: 'keyboard_space_icon',
  shift: 'keyboard_shift',
  control: 'keyboard_ctrl',
  ctrl: 'keyboard_ctrl',
  tab: 'keyboard_tab',
  backspace: 'keyboard_backspace',
  arrowup: 'keyboard_arrow_up',
  arrowdown: 'keyboard_arrow_down',
  arrowleft: 'keyboard_arrow_left',
  arrowright: 'keyboard_arrow_right',
};

const KEY_FILE_RE = /^[a-z0-9]$/;

/** Klavye tuş adı → dosya gövdesi. Tanınmayan tuş `undefined` döner. */
export function keyboardKeyFile(key: string): string | undefined {
  const normalized = key.trim().toLowerCase();
  if (NAMED_KEY_FILES[normalized]) return NAMED_KEY_FILES[normalized];
  if (KEY_FILE_RE.test(normalized)) return `keyboard_${normalized}`;
  return undefined;
}

/** Mantıksal slot + aile → dosya gövdesi. `name === 'key'` için `key` gerekir. */
export function glyphFile(name: GlyphName, family: GlyphFamily, key?: string): string | undefined {
  if (name === 'key' && family === 'keyboard') {
    if (key !== undefined) return keyboardKeyFile(key);
    return GLYPH_FILES.keyboard.key;
  }
  return GLYPH_FILES[family][name];
}

/**
 * Slotun SVG kaynağı. `baseUrl` sona `/` almadan verilir
 * (varsayılan `assets/glyphs`); tüketici kendi public kökünü geçer.
 */
export function glyphUrl(
  name: GlyphName,
  family: GlyphFamily,
  key?: string,
  baseUrl = 'assets/glyphs',
): string | undefined {
  const file = glyphFile(name, family, key);
  return file === undefined ? undefined : `${baseUrl}/${family}/${file}.svg`;
}

const BUTTON_TO_GLYPH: Readonly<Record<string, GlyphName>> = {
  [GAMEPAD_BUTTON.primary]: 'faceDown',
  [GAMEPAD_BUTTON.secondary]: 'faceRight',
  [GAMEPAD_BUTTON.tertiary]: 'faceLeft',
  [GAMEPAD_BUTTON.quaternary]: 'faceUp',
  [GAMEPAD_BUTTON.leftBumper]: 'leftBumper',
  [GAMEPAD_BUTTON.rightBumper]: 'rightBumper',
  [GAMEPAD_BUTTON.leftTrigger]: 'leftTrigger',
  [GAMEPAD_BUTTON.rightTrigger]: 'rightTrigger',
  [GAMEPAD_BUTTON.select]: 'select',
  [GAMEPAD_BUTTON.start]: 'start',
  [GAMEPAD_BUTTON.leftStick]: 'stickLeftPress',
  [GAMEPAD_BUTTON.rightStick]: 'stickRightPress',
  [GAMEPAD_BUTTON.dpadUp]: 'dpadUp',
  [GAMEPAD_BUTTON.dpadDown]: 'dpadDown',
  [GAMEPAD_BUTTON.dpadLeft]: 'dpadLeft',
  [GAMEPAD_BUTTON.dpadRight]: 'dpadRight',
  [GAMEPAD_BUTTON.home]: 'guide',
};

/** Standart düzen düğme dizini → mantıksal glif slotu. Tanınmayan düğme `undefined`. */
export function glyphNameForButton(button: number): GlyphName | undefined {
  return BUTTON_TO_GLYPH[button];
}
