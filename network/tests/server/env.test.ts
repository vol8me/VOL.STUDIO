import { describe, expect, it } from 'vitest';
import { envChoice, envFlag, envInteger, envText, listenSettings } from '../../src/server';

describe('ortam okuyucuları', () => {
  it('tam sayıyı aralıkta okur, boşta varsayılanı verir, dışını reddeder', () => {
    expect(envInteger({ N: '5' }, 'N', 1, 0, 10)).toBe(5);
    expect(envInteger({}, 'N', 7, 0, 10)).toBe(7);
    expect(envInteger({ N: '' }, 'N', 7, 0, 10)).toBe(7);
    for (const value of ['-1', '11', '1.5', 'x']) {
      expect(() => envInteger({ N: value }, 'N', 1, 0, 10)).toThrow(RangeError);
    }
  });

  it('metni kalıba karşı doğrular', () => {
    expect(envText({}, 'T', 'a')).toBe('a');
    expect(envText({ T: '' }, 'T', 'a')).toBe('a');
    expect(envText({ T: 'abc' }, 'T', 'a', /^[a-z]+$/)).toBe('abc');
    expect(() => envText({ T: 'A!' }, 'T', 'a', /^[a-z]+$/)).toThrow(RangeError);
  });

  it('seçenekleri doğrular', () => {
    expect(envChoice({ M: 'aoi' }, 'M', ['lockstep', 'aoi'], 'lockstep')).toBe('aoi');
    expect(envChoice({}, 'M', ['lockstep', 'aoi'], 'lockstep')).toBe('lockstep');
    expect(() => envChoice({ M: 'x' }, 'M', ['lockstep', 'aoi'], 'lockstep')).toThrow(RangeError);
  });

  it('bayrağı açık/kapalı sözcüklerinden okur', () => {
    expect(envFlag({}, 'F')).toBe(false);
    expect(envFlag({}, 'F', true)).toBe(true);
    expect(envFlag({ F: '' }, 'F', true)).toBe(true);
    for (const on of ['1', 'true', 'ON']) expect(envFlag({ F: on }, 'F')).toBe(true);
    for (const off of ['0', 'false', 'Off']) expect(envFlag({ F: off }, 'F', true)).toBe(false);
    expect(() => envFlag({ F: 'belki' }, 'F')).toThrow(RangeError);
  });

  it('dinleme adresi varsayılan olarak loopback 2567; değişkenler değiştirir, geçersiz port durdurur', () => {
    expect(listenSettings({})).toEqual({ port: 2567, host: '127.0.0.1' });
    expect(listenSettings({ VOL_NET_PORT: '0', VOL_NET_HOST: '0.0.0.0' })).toEqual({
      port: 0,
      host: '0.0.0.0',
    });
    for (const port of ['-1', '65536', '1.5', 'x']) {
      expect(() => listenSettings({ VOL_NET_PORT: port })).toThrow(RangeError);
    }
  });
});
