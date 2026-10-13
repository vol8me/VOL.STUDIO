import { describe, expect, it } from 'vitest';
import { parseBootMode } from '../../src/bootstrap/mode';

describe('parseBootMode', () => {
  it('parametresiz sayfa oyundur', () => {
    expect(parseBootMode('')).toEqual({ kind: 'play' });
    expect(parseBootMode('?server=ws://x&name=a')).toEqual({ kind: 'play' });
  });

  it('lab=run ve lab=observe tanınır, başka parametrelerle birlikte de', () => {
    expect(parseBootMode('?lab=run')).toEqual({ kind: 'lab', lab: 'run' });
    expect(parseBootMode('?debug&lab=observe&x=1')).toEqual({ kind: 'lab', lab: 'observe' });
  });

  it.each(['', 'Run', 'runn', 'off', 'true'])(
    'bilinmeyen değer "%s" sessizce oyuna düşmez',
    (value) => {
      expect(parseBootMode(`?lab=${value}`)).toEqual({ kind: 'invalid', value });
    },
  );
});
