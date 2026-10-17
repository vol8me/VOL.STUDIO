import { describe, expect, it } from 'vitest';
import { maxMomentaryLoudness } from '../../src/analysis/loudness';
import { measureLoopSeam } from '../../src/analysis/seam';
import { AudioParamError } from '../../src/guard/errors';
import { estimateProgramCost, renderProgram } from '../../src/program/render';
import { outputChannels, outputSeconds, resolveProgram } from '../../src/program/schema';
import { programNodeIds } from '../../src/program/surface';
import {
  expandTreatment,
  TREATMENT_PROFILES,
  treatmentProfile,
  treatmentProfileHash,
} from '../../src/program/treatmentProfiles';
import { RENDER_BLOCK } from '../support/timeouts';

/**
 * İşleme katmanı kaynağın BİTMİŞ çıktısına uygulanır: boş zincir kaynağı
 * bit bit korur; kanal, süre, seviye ve loop davranışı beyan edildiği gibi
 * olur; zincir sabit parametre ister.
 */
const RATE = 48000;

function hit(extra: Record<string, unknown> = {}) {
  return {
    schema: 'AcousticProgramV1',
    sampleRate: RATE,
    channels: 1,
    durationSeconds: 0.6,
    seed: 3,
    layers: [
      {
        name: 'hit',
        source: { primitive: 'source.noise', version: 1, params: { color: 'white' } },
        articulation: {
          primitive: 'articulation.envelope',
          version: 1,
          params: { attack: 0.001, decay: 0.15, sustainLevel: 0, release: 0.05 },
        },
      },
    ],
    master: { normalize: 'peak', peakDbfs: -3 },
    ...extra,
  };
}

const reverb = {
  primitive: 'effect.reverb',
  version: 1,
  params: { decay: 1.2, amount: 0.4, roomSize: 0.7, damp: 0.5, preDelay: 0.02 },
};

const reject = (value: unknown, fragment: RegExp) => {
  expect(() => resolveProgram(value)).toThrow(AudioParamError);
  expect(() => resolveProgram(value)).toThrow(fragment);
};

describe('işleme katmanı: sözleşme', () => {
  it('sabit parametre, sidechain yok, loop kaynağında kuyruk payı yok', () => {
    reject(
      hit({
        gestures: {
          g: {
            curve: 'curve.linear',
            version: 1,
            points: [
              [0, 0.2],
              [0.5, 0.8],
            ],
          },
        },
        treatment: {
          chain: [{ ...reverb, params: { ...reverb.params, amount: { gesture: 'g' } } }],
        },
      }),
      /parametre sabittir/,
    );
    reject(
      hit({ treatment: { chain: [{ ...reverb, sidechain: { bus: 'x' } }] } }),
      /sidechain|bilinmeyen/,
    );
    reject(
      hit({
        master: { normalize: 'peak', loop: { crossfadeSeconds: 0.1 } },
        treatment: { chain: [reverb], tailSeconds: 0.5 },
      }),
      /kuyruk payı almaz/,
    );
    reject(hit({ treatment: { chain: [], channels: 3 } }), /1 ya da 2/);
  });

  it('çıktı süresi ve kanalı işleme katmanından; maliyet ve yüzey zinciri sayar', () => {
    const plain = resolveProgram(hit());
    const treated = resolveProgram(
      hit({ treatment: { chain: [reverb], channels: 2, tailSeconds: 0.8 } }),
    );
    expect(outputSeconds(treated)).toBeCloseTo(outputSeconds(plain) + 0.8, 9);
    expect(outputChannels(treated)).toBe(2);
    expect(estimateProgramCost(treated).workUnits).toBeGreaterThan(
      estimateProgramCost(plain).workUnits,
    );
    expect(programNodeIds(treated, hit()).map((ref) => ref.id)).toContain('effect.reverb');
  });
});

describe('işleme katmanı: render', RENDER_BLOCK, () => {
  it('boş zincir ve 0 LU kaynağı bit bit korur', () => {
    const source = renderProgram(hit());
    const same = renderProgram(hit({ treatment: { chain: [] } }));
    expect(same.channels).toEqual(source.channels);
  });

  it('kanal katlama/çoğaltma, kuyruk uzunluğu, göreli seviye ve sessiz son', () => {
    const source = renderProgram(hit());
    const out = renderProgram(
      hit({ treatment: { chain: [reverb], channels: 2, tailSeconds: 0.8, levelLu: -6 } }),
    );
    expect(out.channels).toHaveLength(2);
    expect(out.channels[0].length).toBe(source.channels[0].length + 0.8 * RATE);
    expect(out.channels[0][out.channels[0].length - 1]).toBe(0);
    const delta =
      maxMomentaryLoudness(out.channels, RATE) -
      maxMomentaryLoudness([source.channels[0], source.channels[0]], RATE);
    expect(delta).toBeCloseTo(-6, 1);
    const stereo = hit({ channels: 2, layers: [{ ...hit().layers[0], pan: -0.6 }] });
    expect(
      renderProgram({ ...stereo, treatment: { chain: [], channels: 1 } }).channels,
    ).toHaveLength(1);
  });

  it('loop kaynağı dairesel işlenir: uzunluk korunur, dikiş sürekli kalır', () => {
    const loop = hit({
      durationSeconds: 1.2,
      layers: [
        {
          name: 'bed',
          source: { primitive: 'source.noise', version: 1, params: { color: 'pink' } },
        },
      ],
      master: { normalize: 'peak', peakDbfs: -6, loop: { crossfadeSeconds: 0.2 } },
    });
    const source = renderProgram(loop);
    const out = renderProgram({
      ...loop,
      treatment: { chain: [reverb], limiter: { ceilingDbtp: -3 } },
    });
    expect(out.channels[0].length).toBe(source.channels[0].length);
    expect(measureLoopSeam(out.channels, RATE).pass).toBe(true);
  });
});

describe('teslim profilleri', () => {
  it('kimlik: sürüm + render’a giren alanlar; açıklama ve model bilgisi girmez', () => {
    const far = treatmentProfile('distance-far');
    expect(far).toBeDefined();
    const hash = treatmentProfileHash(far!);
    expect(treatmentProfileHash({ ...far!, description: 'başka' })).toBe(hash);
    expect(treatmentProfileHash({ ...far!, levelLu: -7 })).not.toBe(hash);
    expect(new Set(TREATMENT_PROFILES.map((p) => p.id)).size).toBe(TREATMENT_PROFILES.length);
  });

  it('mono görüntü yalnız yerleşim izin verirse katlar; loop kaynağında kuyruk yazılmaz', () => {
    const radio = treatmentProfile('radio')!;
    expect(
      expandTreatment(radio, { channels: 2, loop: false, monoAllowed: true }, -1.5).channels,
    ).toBe(1);
    expect(
      expandTreatment(radio, { channels: 2, loop: false, monoAllowed: false }, -1.5).channels,
    ).toBe(2);
    const far = treatmentProfile('distance-far')!;
    expect(
      expandTreatment(far, { channels: 1, loop: true, monoAllowed: true }, -1.5),
    ).not.toHaveProperty('tailSeconds');
    for (const profile of TREATMENT_PROFILES) {
      const doc = hit({
        treatment: expandTreatment(profile, { channels: 1, loop: false, monoAllowed: true }, -1.5),
      });
      expect(() => resolveProgram(doc), profile.id).not.toThrow();
    }
  });
});
