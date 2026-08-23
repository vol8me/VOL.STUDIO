import { describe, expect, it } from 'vitest';
import { AssetStudioError } from '../../server/errors.js';
import {
  cookieValue,
  EditorLeaseManager,
  isLoopbackHost,
  LAN_SESSION_COOKIE,
  LanSessionManager,
  tokensEqual,
} from '../../server/lease.js';

describe('EditorLeaseManager', () => {
  it('tek editör verir ve ikinci istemciyi salt okunur tutar', () => {
    const lease = new EditorLeaseManager();
    const first = lease.acquire('client-a');
    const second = lease.acquire('client-b');
    expect(first.mode).toBe('editor');
    expect(second).toEqual({ clientId: 'client-b', mode: 'readonly' });
  });

  it('aynı clientId gizli lease kanıtı olmadan aktif leasei alamaz', () => {
    const lease = new EditorLeaseManager();
    expect(lease.acquire('client-a').mode).toBe('editor');
    expect(lease.acquire('client-a')).toEqual({ clientId: 'client-a', mode: 'readonly' });
  });

  it('süresi dolan lease yerine yeni editör kabul eder', () => {
    let now = 10;
    const lease = new EditorLeaseManager(100, () => now);
    lease.acquire('client-a');
    now = 111;
    expect(lease.acquire('client-b').mode).toBe('editor');
  });

  it('yanlış lease yenilemesini reddeder', () => {
    const lease = new EditorLeaseManager();
    expect(() => lease.renew('client-a', 'not-the-lease')).toThrow(AssetStudioError);
  });
});

describe('ağ erişimi yardımcıları', () => {
  it('loopback adreslerini ayırır', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('0.0.0.0')).toBe(false);
  });

  it('tokenları sabit zamanlı karşılaştırma yüzeyinden geçirir', () => {
    expect(tokensEqual('secret', 'secret')).toBe(true);
    expect(tokensEqual('secret', 'other')).toBe(false);
    expect(tokensEqual('secret', undefined)).toBe(false);
  });

  it('HttpOnly oturum kimliğini cookie başlığından ayırır ve süresini uygular', () => {
    let now = 100;
    const sessions = new LanSessionManager(50, () => now);
    const session = sessions.create();
    const cookie = `other=x; ${LAN_SESSION_COOKIE}=${session.sessionId}; final=y`;
    expect(sessions.has(cookieValue(cookie, LAN_SESSION_COOKIE))).toBe(true);
    now = 151;
    expect(sessions.has(session.sessionId)).toBe(false);
  });
});
