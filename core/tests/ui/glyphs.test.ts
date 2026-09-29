import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  Glyph,
  glyphFile,
  glyphUrl,
  glyphNameForButton,
  keyboardKeyFile,
  resolveGlyphFamily,
  type GlyphFamily,
  type GlyphName,
} from '../../src/ui/glyphs';
import { GAMEPAD_BUTTON } from '../../src/input/GamepadState';

const GLYPHS_DIR = resolve(__dirname, '../../public/assets/glyphs');

const ALL_NAMES: GlyphName[] = [
  'faceDown',
  'faceRight',
  'faceLeft',
  'faceUp',
  'leftBumper',
  'rightBumper',
  'leftTrigger',
  'rightTrigger',
  'select',
  'start',
  'guide',
  'quickAccess',
  'gripLeftInner',
  'gripLeftOuter',
  'gripRightInner',
  'gripRightOuter',
  'stickLeft',
  'stickRight',
  'stickLeftPress',
  'stickRightPress',
  'dpadUp',
  'dpadDown',
  'dpadLeft',
  'dpadRight',
  'trackpadLeft',
  'trackpadRight',
  'key',
  'mouse',
  'mouseLeft',
  'mouseRight',
  'mouseScroll',
  'mouseMove',
];

const FAMILIES: GlyphFamily[] = ['valve', 'xbox', 'playstation', 'nintendo', 'keyboard'];

