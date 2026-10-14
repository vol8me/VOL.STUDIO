import { describe, expect, it } from 'vitest';
import { formatMetres } from '@/hud/format';

describe('format', () => {
  it('dünya konumunu metreye çevirir', () => {
    expect(formatMetres(2048, 32)).toBe('64');
    expect(formatMetres(16, 32)).toBe('1');
    expect(formatMetres(0, 32)).toBe('0');
  });
});
