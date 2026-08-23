import { describe, expect, it } from 'vitest';
import { parsePorcelainV2 } from '../../server/gitStatus.js';

describe('parsePorcelainV2', () => {
  it('boşluklu yolları ve temel çalışma ağacı durumlarını kaybetmez', () => {
    const output = Buffer.from(
      [
        '1 .M N... 100644 100644 100644 abc def assets/changed file.png',
        '? assets/new file.ogg',
        '! assets/ignored.tmp',
        '1 D. N... 100644 000000 000000 abc 000 assets/deleted.png',
        '',
      ].join('\0'),
    );
    const statuses = parsePorcelainV2(output);
    expect(statuses.get('assets/changed file.png')).toBe('modified');
    expect(statuses.get('assets/new file.ogg')).toBe('untracked');
    expect(statuses.get('assets/ignored.tmp')).toBe('ignored');
    expect(statuses.get('assets/deleted.png')).toBe('deleted');
  });
});