describe('glyphFile', () => {
  it('eşleme tablosundaki her dosya diskte var', () => {
    const missing: string[] = [];
    for (const family of FAMILIES) {
      for (const name of ALL_NAMES) {
        const file = glyphFile(name, family);
        if (file === undefined) continue;
        const path = resolve(GLYPHS_DIR, family, `${file}.svg`);
        if (!existsSync(path)) missing.push(`${family}/${file}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('konumsal eşleme: faceDown Xbox A, PlayStation cross, Switch B', () => {
    expect(glyphFile('faceDown', 'xbox')).toBe('xbox_button_a');
    expect(glyphFile('faceDown', 'playstation')).toBe('playstation_button_cross');
    expect(glyphFile('faceDown', 'nintendo')).toBe('switch_button_b');
    expect(glyphFile('faceDown', 'valve')).toBe('steamdeck_button_a');
  });

  it('ailenin taşımadığı slot undefined döner (sessiz tahmin yok)', () => {
    expect(glyphFile('trackpadLeft', 'xbox')).toBeUndefined();
    expect(glyphFile('trackpadLeft', 'valve')).toBe('steamdeck_trackpad_l');
    expect(glyphFile('faceDown', 'keyboard')).toBeUndefined();
  });
});

describe('keyboardKeyFile', () => {
  it('harf, rakam ve adlı tuşları çözer', () => {
    expect(keyboardKeyFile('w')).toBe('keyboard_w');
    expect(keyboardKeyFile('5')).toBe('keyboard_5');
    expect(keyboardKeyFile('Escape')).toBe('keyboard_escape');
    expect(keyboardKeyFile('ArrowUp')).toBe('keyboard_arrow_up');
  });

  it('tanınmayan tuş undefined döner', () => {
    expect(keyboardKeyFile('f20')).toBeUndefined();
    expect(keyboardKeyFile('')).toBeUndefined();
    // Birden çok harf dosya adı üretmez (path sızıntısı yok)
    expect(keyboardKeyFile('wasd')).toBeUndefined();
  });
});

describe('glyphUrl', () => {
  it('aile ve dosya ile yol üretir', () => {
    expect(glyphUrl('faceDown', 'xbox')).toBe('assets/glyphs/xbox/xbox_button_a.svg');
    expect(glyphUrl('key', 'keyboard', 'w')).toBe('assets/glyphs/keyboard/keyboard_w.svg');
  });

  it('eşlemesiz slot undefined döner', () => {
    expect(glyphUrl('gripLeftInner', 'xbox')).toBeUndefined();
  });
});

describe('glyphNameForButton', () => {
  it('standart düğme dizinlerini slota çevirir', () => {
    expect(glyphNameForButton(GAMEPAD_BUTTON.primary)).toBe('faceDown');
    expect(glyphNameForButton(GAMEPAD_BUTTON.start)).toBe('start');
    expect(glyphNameForButton(GAMEPAD_BUTTON.dpadUp)).toBe('dpadUp');
    expect(glyphNameForButton(GAMEPAD_BUTTON.leftStick)).toBe('stickLeftPress');
    expect(glyphNameForButton(99)).toBeUndefined();
  });
});

describe('resolveGlyphFamily', () => {
  it('pc-benzeri kimlikler keyboard, touch ve tanınmayanlar null verir', () => {
    expect(resolveGlyphFamily('pc')).toBe('keyboard');
    expect(resolveGlyphFamily('keyboard')).toBe('keyboard');
    expect(resolveGlyphFamily('touch')).toBeNull();
    expect(resolveGlyphFamily('kinetic-eye')).toBeNull();
    expect(resolveGlyphFamily(undefined)).toBeNull();
  });

  it('steamworksType her ipucundan önce kazanır', () => {
    expect(
      resolveGlyphFamily('gamepad', {
        steamworksType: 'ps5',
        gamepadId: 'Xbox 360 Controller',
      }),
    ).toBe('playstation');
    expect(resolveGlyphFamily('gamepad', { steamworksType: 'steamdeck' })).toBe('valve');
  });

  it('gamepadId kalıpları: Steam Input sanal kolu valve sayılır', () => {
    expect(
      resolveGlyphFamily('gamepad', { gamepadId: 'Microsoft X-Box 360 pad 0 (28DE:11FF)' }),
    ).toBe('valve');
    expect(resolveGlyphFamily('gamepad', { gamepadId: 'Sony Interactive DualSense' })).toBe(
      'playstation',
    );
    expect(resolveGlyphFamily('gamepad', { gamepadId: 'Nintendo Switch Pro Controller' })).toBe(
      'nintendo',
    );
    expect(resolveGlyphFamily('gamepad', { gamepadId: 'Xbox 360 Controller' })).toBe('xbox');
  });

  it('bilinmeyen pad: steamDeckSession → valve, yoksa xbox varsayılanı', () => {
    expect(resolveGlyphFamily('gamepad', { steamDeckSession: true })).toBe('valve');
    expect(resolveGlyphFamily('gamepad', { gamepadId: 'Generic Pad' })).toBe('xbox');
    expect(resolveGlyphFamily('gamepad')).toBe('xbox');
  });
});

describe('Glyph', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
  });

  it('aile/slot için img src kurar', () => {
    const g = new Glyph({ name: 'faceDown', family: 'xbox' });
    host.appendChild(g.element);
    const img = g.element.querySelector('img')!;
    expect(img.hidden).toBe(false);
    expect(img.src).toContain('assets/glyphs/xbox/xbox_button_a.svg');
    g.destroy();
  });

  it('aile yoksa gizlenir, sonra canlı güncellenir', () => {
    const g = new Glyph({ name: 'faceDown' });
    host.appendChild(g.element);
    expect(g.element.hidden).toBe(true);
    g.setFamily('playstation');
    expect(g.element.hidden).toBe(false);
    const img = g.element.querySelector('img')!;
    expect(img.src).toContain('playstation_button_cross.svg');
    g.setFamily(null);
    expect(g.element.hidden).toBe(true);
    g.destroy();
  });

  it('eşlemesiz slotta metin çipi gösterir', () => {
    const g = new Glyph({ name: 'trackpadLeft', family: 'xbox', label: 'LT Pad' });
    host.appendChild(g.element);
    const img = g.element.querySelector('img')!;
    const text = g.element.querySelector('.vol-glyph__text')!;
    expect(img.hidden).toBe(true);
    expect(text.textContent).toBe('LT Pad');
    expect(g.element.getAttribute('aria-label')).toBe('LT Pad');
    g.destroy();
  });

  it('keyboard ailesinde key ile dosya çözer', () => {
    const g = new Glyph({ name: 'key', family: 'keyboard', key: 'w', label: 'W' });
    host.appendChild(g.element);
    const img = g.element.querySelector('img')!;
    expect(img.src).toContain('keyboard/keyboard_w.svg');
    g.destroy();
  });
});

describe('resolveGlyphFamily — Steam sanal kolunun arkasındaki aygıt', () => {
  const steamVirtual = 'Microsoft X-Box 360 pad 0 (STANDARD GAMEPAD Vendor: 28de Product: 11ff)';

  it('sanal kol kimliği yerine gerçek aygıtın türü kazanır', () => {
    expect(resolveGlyphFamily('gamepad', { gamepadId: steamVirtual })).toBe('valve');
    expect(
      resolveGlyphFamily('gamepad', {
        gamepadId: steamVirtual,
        virtualPad: { vid: 0x054c, type: 'ps5' },
      }),
    ).toBe('playstation');
    expect(resolveGlyphFamily('gamepad', { virtualPad: { vid: 0x057e } })).toBe('nintendo');
  });

  it('Steamworks türü yine önceliklidir; tanınmayan sanal kol sıradakine düşer', () => {
    expect(
      resolveGlyphFamily('gamepad', {
        steamworksType: 'xboxone',
        virtualPad: { vid: 0x054c, type: 'ps5' },
      }),
    ).toBe('xbox');
    expect(
      resolveGlyphFamily('gamepad', { virtualPad: { vid: 0x1234 }, steamDeckSession: true }),
    ).toBe('valve');
  });
});
