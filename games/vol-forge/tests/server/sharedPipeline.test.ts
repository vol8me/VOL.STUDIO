import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), 'utf8');

describe('Forge sunucusu ile CLI aynı çıktı hattına bağlıdır', () => {
  it('iki giriş de createForgeArtifact kullanır ve sunucu ikinci render yolu açmaz', () => {
    const cli = read('../../../../core/scripts/forge.ts');
    const server = read('../../server/forgePlugin.ts');

    expect(cli).toContain('createForgeArtifact(');
    expect(server).toContain('createForgeArtifact(');
    expect(server).not.toMatch(/\brenderSprite\(/);
    expect(server).not.toMatch(/\bencodePng\(/);
  });
});
