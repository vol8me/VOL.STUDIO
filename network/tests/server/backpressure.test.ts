import { describe, expect, it, vi } from 'vitest';
import {
  clientTraffic,
  evictSlowConsumers,
  SLOW_CONSUMER_CLOSE_CODE,
  SlowConsumerWatch,
} from '../../src/server';

const watchOf = () => new SlowConsumerWatch({ limitBytes: 1000, graceMs: 500 });

describe('clientTraffic', () => {
  it('soketten bayt sayaçlarını okur', () => {
    const client = {
      sessionId: 'a',
      ref: { bufferedAmount: 42, _socket: { bytesWritten: 900, bytesRead: 80 } },
    };
    expect(clientTraffic(client)).toEqual({ bufferedBytes: 42, sentBytes: 900, receivedBytes: 80 });
  });

  it('eksik ya da sayı olmayan alanda 0 döner, fırlatmaz', () => {
    expect(clientTraffic({ sessionId: 'a' })).toEqual({
      bufferedBytes: 0,
      sentBytes: 0,
      receivedBytes: 0,
    });
    expect(
      clientTraffic({ sessionId: 'a', ref: { bufferedAmount: Number.NaN } }).bufferedBytes,
    ).toBe(0);
    expect(clientTraffic({ sessionId: 'a', ref: 'x' }).sentBytes).toBe(0);
  });
});

describe('SlowConsumerWatch', () => {
  it('sınırı kesintisiz aşan istemci tolerans bitince atılır', () => {
    const watch = watchOf();
    expect(watch.exceeds('a', 5000, 0)).toBe(false);
    expect(watch.exceeds('a', 5000, 499)).toBe(false);
    expect(watch.exceeds('a', 5000, 500)).toBe(true);
  });

  it('kuyruk sınırın altına inerse süre sıfırlanır', () => {
    const watch = watchOf();
    watch.exceeds('a', 5000, 0);
    expect(watch.exceeds('a', 10, 400)).toBe(false);
    expect(watch.tracked).toBe(0);
    watch.exceeds('a', 5000, 450);
    expect(watch.exceeds('a', 5000, 900)).toBe(false);
    expect(watch.exceeds('a', 5000, 950)).toBe(true);
  });

  it('istemcileri birbirinden bağımsız izler', () => {
    const watch = watchOf();
    watch.exceeds('a', 5000, 0);
    expect(watch.exceeds('b', 5000, 600)).toBe(false);
    expect(watch.exceeds('a', 5000, 600)).toBe(true);
  });
});

describe('evictSlowConsumers', () => {
  it('yalnız yavaş olanı nedenle atar ve unutur', () => {
    const watch = watchOf();
    const slow = { sessionId: 'slow', ref: { bufferedAmount: 9000 }, leave: vi.fn() };
    const fine = { sessionId: 'fine', ref: { bufferedAmount: 10 }, leave: vi.fn() };
    expect(evictSlowConsumers([slow, fine], watch, 0)).toEqual([]);
    expect(evictSlowConsumers([slow, fine], watch, 600)).toEqual(['slow']);
    expect(slow.leave).toHaveBeenCalledWith(SLOW_CONSUMER_CLOSE_CODE, 'slow-consumer');
    expect(fine.leave).not.toHaveBeenCalled();
    expect(watch.tracked).toBe(0);
  });
});
