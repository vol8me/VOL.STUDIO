import { describe, expect, it } from 'vitest';
import { InputPacer, type InputSource } from '../../src/server/inputPacer';

/** Sıralı bir girdi kuyruğu; Colyseus erişicisinin pacer'ın okuduğu kısmını taklit eder. */
class Queue implements InputSource<number> {
  readonly items: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(value: number): void {
    this.items.push(value);
  }

  next(): number | undefined {
    return this.items.shift();
  }
}

const convert = (input: number): string => `girdi:${input}`;
const hold = (last: string): string => `tut:${last}`;
const pull = (pacer: InputPacer<string>, queue: Queue, tick = 0): string =>
  pacer.pull(queue, convert, hold, 'boşta', tick);

describe('InputPacer oluşturma', () => {
  it('geçersiz pay ve tutma adımını reddeder', () => {
    for (const lead of [0, -1, 1.5, Number.NaN]) {
      expect(() => new InputPacer<string>(lead, 3)).toThrow(RangeError);
    }
    for (const holdSteps of [-1, 1.5, Number.NaN]) {
      expect(() => new InputPacer<string>(2, holdSteps)).toThrow(RangeError);
    }
  });
});

describe('InputPacer titreşim tamponu', () => {
  it('pay dolana dek tüketmez ve girdi yokken boşta döner', () => {
    const pacer = new InputPacer<string>(2, 3);
    const queue = new Queue();
    expect(pull(pacer, queue)).toBe('boşta');
    queue.push(1);
    expect(pull(pacer, queue)).toBe('boşta');
    expect(queue.size).toBe(1);
    queue.push(2);
    expect(pull(pacer, queue)).toBe('girdi:1');
    expect(pacer.stats.consumed).toBe(1);
  });

  it('dolduktan sonra adım başına tek girdi tüketir', () => {
    const pacer = new InputPacer<string>(2, 3);
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
    const pacer = new InputPacer<string>(2, 3);
    const queue = new Queue();
    queue.push(1);
    queue.push(2);
    pull(pacer, queue);
    // Paket geç kaldı: tamponda hâlâ bir girdi var, adım boşa gitmez.
    expect(pull(pacer, queue)).toBe('girdi:2');
    expect(pacer.stats.underflows).toBe(0);
  });

  it('tampon boşalınca yeniden dolana dek tüketmez', () => {
    const pacer = new InputPacer<string>(2, 3);
    const queue = new Queue();
    queue.push(1);
    queue.push(2);
    pull(pacer, queue);
    pull(pacer, queue);
    expect(pull(pacer, queue, 7)).toBe('tut:girdi:2');
    expect(pacer.stats.underflows).toBe(1);
    expect(pacer.stats.underflowTicks).toEqual([7]);
    queue.push(3);
    // Yeni gelen girdi henüz tüketilmedi: boşta adım onu değil, son tüketileni sürdürür.
    expect(pull(pacer, queue)).toBe('tut:girdi:2');
    queue.push(4);
    expect(pull(pacer, queue)).toBe('girdi:3');
  });

  it('her girdi tam bir kez uygulanır: tutulan adım tüketilmemiş girdiyi tekrar etmez', () => {
    const pacer = new InputPacer<string>(2, 6);
    const queue = new Queue();
    const applied: string[] = [];
    const trace = (): void => {
      applied.push(pull(pacer, queue));
    };
    queue.push(1);
    queue.push(2);
    trace();
    trace();
    trace(); // tampon boş: tutulan adım
    queue.push(3);
    trace(); // yeniden dolum
    queue.push(4);
    trace();
    trace();
    expect(applied.filter((value) => value === 'girdi:3')).toHaveLength(1);
    expect(applied.filter((value) => value === 'girdi:4')).toHaveLength(1);
  });

  it('ilk girdi tüketilmeden önce hiçbir komut tutulmaz', () => {
    const pacer = new InputPacer<string>(3, 6);
    const queue = new Queue();
    queue.push(1);
    queue.push(2);
    // Girdiler tamponda ama pay dolmadı: sunucu aracı istemcinin öngörmediği bir adımla itmez.
    expect(pull(pacer, queue)).toBe('boşta');
    expect(pull(pacer, queue)).toBe('boşta');
    queue.push(3);
    expect(pull(pacer, queue)).toBe('girdi:1');
  });
});

describe('InputPacer boşta adım', () => {
  it('son tüketilen komutu tutma süresi boyunca sürdürür, sonra boşta döner', () => {
    const pacer = new InputPacer<string>(1, 2);
    const queue = new Queue();
    queue.push(9);
    expect(pull(pacer, queue)).toBe('girdi:9');
    expect(pull(pacer, queue)).toBe('tut:girdi:9');
    expect(pull(pacer, queue)).toBe('tut:girdi:9');
    expect(pull(pacer, queue)).toBe('boşta');
    expect(pull(pacer, queue)).toBe('boşta');
  });

  it('girdi gelince tutma sayacı sıfırlanır', () => {
    const pacer = new InputPacer<string>(1, 1);
    const queue = new Queue();
    queue.push(1);
    pull(pacer, queue);
    expect(pull(pacer, queue)).toBe('tut:girdi:1');
    expect(pull(pacer, queue)).toBe('boşta');
    queue.push(2);
    expect(pull(pacer, queue)).toBe('girdi:2');
    expect(pull(pacer, queue)).toBe('tut:girdi:2');
  });

  it('hiç girdi gelmemişse boşta döner ve ölçüm yalnız ilk on altı adımı tutar', () => {
    const pacer = new InputPacer<string>(1, 5);
    const queue = new Queue();
    for (let tick = 0; tick < 30; tick++) expect(pull(pacer, queue, tick)).toBe('boşta');
    expect(pacer.stats.underflows).toBe(30);
    expect(pacer.stats.underflowTicks).toHaveLength(16);
  });

  it('aç kalma yalnız ilk tüketimden sonraki boşta adımları sayar', () => {
    const pacer = new InputPacer<string>(1, 3);
    const queue = new Queue();
    pull(pacer, queue);
    pull(pacer, queue);
    expect(pacer.stats).toMatchObject({ underflows: 2, starved: 0 });
    queue.push(1);
    pull(pacer, queue);
    pull(pacer, queue);
    pull(pacer, queue);
    expect(pacer.stats).toMatchObject({ consumed: 1, underflows: 4, starved: 2 });
  });

  it('tutma adımı sıfırsa komut tutulmaz', () => {
    const pacer = new InputPacer<string>(1, 0);
    const queue = new Queue();
    queue.push(1);
    pull(pacer, queue);
    expect(pull(pacer, queue)).toBe('boşta');
  });
});
