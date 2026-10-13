import { describe, expect, it } from 'vitest';
import { SIM_VERSION } from '../../src/config/factory';
import { COMMAND } from '../../src/sim/commands';
import { buildComb } from '../../src/sim/scenario';
import { FactorySim } from '../../src/sim/sim';

/**
 * Simülasyon kurallarının parmak izi. Kilit adımlı istemci ile sunucu aynı kuralları koşturmak
 * zorundadır; bu test kuralların (bant hızı, adım sırası, sabitler) haberimiz olmadan değişmesini
 * engeller. Düşerse kural bilinçli değiştiyse `SIM_VERSION`ı artır ve beklenen değerleri yeniden yaz.
 */
const GOLDEN = { simVersion: 2, tick: 900, hash: 2484189448 };

const KEY = 'golden-player';
/** Tank yön niyetini bu aralıkla değiştirir: hareket, çarpışma ve otomatik ateş parmak izine girer. */
const LEG_TICKS = 60;

function fingerprint(): number {
  const sim = FactorySim.create({ seed: 0x5eed, width: 96, height: 96, sustainUnits: 60 });
  buildComb(sim, { maxBelts: 900, turrets: 12, fill: 2, smelterEvery: 3 });
  sim.applyRaw({ type: COMMAND.join, key: KEY }, -1);
  for (let leg = 0; leg < GOLDEN.tick / LEG_TICKS; leg++) {
    sim.apply(KEY, leg + 1, { type: COMMAND.move, dir: 1 + ((leg * 5) % 16) });
    sim.run(LEG_TICKS);
  }
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
