import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { coreClosure } from '../../src/protocol/sourceClosure';

const REPO = new URL('../../../../', import.meta.url).pathname;
const roots: string[] = [];

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'vol-closure-'));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('coreClosure — önbellek parmak izinin CORE kapsamı', () => {
  const core = {
    'core/package.json': JSON.stringify({
      exports: { './audio': { import: './src/audio/index.ts' }, './math': './src/math.ts' },
    }),
    'core/src/audio/index.ts': "export * from './mix';\nimport type { T } from '../types';",
    'core/src/audio/mix.ts': "import { lerp } from '../math';\nexport const mix = lerp;",
    'core/src/math.ts': 'export const lerp = 1;',
    'core/src/types.ts': 'export type T = 1;',
    'core/src/ui/Button.ts': "import './button.css';",
  };

  it('yalnız tüketicinin yüklediği CORE dosyalarını geçişli olarak toplar', () => {
    const root = tree({ ...core, 'app/src/a.ts': "import { mix } from '@volstudio/core/audio';" });
    const files = coreClosure(join(root, 'app/src'), join(root, 'core'));
    expect(files.map((file) => relative(join(root, 'core'), file))).toEqual([
      'src/audio/index.ts',
      'src/audio/mix.ts',
      'src/math.ts',
      'src/types.ts',
    ]);
  });

  it('çözülemeyen göreli yol ya da dışa açık olmayan alt yol hata verir', () => {
    const broken = tree({ ...core, 'core/src/math.ts': "import './missing';" });
    mkdirSync(join(broken, 'app/src'), { recursive: true });
    writeFileSync(join(broken, 'app/src/a.ts'), "import '@volstudio/core/math';");
    expect(() => coreClosure(join(broken, 'app/src'), join(broken, 'core'))).toThrow(
      /missing çözülemedi/,
    );
    const hidden = tree({ ...core, 'app/src/a.ts': "import '@volstudio/core/ui';" });
    expect(() => coreClosure(join(hidden, 'app/src'), join(hidden, 'core'))).toThrow(
      /dışa açık değil/,
    );
  });

  it('gerçek depoda CORE UI parmak izine girmez, ses ve rastgelelik girer', () => {
    const files = coreClosure(join(REPO, 'devtools/audio-synth/src'), join(REPO, 'core')).map(
      (file) => relative(join(REPO, 'core'), file),
    );
    expect(files).toContain('src/random/random.ts');
    expect(files).toContain('src/audio/music/spec.ts');
    expect(files.filter((file) => file.startsWith('src/ui/'))).toEqual([]);
  });
});
