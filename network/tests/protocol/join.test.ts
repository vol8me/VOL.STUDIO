import { describe, expect, it } from 'vitest';
import {
  NAME_MAX_LENGTH,
  PROTOCOL_VERSION,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  createRoomCode,
  normalizeRoomCode,
  parseJoinOptions,
  sanitizeName,
} from '../../src/protocol';

describe('sanitizeName', () => {
  it('kenar boşluklarını atar ve iç boşlukları tek boşluğa indirir', () => {
    expect(sanitizeName('  Ada   Lovelace ')).toBe('Ada Lovelace');
  });

  it('kontrol, yön değiştiren ve sıfır genişlikli karakterleri boşluğa çevirir', () => {
    expect(sanitizeName('A‮da​x')).toBe('A da x');
    expect(sanitizeName('a\nb\tc')).toBe('a b c');
  });

  it('kod noktası sayısıyla kısaltır; vekil çiftleri ortadan bölmez', () => {
    const long = '🚀'.repeat(NAME_MAX_LENGTH + 4);
    const clean = sanitizeName(long)!;
    expect(Array.from(clean)).toHaveLength(NAME_MAX_LENGTH);
    expect(clean).toBe('🚀'.repeat(NAME_MAX_LENGTH));
  });

  it('kısaltmanın bıraktığı sondaki boşluğu da atar', () => {
    expect(sanitizeName(`${'a'.repeat(NAME_MAX_LENGTH - 1)} bbbb`)).toBe(
      'a'.repeat(NAME_MAX_LENGTH - 1),
    );
  });

  it('dize olmayan ya da boş kalan değerde null döner', () => {
    for (const value of [undefined, null, 5, {}, '', '   ', '​‮']) {
      expect(sanitizeName(value)).toBeNull();
    }
  });
});

describe('oda kodu', () => {
  it('alfabe karışan karakterleri taşımaz', () => {
    for (const char of '01OIL') expect(ROOM_CODE_ALPHABET).not.toContain(char);
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(ROOM_CODE_ALPHABET.length);
  });

  it('normalleştirme büyük harfe çevirir, boşluk ve tireyi atar', () => {
    expect(normalizeRoomCode('ab c-d2')).toBe('ABCD2');
  });

  it('uzunluğu ya da karakteri geçersiz kodu reddeder', () => {
    for (const value of ['ABCD', 'ABCDEF', 'ABCD0', 'ABCDI', 'ABC!D', 5, null, undefined]) {
      expect(normalizeRoomCode(value)).toBeNull();
    }
  });

  it('üretilen kod her zaman kurala uyar ve kenar rastgele değerlerinde taşmaz', () => {
    for (const value of [0, 0.5, 0.999999, 1]) {
      const code = createRoomCode(() => value);
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect(normalizeRoomCode(code)).toBe(code);
    }
    expect(createRoomCode()).toMatch(new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`));
  });

  it('rastgele akışı sırayla tüketir', () => {
    const sequence = [0, 1 / 31, 2 / 31, 3 / 31, 4 / 31];
    let index = 0;
    expect(createRoomCode(() => sequence[index++])).toBe(ROOM_CODE_ALPHABET.slice(0, 5));
  });
});

describe('parseJoinOptions', () => {
  it('geçerli seçenekleri adı ve kodu temizleyerek döndürür', () => {
    expect(parseJoinOptions({ protocol: PROTOCOL_VERSION, name: ' Ada ', code: 'ab-cd2' })).toEqual(
      { ok: true, name: 'Ada', code: 'ABCD2' },
    );
  });

  it('ad ve kod isteğe bağlıdır', () => {
    expect(parseJoinOptions({ protocol: PROTOCOL_VERSION })).toEqual({
      ok: true,
      name: null,
      code: null,
    });
    expect(parseJoinOptions({ protocol: PROTOCOL_VERSION, code: null })).toMatchObject({
      code: null,
    });
  });

  it('geçersiz adı reddetmez; sunucu ad atar', () => {
    expect(parseJoinOptions({ protocol: PROTOCOL_VERSION, name: 42 })).toEqual({
      ok: true,
      name: null,
      code: null,
    });
  });

  it('sürüm uyuşmazlığını ve seçeneksiz katılımı reddeder', () => {
    for (const value of [undefined, null, 'x', {}, { protocol: 1 }, { protocol: '2' }]) {
      expect(parseJoinOptions(value)).toEqual({ ok: false, reason: 'protocol' });
    }
  });

  it('biçimi bozuk kodu reddeder', () => {
    expect(parseJoinOptions({ protocol: PROTOCOL_VERSION, code: 'zz' })).toEqual({
      ok: false,
      reason: 'code',
    });
  });
});
