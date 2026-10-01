import { describe, expect, it } from 'vitest';
import { ControlIntent } from '@/input/ControlIntent';
import { command } from '../support/sim';

describe('ControlIntent', () => {
  it('hareketi hafif yumuşatır; aynı süre farklı kare hızında aynı sonuç verir', () => {
    const run = (frames: number) => {
      const filter = new ControlIntent();
      const input = command({ moveX: 1, aimY: -1 });
      for (let frame = 0; frame < frames; frame++) filter.update(input, 100 / frames);
      return filter.command;
    };
    expect(run(3).moveX).toBeCloseTo(run(12).moveX, 12);
    expect(run(3).moveX).toBeGreaterThan(0.85);
    expect(run(3).moveX).toBeLessThan(0.99);
    expect(run(3).aimY).toBe(-1);
  });

  it('hafif sağ çubuk yalnız nişan alır; dış bölgede ateş ve eşikte histerezis vardır', () => {
    const filter = new ControlIntent();
    const input = command({ aimX: -1, fire: true });
    expect(filter.update(input, 16, 0.4).fire).toBe(false);
    expect(filter.update(input, 16, 0.85).fire).toBe(true);
    expect(filter.update(input, 16, 0.72).fire).toBe(true);
    expect(filter.update(input, 16, 0.5).fire).toBe(false);
    expect(filter.update(input, 16, 0.72).fire).toBe(false);
    expect(filter.update(input, 16).fire).toBe(true);
  });

  it('bırakma/odak kaybı ateşi ve yumuşatma geçmişini anında temizler', () => {
    const filter = new ControlIntent();
    filter.update(command({ moveX: 1, fire: true }), 100, 1);
    filter.reset();
    expect(filter.command).toEqual(command());
    expect(filter.update(command(), 16, 0).fire).toBe(false);
    expect(filter.command.moveX).toBe(0);
    expect(filter.update(command({ moveX: 1 }), 0).moveX).toBe(0);
  });
});
