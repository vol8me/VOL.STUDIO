import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SidechainDucker } from '../../src/audio/sidechain';
import { FakeAudioContext } from './music/mock-audio';

describe('SidechainDucker', () => {
  let context: FakeAudioContext;

  beforeEach(() => {
    context = new FakeAudioContext();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('duck cagrisi gain hedefini dusurur ve release zamanlar', () => {
    const ducker = new SidechainDucker(
      context as unknown as AudioContext,
      context.destination as unknown as AudioNode,
    );
    ducker.duck({ target: 0.2, attack: 0.03, hold: 0.1, release: 0.2 });

    const gain = (ducker.gain as unknown as { gain: { value: number } }).gain;
    expect(gain.value).toBe(0.2);

    // Hold aşamasında ikinci duck — aynı target, gain değişmemeli.
    vi.advanceTimersByTime(120);
    context.currentTime = 0.15;
    ducker.duck({ target: 0.2, attack: 0.03, hold: 0.1, release: 0.2 });
    expect(gain.value).toBe(0.2);

    // Release aşamasında üçüncü duck — gain yeni target'a çekilmeli.
    vi.advanceTimersByTime(200);
    context.currentTime = 0.35;
    ducker.duck({ target: 0.3, attack: 0.03, hold: 0.1, release: 0.2 });
    expect(gain.value).toBe(0.3);
  });

  it('ust uste ducklerde en gucclu (en dusuk) gain uygulanir', () => {
    const ducker = new SidechainDucker(
      context as unknown as AudioContext,
      context.destination as unknown as AudioNode,
    );
    ducker.duck({ target: 0.5, attack: 0.01, hold: 0.1, release: 0.2 });
    ducker.duck({ target: 0.2, attack: 0.01, hold: 0.1, release: 0.2 });

    const gain = (ducker.gain as unknown as { gain: { value: number } }).gain;
    expect(gain.value).toBe(0.2);
  });

  it('reset anında gaini 1.0 yapar', () => {
    const ducker = new SidechainDucker(
      context as unknown as AudioContext,
      context.destination as unknown as AudioNode,
    );
    ducker.duck({ target: 0.1, attack: 0.01, hold: 0.5, release: 0.2 });
    ducker.reset(0.05);

    const gain = (ducker.gain as unknown as { gain: { value: number } }).gain;
    expect(gain.value).toBe(1);
  });

  it('dispose baglantilari temizler', () => {
    const ducker = new SidechainDucker(
      context as unknown as AudioContext,
      context.destination as unknown as AudioNode,
    );
    ducker.dispose();
    expect((ducker.gain as unknown as { connected: { length: number } }).connected.length).toBe(0);
  });
});
