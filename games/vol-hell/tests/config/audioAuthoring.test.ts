import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { resolveProgram } from '@volstudio/audio-synth/program/schema';
import { soundAssets } from '@/config/sounds';
import { musicTracks } from '@/config/music';
import { buildArcadeSuite } from '../../scripts/audio-v2/definitions.arcade';

const suite = buildArcadeSuite();

function filesUnder(directory: string): string[] {
  const result: string[] = [];
  const visit = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else result.push(relative(directory, path).replaceAll('\\', '/'));
    }
  };
  visit(directory);
  return result.sort();
}

describe('VOL.HELL arcade üretim sözleşmesi', () => {
  it('38 SFX ve 8 müzik/ambiyans yolu yeni bir kaynak tarafından sahiplenilir', () => {
    const expected = [
      ...Object.values(soundAssets).flat(),
      ...Object.values(musicTracks).flatMap((track) => track.stems.map((stem) => stem.src)),
    ]
      .map((src) => `public/${src}`)
      .sort();
    expect(suite.coverage.map((item) => item.asset).sort()).toEqual(expected);
    expect(new Set(suite.coverage.map((item) => item.asset)).size).toBe(46);
    expect(suite.jobs).toHaveLength(38);
    expect(suite.music).toHaveLength(8);
  });

  it('sevk, manifest ve müzik özet ağaçlarında eski set artığı kalmaz', () => {
    const root = process.cwd();
    const assets = suite.coverage
      .map((item) => item.asset.replace('public/assets/audio/', ''))
      .sort();
    expect(filesUnder(join(root, 'public/assets/audio'))).toEqual(assets);
    expect(filesUnder(join(root, 'audio-manifests'))).toEqual(
      assets.map((path) => path.replace(/\.ogg$/, '.json')),
    );
    expect(filesUnder(join(root, 'audio-music'))).toEqual(
      suite.music.map((item) => `${item.program.musicId}.json`).sort(),
    );
  });

  it('her iş tekil kimlik taşır ve programı çözülebilir', () => {
    const ids = suite.jobs.map((job) => job.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const job of suite.jobs) {
      expect(() => resolveProgram(job.program), job.id).not.toThrow();
      expect(job.brief.kind).toBe('acoustic');
    }
  });

  it('varyantlı olaylarda her dosya ayrı bir program üretir', () => {
    for (const event of [
      'menuBlip',
      'fire',
      'hurt',
      'fluxPickup',
      'enemyHit',
      'enemyDeath',
    ] as const) {
      const variants = suite.jobs.filter((job) => job.event === event);
      expect(variants).toHaveLength(soundAssets[event].length);
      expect(new Set(variants.map((job) => JSON.stringify(job.program))).size).toBe(
        variants.length,
      );
    }
  });

  it('müzik briefleri form ve uzunluğu programdan türetir', () => {
    for (const item of suite.music) {
      expect(item.brief.kind).toBe('music');
      const roles = [...item.program.sections]
        .sort((a, b) => a.bars[0] - b.bars[0])
        .map((section) => section.role);
      expect(item.brief.form.sections, item.program.musicId).toEqual(roles);
      expect(item.brief.length.bars).toEqual({
        min: item.program.bars,
        max: item.program.bars,
      });
      expect(item.brief.playback).toBe(item.program.playback);
    }
  });
});
