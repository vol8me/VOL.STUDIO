import { describe, expect, it } from 'vitest';
import { estimatePitch } from '../../src/analysis/descriptors';
import { analyzeAudio } from '../../src/analysis/report';
import { measureLoopSeam } from '../../src/analysis/seam';
import { expandArchetype } from '../../src/program/archetype';
import { renderProgram } from '../../src/program/render';
import { soundGraph } from '../../src/program/soundGraph';
import { hashPcm } from '../../src/protocol/canonical';
import { centroid, envelopeRate, peakFrequency } from '../support/measure';

/**
 * Dalga 8 SFX ailesi kapanış kanıtları. Her aile registry yapı taşıdır; bu
 * dosya ölçülen yönleri sınar — "gerçekçi" iddiası yoktur, insan dinlemesi
 * ayrı ve `pending-human`dır.
 */
const node = (primitive: string, params: Record<string, unknown> = {}) => ({
  primitive,
  version: 1,
  params,
});
function single(
  source: Record<string, unknown>,
  seconds = 1,
  rate = 24000,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schema: 'AcousticProgramV1',
    sampleRate: rate,
    channels: 1,
    durationSeconds: seconds,
    seed: 21,
    layers: [{ name: 'x', source }],
    master: { normalize: 'none', gainDb: 0, fadeOutSeconds: 0.01 },
    ...extra,
  };
}
const render = (program: unknown) => renderProgram(program).channels[0];
const energy = (x: Float32Array, from = 0, to = x.length) => {
  let e = 0;
  for (let i = from; i < Math.min(to, x.length); i++) e += x[i] * x[i];
  return e;
};
const strictlyIncreasing = (values: readonly number[]) =>
  values.every((v, i) => i === 0 || v > values[i - 1]);

describe('Impact/Contact', () => {
  it('hız arttıkça uyarım enerjisi ve atak parlaklığı monoton artar (t_c ∝ v^(−1/5) çözülebilir çiftte)', () => {
    const shots = [1, 3, 6, 12].map((velocity) =>
      render(
        single(
          node('source.contact', { velocity, materialA: 'wood', materialB: 'wood', debris: 0 }),
          1,
          48000,
        ),
      ),
    );
    expect(strictlyIncreasing(shots.map((x) => energy(x)))).toBe(true);
    const peaks = shots.map((x) => Math.max(...x.subarray(0, 240).map(Math.abs)));
    expect(strictlyIncreasing(peaks)).toBe(true);
    expect(strictlyIncreasing(shots.map((x) => centroid(x, 48000, 0, 256)))).toBe(true);
  });

  it('metal-metal, taş-taş ve yumuşak-sert aynı motorla ayrışır (sönüm ve renk)', () => {
    const pair = (a: string, b: string) =>
      analyzeAudio(
        [render(single(node('source.contact', { materialA: a, materialB: b, debris: 0 }), 1.5))],
        24000,
        'source-pcm',
      );
    const metal = pair('metal', 'metal');
    const stone = pair('stone', 'stone');
    const soft = pair('rubber', 'metal');
    expect(metal.temporal.decay40Seconds ?? Infinity).toBeGreaterThan(
      stone.temporal.decay40Seconds as number,
    );
    expect(soft.spectral.centroidHz as number).toBeLessThan(metal.spectral.centroidHz as number);
    expect(stone.spectral.flatness as number).toBeGreaterThan(metal.spectral.flatness as number);
  });
});

