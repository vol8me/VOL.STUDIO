import { describe, expect, it } from 'vitest';
import { NETWORK } from '@/config/network';
import { normalizeEndpoint, resolveEndpoint } from '@/network/endpoint';

describe('normalizeEndpoint', () => {
  it('şemasız host:port yazımını http adresine çevirir', () => {
    expect(normalizeEndpoint('localhost:2567')).toBe('http://localhost:2567');
    expect(normalizeEndpoint('  192.168.1.20:2567 ')).toBe('http://192.168.1.20:2567');
  });

  it('ws ve wss şemalarını eşleştirme için http ve https yapar', () => {
    expect(normalizeEndpoint('ws://127.0.0.1:2567')).toBe('http://127.0.0.1:2567');
    expect(normalizeEndpoint('wss://oyun.example.org')).toBe('https://oyun.example.org');
    expect(normalizeEndpoint('https://oyun.example.org/')).toBe('https://oyun.example.org');
  });

  it('kimlik bilgisi, yol, sorgu, parça ve tanınmayan şemayı reddeder', () => {
    for (const value of [
      '',
      '   ',
      'ftp://x:1',
      'javascript:alert(1)',
      'http://user:pass@host:1',
      'http://host:1/oda',
      'http://host:1/?a=1',
      'http://host:1/#x',
      'http://',
      'host:abc',
    ]) {
      expect(normalizeEndpoint(value), value).toBeNull();
    }
  });
});

describe('resolveEndpoint', () => {
  it('önce sorgu, sonra derleme adresi, sonra geliştirme adresidir', () => {
    expect(resolveEndpoint('?server=a:1', 'b:2')).toBe('http://a:1');
    expect(resolveEndpoint('', 'b:2')).toBe('http://b:2');
    expect(resolveEndpoint('', undefined)).toBe(NETWORK.defaultEndpoint);
  });

  it('geçersiz değerlerde bir sonrakine düşer', () => {
    expect(resolveEndpoint('?server=ftp://x', 'b:2')).toBe('http://b:2');
    expect(resolveEndpoint('?server=%20', '??')).toBe(NETWORK.defaultEndpoint);
  });
});
