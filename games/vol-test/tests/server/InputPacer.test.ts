import { describe, expect, it } from 'vitest';
import { InputPacer, type InputSource } from '../../server/InputPacer';

/** Sıralı bir girdi kuyruğu; Colyseus erişicisinin pacer'ın okuduğu kısmını taklit eder. */
class Queue implements InputSource<number> {
  readonly items: number[] = [];
  latest: number | undefined;

  get size(): number {
    return this.items.length;
  }

  push(value: number): void {
    this.items.push(value);
    this.latest = value;
  }

  next(): number | undefined {
    return this.items.shift();
  }
}

const convert = (input: number): string => `girdi:${input}`;
const held = (latest: number): string => `tut:${latest}`;
const pull = (pacer: InputPacer, queue: Queue, tick = 0): string =>
  pacer.pull(queue, convert, held, 'boşta', tick);

describe('InputPacer oluşturma', () => {
  it('geçersiz pay ve tutma adımını reddeder', () => {
    for (const lead of [0, -1, 1.5, Number.NaN]) {
      expect(() => new InputPacer(lead, 3)).toThrow(RangeError);
    }
    for (const hold of [-1, 1.5, Number.NaN]) {
      expect(() => new InputPacer(2, hold)).toThrow(RangeError);
    }
  });
});

describe('InputPacer titreşim tamponu', () => {
  it('pay dolana dek tüketmez ve girdi yokken boşta döner', () => {
    const pacer = new InputPacer(2, 3);
    const queue = new Queue();
    expect(pull(pacer, queue)).toBe('boşta');
    queue.push(1);
    expect(pull(pacer, queue)).toBe('boşta');
    expect(queue.size).toBe(1);
    queue.push(2);
    expect(pull(pacer, queue)).toBe('girdi:1');
    expect(pacer.stats.consumed).toBe(1);
  });

  it('ilk girdi tüketilmeden önce son yönlendirme tutulmaz', () => {
    const pacer = new InputPacer(3, 6);
    const queue = new Queue();
    queue.push(1);
    queue.push(2);
    // Girdiler tamponda ama pay dolmadı: sunucu aracı istemcinin öngörmediği bir adımla itmez.
    expect(pull(pacer, queue)).toBe('boşta');
    expect(pull(pacer, queue)).toBe('boşta');
    queue.push(3);
    expect(pull(pacer, queue)).toBe('girdi:1');
    // Tüketim başladıktan sonraki geç kalma yönlendirmeyi tutar.
    queue.items.length = 0;
    expect(pull(pacer, queue)).toBe('tut:3');
  });

  it('dolduktan sonra adım başına tek girdi tüketir', () => {
    const pacer = new InputPacer(2, 3);
    const queue = new Queue();
    queue.push(1);
    queue.push(2);
    queue.push(3);
    expect([pull(pacer, queue), pull(pacer, queue), pull(pacer, queue)]).toEqual([
      'girdi:1',
      'girdi:2',
      'girdi:3',
    ]);
  });

  it('bir adımlık geç kalma boşta adım üretmez', () => {
    const pacer = new InputPacer(2, 3);
    const queue = new Queue();
    queue.push(1);
    queue.push(2);
    pull(pacer, queue);
    // Paket geç kaldı: tamponda hâlâ bir girdi var, adım boşa gitmez.
    expect(pull(pacer, queue)).toBe('girdi:2');
    expect(pacer.stats.underflows).toBe(0);
  });

  it('tampon boşalınca yeniden dolana dek tüketmez', () => {
    const pacer = new InputPacer(2, 3);
    const queue = new Queue();
    queue.push(1);
    queue.push(2);
    pull(pacer, queue);
    pull(pacer, queue);
    expect(pull(pacer, queue, 7)).toBe('tut:2');
    expect(pacer.stats.underflows).toBe(1);
    expect(pacer.stats.underflowTicks).toEqual([7]);
    queue.push(3);
    expect(pull(pacer, queue)).toBe('tut:3');
    queue.push(4);
    expect(pull(pacer, queue)).toBe('girdi:3');
  });
});

describe('InputPacer boşta adım', () => {
  it('son yönlendirmeyi tutma süresi boyunca tutar, sonra boşta döner', () => {
    const pacer = new InputPacer(1, 2);
    const queue = new Queue();
    queue.push(9);
    expect(pull(pacer, queue)).toBe('girdi:9');
    expect(pull(pacer, queue)).toBe('tut:9');
    expect(pull(pacer, queue)).toBe('tut:9');
    expect(pull(pacer, queue)).toBe('boşta');
    expect(pull(pacer, queue)).toBe('boşta');
  });

  it('girdi gelince tutma sayacı sıfırlanır', () => {
    const pacer = new InputPacer(1, 1);
    const queue = new Queue();
    queue.push(1);
    pull(pacer, queue);
    expect(pull(pacer, queue)).toBe('tut:1');
    expect(pull(pacer, queue)).toBe('boşta');
    queue.push(2);
    expect(pull(pacer, queue)).toBe('girdi:2');
    expect(pull(pacer, queue)).toBe('tut:2');
  });

  it('hiç girdi gelmemişse boşta döner ve ölçüm yalnız ilk on altı adımı tutar', () => {
    const pacer = new InputPacer(1, 5);
    const queue = new Queue();
    for (let tick = 0; tick < 30; tick++) expect(pull(pacer, queue, tick)).toBe('boşta');
    expect(pacer.stats.underflows).toBe(30);
    expect(pacer.stats.underflowTicks).toHaveLength(16);
  });

  it('tutma adımı sıfırsa son yönlendirme tutulmaz', () => {
    const pacer = new InputPacer(1, 0);
    const queue = new Queue();
    queue.push(1);
    pull(pacer, queue);
    expect(pull(pacer, queue)).toBe('boşta');
  });
});
