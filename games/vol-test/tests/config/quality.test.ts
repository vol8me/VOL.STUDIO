import { describe, expect, it } from 'vitest';
import { initialEffectLevel } from '@/config/quality';

describe('ölçülen açılış kalitesi', () => {
  it('ölçülen tablet yüksek, bilinmeyen Android düşük, masaüstü yüksek başlar', () => {
    expect(initialEffectLevel('Mozilla/5.0 (Linux; Android 14; TB350FU Build/UP1A; wv)')).toBe(
      'high',
    );
    expect(initialEffectLevel('Mozilla/5.0 (Linux; Android 14; Unknown; wv)')).toBe('low');
    expect(initialEffectLevel('Mozilla/5.0 (X11; Linux x86_64)')).toBe('high');
    expect(initialEffectLevel('Mozilla/5.0 (X11; Linux x86_64) TB350FU')).toBe('high');
  });
});
