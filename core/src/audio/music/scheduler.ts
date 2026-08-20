import type { MusicContext } from './types';

/** İki zamanın "aynı an" sayılması için tolerans (saniye). */
const TIME_EPSILON = 1e-9;

/** BPM ve ölçü bilgisi üzerinden zaman / bar / beat dönüşümleri yapar. */
export class MusicScheduler {
  readonly beatDuration: number;
  readonly barDuration: number;

  constructor(
    public readonly bpm: number,
    public readonly timeSignature: [number, number] = [4, 4],
  ) {
    if (!Number.isFinite(bpm) || bpm <= 0) {
      throw new Error(`MusicScheduler: bpm pozitif olmalı (verilen: ${bpm})`);
    }
    const [beatsPerBar, beatUnit] = timeSignature;
    if (
      !Number.isFinite(beatsPerBar) ||
      beatsPerBar <= 0 ||
      !Number.isFinite(beatUnit) ||
      beatUnit <= 0
    ) {
      throw new Error(`MusicScheduler: geçersiz ölçü (${beatsPerBar}/${beatUnit})`);
    }

    // BPM dörtlük nota cinsindendir; vuruş birimi paydadan gelir (örn. 6/8'de sekizlik).
    this.beatDuration = (60 / bpm) * (4 / beatUnit);
    this.barDuration = this.beatDuration * beatsPerBar;
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

  /**
   * Verilen andan sonraki ilk bar başlangıç zamanını döner.
   * Tam bir bar sınırındayken bir sonraki barı döndürür.
   */
  getNextBarTime(currentTime: number, startTime: number): number {
    const currentBar = this.getBarAtTime(currentTime, startTime);
    const ceil = Math.ceil(currentBar);
    const nextBar = ceil - currentBar < TIME_EPSILON ? ceil + 1 : ceil;
    return this.getTimeAtBar(nextBar, startTime);
  }

  /** Verilen andan SONRAKİ ilk vuruş zamanını döner (sınırdayken bir sonraki). */
  getNextBeatTime(currentTime: number, startTime: number): number {
    const elapsed = Math.max(0, currentTime - startTime);
    const currentBeat = elapsed / this.beatDuration;
    const ceil = Math.ceil(currentBeat);
    const nextBeat = ceil - currentBeat < TIME_EPSILON ? ceil + 1 : ceil;
    return startTime + nextBeat * this.beatDuration;
  }

  /** Belirli bir zamana göre MusicContext üretir. */
  getContext(time: number, startTime: number): MusicContext {
    const elapsed = Math.max(0, time - startTime);
    const totalBeats = elapsed / this.beatDuration;
    const beatsPerBar = this.timeSignature[0];
    const bar = 1 + Math.floor(totalBeats / beatsPerBar);
    const beat = 1 + (totalBeats % beatsPerBar);
    return {
      bpm: this.bpm,
      timeSignature: this.timeSignature,
      bar,
      beat,
      time: elapsed,
    };
  }
}
