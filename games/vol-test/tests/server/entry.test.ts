import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isEntryModule } from '../../server/entry';

describe('isEntryModule', () => {
  const entry = join(tmpdir(), 'oyun', 'server', 'index.ts');

  it('aynı dosyayı tanır', () => {
    expect(isEntryModule(pathToFileURL(entry).href, entry)).toBe(true);
  });

  it('göreli giriş yolunu çalışma dizinine göre çözer', () => {
    const relative = join('server', 'index.ts');
    expect(isEntryModule(pathToFileURL(join(process.cwd(), relative)).href, relative)).toBe(true);
  });

  it('başka dosyayı ve boş girişi reddeder', () => {
    expect(isEntryModule(pathToFileURL(entry).href, join(tmpdir(), 'baska.ts'))).toBe(false);
    expect(isEntryModule(pathToFileURL(entry).href, undefined)).toBe(false);
    expect(isEntryModule(pathToFileURL(entry).href, '')).toBe(false);
  });
});
