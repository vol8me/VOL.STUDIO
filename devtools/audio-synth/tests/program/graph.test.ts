import { describe, expect, it } from 'vitest';
import { truePeakDb } from '../../src/analysis/loudness';
import { measureLoopSeam } from '../../src/analysis/seam';
import { AudioParamError } from '../../src/guard/errors';
import { estimateProgramCost, renderProgram } from '../../src/program/render';
import { outputSeconds, resolveProgram } from '../../src/program/schema';
import { soundGraph, topologyOf } from '../../src/program/soundGraph';
import { hashCanonical, hashPcm } from '../../src/protocol/canonical';
import { snakeHiss, tankFire } from './graphFixtures';

/**
 * SoundGraph (Dalga 7) ve bus/send grafiği (Dalga 10): tank ateşi ile yılan
 * tıslaması AYNI altyapıda farklı topolojiyle; mechanism/body ortak room
 * send'ine; izdüşüm deterministik serileştirilir; kurallar render'dan önce.
 */
const node = (primitive: string, params: Record<string, unknown> = {}) => ({
  primitive,
  version: 1,
  params,
});
const pcm = (program: unknown) => {
  const r = renderProgram(program);
  return hashPcm(r.channels, r.sampleRate);
};
const rejects = (program: unknown, path: string, issue: string) => {
  try {
    resolveProgram(program);
  } catch (error) {
    expect(error).toBeInstanceOf(AudioParamError);
    expect({
      path: (error as AudioParamError).path,
      issue: (error as AudioParamError).issue,
    }).toEqual({ path, issue });
    return;
  }
  throw new Error(`${path} reddedilmedi`);
};

describe('SoundGraph topolojisi', () => {
  it('tank ateşi ve yılan tıslaması aynı render yolundan farklı topolojiyle geçer', () => {
    const tank = soundGraph(tankFire());
    const snake = soundGraph(snakeHiss());
    expect(tank.roles).toEqual({
      body: ['layer:pressure'],
      mechanism: ['layer:bolt'],
      transient: ['layer:shock'],
    });
    expect(tank.edges).toContainEqual({ from: 'layer:shock', to: 'bus:room', kind: 'send' });
    expect(tank.edges).toContainEqual({ from: 'bus:mech', to: 'bus:room', kind: 'send' });
    expect(tank.edges).toContainEqual({ from: 'bus:room', to: 'master', kind: 'route' });
    expect(snake.nodes.find((n) => n.id === 'layer:hiss')?.chain).toEqual([
      'exciter.turbulence',
      'resonator.biquad',
      'articulation.amplitude',
    ]);
    expect(hashCanonical(topologyOf(tank))).not.toBe(hashCanonical(topologyOf(snake)));
    for (const program of [tankFire(), snakeHiss()]) {
      const r = renderProgram(program);
      expect(r.channels[0].every((v) => Number.isFinite(v))).toBe(true);
      expect(Math.max(...r.channels[0].map(Math.abs))).toBeGreaterThan(0.01);
    }
  });

  it('izdüşüm deterministik: bus anahtar sırası ve yeniden çözüm özeti değiştirmez', () => {
    const program = tankFire();
    const reversed = {
      ...program,
      buses: Object.fromEntries(Object.entries(program.buses as object).reverse()),
    };
    expect(hashCanonical(soundGraph(program))).toBe(hashCanonical(soundGraph(reversed)));
    expect(pcm(program)).toBe(pcm(reversed));
    expect(resolveProgram(program).buses.map((b) => b.name)).toEqual(['mech', 'room']);
  });

  it('rol/mekanizma/gerekçe ses üretmez; boş bus üzerinden geçen tek katman master’la bit-eşit', () => {
    const plain = snakeHiss();
    const annotated = snakeHiss();
    const layer = (annotated.layers as Record<string, unknown>[])[0];
    layer.rationale = 'akış gürültüsü + dar bant: tıslama';
    expect(pcm(annotated)).toBe(pcm(plain));
    const routed: Record<string, unknown> = { ...snakeHiss(), buses: { pass: {} } };
    (routed.layers as Record<string, unknown>[])[0].bus = 'pass';
    expect(pcm(routed)).toBe(pcm(plain));
  });

  it('send ve return efekti kuyruğu taşır; send seviyesi kuyruk enerjisini büyütür', () => {
    const sent = (levelDb: number | null) => {
      const program = snakeHiss();
      const layer = (program.layers as Record<string, unknown>[])[0];
      layer.durationSeconds = 0.3;
      if (levelDb !== null) layer.sends = [{ bus: 'room', levelDb }];
      return {
        ...program,
        master: { normalize: 'none', gainDb: 0, fadeOutSeconds: 0.005 },
        ...(levelDb === null
          ? {}
          : { buses: { room: { effects: [node('effect.reverb', { decay: 1.5, amount: 1 })] } } }),
      };
    };
    const tail = (program: unknown) => {
      const x = renderProgram(program).channels[0];
      let e = 0;
      for (let i = Math.round(0.5 * 24000); i < Math.round(0.95 * 24000); i++) e += x[i] * x[i];
      return e;
    };
    const dry = tail(sent(null));
    const low = tail(sent(-18));
    const high = tail(sent(-6));
    expect(dry).toBeLessThan(1e-9);
    expect(low).toBeGreaterThan(1e-6);
    expect(10 * Math.log10(high / low)).toBeCloseTo(12, 3);
  });

  it('insert’ler katman üzerinde çalışır; sıra ve efekt PCM’e girer', () => {
    const base = snakeHiss();
    const eq = snakeHiss();
    (eq.layers as Record<string, unknown>[])[0].inserts = [
      node('effect.eq-shelf', { edge: 'high', gainDb: -9 }),
    ];
    expect(pcm(eq)).not.toBe(pcm(base));
    expect(
      soundGraph(eq)
        .nodes.find((n) => n.id === 'layer:hiss')
        ?.chain.at(-1),
    ).toBe('effect.eq-shelf');
  });

  it('sidechain: master kompresörü bir katmanı dinler; grafikte sidechain kenarı görünür', () => {
    const keyed = tankFire({
      effects: [
        { ...node('effect.compressor', { thresholdDb: -30, ratio: 8 }), sidechain: 'shock' },
      ],
    });
    expect(soundGraph(keyed).edges).toContainEqual({
      from: 'layer:shock',
      to: 'master',
      kind: 'sidechain',
    });
    expect(pcm(keyed)).not.toBe(pcm(tankFire()));
    const busKeyed = tankFire();
    (busKeyed.buses as Record<string, Record<string, unknown>>).room.effects = [
      { ...node('effect.compressor', { thresholdDb: -30 }), sidechain: 'mech' },
    ];
    expect(soundGraph(busKeyed).edges).toContainEqual({
      from: 'bus:mech',
      to: 'bus:room',
      kind: 'sidechain',
    });
    expect(pcm(busKeyed)).not.toBe(pcm(tankFire()));
  });
});

