import type { VehicleSpec } from '@/config/vehicles';
import type { EffectsView } from '@/view/EffectsView';
import type { TankFrame, VehicleView } from '@/view/VehicleView';

/** Direktörün bir araçtan okuduğu: kimlik, tanım ve canlılık. */
export interface WreckSubject {
  readonly id: number;
  readonly spec: VehicleSpec;
  readonly vitality: { readonly alive: boolean };
}

/**
 * Araç imhasının sahne yönetmeni. Her kare araçların canlılığını bir önceki kareyle karşılaştırır:
 * canlıdan ölüye geçişte tek bir patlama ve parça savrulması oynar, görünüm tümden gizlenir (hayalet,
 * kalan gölge ve ışık kalmaz); yeniden doğunca görünüm geri gelir. Karşılaştırma simülasyon olayına
 * değil canlılık durumuna dayanır, böylece çevrimdışı sandbox ve çevrimiçi istemci aynı yoldan geçer.
 * İlk görülen ölü araç (örn. odaya geç katılım) patlamadan gizlenir.
 */
export class WreckDirector {
  private readonly alive = new Map<number, boolean>();

  constructor(
    private readonly effects: Pick<EffectsView, 'wreck'>,
    /** Patlamanın oyuncuya yansıması (kamera, titreşim); konum dünya birimidir. */
    private readonly onWreck?: (x: number, y: number) => void,
  ) {}

  /** Aracı bu kare için yönetir; çizilip güncellenmesi gerekiyorsa (canlıysa) `true` döner. */
  track(
    subject: WreckSubject,
    view: Pick<VehicleView, 'setPresent'> | undefined,
    frame: Pick<TankFrame, 'x' | 'y' | 'vx' | 'vy'>,
  ): boolean {
    const alive = subject.vitality.alive;
    const before = this.alive.get(subject.id);
    this.alive.set(subject.id, alive);
    if (before === undefined) {
      if (!alive) view?.setPresent(false);
      return alive;
    }
    if (before && !alive) {
      this.effects.wreck(subject.spec, frame.x, frame.y, frame.vx, frame.vy);
      this.onWreck?.(frame.x, frame.y);
      view?.setPresent(false);
    } else if (!before && alive) view?.setPresent(true);
    return alive;
  }

  /** Kaldırılan aracın izini siler. */
  forget(id: number): void {
    this.alive.delete(id);
  }
}
