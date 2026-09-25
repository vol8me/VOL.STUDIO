import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRandom } from '@volstudio/core/random';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  layoutProblem,
  layoutViolations,
  measureStereoImage,
  placementOf,
} from '../../src/analysis/layout';
import { AudioParamError } from '../../src/guard/errors';
import { validateBrief } from '../../src/program/brief';
import { ProtocolError } from '../../src/protocol/errors';
import {
  analyzeCandidate,
  initJob,
  registerBrief,
  registerProgram,
  renderCandidate,
  selectCandidate,
} from '../../src/protocol/job';
import type { AudioAssetManifestV1 } from '../../src/protocol/manifest';
import { publishJob, verifyManifest } from '../../src/protocol/publish';
import { jobStatus } from '../../src/protocol/status';
import { PIPELINE_BLOCK, PIPELINE_TIMEOUT } from '../support/timeouts';
import { createTestRepo, REFERENCE_TARGET, testBrief, testProgram, type TestRepo } from './repo';

/**
 * Kanal/yerleşim politikası: kanal sayısı çalınış biçiminin kararıdır ve
 * yanlışı brief doğrulamasında, stereo'nun mono uyumu kodek sonrası yayın
 * kapısında yakalanır.
 */
const RATE = 48000;

function noise(seed: number, frames = RATE): Float32Array {
  const random = createRandom(seed);
  return Float32Array.from({ length: frames }, () => (random.next() * 2 - 1) * 0.3);
}

describe('stereo görüntü ölçümü', () => {
  it('özdeş kanal dual-mono ve kayıpsız; ilintisiz ≈3 LU; ters faz katlamada yok olur', () => {
    const a = noise(1);
    const same = measureStereoImage([a, a.slice()], RATE);
    expect(same).toMatchObject({ dualMono: true, correlation: 1, monoFoldLossDb: 0 });
    const wide = measureStereoImage([a, noise(2)], RATE);
    expect(wide?.dualMono).toBe(false);
    expect(Math.abs(wide?.correlation ?? 1)).toBeLessThan(0.05);
    expect(wide?.monoFoldLossDb).toBeCloseTo(3, 0);
    const inverted = measureStereoImage([a, a.map((x) => -x)], RATE);
    expect(inverted).toMatchObject({ correlation: -1, monoFoldLossDb: null, dualMono: false });
    expect(layoutViolations('sfx', 'screen', 2, inverted).join()).toMatch(/ters faz/);
    expect(measureStereoImage([a], RATE)).toBeNull();
  });

  it('eşik: yarı ters fazlı genişletme düşer, ilintisiz stereo geçer', () => {
    const a = noise(3);
    const b = noise(4);
    const anti = measureStereoImage(
      [a.map((x, i) => x + 0.6 * b[i]), a.map((x, i) => -0.7 * x + 0.6 * b[i])],
      RATE,
    );
    expect(anti?.monoFoldLossDb).toBeGreaterThan(4);
    expect(layoutViolations('ambience', 'bed', 2, anti).join()).toMatch(/mono katlama kaybı/);
    expect(layoutViolations('ambience', 'bed', 2, measureStereoImage([a, b], RATE))).toEqual([]);
  });
});

describe('yerleşim sözleşmesi', () => {
  it('sınıf varsayılanı ve izinli kanal sayıları', () => {
    expect(placementOf('sfx', undefined)).toBe('positional');
    expect(placementOf('ui', undefined)).toBe('screen');
    expect(placementOf('ambience', undefined)).toBe('bed');
    expect(layoutProblem('sfx', 'positional', 2)).toMatch(/1 kanal ister/);
    expect(layoutProblem('sfx', 'screen', 2)).toBeNull();
    expect(layoutProblem('ui', 'positional', 1)).toMatch(/yerleşimi almaz/);
    expect(layoutProblem('music', 'bed', 1)).toMatch(/2 kanal ister/);
    expect(layoutProblem('ambience', 'positional', 1)).toBeNull();
  });

  it('dual-mono yalnız mono’ya izin verilen yerde ihlaldir', () => {
    const a = noise(5);
    const image = measureStereoImage([a, a.slice()], RATE);
    expect(layoutViolations('ui', 'screen', 2, image).join()).toMatch(/dual-mono/);
    expect(layoutViolations('music-stem', 'bed', 2, image)).toEqual([]);
  });

  it('brief yanlış kanal sayısını yerleşimle birlikte reddeder', () => {
    const reject = (overrides: Record<string, unknown>) => {
      expect(() => validateBrief(testBrief(overrides))).toThrow(AudioParamError);
      expect(() => validateBrief(testBrief(overrides))).toThrow(/kanal ister|yerleşimi almaz/);
    };
    reject({ channels: 2 });
    reject({ assetClass: 'ambience', subtype: 'ambience', placement: 'positional', channels: 2 });
    reject({ assetClass: 'ui', placement: 'bed' });
    expect(validateBrief(testBrief({ channels: 2, placement: 'screen' }))).toMatchObject({
      placement: 'screen',
      channels: 2,
    });
    expect(validateBrief(testBrief())).not.toHaveProperty('placement');
  });
});

