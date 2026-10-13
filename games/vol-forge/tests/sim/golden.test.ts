import { describe, expect, it } from 'vitest';
import { SIM_VERSION } from '../../src/config/forge';
import { buildComb } from '../../src/sim/scenario';
import { ForgeSim } from '../../src/sim/sim';

/**
 * Simülasyon kurallarının parmak izi. Kilit adımlı istemci ile sunucu aynı kuralları koşturmak
 * zorundadır; bu test kuralların (bant hızı, adım sırası, sabitler) haberimiz olmadan değişmesini
 * engeller. Düşerse kural bilinçli değiştiyse `SIM_VERSION`ı artır ve beklenen değerleri yeniden yaz.
 */
const GOLDEN = { simVersion: 1, tick: 900, hash: 1167257528 };

function fingerprint(): number {
  const sim = ForgeSim.create({ seed: 0x5eed, width: 96, height: 96, sustainUnits: 60 });
  buildComb(sim, { maxBelts: 900, turrets: 12, fill: 2, smelterEvery: 3 });
  sim.run(GOLDEN.tick);
  return sim.hash();
}

describe('simülasyon kural parmak izi', () => {
  it('kurallar değişmedi: karma ve SIM_VERSION birlikte güncellenir', () => {
    expect({ simVersion: SIM_VERSION, tick: GOLDEN.tick, hash: fingerprint() }).toEqual(GOLDEN);
  });

  it('aynı senaryo iki kez aynı karmayı verir', () => {
    expect(fingerprint()).toBe(fingerprint());
  });
});
