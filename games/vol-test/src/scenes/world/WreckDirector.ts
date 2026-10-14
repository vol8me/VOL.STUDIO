import type { VehicleSpec } from '@/config/vehicles';
import { bitIndex, partAnchor, partSide, type PartAnchor } from '@/sim/chassis/parts';
import type { EffectsView } from '@/view/EffectsView';
import type { TankFrame, VehicleView } from '@/view/VehicleView';

/** Direktörün bir araçtan okuduğu: kimlik, tanım, canlılık ve kırık parça maskesi. */
export interface WreckSubject {
  readonly id: number;
  readonly spec: VehicleSpec;
  readonly vitality: { readonly alive: boolean };
  readonly chassis: { readonly parts: number };
}

/** Bir kare için gereken poz ve hız (ara değerli kare). */
export type WreckFrame = Pick<TankFrame, 'x' | 'y' | 'hull' | 'vx' | 'vy'>;

interface Seen {
  alive: boolean;
  parts: number;
}

/**
 * Araç imhasının ve parça kopmasının sahne yönetmeni. Her kare araçların canlılığını ve kırık parça
 * maskesini bir önceki kareyle karşılaştırır: canlıdan ölüye geçişte tek bir patlama oynar, görünüm
 * tümden gizlenir (hayalet, kalan gölge ve ışık kalmaz) ve yeniden doğunca geri gelir; maskede yeni bir
 * bit açılınca parça koptuğu noktadan savrulur ve görünüm kırık hâle geçer. Karşılaştırma simülasyon
 * olayına değil durumun kendisine dayanır, böylece çevrimdışı sandbox ve çevrimiçi istemci aynı yoldan
 * geçer. İlk görülen araç (örn. odaya geç katılım) efektsiz kurulur: ölüyse gizlenir, parçalıysa kırık görünür.
 */
export class WreckDirector {
  private readonly seen = new Map<number, Seen>();
  private readonly anchor: PartAnchor = { forward: 0, right: 0 };

  constructor(
    private readonly effects: Pick<EffectsView, 'wreck' | 'shed'>,
    /** Patlamanın oyuncuya yansıması (kamera, titreşim); konum dünya birimidir. */
    private readonly onWreck?: (x: number, y: number) => void,
  ) {}

  /** Aracı bu kare için yönetir; çizilip güncellenmesi gerekiyorsa (canlıysa) `true` döner. */
  track(
    subject: WreckSubject,
    view: Pick<VehicleView, 'setPresent' | 'setParts'> | undefined,
    frame: WreckFrame,
  ): boolean {
    const alive = subject.vitality.alive;
    const parts = subject.chassis.parts;
    const before = this.seen.get(subject.id);
    if (before === undefined) {
      this.seen.set(subject.id, { alive, parts });
      if (!alive) view?.setPresent(false);
      if (parts !== 0) view?.setParts(parts);
      return alive;
    }
    if (before.alive && !alive) {
      this.effects.wreck(subject.spec, frame.x, frame.y, frame.vx, frame.vy);
      this.onWreck?.(frame.x, frame.y);
      view?.setPresent(false);
    } else if (!before.alive && alive) view?.setPresent(true);
    before.alive = alive;
    if (alive && parts !== before.parts) {
      this.shed(subject.spec, before.parts, parts, frame);
      view?.setParts(parts);
    }
    // Ölüyken maske değişmez sayılır: yeniden doğuşta temiz maske ilk canlı karede görünüme işlenir.
    if (alive) before.parts = parts;
    return alive;
  }

  /** Kaldırılan aracın izini siler. */
  forget(id: number): void {
    this.seen.delete(id);
  }

  /** Yeni açılan her bit bir parça koptu demektir: bağlantı noktasından dışarı savrulur. */
  private shed(spec: VehicleSpec, before: number, after: number, frame: WreckFrame): void {
    const cos = Math.cos(frame.hull);
    const sin = Math.sin(frame.hull);
    for (let bits = after & ~before; bits !== 0; bits &= bits - 1) {
      const index = bitIndex(bits & -bits);
      const anchor = partAnchor(spec, index, this.anchor);
      const side = partSide(spec.kind, index);
      const x = frame.x + anchor.forward * cos - anchor.right * sin;
      const y = frame.y + anchor.forward * sin + anchor.right * cos;
      // Dışarı = gövdenin kırılan yanı (sağ eksen yönü ya da tersi).
      this.effects.shed(spec, x, y, frame.hull + side * (Math.PI / 2));
    }
  }
}
