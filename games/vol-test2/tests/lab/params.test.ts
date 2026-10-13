import { describe, expect, it } from 'vitest';
import { resolveParams, type ParamSpec } from '../../src/lab/params';

const SPECS: readonly ParamSpec[] = [
  { name: 'count', type: 'integer', default: 100, min: 1, max: 5000, description: 'sprite sayısı' },
  { name: 'speed', type: 'number', default: 1.5, min: 0, max: 10, description: 'hız' },
  {
    name: 'blend',
    type: 'choice',
    default: 'normal',
    choices: ['normal', 'add'],
    description: 'b',
  },
  { name: 'spin', type: 'boolean', default: false, description: 'dönüş' },
];

describe('resolveParams', () => {
  it('girdi yoksa varsayılanları verir ve sabit bir anahtar üretir', () => {
    const result = resolveParams(SPECS, undefined);
    expect(result).toEqual({
      ok: true,
      values: { count: 100, speed: 1.5, blend: 'normal', spin: false },
      key: 'blend=normal,count=100,speed=1.5,spin=false',
    });
  });

  it('verilen değeri alır, kalanı varsayılanda bırakır', () => {
    const result = resolveParams(SPECS, { count: 20, blend: 'add', spin: true });
    expect(result).toMatchObject({
      ok: true,
      values: { count: 20, speed: 1.5, blend: 'add', spin: true },
    });
  });

  it('anahtar sırası girdiye bağlı değildir', () => {
    const a = resolveParams(SPECS, { count: 5, spin: true });
    const b = resolveParams(SPECS, { spin: true, count: 5 });
    expect(a.ok && b.ok && a.key === b.key).toBe(true);
  });

  it('bilinmeyen adı geçerli adlarla birlikte reddeder', () => {
    const result = resolveParams(SPECS, { cnt: 5 });
    expect(result).toEqual({
      ok: false,
      message: 'bilinmeyen parametre: cnt (geçerli: count, speed, blend, spin)',
    });
  });

  it.each([
    [{ count: 0 }, 'count: 1..5000 aralığında tamsayı olmalı'],
    [{ count: 5001 }, 'count: 1..5000 aralığında tamsayı olmalı'],
    [{ count: 2.5 }, 'count: 1..5000 aralığında tamsayı olmalı'],
    [{ count: '10' }, 'count: 1..5000 aralığında tamsayı olmalı'],
    [{ count: Number.NaN }, 'count: 1..5000 aralığında tamsayı olmalı'],
    [{ speed: 11 }, 'speed: 0..10 aralığında sayı olmalı'],
    [{ blend: 'multiply' }, 'blend: normal | add değerlerinden biri olmalı'],
    [{ spin: 1 }, 'spin: true ya da false olmalı'],
  ])('%j geçersizdir', (input, message) => {
    expect(resolveParams(SPECS, input)).toEqual({ ok: false, message });
  });

  it('zorunlu parametre verilmezse varsayılana düşmez, reddedilir', () => {
    const specs = [
      {
        name: 'name',
        type: 'choice',
        default: 'a',
        choices: ['a', 'b'],
        required: true,
        description: 'ad',
      },
    ] as const;
    expect(resolveParams(specs, {})).toEqual({ ok: false, message: 'name: zorunlu' });
    expect(resolveParams(specs, { name: 'b' })).toMatchObject({ ok: true, values: { name: 'b' } });
    expect(resolveParams(specs, { name: 'z' })).toEqual({
      ok: false,
      message: 'name: a | b değerlerinden biri olmalı',
    });
  });

  it('nesne olmayan girdiyi reddeder', () => {
    for (const input of [null, 5, 'x', [1]])
      expect(resolveParams(SPECS, input)).toEqual({
        ok: false,
        message: 'params bir nesne olmalı',
      });
  });

  it('parametresiz şema boş nesneyi kabul eder, doluyu reddeder', () => {
    expect(resolveParams([], {})).toEqual({ ok: true, values: {}, key: '' });
    expect(resolveParams([], { x: 1 })).toMatchObject({ ok: false });
  });
});
