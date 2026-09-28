import { describe, expect, it } from 'vitest';
import { selectGamepad } from '../../src/input/selectGamepad';
import type { PadLike } from '../../src/input/GamepadState';

function pad(index: number, active = false, mapping = 'standard'): PadLike {
  return {
    id: `pad-${index}`,
    index,
    connected: true,
    mapping,
    axes: [active ? 1 : 0, 0],
    buttons: [],
  };
}

describe('selectGamepad', () => {
  it('ikinci aktif standart kolu seçer ve nötrleşince aynı kimliği korur', () => {
    const first = pad(0);
    const second = pad(1, true);
    expect(selectGamepad([first, second])).toBe(second);
    const neutral = pad(1);
    expect(selectGamepad([first, neutral], second)).toBe(neutral);
    expect(selectGamepad([pad(0, true), neutral], neutral)?.index).toBe(0);
  });

  it('önceki aktif kol iki eşzamanlı girdide seçili kalır', () => {
    const first = pad(0, true);
    const second = pad(1, true);
    expect(selectGamepad([first, second], second)).toBe(second);
  });

  it('disconnect, dock ve kimlik değişimini yeni anlık görüntüden çözer', () => {
    const previous = pad(1);
    const dock = { ...pad(1), id: 'dock-pad' };
    const first = pad(0);
    expect(selectGamepad([first, null], previous)).toBe(first);
    expect(selectGamepad([first, dock], previous)).toBe(first);
    expect(selectGamepad([null, dock], previous)).toBe(dock);
    expect(selectGamepad([null, { ...previous, connected: false }], previous)).toBeNull();
  });

  it('standart havuzu önceliklidir; explicit index başka kola kaymaz', () => {
    const custom = pad(0, true, '');
    const standard = pad(1);
    expect(selectGamepad([custom, standard], custom)).toBe(standard);
    expect(selectGamepad([custom, standard], null, { padIndex: 0 })).toBe(custom);
    expect(selectGamepad([custom, null], null, { padIndex: 1 })).toBeNull();
    expect(selectGamepad([custom])).toBe(custom);
  });

  it('deadzone gürültüsü kolu devralmaz', () => {
    const selected = pad(1);
    const noise = { ...pad(0), axes: [0.1, 0] };
    expect(selectGamepad([noise, selected], selected, { deadZone: 0.2 })).toBe(selected);
  });
});
