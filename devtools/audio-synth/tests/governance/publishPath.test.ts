import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PROGRAM_REGISTRY } from '../../src/program/catalog';

/**
 * Production asset'i TEK kapıdan geçer. Aktif bir workspace'te yazıcıyı
 * (`writeOgg`/`writeWav`/`writeAudio`) çağıran her dosya burada gerekçesiyle
 * listelenir; yeni, sahipsiz bir publish yolu bu testi düşürür. Frozen
 * ağaçlar tarihî kayıttır ve taranmaz.
 */
const REPO = fileURLToPath(new URL('../../../..', import.meta.url));
const WRITER_CALL = /\b(writeOgg|writeWav|writeAudio)\s*\(/;
const ALLOWED: Readonly<Record<string, string>> = {
  'devtools/audio-synth/src/writer.ts': 'yazıcının kendisi',
  'devtools/audio-synth/src/protocol/publish.ts':
    'TEK kanonik publish kapısı (staging + doğrulama)',
  'devtools/audio-synth/src/protocol/audition.ts':
    'TEK dinleme kopyası yazıcısı (job/arama/canary); yalnız git-dışı export/ altına',
  'devtools/audio-synth/scripts/audio-reference-check.ts': 'geçici dizinde ölçüm fixture’ı',
  'devtools/audio-synth/scripts/render-budget-bench.ts': 'geçici dizinde kıyas ölçümü',
  'devtools/audio-synth/scripts/music-demo.ts': 'git-dışı export/ demo çıktısı',
  'devtools/audio-synth/scripts/archetype-audition.ts': 'git-dışı export/ dinleme paketi',
};

interface Workspace {
  readonly path: string;
  readonly status: string;
}

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'coverage', 'target', 'gen', 'export'].includes(entry.name))
      continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) walk(full, out);
    else if (/\.(?:[cm]?[jt]s|tsx)$/.test(entry.name)) out.push(full);
  }
}

const lifecycle = JSON.parse(readFileSync(join(REPO, 'workspace-lifecycle.json'), 'utf8')) as {
  workspaces: Workspace[];
};
const active = lifecycle.workspaces.filter((w) => w.status === 'active');

describe('tek publish yolu', () => {
  it('aktif ağaçlarda yazıcı çağrısı yalnız gerekçeli dosyalarda', () => {
    const offenders: string[] = [];
    for (const workspace of active) {
      const files: string[] = [];
      walk(join(REPO, workspace.path), files);
      for (const file of files) {
        const rel = relative(REPO, file).split('\\').join('/');
        if (rel.includes('/tests/')) continue;
        if (WRITER_CALL.test(readFileSync(file, 'utf8')) && !(rel in ALLOWED)) offenders.push(rel);
      }
    }
    expect(
      offenders,
      'yeni yazıcı yolu: asset publish kapısından (audio:job publish) geçmeli',
    ).toEqual([]);
  });

  it('aktif paketlerde sevk edilen her .ogg bir manifest’e sahip', () => {
    const orphans: string[] = [];
    for (const workspace of active) {
      const roots: [string, string][] = workspace.path.startsWith('games/')
        ? [['public/assets/audio', 'audio-manifests']]
        : workspace.path === 'devtools/audio-synth'
        ? [['reference/production/assets', 'reference/production/manifests']]
        : [];
      for (const [assets, manifests] of roots) {
        const files: string[] = [];
        const collect = (dir: string) => {
          if (!existsSync(dir)) return;
          for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) collect(full);
            else if (entry.name.endsWith('.ogg')) files.push(full);
          }
        };
        collect(join(REPO, workspace.path, assets));
        for (const file of files) {
          const within = relative(join(REPO, workspace.path, assets), file).replace(
            /\.ogg$/,
            '.json',
          );
          if (!existsSync(join(REPO, workspace.path, manifests, within)))
            orphans.push(relative(REPO, file));
        }
      }
    }
    expect(orphans).toEqual([]);
  });
});

describe('agent adapter ince kalır', () => {
  const readme = readFileSync(join(REPO, 'devtools/audio-synth/README.md'), 'utf8');
  const section = readme.slice(readme.indexOf('## Agent protokolü'));

  it('README agent bölümü kanonik context komutuna yönlendirir', () => {
    expect(readme).toContain('## Agent protokolü');
    expect(section).toContain('audio:job context --json');
  });

  it('adapter registry kataloğunu TEKRAR ETMEZ (hiçbir registry kimliği yazılmaz)', () => {
    const next = section.indexOf('\n## ', 3);
    const body = next < 0 ? section : section.slice(0, next);
    const leaked = PROGRAM_REGISTRY.entries()
      .map((e) => e.id)
      .filter((id) => body.includes(id));
    expect(leaked).toEqual([]);
  });
});
