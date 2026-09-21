import { describe, expect, it, vi } from 'vitest';
import { LatestValueWriter } from '../../src/persistence/LatestValueWriter';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
}

describe('LatestValueWriter', () => {
  it('pending istekleri tek promise ve son değerde birleştirir', async () => {
    const firstWrite = deferred();
    const writes: number[] = [];
    const writer = new LatestValueWriter<number>(async (value) => {
      writes.push(value);
      if (value === 0) await firstWrite.promise;
    });

    const running = writer.enqueue(0);
    const pending = writer.enqueue(1);
    const promises = Array.from({ length: 20_000 }, (_, index) => writer.enqueue(index + 2));

    expect(promises.every((promise) => promise === pending)).toBe(true);
    expect(writes).toEqual([0]);
    firstWrite.resolve();
    await Promise.all([running, pending]);
    expect(writes).toEqual([0, 20_001]);
  });

  it('yazım hatasından sonra yeni batchi işlemeye devam eder', async () => {
    const failure = new Error('disk');
    const onError = vi.fn();
    const write = vi
      .fn<(value: number) => Promise<void>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce();
    const writer = new LatestValueWriter(write, onError);

    await expect(writer.enqueue(1)).rejects.toBe(failure);
    await expect(writer.enqueue(2)).resolves.toBeUndefined();
    await writer.whenIdle();

    expect(write).toHaveBeenNthCalledWith(1, 1);
    expect(write).toHaveBeenNthCalledWith(2, 2);
    expect(onError).toHaveBeenCalledWith(failure);
  });
});