describe('Pressure/Explosion/Discharge (archetype.pressure-event)', () => {
  const event = (params: Record<string, number>, variation = 0) =>
    expandArchetype({
      schema: 'ArchetypeRequestV1',
      archetype: 'archetype.pressure-event',
      version: 1,
      variation,
      sampleRate: 24000,
      params: { durationSeconds: 2, ...params },
    }) as unknown as Record<string, unknown>;
  const measured = (params: Record<string, number>) => {
    const program = {
      ...event(params),
      master: { normalize: 'none', gainDb: 0, fadeOutSeconds: 0.02 },
    };
    const report = analyzeAudio([render(program)], 24000, 'source-pcm');
    const x = render(program);
    const lowDb =
      10 *
      Math.log10(
        10 ** ((report.spectral.bandsDb.sub as number) / 10) +
          10 ** ((report.spectral.bandsDb.low as number) / 10),
      );
    let slope = Math.abs(x[0]);
    for (let i = 1; i < 480; i++) slope = Math.max(slope, Math.abs(x[i] - x[i - 1]));
    return { lowDb, slope };
  };

  it('tank/havan atışı, büyük patlama ve enerji deşarjı aynı aileden farklı programlardır', () => {
    const shot = event({
      size: 0.4,
      transient: 0.8,
      body: 0.6,
      blast: 0.4,
      debris: 0.2,
      tail: 0.3,
    });
    const explosion = event({
      size: 0.95,
      transient: 0.5,
      body: 0.9,
      blast: 0.9,
      debris: 0.8,
      tail: 0.7,
    });
    const discharge = event({
      size: 0.15,
      transient: 0.9,
      body: 0.2,
      blast: 0,
      debris: 0,
      tail: 0.2,
      discharge: 0.9,
    });
    const layers = (p: Record<string, unknown>) =>
      (p.layers as { name: string }[]).map((l) => l.name);
    expect(layers(explosion)).toEqual(['shock', 'body', 'blast', 'debris']);
    expect(layers(discharge)).toEqual(['shock', 'body', 'discharge']);
    const hashes = [shot, explosion, discharge].map((p) => {
      const r = renderProgram(p);
      return hashPcm(r.channels, r.sampleRate);
    });
    expect(new Set(hashes).size).toBe(3);
    expect(soundGraph(explosion).nodes.some((n) => n.id === 'bus:space')).toBe(true);
  });

  it('transient ve low-end bağımsız: biri değişirken öteki ölçülür biçimde sabit kalır', () => {
    const base = { size: 0.5, blast: 0, debris: 0, tail: 0 };
    const softShock = measured({ ...base, transient: 0.1, body: 0.5 });
    const hardShock = measured({ ...base, transient: 0.95, body: 0.5 });
    const thinBody = measured({ ...base, transient: 0.5, body: 0.1 });
    const fullBody = measured({ ...base, transient: 0.5, body: 0.95 });
    expect(hardShock.slope).toBeGreaterThan(softShock.slope * 3);
    expect(Math.abs(hardShock.lowDb - softShock.lowDb)).toBeLessThan(2.5);
    expect(fullBody.lowDb - thinBody.lowDb).toBeGreaterThan(8);
    expect(Math.abs(fullBody.slope / thinBody.slope - 1)).toBeLessThan(0.25);
  });

  it('yapısal kısıt: ölçeğe göre çok kısa süre render’dan önce reddedilir', () => {
    expect(() => event({ size: 1, durationSeconds: 0.5 })).toThrow(/süre/);
  });
});

describe('Weapon/Launcher (archetype.launcher)', () => {
  const launcher = (params: Record<string, number>, profiles: Record<string, unknown>) =>
    expandArchetype({
      schema: 'ArchetypeRequestV1',
      archetype: 'archetype.launcher',
      version: 1,
      variation: 0,
      sampleRate: 24000,
      params: { durationSeconds: 2.5, ...params },
      profiles,
    }) as unknown as Record<string, unknown>;

  it('tank topu, arcade taret ve bilimkurgu fırlatıcı aynı archetype + farklı stil/materyal', () => {
    const tank = launcher(
      { caliber: 0.9, charge: 0, mechanism: 0.7, debris: 0.5, tail: 0.5 },
      {
        style: { profile: 'realistic-heavy', version: 1 },
        material: 'metal',
      },
    );
    const turret = launcher(
      { caliber: 0.3, charge: 0, mechanism: 0.8, debris: 0.2, tail: 0.1 },
      {
        style: { profile: 'arcade-industrial', version: 1 },
        material: 'hard-plastic',
      },
    );
    const scifi = launcher(
      { caliber: 0.4, charge: 0.8, mechanism: 0, debris: 0, tail: 0.4 },
      {
        style: { profile: 'clean-sci-fi', version: 1 },
        material: 'ceramic',
      },
    );
    const graphs = [tank, turret, scifi].map((p) => soundGraph(p));
    expect(graphs.map((g) => g.style?.profile)).toEqual([
      'realistic-heavy',
      'arcade-industrial',
      'clean-sci-fi',
    ]);
    expect(graphs[2].nodes.some((n) => n.id === 'layer:charge')).toBe(true);
    expect(graphs[0].nodes.some((n) => n.id === 'layer:charge')).toBe(false);
    for (const graph of graphs) {
      for (const n of graph.nodes)
        for (const id of n.chain)
          expect(id).toMatch(/^(source|exciter|resonator|articulation|effect)\./);
    }
    const bodyMaterial = (p: Record<string, unknown>) =>
      (
        (p.layers as Record<string, unknown>[]).find((l) => l.name === 'body')!.resonators as {
          params: { material: string };
        }[]
      )[0].params.material;
    expect([tank, turret, scifi].map(bodyMaterial)).toEqual(['metal', 'hard-plastic', 'ceramic']);
    const rendered = [tank, turret, scifi].map((p) => render(p));
    expect(new Set(rendered.map((x) => hashPcm([x], 24000))).size).toBe(3);
    const peakTime = (x: Float32Array) =>
      x.reduce((best, v, i) => (Math.abs(v) > Math.abs(x[best]) ? i : best), 0) / 24000;
    expect(peakTime(rendered[0])).toBeLessThan(0.3);
    expect(peakTime(rendered[2])).toBeGreaterThan(0.6);
  });

  it('profil kabul etmeyen archetype’a materyal verilemez; bilinmeyen materyal reddedilir', () => {
    expect(() =>
      expandArchetype({
        schema: 'ArchetypeRequestV1',
        archetype: 'archetype.resonant-shell',
        version: 1,
        variation: 0,
        profiles: { material: 'metal' },
      }),
    ).toThrow(/profili almaz/);
    expect(() => launcher({}, { material: 'unobtainium' })).toThrow(/materyal/);
  });
});

