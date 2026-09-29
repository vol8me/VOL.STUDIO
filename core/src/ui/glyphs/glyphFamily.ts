import type { GlyphFamily } from './glyphMap';

/**
 * Glif ailesini çözmek için dışarıdan verilen ipuçları. Ürün kodu platform
 * algılaması taşımaz; bu ipuçlarını kim sağlıyorsa (kabuk, tarayıcı,
 * Steamworks katmanı) doğruluğundan o sorumludur.
 */
export interface GlyphFamilyContext {
  /**
   * Steamworks `GetControllerType` adı ya da eşdeğeri (örn.
   * `'steamdeck'`, `'ps5'`, `'xboxone'`, `'switch_pro'`). Tanınırsa
   * listedeki diğer ipuçlarından önce kazanır.
   */
  steamworksType?: string;
  /**
   * `Gamepad.id` dizesi. VID/PID ve ad kalıplarıyla sınıflandırılır;
   * Steam Input'un sanal kolu (`28DE` VID) `valve` sayılır.
   */
  gamepadId?: string;
  /**
   * Steam Input sanal kolunun arkasındaki gerçek aygıt
   * (`SteamVirtualGamepadInfo`); `Gamepad.id` bu durumda Steam'in sanal
   * kolunu gösterir ve gerçek aileyi saklar.
   */
  virtualPad?: { readonly vid: number; readonly type?: string };
  /** `SteamDeck=1` ortam bayrağı ya da eşdeğer oturum işareti. */
  steamDeckSession?: boolean;
}

const VENDOR_FAMILY: ReadonlyMap<number, GlyphFamily> = new Map([
  [0x28de, 'valve'],
  [0x054c, 'playstation'],
  [0x057e, 'nintendo'],
  [0x045e, 'xbox'],
]);

/** `SteamVirtualGamepadInfo` `type=` değerleri. */
const VIRTUAL_TYPE_FAMILY: Readonly<Record<string, GlyphFamily>> = {
  steam: 'valve',
  ps4: 'playstation',
  ps5: 'playstation',
  xbox360: 'xbox',
  xboxone: 'xbox',
  switchpro: 'nintendo',
};

const STEAMWORKS_FAMILY: Readonly<Record<string, GlyphFamily>> = {
  steamdeck: 'valve',
  steamcontroller: 'valve',
  xbox360: 'xbox',
  xboxone: 'xbox',
  ps3: 'playstation',
  ps4: 'playstation',
  ps5: 'playstation',
  switch_pro: 'nintendo',
  switch_joycon: 'nintendo',
  switch: 'nintendo',
};

const GAMEPAD_ID_PATTERNS: ReadonlyArray<readonly [RegExp, GlyphFamily]> = [
  // Valve/Steam her zaman önce: sanal kol "Microsoft X-Box 360 pad" adını
  // taşır; ayırt edici parça 28DE VID'i ya da steam adıdır.
  [/\b28de\b/i, 'valve'],
  [/steam/i, 'valve'],
  [/dualsense|dualshock|playstation|sony|wireless controller/i, 'playstation'],
  [/nintendo|joy-?con|switch|pro controller/i, 'nintendo'],
  [/xbox|xinput|\b045e\b/i, 'xbox'],
];

/** PC-benzeri sağlayıcı kimlikleri → klavye/fare ailesi. */
const PC_PROVIDERS = new Set(['pc', 'keyboard', 'pointer', 'mouse']);
/** Kol-benzeri sağlayıcı kimlikleri → pad bağlamı çözülür. */
const PAD_PROVIDERS = new Set(['gamepad', 'pad', 'controller']);

/**
 * Etkin sağlayıcı kimliğine göre glif ailesi. Kimlikler `InputModeArbiter`'a
 * beslenen aynı dizelerdir; iyi bilinenleri çözülür, tanınmayanlar
 * `null` döner (tüketici glifi gizler — tahmin edilmiş yanlış ikon
 * göstermekten dürüsttür).
 *
 * Kol sağlayıcısında çözüm sırası:
 * 1. `steamworksType` — en doğru kaynak (varsa kazanır).
 * 2. `virtualPad` — Steam Input arkasındaki gerçek aygıt.
 * 3. `gamepadId` kalıpları.
 * 4. `steamDeckSession` — Steam Input kapanıksa fiziksel kol Deck'inkidir.
 * 5. Bilinmeyen pad → `xbox` (standart düzenin varsayılan sunumu).
 */
export function resolveGlyphFamily(
  providerId: string | undefined,
  context: GlyphFamilyContext = {},
): GlyphFamily | null {
  if (providerId === undefined || providerId === 'touch') return null;
  if (PC_PROVIDERS.has(providerId)) return 'keyboard';
  if (!PAD_PROVIDERS.has(providerId)) return null;

  const { steamworksType, virtualPad, gamepadId, steamDeckSession } = context;
  if (steamworksType !== undefined) {
    const family = STEAMWORKS_FAMILY[steamworksType.toLowerCase()];
    if (family !== undefined) return family;
  }
  if (virtualPad !== undefined) {
    const family =
      VIRTUAL_TYPE_FAMILY[(virtualPad.type ?? '').toLowerCase()] ??
      VENDOR_FAMILY.get(virtualPad.vid);
    if (family !== undefined) return family;
  }
  if (gamepadId !== undefined && gamepadId !== '') {
    for (const [pattern, family] of GAMEPAD_ID_PATTERNS) {
      if (pattern.test(gamepadId)) return family;
    }
  }
  if (steamDeckSession) return 'valve';
  return 'xbox';
}
