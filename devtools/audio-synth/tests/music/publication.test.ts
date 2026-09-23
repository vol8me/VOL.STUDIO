import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ProtocolError } from '../../src/protocol/errors';
import {
  checkMusic,
  listMusic,
  loadMusicDocuments,
  musicStatus,
  previewMusic,
  publishedStems,
  publishMusic,
  stemJob,
  verifyMusic,
  type MusicLocation,
} from '../../src/protocol/music';
import { validateManifest } from '../../src/protocol/manifest';
import { verifyManifest } from '../../src/protocol/publish';
import { jobStatus } from '../../src/protocol/status';
import { themeBookHash, validateThemeBook } from '../../src/music/themeBook';
import { cloneTestRepo, createTestRepo, type TestRepo } from '../protocol/repo';
import { musicBrief, referenceThemeBook, unitAdaptiveProgram, unitProgram } from './fixtures';
import { PIPELINE_BLOCK, PIPELINE_TIMEOUT } from '../support/timeouts';

const MUSIC_ROOT = 'devtools/audio-synth/audio-music';
const THEMEBOOKS_ROOT = 'devtools/audio-synth/audio-themebooks';

let repo: TestRepo;
beforeEach(() => {
  repo = createTestRepo();
});
afterEach(() => repo.cleanup());

const at = (relative: string) => join(repo.root, relative);

function write(relative: string, document: unknown): void {
  const file = at(relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
}

function seed(
  musicId: string,
  program: Record<string, unknown>,
  brief: Record<string, unknown>,
): MusicLocation {
  write(`${MUSIC_ROOT}/${musicId}/music.json`, program);
  write(`${MUSIC_ROOT}/${musicId}/brief.json`, brief);
  return { repoRoot: repo.root, musicRoot: MUSIC_ROOT, musicId };
}

function loopSetup(overrides: Record<string, unknown> = {}): MusicLocation {
  return seed('unit-loop', unitProgram(overrides), musicBrief());
}

function adaptiveSetup(): MusicLocation {
  return seed(
    'unit-adaptive',
    unitAdaptiveProgram(),
    musicBrief({
      id: 'unit-adaptive',
      usage: 'interactive',
      playback: 'adaptiveLoop',
      adaptive: {
        states: [
          { id: 'calm', intensity: 0 },
          { id: 'peak', intensity: 1 },
        ],
      },
    }),
  );
}

const codeOf = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof ProtocolError ? error.code : `beklenmeyen: ${(error as Error).message}`;
  }
};

describe('müzik belgeleri', PIPELINE_BLOCK, () => {
  it('brief ve program okunur, kimlik dizinle eşleşmeli', () => {
    const loc = loopSetup();
    const documents = loadMusicDocuments(loc);
    expect(documents.program.musicId).toBe('unit-loop');
    expect(documents.brief.kind).toBe('music');
    expect(documents.themeBook).toBeNull();
    const wrong = seed('other-id', unitProgram(), musicBrief());
    expect(codeOf(() => loadMusicDocuments(wrong))).toBe('identity');
  });

  it('müzik olmayan brief reddedilir', () => {
    const loc = seed('unit-loop', unitProgram(), {
      schema: 'AudioBriefV1',
      kind: 'acoustic',
      id: 'x',
      title: 'x',
      intent: 'x',
      provenance: { author: 'agent' },
      subtype: 'sfx',
      assetClass: 'sfx',
      durationSeconds: { min: 0.1, max: 1 },
      channels: 1,
    });
    expect(codeOf(() => loadMusicDocuments(loc))).toBe('invalid');
  });

  it('ThemeBook bağı özetle doğrulanır', () => {
    const book = validateThemeBook(referenceThemeBook());
    write(`${THEMEBOOKS_ROOT}/reference-theme.json`, book);
    const ok = loopSetup({ themeBook: { id: 'reference-theme', hash: themeBookHash(book) } });
    expect(loadMusicDocuments(ok).themeBook?.themeBookId).toBe('reference-theme');

    const stale = loopSetup({
      themeBook: { id: 'reference-theme', hash: `sha256:${'0'.repeat(64)}` },
    });
    expect(codeOf(() => loadMusicDocuments(stale))).toBe('stale');

    const missing = loopSetup({ themeBook: { id: 'yok-boyle', hash: themeBookHash(book) } });
    expect(codeOf(() => loadMusicDocuments(missing))).toBe('not-found');
  });

  it('listeleme dizinden gelir', () => {
    loopSetup();
    adaptiveSetup();
    expect(listMusic(repo.root, MUSIC_ROOT)).toEqual(['unit-adaptive', 'unit-loop']);
    expect(listMusic(repo.root, 'devtools/audio-synth/yok')).toEqual([]);
  });
});

