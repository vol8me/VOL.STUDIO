import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderMusicStem } from '../../src/music/stem';
import { hashPcm } from '../../src/kernel/canonical';
import { loadJob } from '../../src/protocol/location';
import {
  checkMusic,
  loadMusicDocuments,
  publishedStems,
  publishMusic,
  stemJob,
  verifyMusic,
  type MusicBundleV1,
  type MusicLocation,
} from '../../src/protocol/music';
import { verifyManifest } from '../../src/protocol/publish';
import { createTestRepo, type TestRepo } from '../protocol/repo';
import { PIPELINE_BLOCK, PIPELINE_TIMEOUT } from '../support/timeouts';
import { musicBrief, unitProgram } from './fixtures';

/**
 * Bundle segmentlerinin YAYIN kanıtı: loop gövdesi + giriş, bitiş ve
 * stinger aynı kanonik kapıdan geçer; bundle cue'ları, dikiş kaydını ve
 * türeyen cue brief'lerini taşır. Ayrıca bus grafikli bir müzikte ön
 * denetimin render'ı iş render'ıyla birebir aynıdır.
 */
const MUSIC_ROOT = 'devtools/audio-synth/audio-music';

let repo: TestRepo;
beforeEach(() => {
  repo = createTestRepo();
});
afterEach(() => repo.cleanup());

function write(relative: string, document: unknown): void {
  const file = join(repo.root, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
}

function seed(musicId: string, program: Record<string, unknown>, brief: Record<string, unknown>) {
  write(`${MUSIC_ROOT}/${musicId}/music.json`, program);
  write(`${MUSIC_ROOT}/${musicId}/brief.json`, brief);
  return { repoRoot: repo.root, musicRoot: MUSIC_ROOT, musicId } satisfies MusicLocation;
}

function segmented() {
  const melody = ['C4', 'E4', 'G4', 'A4', 'C4', 'E4', 'G4', 'C5', 'G4'];
  return unitProgram({
    musicId: 'unit-bundle',
    bars: 9,
    delivery: {
      package: '@volstudio/audio-synth',
      assetDir: 'reference/production/assets/music/unit-bundle',
    },
    lanes: [{ id: 'keys', instrument: 'preset:warmKeys', stem: 'main', gain: 0.8 }],
    sections: [
      {
        id: 'body',
        role: 'body',
        bars: [0, 9],
        targetEnergy: 0.5,
        lanes: ['keys'],
        parts: [
          {
            lane: 'keys',
            source: 'notes',
            notes: melody.map((note, bar) => ({ bar, beat: 0, beats: 2, note })),
          },
        ],
      },
    ],
    markers: undefined,
    segments: [
      { id: 'intro', kind: 'intro', bars: [0, 2] },
      { id: 'body', kind: 'loop', bars: [2, 6] },
      { id: 'ending', kind: 'outro', bars: [6, 8] },
      { id: 'hit', kind: 'stinger', bars: [8, 9], gainDb: -6 },
    ],
    transitions: [{ id: 'accent', kind: 'stinger', seconds: 0.05, cue: 'hit' }],
  });
}

const bundleBrief = () =>
  musicBrief({
    id: 'unit-bundle',
    rhythmicDensity: 'sparse',
    length: { bars: { min: 4, max: 16 } },
  });

describe('segmentli bundle yayını', PIPELINE_BLOCK, () => {
  it(
    'loop + üç cue kanonik kapıdan geçer; bundle cue, dikiş ve türeyen brief taşır',
    () => {
      const loc = seed('unit-bundle', segmented(), bundleBrief());
      const documents = loadMusicDocuments(loc);
      expect(publishedStems(documents.program)).toEqual(['mix', 'intro', 'ending', 'hit']);
      const outcome = publishMusic(repo.root, MUSIC_ROOT, documents);
      expect(outcome.qa.pass).toBe(true);
      expect(outcome.stems.map((s) => s.result)).toEqual([
        'published',
        'published',
        'published',
        'published',
      ]);
      const bundle = JSON.parse(
        readFileSync(join(repo.root, outcome.bundle), 'utf8'),
      ) as MusicBundleV1;
      expect(bundle.spec.bars).toBe(4);
      expect(bundle.spec.loop).toEqual({ startBar: 0, endBar: 4 });
      expect(bundle.spec.cues?.map((c) => [c.id, c.kind, c.bars])).toEqual([
        ['intro', 'intro', 2],
        ['ending', 'outro', 2],
        ['hit', 'stinger', 1],
      ]);
      expect(bundle.spec.transitions).toEqual([
        { id: 'accent', kind: 'stinger', seconds: 0.05, cue: 'hit' },
      ]);
      expect(bundle.sync.seams?.map((s) => [s.id, s.ok])).toEqual([['mix', true]]);
      expect(bundle.sync.checks.every((c) => c.ok)).toBe(true);

      const cueJob = loadJob(stemJob(loc, 'hit'));
      expect(cueJob.target.integration.loop).toBe(false);
      const cueBrief = JSON.parse(
        readFileSync(join(repo.root, `${MUSIC_ROOT}/unit-bundle/jobs/hit/brief.json`), 'utf8'),
      ) as { playback: string; usage: string };
      expect(cueBrief).toMatchObject({ playback: 'playlistOneShot', usage: 'cue' });
      expect(loadJob(stemJob(loc, 'mix')).target.integration.loop).toBe(true);

      expect(verifyMusic(loc).complete).toBe(true);
      const hit = bundle.stems.find((s) => s.id === 'hit');
      expect(verifyManifest(repo.root, `devtools/audio-synth/${hit?.manifest.path}`).ok).toBe(true);
    },
    PIPELINE_TIMEOUT,
  );

  it(
    'bus grafikli müzikte ön denetimin PCM’i iş render’ıyla aynıdır',
    () => {
      const program = unitProgram({
        musicId: 'unit-bused',
        mix: {
          routes: { keys: 'room', lead: 'room' },
          buses: {
            room: {
              effects: [{ primitive: 'effect.eq-shelf', version: 1, params: { gainDb: -4 } }],
            },
          },
        },
      });
      const loc = seed('unit-bused', program, musicBrief({ id: 'unit-bused' }));
      const check = checkMusic(repo.root, loadMusicDocuments(loc), { workers: 1 });
      const mix = check.rendered.find((r) => r.stem === 'mix');
      const job = renderMusicStem({
        schema: 'MusicStemProgramV1',
        stem: 'mix',
        mastering: check.mastering,
        music: check.program,
      });
      expect(hashPcm(job.channels, job.sampleRate)).toBe(mix?.pcmHash);
    },
    PIPELINE_TIMEOUT,
  );
});