const MANIFEST = 'devtools/audio-synth/reference/production/manifests/sfx/knock.json';

function stereoProgram(right: Record<string, unknown>): Record<string, unknown> {
  const hit = (name: string, pan: number, extra: Record<string, unknown> = {}) => ({
    name,
    pan,
    source: { primitive: 'source.noise', version: 1, params: { color: 'white' } },
    articulation: {
      primitive: 'articulation.envelope',
      version: 1,
      params: { attack: 0.001, decay: 0.12, sustainLevel: 0, release: 0.05 },
    },
    ...extra,
  });
  return testProgram({ channels: 2, layers: [hit('left', -1), hit('right', 1, right)] });
}

describe('yayın kapısında yerleşim', PIPELINE_BLOCK, () => {
  let repo: TestRepo;
  beforeEach(() => {
    repo = createTestRepo();
  });
  afterEach(() => repo.cleanup());

  function publish(program: Record<string, unknown>, brief: Record<string, unknown>) {
    const loc = repo.loc('knock');
    initJob(loc, { target: REFERENCE_TARGET });
    registerBrief(loc, brief);
    registerProgram(loc, program);
    renderCandidate(loc);
    analyzeCandidate(loc);
    selectCandidate(loc, undefined, 'yerleşim');
    return () => publishJob(loc);
  }

  it(
    'mono konumsal ses yerleşimi kaydeder; verify yerleşimi yeniden sınar',
    () => {
      publish(testProgram(), testBrief())();
      const manifest = JSON.parse(
        readFileSync(join(repo.root, MANIFEST), 'utf8'),
      ) as AudioAssetManifestV1;
      expect(manifest.layout).toEqual({
        scheme: 'channel-layout-v1',
        placement: 'positional',
        channels: 1,
        image: null,
      });
      const check = verifyManifest(repo.root, MANIFEST).checks.find((c) => c.name === 'layout');
      expect(check).toMatchObject({ ok: true, detail: 'geçti' });

      // Yalnız brief'in yerleşim beyanı değişir: program ve seçim aynı kalsa
      // bile yayımlanan manifest eski beyanı anlatır ve bayat görünür.
      const loc = repo.loc('knock');
      registerBrief(loc, testBrief({ placement: 'screen' }));
      registerProgram(loc, testProgram());
      const status = jobStatus(loc);
      expect(status.artifacts.selection.state).toBe('valid');
      expect(status.artifacts.publication).toMatchObject({
        state: 'stale',
        reason: 'yayımlanan brief güncel değil',
      });
      expect(status.next.action).toBe('publish');
    },
    PIPELINE_TIMEOUT,
  );

  it(
    'ekran yerleşimli stereo: gerçek stereo geçer, özdeş kanallar yayımlanmaz',
    () => {
      const brief = testBrief({ channels: 2, placement: 'screen' });
      const differing = stereoProgram({
        source: { primitive: 'source.noise', version: 1, params: { color: 'pink' } },
      });
      publish(differing, brief)();
      const manifest = JSON.parse(
        readFileSync(join(repo.root, MANIFEST), 'utf8'),
      ) as AudioAssetManifestV1;
      expect(manifest.layout?.placement).toBe('screen');
      expect(manifest.layout?.image?.dualMono).toBe(false);
      expect(manifest.layout?.image?.monoFoldLossDb).toBeLessThan(4);
    },
    PIPELINE_TIMEOUT,
  );

  it(
    'iki kanalı özdeş stereo politika hatasıyla düşer',
    () => {
      const centred = testProgram({ channels: 2 });
      const run = publish(centred, testBrief({ channels: 2, placement: 'screen' }));
      expect(run).toThrow(ProtocolError);
      expect(run).toThrow(/dual-mono/);
    },
    PIPELINE_TIMEOUT,
  );
});
