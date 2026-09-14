import { describe, expect, it } from 'vitest';
import { createExplicitWorldMetadata, createFreshWorldMetadata } from '@/runtime/sim/WorldMetadata';

describe('WorldMetadata', () => {
  it('aynı entropy örneği tekrarlansa bile her yeni dünyaya farklı seed verir', () => {
    const source = { nextUint32: () => 42, now: () => 1000 };

    const first = createFreshWorldMetadata(source);
    const second = createFreshWorldMetadata(source);
    const third = createFreshWorldMetadata(source);

    expect(first.seed).toBe(42);
    expect(second.seed).toBe(43);
    expect(third.seed).toBe(44);
    expect(second.id).not.toBe(first.id);
    expect(third.id).not.toBe(second.id);
  });

  it('explicit seed ile tekrar üretilebilir metadata kurar', () => {
    expect(createExplicitWorldMetadata(42, 1000)).toEqual(createExplicitWorldMetadata(42, 1000));
    const defaultCreated = createExplicitWorldMetadata(42);
    expect(defaultCreated.createdAtMs).toBe(0);
  });

  it('varsayılan entropi kaynağıyla geçerli metadata üretir', () => {
    const meta = createFreshWorldMetadata();
    expect(typeof meta.id).toBe('string');
    expect(meta.seed).toBeGreaterThanOrEqual(0);
  });

  it('uint32 dışındaki explicit seedleri reddeder', () => {
    expect(() => createExplicitWorldMetadata(-1)).toThrow(RangeError);
    expect(() => createExplicitWorldMetadata(0x1_0000_0000)).toThrow(RangeError);
  });
});
