import { describe, expect, it } from 'vitest';
import { parseByteRange } from '../../server/range.js';

describe('parseByteRange', () => {
  it('açık, ucu açık ve suffix aralıklarını çözer', () => {
    expect(parseByteRange('bytes=2-5', 10)).toEqual({ start: 2, end: 5, length: 4 });
    expect(parseByteRange('bytes=7-', 10)).toEqual({ start: 7, end: 9, length: 3 });
    expect(parseByteRange('bytes=-4', 10)).toEqual({ start: 6, end: 9, length: 4 });
  });

  it('sınırı aşan bitişi dosya sonuna kırpar', () => {
    expect(parseByteRange('bytes=8-80', 10)).toEqual({ start: 8, end: 9, length: 2 });
  });

  it.each(['items=0-1', 'bytes=', 'bytes=9-2', 'bytes=20-', 'bytes=0-1,4-5'])(
    'geçersiz aralığı reddeder: %s',
    (range) => {
      expect(parseByteRange(range, 10)).toBeNull();
    },
  );
});
