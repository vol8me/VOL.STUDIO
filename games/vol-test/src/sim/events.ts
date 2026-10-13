import type { EntityId } from './entities/Vehicle';

export type DamageCause = 'projectile' | 'wall' | 'collision' | 'direct';

/**
 * Simülasyonun sunuma bildirdiği olaylar. Her olay kaynağını (ve varsa
 * hedefini) kimlikle taşır; görünüm, efekt, kamera, ses ve titreşim olayın
 * oyuncuya ait olup olmadığına göre tepki verir.
 */
export type SimEvent =
  | {
      readonly kind: 'damaged';
      readonly target: EntityId;
      readonly source?: EntityId;
      readonly cause: DamageCause;
      readonly amount: number;
      readonly health: number;
    }
  | {
      readonly kind: 'healed';
      readonly target: EntityId;
      readonly source?: EntityId;
      readonly amount: number;
      readonly health: number;
    }
  | {
      readonly kind: 'died';
      readonly target: EntityId;
      readonly source?: EntityId;
      readonly cause: DamageCause;
    }
  | {
      readonly kind: 'respawned';
      readonly target: EntityId;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly kind: 'fired';
      readonly source: EntityId;
      /** Ateşleyen yuva (`Armament.mounts` indeksi): çok namlulu araçta her namlu ayrı olaydır. */
      readonly mount: number;
      readonly x: number;
      readonly y: number;
      readonly angle: number;
      /** Mermi ilk hızı (tankın hızı dahil): uzaktan izleyen istemci mermiyi aynı yörüngede uçurur. */
      readonly vx: number;
      readonly vy: number;
    }
  /**
   * Mermi patladı: dünya duvarına çarptı (`wall`) ya da menzil sonunda yere
   * düştü (`ground`).
   */
  | {
      readonly kind: 'impact';
      readonly owner: EntityId;
      readonly surface: 'wall' | 'ground';
      readonly x: number;
      readonly y: number;
      readonly angle: number;
    }
  /** Mermi bir araca isabet etti. */
  | {
      readonly kind: 'hit';
      readonly owner: EntityId;
      readonly target: EntityId;
      readonly x: number;
      readonly y: number;
      readonly angle: number;
    }
  /** Araç dünya duvarına çarptı. */
  | {
      readonly kind: 'wallHit';
      readonly source: EntityId;
      readonly x: number;
      readonly y: number;
      readonly normalX: number;
      readonly normalY: number;
      /** Çarpmanın normal hızı (birim/s). */
      readonly speed: number;
    }
  /** İki araç çarpıştı. */
  | {
      readonly kind: 'collision';
      readonly a: EntityId;
      readonly b: EntityId;
      readonly x: number;
      readonly y: number;
      readonly normalX: number;
      readonly normalY: number;
      readonly speed: number;
    };
