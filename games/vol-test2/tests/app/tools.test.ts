import { describe, expect, it } from 'vitest';
import { KIND } from '../../src/config/factory';
import { TOOLS } from '../../src/config/game';
import { ACK_APPLIED_UNKNOWN } from '../../src/net/session';
import { COMMAND, RESULT } from '../../src/sim/commands';
import { commandFor, nextRotation, resultKey, toolForKey } from '../../src/app/tools';
import en from '../../src/i18n/en.json';

describe('commandFor', () => {
  it('yapı araçları o türü verilen yönde yerleştirir', () => {
    expect(commandFor('conveyor', 3, 4, 2)).toEqual({
      type: COMMAND.place,
      x: 3,
      y: 4,
      kind: KIND.conveyor,
      rot: 2,
    });
    expect(commandFor('turret', 1, 1, 0)).toMatchObject({ kind: KIND.turret });
  });

  it('sil aracı silme komutu üretir', () => {
    expect(commandFor('remove', 7, 8, 3)).toEqual({ type: COMMAND.remove, x: 7, y: 8 });
  });

  it('her araç bir komut üretir', () => {
    for (const tool of TOOLS) expect(commandFor(tool.id, 0, 0, 0).type).toBeGreaterThan(0);
  });
});

describe('resultKey', () => {
  it('başarı ve belirsiz sonuç mesaj üretmez', () => {
    expect(resultKey(RESULT.ok)).toBeNull();
    expect(resultKey(ACK_APPLIED_UNKNOWN)).toBeNull();
  });

  it('her hata sonucunun iki dilde de çevirisi vardır', () => {
    for (const [name, value] of Object.entries(RESULT)) {
      if (value === RESULT.ok) continue;
      const key = resultKey(value);
      expect(key, name).not.toBeNull();
      const leaf = key!.replace('result.', '') as keyof typeof en.result;
      expect(en.result[leaf], name).toBeTypeOf('string');
    }
  });

  it('bilinmeyen sonuç geçersiz komut mesajına düşer', () => {
    expect(resultKey(200)).toBe('result.malformed');
  });
});

describe('yön ve kısayol', () => {
  it('yön dört adımda başa döner', () => {
    let rot = 0;
    for (let step = 0; step < 4; step++) rot = nextRotation(rot);
    expect(rot).toBe(0);
    expect(nextRotation(3)).toBe(0);
  });

  it('toolForKey tanınmayan tuşa null verir', () => {
    expect(toolForKey('1')).toBe('conveyor');
    expect(toolForKey('9')).toBeNull();
  });
});