describe('SoundGraph kuralları (render öncesi)', () => {
  const withBus = (
    mutate: (program: Record<string, unknown>) => unknown,
  ): Record<string, unknown> => {
    const program = tankFire();
    mutate(program);
    return program;
  };
  const layers = (p: Record<string, unknown>): Record<string, unknown>[] =>
    p.layers as Record<string, unknown>[];
  const buses = (p: Record<string, unknown>): Record<string, Record<string, unknown>> =>
    p.buses as Record<string, Record<string, unknown>>;

  it.each([
    [
      'tanımsız bus',
      (p: Record<string, unknown>): void => {
        layers(p)[0].bus = 'nowhere';
      },
      'layers[0].bus',
      'unknown-id',
    ],
    [
      'master adlı bus',
      (p: Record<string, unknown>): void => {
        buses(p).master = {};
      },
      'buses.master',
      'combination',
    ],
    [
      'zamana yayılan insert',
      (p: Record<string, unknown>): void => {
        layers(p)[0].inserts = [node('effect.reverb')];
      },
      'layers[0].inserts[0].primitive',
      'combination',
    ],
    [
      'döngü',
      (p: Record<string, unknown>): void => {
        buses(p).room.output = 'mech';
      },
      'buses',
      'combination',
    ],
    [
      'girdisiz bus',
      (p: Record<string, unknown>): void => {
        buses(p).idle = {};
      },
      'buses.idle',
      'combination',
    ],
    [
      'kendine send',
      (p: Record<string, unknown>): void => {
        buses(p).mech.sends = [{ bus: 'mech', levelDb: -3 }];
      },
      'buses.mech.sends[0].bus',
      'combination',
    ],
    [
      'sidechain almayan efekt',
      (p: Record<string, unknown>): void => {
        buses(p).room.effects = [{ ...node('effect.eq-bell'), sidechain: 'shock' }];
      },
      'buses.room.effects[0].sidechain',
      'combination',
    ],
    [
      'bus kendi sidechain’i',
      (p: Record<string, unknown>): void => {
        buses(p).room.effects = [{ ...node('effect.compressor'), sidechain: 'room' }];
      },
      'buses.room.effects[0].sidechain',
      'combination',
    ],
    [
      'tanımsız sidechain',
      (p: Record<string, unknown>): void => {
        p.effects = [{ ...node('effect.compressor'), sidechain: 'ghost' }];
      },
      'effects[0].sidechain',
      'unknown-id',
    ],
    [
      'ontolojide olmayan mekanizma',
      (p: Record<string, unknown>): void => {
        layers(p)[0].mechanism = 'telepathy';
      },
      'layers[0].mechanism',
      'unknown-id',
    ],
    [
      'kapalı rol sözlüğü',
      (p: Record<string, unknown>): void => {
        layers(p)[0].role = 'hero';
      },
      'layers[0].role',
      'type',
    ],
    [
      'tanımsız send hedefi',
      (p: Record<string, unknown>): void => {
        layers(p)[0].sends = [{ bus: 'nowhere', levelDb: 0 }];
      },
      'layers[0].sends[0].bus',
      'unknown-id',
    ],
  ] as const)('%s reddedilir', (_n, mutate, path, issue) => {
    rejects(withBus(mutate), path, issue);
  });

  it('bus, stil ve limiter maliyeti ayırmadan önce tahmine girer', () => {
    const plain = estimateProgramCost(resolveProgram(snakeHiss()));
    const heavy = estimateProgramCost(
      resolveProgram({
        ...snakeHiss(),
        style: { profile: 'lo-fi', version: 1 },
        master: { normalize: 'peak', peakDbfs: -3, limiter: { ceilingDbtp: -1 } },
      }),
    );
    expect(heavy.workUnits).toBeGreaterThan(plain.workUnits * 2);
    expect(heavy.peakBytes).toBeGreaterThan(plain.peakBytes);
  });
});