describe('ön denetim ve kontrol', PIPELINE_BLOCK, () => {
  it('plan render etmeden rapor ve bütçe verir', () => {
    const loc = loopSetup();
    const preview = previewMusic(repo.root, loadMusicDocuments(loc));
    expect(preview.report.verdict.pass).toBe(true);
    expect(preview.assets).toEqual(['mix']);
    expect(preview.estimate.items).toBe(1);
    expect(preview.estimate.totalWorkUnits).toBeGreaterThan(0);
  });

  it('adaptive programda her stem + referans mix yayımlanır', () => {
    const loc = adaptiveSetup();
    const preview = previewMusic(repo.root, loadMusicDocuments(loc));
    expect(preview.assets).toEqual(['bed', 'pulse', 'lead', 'mix']);
    expect(publishedStems(preview.program)).toEqual(preview.assets);
  });

  it('frozen ya da beyansız hedef reddedilir', () => {
    const frozen = loopSetup({
      delivery: { package: '@volstudio/old-game', assetDir: 'public/assets/audio/music/x' },
    });
    expect(codeOf(() => previewMusic(repo.root, loadMusicDocuments(frozen)))).toBe('destination');
    const bare = loopSetup({
      delivery: { package: '@volstudio/bare-game', assetDir: 'public/assets/audio/music/x' },
    });
    expect(codeOf(() => previewMusic(repo.root, loadMusicDocuments(bare)))).toBe('destination');
  });

  it('check ses ölçer ve çalışma zamanı sözleşmesini kurar', () => {
    const loc = loopSetup();
    const check = checkMusic(repo.root, loadMusicDocuments(loc));
    expect(check.mastering.path).toBe('loop-cyclic');
    expect(check.qa.verdict.pass).toBe(true);
    expect(check.spec.stems[0].file).toBe('reference/production/assets/music/unit-loop/mix.ogg');
    expect(check.rendered.map((asset) => asset.stem)).toEqual(['mix']);
    expect(check.spec.engine.compressor).toBe(false);
  });
});

/**
 * Yayın pahalıdır (render + kodlama + çözme); aynı programı her testte
 * sıfırdan yayımlamak yerine her fixture BİR KEZ yayımlanır. Salt okuyan
 * testler bu altın depoya bakar, onu değiştirecek testler kopyasında çalışır.
 */
function published(setup: (target: TestRepo) => MusicLocation) {
  const golden = createTestRepo();
  const loc = setup(golden);
  const outcome = publishMusic(golden.root, MUSIC_ROOT, loadMusicDocuments(loc));
  return { golden, loc, outcome };
}

