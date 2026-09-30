import { describe, expect, it } from 'vitest';
import { estimateProgramCost, renderProgram } from '../../src/program/render';
import { PROGRAM_REGISTRY } from '../../src/program/catalog';
import { renderProjection } from '../../src/program/surface';
import { hashPcm } from '../../src/kernel/canonical';
import { resolveProgram } from '../../src/program/schema';

const program = (params: Record<string, number | string> = {}) => ({
  schema: 'AcousticProgramV1',
  sampleRate: 44100,
  channels: 1,
  durationSeconds: 0.6,
  seed: 71,
  layers: [
    {
      name: 'tone',
      source: {
        primitive: 'source.instrument',
        version: 2,
        params: { instrument: 'preparedPiano', frequency: 220, noteSeconds: 0.2, ...params },
      },
    },
  ],
  master: { normalize: 'none', fadeOutSeconds: 0.01 },
});

describe('kanonik enstrüman kaynağı', () => {
  it('parlak presetler açıktır; emekli v1 adıyla istenirse reddedilir', () => {
    const fresh = program();
    fresh.layers[0].source.params.instrument = 'crystalBell';
    expect(() => resolveProgram(fresh)).not.toThrow();
    fresh.layers[0].source.version = 1;
    expect(() => resolveProgram(fresh)).toThrow(/sürüm/);
  });
  it('çıkıştan uzun nota ayırmadan önce kendi iş ve bellek bütçesine girer', () => {
    const short = estimateProgramCost(resolveProgram(program({ noteSeconds: 0.1 })));
    const long = estimateProgramCost(resolveProgram(program({ noteSeconds: 20 })));
    expect(long.workUnits).toBeGreaterThan(short.workUnits * 5);
    expect(long.peakBytes).toBeGreaterThan(short.peakBytes * 5);
  });
  it('preset parametreleri sürümlü düğümün render sözleşmesine girer', () => {
    const projection = renderProjection(PROGRAM_REGISTRY.get('source.instrument'));
    expect(projection).toHaveProperty('renderContract.preparedPiano');
    expect(projection).toHaveProperty('renderContract.cello');
  });
  it('aynı preset, program ve tohum aynı PCM verir', () => {
    const first = renderProgram(program());
    const second = renderProgram(program());
    expect(first.channels[0].some((sample) => sample !== 0)).toBe(true);
    expect(hashPcm(first.channels, first.sampleRate)).toBe(
      hashPcm(second.channels, second.sampleRate),
    );
  });

  it.each(['cello', 'preparedPiano', 'doubleBass', 'additivePad'])(
    '%s preset’i mono, sonlu ve deterministik kısa olaya dönüşür',
    (instrument) => {
      const rendered = renderProgram(program({ instrument }));
      expect(rendered.channels).toHaveLength(1);
      expect(rendered.channels[0].every(Number.isFinite)).toBe(true);
      expect(rendered.channels[0].some((sample) => sample !== 0)).toBe(true);
    },
  );

  it('preset, perde, nota süresi ve velocity birbirinden bağımsız PCM etkisi taşır', () => {
    const hash = (params = {}) => {
      const rendered = renderProgram(program(params));
      return hashPcm(rendered.channels, rendered.sampleRate);
    };
    const baseline = hash();
    for (const params of [
      { instrument: 'cello' },
      { frequency: 330 },
      { noteSeconds: 0.1 },
      { velocity: 0.4 },
      { articulation: 'struck' },
    ]) {
      expect(hash(params)).not.toBe(baseline);
    }
  });
});
