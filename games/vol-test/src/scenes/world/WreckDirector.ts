import type { VehicleSpec } from '@/config/vehicles';
import { WATER_VIEW } from '@/config/waterView';
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

/** Batışın görünümden istediği: ilerleme ve sahneden kalkma. */
type SinkView = Partial<Pick<VehicleView, 'sink' | 'setPresent'>>;

/** Bir kare için gereken poz ve hız (ara değerli kare). */
export type WreckFrame = Pick<TankFrame, 'x' | 'y' | 'hull' | 'vx' | 'vy'>;

interface Seen {
  alive: boolean;
  parts: number;
  /** Batış süresi (ms): `null` batmıyor; `durationMs` olunca araç sahneden kalkmıştır. */
  sunk: number | null;
}

/** Suyun batış için sunduğu: konumun derinliği ve dibe giden aracın yüzeyde bıraktığı iz. */
export interface WreckWater {
  depthAt(x: number, y: number): number;
  splash(x: number, y: number, radius: number): void;
}

/** Batışta halka ve kabarcıkların yarıçapı (birim): aracın boyuna yakın tek değer. */
const SPLASH_RADIUS = 30;

/**
 * Araç imhasının ve parça kopmasının sahne yönetmeni. Her kare araçların canlılığını ve kırık parça
 * maskesini bir önceki kareyle karşılaştırır: canlıdan ölüye geçişte tek bir patlama oynar, görünüm
 * olduğu yerde yanmış bir gövde olarak kalır (ışık ve hayalet söner, poz donar) ve yeniden doğunca
 * eski hâline döner. Derin suda ölen araç patlamaz: halka ve kabarcık bırakarak solar, küçülür ve
 * süre bitince sahneden kalkar (batış). Maskede yeni bir
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
    /** Göl varsa batışı ve izi buradan alır; yoksa her ölüm patlar. */
    private readonly water?: WreckWater,
  ) {}

  /** Aracı bu kare için yönetir; çizilip güncellenmesi gerekiyorsa (canlıysa) `true` döner. */
  track(
    subject: WreckSubject,
    view: (Pick<VehicleView, 'setWrecked' | 'setParts'> & Partial<VehicleView>) | undefined,
    frame: WreckFrame,
    /** Bu karenin sunum süresi (ms): batışı ilerletir; duraklatmada sıfırdır. */
    deltaMs = 0,
  ): boolean {
    const alive = subject.vitality.alive;
    const parts = subject.chassis.parts;
    const before = this.seen.get(subject.id);
    if (before === undefined) {
      // Geç katılımda suya gömülü ölü araç hiç görünmez: batmış sayılır.
      const sunk = !alive && this.drowned(frame) ? WATER_VIEW.sink.durationMs : null;
      this.seen.set(subject.id, { alive, parts, sunk });
      if (!alive) view?.setWrecked(true);
      if (sunk !== null) view?.setPresent?.(false);
      if (parts !== 0) view?.setParts(parts);
      return alive;
    }
    if (before.alive && !alive) {
      view?.setWrecked(true);
      if (this.drowned(frame)) {
        before.sunk = 0;
        this.water?.splash(frame.x, frame.y, SPLASH_RADIUS);
      } else {
        this.effects.wreck(subject.spec, frame.x, frame.y, frame.vx, frame.vy);
        this.onWreck?.(frame.x, frame.y);
      }
    } else if (!before.alive && alive) {
      view?.setWrecked(false);
      this.refloat(before, view);
    }
    before.alive = alive;
    if (!alive) this.sink(before, view, deltaMs);
    if (alive && parts !== before.parts) {
      this.shed(subject.spec, before.parts, parts, frame);
      view?.setParts(parts);
    }
    // Ölüyken maske değişmez sayılır: yeniden doğuşta temiz maske ilk canlı karede görünüme işlenir.
    if (alive) before.parts = parts;
    return alive;
  }

  /** Aracın bulunduğu yer batışa yetecek kadar derin mi. */
  private drowned(frame: WreckFrame): boolean {
    return (
      this.water !== undefined && this.water.depthAt(frame.x, frame.y) >= WATER_VIEW.sink.minDepth
    );
  }

  private sink(seen: Seen, view: SinkView | undefined, deltaMs: number): void {
    const { durationMs } = WATER_VIEW.sink;
    if (seen.sunk === null || seen.sunk >= durationMs) return;
    seen.sunk = Math.min(durationMs, seen.sunk + deltaMs);
    view?.sink?.(seen.sunk / durationMs);
    if (seen.sunk >= durationMs) view?.setPresent?.(false);
  }

  /** Yeniden doğan araç batmışsa gövde ve görünürlük yerine gelir. */
  private refloat(seen: Seen, view: SinkView | undefined): void {
    if (seen.sunk === null) return;
    seen.sunk = null;
    view?.sink?.(0);
    view?.setPresent?.(true);
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
