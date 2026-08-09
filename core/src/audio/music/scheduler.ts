import type { MusicContext } from './types';

/** BPM ve ölçü bilgisi üzerinden zaman / bar / beat dönüşümleri yapar. */
export class MusicScheduler {
  readonly beatDuration: number;
  readonly barDuration: number;

  constructor(
    public readonly bpm: number,
    public readonly timeSignature: [number, number] = [4, 4],
  ) {
    this.beatDuration = 60 / bpm;
    this.barDuration = this.beatDuration * timeSignature[0];
  }

  /** Bar sayısını saniyeye çevirir. */
  barsToSeconds(bars: number): number {
    return bars * this.barDuration;
  }

  /** Saniyeyi bar sayısına çevirir. */
  secondsToBars(seconds: number): number {
    return seconds / this.barDuration;
  }

  /** Belirli bir barın başlangıç zamanını döner (startTime'dan itibaren). */
  getTimeAtBar(bar: number, startTime: number): number {
    return startTime + this.barsToSeconds(bar - 1);
  }

  /** Verilen zamandaki barı döner (1-based, float). */
  getBarAtTime(time: number, startTime: number): number {
    if (time < startTime) return 1;
    return 1 + this.secondsToBars(time - startTime);
  }

  /** Verilen andan sonraki ilk bar başlangıç zamanını döner. */
  getNextBarTime(currentTime: number, startTime: number): number {
    const currentBar = this.getBarAtTime(currentTime, startTime);
    const nextBar = Math.ceil(currentBar);
    return this.getTimeAtBar(nextBar, startTime);
  }

  /** Verilen andan sonraki ilk vuruş zamanını döner. */
  getNextBeatTime(currentTime: number, startTime: number): number {
    const elapsed = Math.max(0, currentTime - startTime);
    const currentBeat = 1 + elapsed / this.beatDuration;
    const nextBeat = Math.ceil(currentBeat);
    return startTime + (nextBeat - 1) * this.beatDuration;
  }

  /** Belirli bir zamana göre MusicContext üretir. */
  getContext(time: number, startTime: number): MusicContext {
    const elapsed = Math.max(0, time - startTime);
    const totalBeats = elapsed / this.beatDuration;
    const bar = 1 + Math.floor(totalBeats / this.timeSignature[0]);
    const beat = 1 + (totalBeats % this.timeSignature[0]);
    return {
      bpm: this.bpm,
      timeSignature: this.timeSignature,
      bar,
      beat,
      time: elapsed,
    };
  }
}
