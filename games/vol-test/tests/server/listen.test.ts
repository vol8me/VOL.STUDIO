import { describe, expect, it } from 'vitest';
import { listenSettings } from '../../server/index';

describe('listenSettings', () => {
  it('varsayılanı loopback 2567 verir', () => {
    expect(listenSettings({})).toEqual({ port: 2567, host: '127.0.0.1' });
  });

  it('ortam değişkenlerini okur ve geçersiz portu reddeder', () => {
    expect(listenSettings({ VOL_NET_PORT: '0', VOL_NET_HOST: '0.0.0.0' })).toEqual({
      port: 0,
      host: '0.0.0.0',
    });
    for (const port of ['-1', '65536', '1.5', 'x']) {
      expect(() => listenSettings({ VOL_NET_PORT: port })).toThrow(RangeError);
    }
  });
});