describe('master: teslim sınırlayıcısı ve dikişsiz loop', () => {
  it('master.limiter kodek öncesi true peak’i tavanın altında tutar', () => {
    const program = tankFire({
      master: { normalize: 'peak', peakDbfs: 0, limiter: { ceilingDbtp: -1.5 } },
    });
    const r = renderProgram(program);
    expect(truePeakDb(r.channels, r.sampleRate)).toBeLessThanOrEqual(-1.5 + 0.01);
    const unlimited = renderProgram(tankFire({ master: { normalize: 'peak', peakDbfs: 0 } }));
    expect(truePeakDb(unlimited.channels, unlimited.sampleRate)).toBeGreaterThan(-0.5);
  });

  it('master.loop: çıktı D − X sürer ve dikiş QA’sından geçer; kesik doku geçmez', () => {
    const texture = (master: Record<string, unknown>) => ({
      schema: 'AcousticProgramV1',
      sampleRate: 24000,
      channels: 1,
      durationSeconds: 3,
      seed: 4,
      layers: [
        {
          name: 'air',
          source: node('exciter.turbulence', { pressure: 0.7, brightness: 0.3, color: 'pink' }),
        },
      ],
      master,
    });
    const looped = texture({ normalize: 'peak', peakDbfs: -3, loop: { crossfadeSeconds: 0.25 } });
    const r = renderProgram(looped);
    expect(r.channels[0].length).toBe(Math.round((3 - 0.25) * 24000));
    expect(outputSeconds(resolveProgram(looped))).toBeCloseTo(2.75, 9);
    expect(measureLoopSeam(r.channels, r.sampleRate).pass).toBe(true);
    const cut = renderProgram(texture({ normalize: 'peak', peakDbfs: -3, fadeOutSeconds: 0 }));
    const seam = measureLoopSeam(cut.channels, cut.sampleRate);
    expect(seam.pass).toBe(false);
    expect(seam.jumpRatio).toBeGreaterThan(1.5);
    rejects(
      texture({ loop: { crossfadeSeconds: 0.25 }, fadeOutSeconds: 0.1 }),
      'master.loop',
      'combination',
    );
  });
});
