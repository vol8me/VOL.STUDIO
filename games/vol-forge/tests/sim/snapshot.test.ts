import { describe, expect, it } from 'vitest';
import { BUILDING, ITEM, KIND, UNIT_KIND, WAVES } from '../../src/config/forge';
import { fnv1a } from '../../src/net/bytes';
import { COMMAND, Ledger, type ForgeCommand } from '../../src/sim/commands';
import { buildComb } from '../../src/sim/scenario';
import { ForgeSim } from '../../src/sim/sim';
import { readSnapshot, SnapshotError, snapshotDimensions } from '../../src/sim/snapshot';
import { ForgeState } from '../../src/sim/state';
import { beltViolations, SMALL } from '../helpers/world';

function busy(seed = 7): ForgeSim {
  const sim = ForgeSim.create({ ...SMALL, seed, sustainUnits: 60 });
  buildComb(sim, { maxBelts: 400, turrets: 8, fill: 2, smelterEvery: 2 });
  return sim;
}

/** Gövdeyi değiştirip sağlamayı yeniden yazar: yalnız okuyucunun mantıksal doğrulamasını sınar. */
function reseal(bytes: Uint8Array, edit: (body: Uint8Array) => Uint8Array): Uint8Array {
  const body = edit(bytes.slice(0, bytes.length - 4));
  const out = new Uint8Array(body.length + 4);
  out.set(body);
  new DataView(out.buffer).setUint32(body.length, fnv1a(body), true);
  return out;
}

const place = (x: number, y: number, kind: number): ForgeCommand => ({
  type: COMMAND.place,
  x,
  y,
  kind,
  rot: 0,
});

describe('determinizm', () => {
  it('aynı tohum ve aynı komutlar bit düzeyinde aynı durumu verir', () => {
    const a = busy();
    const b = busy();
    for (let step = 0; step < 900; step++) {
      if (step % 100 === 50) {
        const command = place(10 + (step % 30), 10, KIND.wall);
        a.state.inventory[ITEM.plate] += 8;
        b.state.inventory[ITEM.plate] += 8;
        expect(a.apply('p', step, command)).toEqual(b.apply('p', step, command));
      }
      a.step();
      b.step();
      if (step % 150 === 0) expect(a.hash()).toBe(b.hash());
    }
    expect(a.hash()).toBe(b.hash());
    expect(a.snapshot()).toEqual(b.snapshot());
  });

  it('farklı tohum farklı dünya verir', () => {
    expect(busy(1).hash()).not.toBe(busy(2).hash());
  });

  it('bant kuralları uzun koşuda bozulmaz', () => {
    const sim = busy();
    sim.run(1500);
    expect(beltViolations(sim.state)).toEqual([]);
  });
});

describe('anlık görüntü', () => {
  it('geri yüklenen simülasyon canlı olanla aynı karmayı ve aynı geleceği taşır', () => {
    const live = busy();
    live.run(700);
    live.apply('ali', 1, place(12, 12, KIND.wall));
    live.apply('veli', 4, place(13, 12, KIND.wall));
    const bytes = live.snapshot();
    const restored = ForgeSim.restore(bytes, { sustainUnits: 60 });
    expect(restored.hash()).toBe(live.hash());
    expect(restored.tick).toBe(live.tick);
    expect(restored.snapshot()).toEqual(bytes);
    expect(restored.ledger.lookup('ali', 1)).toEqual(live.ledger.lookup('ali', 1));
    for (let step = 0; step < 900; step++) {
      live.step();
      restored.step();
      if (step % 100 === 0) expect(restored.hash()).toBe(live.hash());
    }
    expect(restored.snapshot()).toEqual(live.snapshot());
  });

  it('geri yüklemeden sonra tekrarlanan komut ikinci kez uygulanmaz', () => {
    const live = busy();
    const command = place(14, 14, KIND.wall);
    live.state.inventory[ITEM.plate] = 100;
    const first = live.apply('ali', 9, command);
    const restored = ForgeSim.restore(live.snapshot());
    const plates = restored.state.inventory[ITEM.plate];
    expect(restored.apply('ali', 9, command)).toEqual({ fresh: false, result: first.result });
    expect(restored.state.inventory[ITEM.plate]).toBe(plates);
  });

  it('boyutu başlıktan okur', () => {
    expect(snapshotDimensions(busy().snapshot())).toEqual({ width: 64, height: 64 });
  });

  it('havuzun yuva sırası ve nesil sayacı korunur', () => {
    const live = busy();
    live.run(400);
    const restored = ForgeSim.restore(live.snapshot(), { sustainUnits: 60 });
    expect([...restored.state.freeUnits.subarray(0, restored.state.freeCount)]).toEqual([
      ...live.state.freeUnits.subarray(0, live.state.freeCount),
    ]);
    expect(restored.state.unitGen).toEqual(live.state.unitGen);
    expect(restored.state.aliveUnits).toBe(live.state.aliveUnits);
  });
});

