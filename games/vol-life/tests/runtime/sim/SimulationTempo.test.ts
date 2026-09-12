import { describe, expect, it, vi } from 'vitest';
import { SimulationTempo } from '@/runtime/sim/SimulationTempo';

describe('SimulationTempo', () => {
  it('60 taban tick içinde 10 Hz sistemi tam 10 kez çalıştırır', () => {
    const tempo = new SimulationTempo(60);
    const task = vi.fn();
    tempo.every(10, task);

    for (let i = 0; i < 60; i++) tempo.advance();

    expect(task).toHaveBeenCalledTimes(10);
    expect(task.mock.calls.map((call) => call[0] as number)).toEqual([
      6, 12, 18, 24, 30, 36, 42, 48, 54, 60,
    ]);
  });

  it('taban frekansını tam bölmeyen ve geçersiz tempoyu reddeder', () => {
    const tempo = new SimulationTempo(60);
    expect(() => tempo.every(7, () => {})).toThrow(RangeError);
    expect(() => tempo.every(0, () => {})).toThrow(RangeError);
  });
});
