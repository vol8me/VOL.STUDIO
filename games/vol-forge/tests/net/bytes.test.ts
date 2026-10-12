import { describe, expect, it } from 'vitest';
import { ByteReader, ByteWriter, fnv1a } from '../../src/net/bytes';

describe('ByteWriter / ByteReader', () => {
  it('her türü yazıp aynen okur ve tampon büyür', () => {
    const out = new ByteWriter(16);
    out.u8(255);
    out.u16(65535);
    out.u32(0xdeadbeef);
    out.f64(-1.5e300);
    out.bytes(new Uint8Array(100).fill(7));
    out.typed(new Uint16Array([1, 2, 3]));
    const bytes = out.finish();
    expect(out.length).toBe(bytes.length);
    const input = new ByteReader(bytes);
    expect([input.u8(), input.u16(), input.u32(), input.f64()]).toEqual([
      255, 65535, 0xdeadbeef, -1.5e300,
    ]);
    expect(input.bytes(100).every((value) => value === 7)).toBe(true);
    const target = new Uint16Array(3);
    input.typedInto(target);
    expect([...target]).toEqual([1, 2, 3]);
    expect(input.remaining).toBe(0);
    expect(input.position).toBe(bytes.length);
  });

  it('reset yazıcıyı başa alır; finish kopya döndürür', () => {
    const out = new ByteWriter();
    out.u32(1);
    const first = out.finish();
    out.reset();
    out.u8(9);
    expect(out.length).toBe(1);
    expect(first.length).toBe(4);
  });

  it('beklenenden kısa paketi ve geçersiz uzunluğu reddeder', () => {
    const input = new ByteReader(new Uint8Array([1, 2]));
    expect(() => input.u32()).toThrow(RangeError);
    expect(() => input.bytes(-1)).toThrow(RangeError);
    expect(() => input.bytes(Number.NaN)).toThrow(RangeError);
    expect(() => input.bytes(3)).toThrow(RangeError);
  });
});

describe('fnv1a', () => {
  it('bilinen değerleri verir ve tohumla zincirlenir', () => {
    const encode = (text: string) => new TextEncoder().encode(text);
    expect(fnv1a(encode('a'))).toBe(0xe40c292c);
    expect(fnv1a(new Uint8Array(0))).toBe(0x811c9dc5);
    expect(fnv1a(encode('b'), fnv1a(encode('a')))).toBe(fnv1a(encode('ab')));
  });
});
