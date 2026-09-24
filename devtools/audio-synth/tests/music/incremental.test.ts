import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderVoices } from '../../src/arrange/render';
import { MemoryRenderCache } from '../../src/engine/renderCache';
import { withRenderSession } from '../../src/engine/session';
import type { MusicProgramV1 } from '../../src/music/program';
import { eventsFor, renderScoreRaw, voicesOf } from '../../src/music/render';
import { expandProgram } from '../../src/music/score';
import { renderMusicStem } from '../../src/music/stem';
import { hashPcm } from '../../src/protocol/canonical';
import { RENDER_BLOCK } from '../support/timeouts';

const LOOP = new URL('../../audio-music/reference-loop/music.json', import.meta.url);
const LOOP_STEM = new URL(
  '../../audio-music/reference-loop/jobs/mix/program.json',
  import.meta.url,
);
const reference = () => JSON.parse(readFileSync(LOOP, 'utf8')) as MusicProgramV1;

function withLane(
  program: MusicProgramV1,
  id: string,
  change: Record<string, unknown>,
): MusicProgramV1 {
  return {
    ...program,
    lanes: program.lanes.map((lane) => (lane.id === id ? { ...lane, ...change } : lane)),
  } as MusicProgramV1;
}

function render(program: MusicProgramV1, cache: MemoryRenderCache | null) {
  const score = expandProgram(program);
  const out = withRenderSession({ cache }, () =>
    renderScoreRaw(score, { playback: program.playback }),
  );
  return hashPcm(out.channels, out.sampleRate);
}

function writesDuring(cache: MemoryRenderCache, fn: () => void): number {
  const before = cache.stats.writes;
  fn();
  return cache.stats.writes - before;
}

/** Yalnız bir şeridin seslerini taze önbellekle render eder: o şeridin benzersiz ses sayısı. */
function uniqueVoicesOf(program: MusicProgramV1, lane: string): number {
  const score = expandProgram(program);
  const cache = new MemoryRenderCache({ maxBytes: 1 << 28 });
  const voices = voicesOf(
    score,
    eventsFor(score).filter((event) => event.lane === lane),
  );
  withRenderSession({ cache }, () =>
    renderVoices(voices, { durationSeconds: 1, sampleRate: score.sampleRate }),
  );
  return cache.stats.writes;
}

describe('müzik: ses önbelleği ve artımlı render', RENDER_BLOCK, () => {
  it('önbellek açık ve kapalı partisyon ve stem render’ı aynıdır', () => {
    const cache = new MemoryRenderCache({ maxBytes: 1 << 28 });
    expect(render(reference(), cache)).toBe(render(reference(), null));
    const stem = JSON.parse(readFileSync(LOOP_STEM, 'utf8')) as unknown;
    const plain = renderMusicStem(stem);
    const cached = renderMusicStem(stem, { cache });
    expect(hashPcm(cached.channels, cached.sampleRate)).toBe(
      hashPcm(plain.channels, plain.sampleRate),
    );
  });

  it('şerit kazancı değişince hiçbir ses yeniden sentezlenmez', () => {
    const cache = new MemoryRenderCache({ maxBytes: 1 << 28 });
    render(reference(), cache);
    const quieter = withLane(reference(), 'keys', { gain: 0.3 });
    expect(writesDuring(cache, () => render(quieter, cache))).toBe(0);
    expect(render(quieter, cache)).toBe(render(quieter, null));
  });

  it('şerit enstrümanı değişince yalnız o şeridin sesleri sentezlenir', () => {
    const cache = new MemoryRenderCache({ maxBytes: 1 << 28 });
    render(reference(), cache);
    const swapped = withLane(reference(), 'keys', { instrument: 'preset:harp' });
    const expected = uniqueVoicesOf(swapped, 'keys');
    expect(expected).toBeGreaterThan(0);
    expect(writesDuring(cache, () => render(swapped, cache))).toBe(expected);
    expect(render(swapped, cache)).toBe(render(swapped, null));
  });
});
