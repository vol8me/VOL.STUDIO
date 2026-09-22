import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../src/protocol/canonical';
import { buildContext } from '../../src/protocol/context';
import { ProtocolError } from '../../src/protocol/errors';
import { resolveDestination, surveyTargets } from '../../src/protocol/targets';
import { createTestRepo } from './repo';

const REPO = fileURLToPath(new URL('../../../..', import.meta.url));

describe('audio:job context', () => {
  it('gerçek repo: aktif oyun hedefi yok — bunu AÇIKÇA söyler; frozen oyunlar listelenir', () => {
    const context = buildContext(REPO);
    expect(context.targets.publishable.map((t) => t.packageName)).toEqual([
      '@volstudio/audio-synth',
    ]);
    expect(context.targets.publishable[0].runtime).toBeNull();
    expect(context.targets.frozen).toEqual(['@volstudio/vol-arachnid', '@volstudio/vol-hell']);
    expect(context.targets.note).toMatch(/oyun hedefi YOK/);
    expect(context.schemas.brief.kinds.music.status).toBe('supported');
    expect(context.music.schemas.program).toBe('MusicProgramV1');
    expect(context.music.runtime.capabilities.stingers).toBe(false);
    expect(Object.keys(context.music.commands)).toContain('publish');
  });

  it('arama sözleşmesi çalışan koddan: şemalar, strateji, aranabilir boyutlar, bütçe, komutlar', () => {
    const { search, canaries } = buildContext(REPO);
    expect(search.schemas).toEqual({
      spec: 'AcousticSearchSpecV1',
      report: 'AcousticSearchReportV1',
      selection: 'SearchSelectionV1',
      status: 'AcousticSearchStatusV1',
      origin: 'ProgramOriginV1',
    });
    expect(search.strategies.map((s) => [s.id, s.version])).toEqual([['scrambled-halton', 1]]);
    const shell = search.dimensions.targets['archetype-param'].searchable.find(
      (a) => a.id === 'archetype.resonant-shell',
    );
    expect(Object.keys(shell?.params ?? {}).sort()).toEqual([
      'damping',
      'durationSeconds',
      'hardness',
      'roughness',
      'size',
    ]);
    expect(search.dimensions.targets.control.controls).toContain('control.body-size');
    expect(search.filters.kinds).toContain('aperiodic');
    expect(Object.keys(search.commands).sort()).toEqual([
      'audition',
      'decide',
      'list',
      'plan',
      'promote',
      'run',
      'status',
      'verify',
    ]);
    expect(search.budget.default.maxItems).toBeGreaterThan(0);
    expect(canaries.entries.map((c) => c.review)).toEqual(Array(8).fill('pending-human'));
  });

  it('aile sözleşmesi: şemalar, genel rol sözlüğü, bank arama sözleşmesi, komutlar', () => {
    const { family, targets } = buildContext(REPO);
    expect(family.schemas).toEqual({
      family: 'SoundFamilyProgramV1',
      quality: 'SoundFamilyQualityReportV1',
      bank: 'SoundFamilyBankV1',
      status: 'SoundFamilyStatusV1',
    });
    expect(Object.keys(family.roleAxes)).toContain('intensity');
    expect(family.bank).toMatchObject({
      lookupContract: 'sound-family-lookup-v1',
      choice: 'fnv1a32-mod-v1',
    });
    expect(Object.keys(family.commands).sort()).toEqual([
      'check',
      'list',
      'plan',
      'publish',
      'status',
      'verify',
    ]);
    expect(targets.publishable[0].bankRoot).toBe('reference/production/banks');
  });

  it('aynı repo durumu aynı baytları verir (zaman damgası yok, sıra kararlı)', () => {
    expect(canonicalJson(buildContext(REPO))).toBe(canonicalJson(buildContext(REPO)));
    expect(JSON.stringify(buildContext(REPO))).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(JSON.stringify(buildContext(REPO))).not.toContain(REPO);
  });

  it('test deposu: beyanlı oyun yayımlanabilir, beyansız oyun ayrıca raporlanır', () => {
    const repo = createTestRepo();
    try {
      const context = buildContext(repo.root);
      expect(context.targets.publishable.map((t) => [t.packageName, t.kind])).toEqual([
        ['@volstudio/audio-synth', 'reference'],
        ['@volstudio/declared-game', 'game'],
      ]);
      expect(context.targets.undeclaredActiveGames).toEqual(['@volstudio/bare-game']);
      expect(context.targets.note).toBe('1 aktif oyun hedefi beyanlı.');
    } finally {
      repo.cleanup();
    }
  });

  it('bozuk çalışma zamanı beyanı adlı hata verir', () => {
    const repo = createTestRepo();
    try {
      writeFileSync(
        join(repo.root, 'games/declared-game/audio-target.json'),
        JSON.stringify({
          schema: 'AudioTargetV1',
          formats: ['mp3'],
          sampleRates: [48000],
          channels: [1],
          loop: false,
        }),
      );
      expect(() => surveyTargets(repo.root)).toThrow(ProtocolError);
    } finally {
      repo.cleanup();
    }
  });

  it('hedef çözümü: manifest yolu asset yolundan türer', () => {
    const repo = createTestRepo();
    try {
      const destination = resolveDestination(
        surveyTargets(repo.root),
        '@volstudio/declared-game',
        'public/assets/audio/sfx/ui/click.ogg',
      );
      expect(destination).toMatchObject({
        assetPath: 'games/declared-game/public/assets/audio/sfx/ui/click.ogg',
        manifestPath: 'games/declared-game/audio-manifests/sfx/ui/click.json',
        withinRoot: 'sfx/ui/click.ogg',
      });
    } finally {
      repo.cleanup();
    }
  });
});
