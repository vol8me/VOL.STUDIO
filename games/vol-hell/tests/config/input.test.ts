import { describe, it, expect } from 'vitest';
import Phaser from 'phaser';
import {
  HELL_ACTIONS,
  HELL_AIM_STICK_ACTION,
  HELL_MOVE_KEYS,
  HELL_PC_BINDINGS,
  type HellAction,
} from '@/config/input';

/**
 * Eylem sözlüğü ve tuş eşlemesi VERİDİR (bkz. src/config/input.ts): CORE
 * hiçbir eylem adı bilmez, bu dosya tanımlar. Sözleşmenin bozulması sessizce
 * "tuş çalışmıyor" olarak görünür, bu yüzden yapısal olarak doğrulanır.
 */
describe('VOL.HELL eylem eşlemesi', () => {
  it('her tanınan eylemin bir PC bağlantısı var (eksik = o tuş hiç çalışmaz)', () => {
    for (const action of HELL_ACTIONS) {
      expect(HELL_PC_BINDINGS[action], action).toBeDefined();
    }
    // Ters yön: eşlemede tanınmayan bir eylem olmamalı (ölü bağlantı).
    const known = new Set<string>(HELL_ACTIONS);
    for (const action of Object.keys(HELL_PC_BINDINGS)) {
      expect(known.has(action), `${action} HELL_ACTIONS içinde yok`).toBe(true);
    }
  });

  it('nişan stick eylemi tanınan eylemler arasında', () => {
    expect(HELL_ACTIONS).toContain(HELL_AIM_STICK_ACTION);
  });

  it('ham keyCode değerleri Phaser tablosuyla aynı (sessiz sapma bekçisi)', () => {
    const codes = Phaser.Input.Keyboard.KeyCodes;
    const dash = HELL_PC_BINDINGS.dash;
    expect(dash.source).toBe('key');
    if (dash.source === 'key') {
      expect(dash.keyCode).toBe(codes.SPACE);
    }
    expect(HELL_MOVE_KEYS).toEqual({
      up: codes.W,
      down: codes.S,
      left: codes.A,
      right: codes.D,
    });
  });

  it('fire fare sol düğmesine bağlı — dokunmatikle karışmayı CORE önler', () => {
    expect(HELL_PC_BINDINGS.fire).toEqual({ source: 'pointerButton', button: 'left' });
  });

  it('eylem kümesi tekrarsız', () => {
    const unique = new Set<HellAction>(HELL_ACTIONS);
    expect(unique.size).toBe(HELL_ACTIONS.length);
  });
});
