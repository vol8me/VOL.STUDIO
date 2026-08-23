import { describe, expect, it } from 'vitest';
import { normalizeHostname, resolveAllowedHosts } from '../../server/hostPolicy.js';

describe('resolveAllowedHosts', () => {
  it('loopback bindde yalnız loopback adlarını kabul eder', () => {
    const allowed = resolveAllowedHosts('127.0.0.1');

    expect(allowed.has('localhost')).toBe(true);
    expect(allowed.has('127.0.0.1')).toBe(true);
    expect(allowed.has('::1')).toBe(true);
    expect(allowed.has('attacker.example')).toBe(false);
  });

  it('belirli LAN adresine bindde loopback adlarını listeye almaz', () => {
    const allowed = resolveAllowedHosts('192.168.1.50');

    expect(allowed.has('192.168.1.50')).toBe(true);
    expect(allowed.has('localhost')).toBe(false);
    expect(allowed.has('attacker.example')).toBe(false);
  });

  it('joker bindde loopback adlarını da kapsar', () => {
    const allowed = resolveAllowedHosts('0.0.0.0');

    expect(allowed.has('localhost')).toBe(true);
    expect(allowed.has('127.0.0.1')).toBe(true);
    expect(allowed.has('attacker.example')).toBe(false);
  });

  it('açıkça verilen adları normalize ederek ekler', () => {
    const allowed = resolveAllowedHosts('192.168.1.50', ['  Studio.Local  ', '[fd00::1]']);

    expect(allowed.has('studio.local')).toBe(true);
    expect(allowed.has('fd00::1')).toBe(true);
  });
});

describe('normalizeHostname', () => {
  it('boşluk, büyük harf ve IPv6 köşeli ayracını temizler', () => {
    expect(normalizeHostname('  LocalHost ')).toBe('localhost');
    expect(normalizeHostname('[::1]')).toBe('::1');
  });
});