describe('bozuk anlık görüntü', () => {
  it('kısa dosyayı, yanlış imzayı ve bozuk baytı reddeder', () => {
    const bytes = busy().snapshot();
    expect(() => ForgeSim.restore(bytes.slice(0, 7))).toThrow(SnapshotError);
    const flipped = bytes.slice();
    flipped[flipped.length >> 1] ^= 0x40;
    expect(() => ForgeSim.restore(flipped)).toThrow(/sağlama/);
    const foreign = reseal(bytes, (body) => {
      body[0] ^= 0xff;
      return body;
    });
    expect(() => ForgeSim.restore(foreign)).toThrow(/imza/);
  });

  it('desteklenmeyen sürümü ve artık baytı reddeder', () => {
    const bytes = busy().snapshot();
    const future = reseal(bytes, (body) => {
      body[4] = 99;
      return body;
    });
    expect(() => ForgeSim.restore(future)).toThrow(/sürüm/);
    const padded = reseal(bytes, (body) => {
      const wider = new Uint8Array(body.length + 1);
      wider.set(body);
      return wider;
    });
    expect(() => ForgeSim.restore(padded)).toThrow(/artık/);
  });

  it('sağlaması geçerli ama kesik gövdeyi reddeder ve hedef durumu bozmaz', () => {
    const live = busy();
    live.run(300);
    const target = ForgeSim.create({ ...SMALL, seed: 99 });
    const before = target.hash();
    const truncated = reseal(live.snapshot(), (body) => body.slice(0, body.length - 9));
    expect(() => readSnapshot(truncated, target.state, target.ledger)).toThrow(SnapshotError);
    expect(target.hash()).toBe(before);
  });

  it('başka boyuttaki dünyaya yüklemeyi reddeder', () => {
    const bytes = busy().snapshot();
    const other = new ForgeState(80, 80);
    expect(() => readSnapshot(bytes, other, new Ledger())).toThrow(/boyut/);
  });

  it('birim sayıları tutarsızsa reddeder', () => {
    const live = busy();
    live.run(200);
    const sealed = reseal(live.snapshot(), (body) => {
      // freeCount alanını bozmak, hazır birim sayısıyla toplamı pool boyutundan ayırır.
      const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
      const bytesBeforeUnits = 4 + 4 + 2 + 2 + 4 * 5 + 8 + 1 + 4 + 4 * 3 * 2;
      const tiles = 64 * 64;
      const perTile = 1 + 1 + 1 + 1 + 2 + 2 + 1 + 1 + 1 + 4 + 8 + 1;
      const freeCountAt = bytesBeforeUnits + tiles * perTile + 2048;
      view.setUint32(freeCountAt, view.getUint32(freeCountAt, true) - 1, true);
      return body;
    });
    expect(() => ForgeSim.restore(sealed)).toThrow(SnapshotError);
  });
});

describe('çekirdek ve yenilgi durumu', () => {
  it('yenilgi sayacı ve çekirdek canı kalıcıdır', () => {
    const live = ForgeSim.create({ ...SMALL });
    live.state.coreHp = 10;
    live.state.allocateUnit(UNIT_KIND.crawler, 29.5, 31.5, 40);
    live.step();
    expect(live.state.defeats).toBe(1);
    const restored = ForgeSim.restore(live.snapshot());
    expect(restored.state.defeats).toBe(1);
    expect(restored.state.coreHp).toBe(BUILDING[KIND.core].hp);
    expect(restored.state.nextWaveTick).toBe(WAVES.firstDelay);
  });
});