describe('Airflow/Turbulence/Hiss', () => {
  const flow = (
    params: Record<string, unknown>,
    gesture?: readonly (readonly [number, number])[],
  ) => {
    const program = single(
      node('source.airflow', gesture ? { ...params, pressure: { gesture: 'p' } } : params),
      1.2,
      32000,
    );
    if (gesture) program.gestures = { p: { curve: 'curve.cosine', version: 1, points: gesture } };
    return analyzeAudio([render(program)], 32000, 'source-pcm');
  };
  const sounds = {
    snake: flow({ pressure: 0.7, aperture: 2, turbulence: 0.95, sibilance: 0.9, cavityMix: 0.1 }),
    steam: flow({ pressure: 1, aperture: 3, turbulence: 1, sibilance: 0.4, tilt: 0.4 }),
    pneumatic: flow({ aperture: 8, turbulence: 0.9 }, [
      [0, 1],
      [0.05, 1],
      [0.7, 0],
    ]),
    whistle: flow({ pressure: 0.25, aperture: 20, turbulence: 0.05, sibilance: 0, cavityMix: 0 }),
    breath: flow(
      { aperture: 15, turbulence: 1, sibilance: 0.1, cavityMix: 0.5, cavity: 2, tilt: -0.5 },
      [
        [0, 0.05],
        [0.5, 0.6],
        [1.2, 0.05],
      ],
    ),
  };

  it('beş ses aynı yapı taşından belirgin ama ilişkili davranış verir', () => {
    expect(sounds.snake.spectral.centroidHz as number).toBeGreaterThan(3500);
    expect(sounds.breath.spectral.centroidHz as number).toBeLessThan(
      (sounds.steam.spectral.centroidHz as number) * 0.6,
    );
    expect(sounds.whistle.spectral.flatness as number).toBeLessThan(
      (sounds.snake.spectral.flatness as number) * 0.3,
    );
    expect(sounds.pneumatic.temporal.decay40Seconds as number).toBeLessThan(1.1);
    for (const key of ['snake', 'steam', 'pneumatic', 'breath'] as const) {
      expect(sounds[key].spectral.flatness as number, key).toBeGreaterThan(
        sounds.whistle.spectral.flatness as number,
      );
    }
  });

  it('Strouhal: ağız çapı yarıya inince jet bandı oktav yukarı; basınç U³ ile yükselir', () => {
    const tonePeak = (aperture: number) =>
      peakFrequency(
        render(
          single(
            node('source.airflow', {
              pressure: 0.25,
              aperture,
              turbulence: 0,
              sibilance: 0,
              cavityMix: 0,
            }),
            1,
            32000,
          ),
        ),
        32000,
        8192,
        8192,
      );
    expect(tonePeak(10) / tonePeak(20)).toBeCloseTo(2, 1);
    const level = (pressure: number) =>
      energy(render(single(node('source.airflow', { pressure }), 0.5, 32000)));
    expect(10 * Math.log10(level(0.8) / level(0.2))).toBeGreaterThan(15);
  });
});