describe('yayın', PIPELINE_BLOCK, () => {
  let loop: ReturnType<typeof published>;
  let adaptive: ReturnType<typeof published>;
  const clones: TestRepo[] = [];
  const clone = (source: TestRepo) => {
    const copy = cloneTestRepo(source);
    clones.push(copy);
    return copy;
  };
  /** Testin kendi deposunu (beforeEach) kopyayla değiştirir; afterEach kopyayı siler. */
  const adopt = (copy: TestRepo) => {
    repo.cleanup();
    repo = copy;
  };
  const inRepo = (target: TestRepo, musicId: string): MusicLocation => ({
    repoRoot: target.root,
    musicRoot: MUSIC_ROOT,
    musicId,
  });

  beforeAll(() => {
    loop = published((target) => {
      repo = target;
      return loopSetup();
    });
    adaptive = published((target) => {
      repo = target;
      return adaptiveSetup();
    });
  }, 2 * PIPELINE_TIMEOUT);

  afterAll(() => {
    for (const copy of clones) copy.cleanup();
    loop.golden.cleanup();
    adaptive.golden.cleanup();
  });

  const inGolden = (target: TestRepo, relative: string) => join(target.root, relative);

  it('tek asset’li loop yayımlanır, bundle en son yazılır ve doğrulanır', () => {
    expect(loop.outcome.stems).toEqual([{ id: 'mix', result: 'published' }]);
    const bundle = JSON.parse(
      readFileSync(inGolden(loop.golden, loop.outcome.bundle), 'utf8'),
    ) as Record<string, unknown>;
    expect(bundle.schema).toBe('MusicBundleV1');
    expect((bundle.sync as { ok: boolean }).ok).toBe(true);
    expect((bundle.stems as unknown[]).length).toBe(1);
    const verification = verifyMusic(loop.loc);
    expect(verification.complete).toBe(true);
    expect(verification.checks.map((c) => c.name)).toEqual([
      'program-hash',
      'brief-hash',
      'expansion',
      'qa-hash',
      'spec',
      'links',
      'sync',
    ]);
  });

  it('yayımlanmış asset manifest’inden yeniden üretilebilir', () => {
    const manifestPath =
      'devtools/audio-synth/reference/production/manifests/music/unit-loop/mix.json';
    const manifest = validateManifest(
      JSON.parse(readFileSync(inGolden(loop.golden, manifestPath), 'utf8')),
    );
    expect(manifest.brief.kind).toBe('music');
    expect(manifest.program.schema).toBe('MusicStemProgramV1');
    expect(manifest.policy.assetClass).toBe('music');
    expect(manifest.engine.renderSurface?.instruments?.length).toBeGreaterThan(0);
    const verification = verifyManifest(loop.golden.root, manifestPath);
    expect(verification.ok).toBe(true);
    expect(verification.change).toBe('identical');
  });

  it('ikinci koşu değişmemiş stemi atlar', () => {
    const copy = clone(loop.golden);
    const second = publishMusic(
      copy.root,
      MUSIC_ROOT,
      loadMusicDocuments(inRepo(copy, 'unit-loop')),
    );
    expect(second.stems).toEqual([{ id: 'mix', result: 'unchanged' }]);
  });

  it('adaptive yayın stemleri ve referans mixi hizalı üretir', () => {
    expect(adaptive.outcome.stems.map((s) => s.id)).toEqual(['bed', 'pulse', 'lead', 'mix']);
    const bundle = JSON.parse(
      readFileSync(inGolden(adaptive.golden, adaptive.outcome.bundle), 'utf8'),
    ) as {
      sync: { checks: { id: string; lagSamples: number; frameDelta: number }[] };
      spec: { stems: { id: string; frames: number }[]; playback: string };
      stems: { id: string; pcmHash: string }[];
    };
    expect(bundle.sync.checks).toHaveLength(4);
    expect(bundle.sync.checks.every((c) => c.lagSamples === 0 && c.frameDelta === 0)).toBe(true);
    expect(bundle.spec.playback).toBe('adaptiveLoop');
    expect(new Set(bundle.spec.stems.map((s) => s.frames)).size).toBe(1);
    expect(new Set(bundle.stems.map((s) => s.pcmHash)).size).toBe(4);
    expect(verifyMusic(adaptive.loc).complete).toBe(true);
  });

  it('stem manifesti mix’ten farklı politika sınıfı taşır', () => {
    const base = 'devtools/audio-synth/reference/production/manifests/music/unit-adaptive';
    const read = (name: string) =>
      validateManifest(
        JSON.parse(readFileSync(inGolden(adaptive.golden, `${base}/${name}.json`), 'utf8')),
      );
    const stem = read('lead');
    const mix = read('mix');
    expect(stem.policy.assetClass).toBe('music-stem');
    expect(mix.policy.assetClass).toBe('music');
    expect(stem.assetId).toBe('unit-adaptive-lead');
    expect(mix.assetId).toBe('unit-adaptive-mix');
  });

  it('sembolik kapı düşerse hiçbir şey yayımlanmaz', () => {
    adopt(cloneTestRepo(loop.golden));
    const loc = seed(
      'other-loop',
      unitProgram({
        musicId: 'other-loop',
        delivery: {
          package: '@volstudio/audio-synth',
          assetDir: 'reference/production/assets/music/other-loop',
        },
      }),
      musicBrief({ id: 'other-loop', rhythmicDensity: 'sparse' }),
    );
    expect(codeOf(() => publishMusic(repo.root, MUSIC_ROOT, loadMusicDocuments(loc)))).toBe(
      'policy',
    );
    expect(
      existsSync(at('devtools/audio-synth/reference/production/assets/music/other-loop')),
    ).toBe(false);
  });

  it('içerik değişince sürüm artmalıdır', () => {
    adopt(cloneTestRepo(loop.golden));
    const changed = loopSetup({ seed: 99 });
    expect(codeOf(() => publishMusic(repo.root, MUSIC_ROOT, loadMusicDocuments(changed)))).toBe(
      'overwrite',
    );
    const bumped = loopSetup({ seed: 99, version: 2 });
    expect(publishMusic(repo.root, MUSIC_ROOT, loadMusicDocuments(bumped)).stems).toEqual([
      { id: 'mix', result: 'published' },
    ]);
  });

  it('durum yalnız dosyalardan hesaplanır', () => {
    const fresh = musicStatus(loopSetup());
    expect(fresh.verification.complete).toBe(false);
    expect(fresh.stems).toEqual([]);
    const after = musicStatus(loop.loc);
    expect(after.verification.complete).toBe(true);
    expect(after.stems).toEqual([{ id: 'mix', stage: 'published', next: 'done' }]);
    expect(jobStatus(stemJob(loop.loc, 'mix')).effectiveStage).toBe('published');
  });

  it('bozuk asset bundle doğrulamasını düşürür', () => {
    const copy = clone(loop.golden);
    writeFileSync(
      join(copy.root, 'devtools/audio-synth/reference/production/assets/music/unit-loop/mix.ogg'),
      'bozuk',
    );
    const verification = verifyMusic(inRepo(copy, 'unit-loop'));
    expect(verification.complete).toBe(false);
    expect(verification.checks.find((c) => c.name === 'links')?.ok).toBe(false);
  });

  it('bundle yoksa yayın tamamlanmamıştır', () => {
    const loc = loopSetup();
    expect(verifyMusic(loc).checks[0].detail).toContain('bundle yok');
    rmSync(at(`${MUSIC_ROOT}/unit-loop/music.json`));
    expect(verifyMusic(loc).checks[0].detail).toContain('music.json yok');
  });

  it('stem işi başka bir hedefe bağlanamaz', () => {
    adopt(cloneTestRepo(loop.golden));
    const jobFile = at(`${MUSIC_ROOT}/unit-loop/jobs/mix/job.json`);
    const job = JSON.parse(readFileSync(jobFile, 'utf8')) as Record<string, unknown>;
    const target = job.target as Record<string, unknown>;
    target.asset = 'reference/production/assets/music/unit-loop/other.ogg';
    job.revision = (job.revision as number) + 1;
    writeFileSync(jobFile, JSON.stringify(job, null, 2));
    expect(
      codeOf(() =>
        publishMusic(repo.root, MUSIC_ROOT, loadMusicDocuments(loopSetup({ version: 2 }))),
      ),
    ).toBe('identity');
  });
});
