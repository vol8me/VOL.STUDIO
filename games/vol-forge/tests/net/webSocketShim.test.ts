import { describe, expect, it } from 'vitest';
import { installWebSocketShim, normalizeProtocols } from '../../src/net/webSocketShim';

class FakeSocket {
  static readonly OPEN = 1;
  static calls: unknown[][] = [];
  constructor(...args: unknown[]) {
    FakeSocket.calls.push(args);
  }
}

describe('normalizeProtocols', () => {
  it('dize, dizi ve tanımsızı olduğu gibi bırakır', () => {
    expect(normalizeProtocols('a')).toBe('a');
    expect(normalizeProtocols(['a', 'b'])).toEqual(['a', 'b']);
    expect(normalizeProtocols(undefined)).toBeUndefined();
  });

  it('Node imzasındaki nesneden protokolü alır, başlıkları atar', () => {
    expect(normalizeProtocols({ headers: { x: '1' }, protocols: ['colyseus'] })).toEqual([
      'colyseus',
    ]);
    expect(normalizeProtocols({ headers: { x: '1' } })).toBeUndefined();
    expect(normalizeProtocols({ protocols: undefined })).toBeUndefined();
  });

  it('anlamsız değerde protokol vermez', () => {
    expect(normalizeProtocols(5)).toBeUndefined();
    expect(normalizeProtocols(null)).toBeUndefined();
  });
});

describe('installWebSocketShim', () => {
  it('nesne imzasını tarayıcı imzasına çevirir ve statikleri korur', () => {
    FakeSocket.calls = [];
    const target = { WebSocket: FakeSocket as never };
    expect(installWebSocketShim(target)).toBe(true);
    const Shimmed = target.WebSocket as unknown as typeof FakeSocket;
    new Shimmed('ws://x', { headers: { a: 'b' }, protocols: undefined });
    new Shimmed('ws://y', 'p');
    new Shimmed('ws://z');
    expect(FakeSocket.calls).toEqual([
      ['ws://x', undefined],
      ['ws://y', 'p'],
      ['ws://z', undefined],
    ]);
    expect(Shimmed.OPEN).toBe(1);
  });

  it('ikinci kurulum bir şey yapmaz', () => {
    const target = { WebSocket: FakeSocket as never };
    expect(installWebSocketShim(target)).toBe(true);
    const first = target.WebSocket;
    expect(installWebSocketShim(target)).toBe(false);
    expect(target.WebSocket).toBe(first);
  });

  it('WebSocket yoksa (Node) kurulmaz', () => {
    expect(installWebSocketShim({})).toBe(false);
  });
});