describe('Friction/Scrape/Rolling', () => {
  const scrape = (speed: number, params: Record<string, unknown> = {}) =>
    render(
      single(
        node('source.friction', { speed, roughness: 0.8, granularity: 5, ...params }),
        1.5,
        24000,
      ),
    );

  it('yuvarlanma: dönme darbesi v/(2πr) ile izlenir; hız ×2 → periyodik oran ×2', () => {
    const rolling = (speed: number) =>
      render(
        single(
          node('source.friction', {
            speed,
            roughness: 0.8,
            granularity: 20,
            material: 'stone',
            rolling: 1,
          }),
          4,
          16000,
        ),
      );
    for (const speed of [0.5, 1]) {
      const expected = speed / (2 * Math.PI * 0.03);
      expect(Math.abs(envelopeRate(rolling(speed), 16000, 1, 20) / expected - 1)).toBeLessThan(
        0.15,
      );
    }
  });

  it('kayma: hız arttıkça bant merkezi yükselir, sürekli gürültü baskınlaşır', () => {
    const slow = scrape(0.1, { granularity: 10 });
    const fast = scrape(0.8, { granularity: 10 });
    expect(centroid(fast, 24000, 12000, 8192)).toBeGreaterThan(
      centroid(slow, 24000, 12000, 8192) * 1.2,
    );
    expect(energy(fast)).toBeGreaterThan(energy(slow));
  });

  it('metal kazıma, taş sürükleme, yuvarlanan döküntü aynı aileden ayrışır', () => {
    const metal = scrape(0.8, { material: 'metal' });
    const stone = scrape(0.8, { material: 'stone', granularity: 3 });
    const rolling = scrape(0.8, { material: 'stone', rolling: 0.9 });
    const hashes = [metal, stone, rolling].map((x) => hashPcm([x], 24000));
    expect(new Set(hashes).size).toBe(3);
    const accel = render({
      ...single(node('source.friction', { speed: { gesture: 's' }, roughness: 0.7 }), 2, 24000),
      gestures: {
        s: {
          curve: 'curve.linear',
          version: 1,
          points: [
            [0, 0.05],
            [2, 1.2],
          ],
        },
      },
    });
    expect(energy(accel, 36000, 48000)).toBeGreaterThan(energy(accel, 0, 12000) * 4);
    expect(centroid(accel, 24000, 38000, 8192)).toBeGreaterThan(centroid(accel, 24000, 2000, 8192));
  });
});

describe('Machine/Motor/Rotor', () => {
  it.each(['engine', 'fan', 'gear'] as const)(
    '%s: RPM iki katına çıkınca baskın döngü ×2 kayar',
    (mechanism) => {
      const dominant = (rpm: number) => {
        const x = render(
          single(
            node('source.machine', {
              rpm,
              mechanism,
              count: 4,
              noise: 0,
              bearing: 0,
              imbalance: 0,
            }),
            1,
            16000,
          ),
        );
        const expected = (rpm / 60) * 4 * (mechanism === 'engine' ? 0.5 : 1);
        return peakFrequency(x, 16000, 4000, 8192, [expected * 0.8, expected * 1.25]);
      };
      const ratio = dominant(2400) / dominant(1200);
      expect(ratio).toBeCloseTo(2, 1);
    },
  );

  it('ivmelenme gesture’ı baskın bileşeni zamanla yükseltir', () => {
    const program = {
      ...single(
        node('source.machine', {
          rpm: { gesture: 'r' },
          mechanism: 'fan',
          count: 6,
          noise: 0,
          bearing: 0,
        }),
        2,
        16000,
      ),
      gestures: {
        r: {
          curve: 'curve.linear',
          version: 1,
          points: [
            [0, 600],
            [2, 2400],
          ],
        },
      },
    };
    const x = render(program);
    const early = peakFrequency(x, 16000, 2000, 4096, [40, 400]);
    const late = peakFrequency(x, 16000, 26000, 4096, [40, 400]);
    expect(late / early).toBeGreaterThan(2.5);
  });
});

