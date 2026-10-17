/** Sıçramanın bir karedeki durumu: uzuvlar ve gövde aynı sözlüğü okur. */
export interface LeapPhase {
  readonly airborne: boolean;
  /** Bu karede havalandı / indi: toz, iz ve darbe tek seferlik tetiklenir. */
  readonly takeoff: boolean;
  readonly landed: boolean;
  /** [0, 1] uçuş ilerlemesi (tahmini süreye göre) ve yay yüksekliği `sin(π · ilerleme)`. */
  readonly phase: number;
  readonly arc: number;
  /** Kalkıştan beri geçen süre (ms); havada değilken 0. */
  readonly sinceLaunchMs: number;
}

/** Sıçramayan örümcek (Goliath) ve yerdeki her kare için sabit durum. */
export const GROUNDED: LeapPhase = {
  airborne: false,
  takeoff: false,
  landed: false,
  phase: 0,
  arc: 0,
  sinceLaunchMs: 0,
};

type MutablePhase = { -readonly [K in keyof LeapPhase]: LeapPhase[K] };

/**
 * Sıçramayı hız deposunun aktifliğinden (`TankFrame.boosting`) izler: sunucu ve öngörü aynı bayrağı
 * taşır, yeni bir ağ alanı gerekmez. Uçuş süresi depodan türer (`kapasite / boşalma`); ilerleme bu
 * süreye oranlanır ve süre 0 iken (duraklatma) donar.
 */
export class LeapTracker {
  readonly state: LeapPhase;
  private readonly phase: MutablePhase = { ...GROUNDED };
  private flying = false;
  private elapsedMs = 0;

  constructor(private readonly flightMs: number) {
    if (!(flightMs > 0)) throw new RangeError('Sıçrama süresi pozitif olmalı');
    this.state = this.phase;
  }

  update(boosting: boolean, deltaMs: number): LeapPhase {
    const phase = this.phase;
    phase.takeoff = boosting && !this.flying;
    phase.landed = !boosting && this.flying;
    if (phase.takeoff) this.elapsedMs = 0;
    else if (boosting) this.elapsedMs += Math.max(0, deltaMs);
    this.flying = boosting;
    phase.airborne = boosting;
    phase.sinceLaunchMs = boosting ? this.elapsedMs : 0;
    phase.phase = boosting ? Math.min(1, this.elapsedMs / this.flightMs) : 0;
    phase.arc = boosting ? Math.sin(Math.PI * phase.phase) : 0;
    return phase;
  }

  reset(): void {
    this.flying = false;
    this.elapsedMs = 0;
    Object.assign(this.phase, GROUNDED);
  }
}