describe('Electrical/Energy', () => {
  const electric = (params: Record<string, unknown>, seconds = 1) =>
    render(single(node('source.electrical', params), seconds, 24000));

  it('hum şebeke harmoniği taşır; kararsız ark gürültülü ve olay yoğundur', () => {
    const hum = electric({ mains: 50, hum: 1, buzz: 0.1, arcs: 0, instability: 0, ring: 0 });
    expect(peakFrequency(hum, 24000, 4000, 16384, [80, 130])).toBeCloseTo(100, 0);
    const arc = electric({
      mains: 60,
      hum: 0.2,
      buzz: 0.6,
      arcs: 0.9,
      instability: 0.9,
      ring: 0.3,
    });
    const humReport = analyzeAudio([hum], 24000, 'source-pcm');
    const arcReport = analyzeAudio([arc], 24000, 'source-pcm');
    expect(arcReport.spectral.flatness as number).toBeGreaterThan(
      (humReport.spectral.flatness as number) * 5,
    );
  });

  it('şarj perdesi yükselir, enerji atışı düşer (YIN)', () => {
    const pitchAt = (x: Float32Array, from: number, to: number) =>
      estimatePitch([x], 24000, { minHz: 40, maxHz: 2000, from, to }).hz as number;
    const charge = electric(
      { mains: 110, charge: 1, arcs: 0, instability: 0, ring: 0, buzz: 0.2 },
      1.2,
    );
    const shot = electric(
      { mains: 110, charge: -1, arcs: 0, instability: 0, ring: 0, buzz: 0.2 },
      0.8,
    );
    expect(pitchAt(charge, 24000, 28000)).toBeGreaterThan(pitchAt(charge, 2000, 6000) * 2);
    expect(pitchAt(shot, 1000, 4000)).toBeGreaterThan(pitchAt(shot, 12000, 15000) * 1.5);
  });
});

describe('Çevresel dokular (wind/rain/fire)', () => {
  const texture = (
    primitive: string,
    params: Record<string, unknown> = {},
    master?: Record<string, unknown>,
  ) => single(node(primitive, params), 20, 16000, master ? { master } : {});

  /**
   * Tekrar izi: 50 ms zarf karelerinin normalize özilintisinin, 0.5–4 sn
   * (kısa döngü) gecikmelerde ÖNCEKİ en düşük değerinden geri yükselişi. Yavaş esinti
   * kısa gecikmede yüksek ilinti verir ama geri yükselmez; kısa döngü
   * periyodunda ilinti yeniden ~1'e çıkar (pozitif kontrol aşağıda).
   */
  function recurrence(x: Float32Array, rate: number): number {
    const hop = Math.round(0.05 * rate);
    const env: number[] = [];
    for (let at = 0; at + hop <= x.length; at += hop)
      env.push(Math.sqrt(energy(x, at, at + hop) / hop));
    const mean = env.reduce((a, v) => a + v, 0) / env.length;
    const d = env.map((v) => v - mean);
    const zero = d.reduce((a, v) => a + v * v, 0);
    let lowest = Infinity;
    let worst = 0;
    for (let lag = 10; lag <= 80; lag++) {
      let s = 0;
      for (let i = 0; i + lag < d.length; i++) s += d[i] * d[i + lag];
      const r = s / zero;
      lowest = Math.min(lowest, r);
      worst = Math.max(worst, r - lowest);
    }
    return worst;
  }

  it('tekrar ölçüsü dişlidir: 2 sn’lik döngüyle tekrarlanan doku yakalanır', () => {
    const seed = render(texture('source.rain', { intensity: 800, variability: 0.6 })).subarray(
      0,
      32000,
    );
    const looped = new Float32Array(320000);
    for (let i = 0; i < looped.length; i++) looped[i] = seed[i % seed.length];
    expect(recurrence(looped, 16000)).toBeGreaterThan(0.7);
  });

  it.each([
    ['source.wind', { speed: 10, gustiness: 0.7 }],
    ['source.rain', { intensity: 800, variability: 0.6 }],
    ['source.fire', { intensity: 0.7, crackle: 0.6 }],
  ] as const)('%s: 20 sn’de kısa döngü tekrarı yok, deterministik', (primitive, params) => {
    const program = texture(primitive, params);
    const a = renderProgram(program);
    const b = renderProgram(program);
    expect(hashPcm(a.channels, 16000)).toBe(hashPcm(b.channels, 16000));
    expect(recurrence(a.channels[0], 16000)).toBeLessThan(0.35);
  });

  it.each(['source.wind', 'source.rain', 'source.fire'])(
    '%s loop sürümü dikiş QA’sından geçer',
    (primitive) => {
      const r = renderProgram(
        texture(primitive, {}, { normalize: 'peak', peakDbfs: -3, loop: { crossfadeSeconds: 1 } }),
      );
      expect(r.channels[0].length).toBe(19 * 16000);
      const seam = measureLoopSeam(r.channels, 16000);
      expect(seam.pass, seam.reasons.join('; ')).toBe(true);
    },
  );
});
