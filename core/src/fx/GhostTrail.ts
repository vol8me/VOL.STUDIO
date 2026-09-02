import { clamp01, lerp } from '../math/interpolation';
import { requireFinite } from '../math/numeric';
import {
  samplePose,
  type PoseSample,
  type PoseSampleScratch,
  type PoseSourceNode,
} from './poseSample';
import { PoseSpriteSet, type PoseSpriteScene } from './PoseSpritePool';

export interface GhostTrailOptions {
  /** Aynı anda yaşayabilecek hayalet sayısı. */
  maxGhosts: number;
  /** Bir hayaletin sönme süresi (ms). */
  lifespanMs: number;
  /** İki yakalama arasındaki en kısa süre (ms); 0 = her `capture()` çağrısı yakalar. */
  captureIntervalMs?: number;
  /** Doğduğu andaki ve söndüğü andaki saydamlık. */
  startAlpha: number;
  endAlpha?: number;
  /** Hayaletin rengi; verilmezse parçaların kendi rengi korunur. */
  tint?: number;
  depth: number;
  blendMode?: number;
}

interface Ghost {
  readonly sprites: PoseSpriteSet;
  samples: PoseSample[];
  ageMs: number;
  alive: boolean;
}

/**
 * Eklemli bir görüntü ağacının ardında bıraktığı sönümlenen art-görüntüler.
 *
 * Tek bir sprite'ın kopyası DEĞİLDİR: kaynak ağaç her yakalamada dünya uzayına
 * düzleştirilir, yani hayalet gövdenin ve uzuvların o andaki gerçek pozunu
 * taşır. Bir atılımın hızını okutan şey de budur — bacakların o karedeki
 * salınımı izde görünür.
 *
 * Hayaletler dünya uzayında durur ve kaynağı İZLEMEZ; bırakıldıkları yerde
 * sönerler.
 */
export class GhostTrail {
  private readonly options: Required<Omit<GhostTrailOptions, 'tint' | 'blendMode'>> &
    Pick<GhostTrailOptions, 'tint' | 'blendMode'>;
  private readonly ghosts: Ghost[] = [];
  private readonly scratch: PoseSampleScratch = {};
  private sinceCaptureMs = Number.POSITIVE_INFINITY;
  private next = 0;
  private destroyed = false;

  constructor(scene: PoseSpriteScene, options: GhostTrailOptions) {
    requireFinite(options.lifespanMs, 'GhostTrailOptions.lifespanMs');
    requireFinite(options.startAlpha, 'GhostTrailOptions.startAlpha');
    if (!Number.isInteger(options.maxGhosts) || options.maxGhosts <= 0) {
      throw new RangeError('GhostTrail: maxGhosts pozitif bir tam sayı olmalı');
    }
    if (options.lifespanMs <= 0) {
      throw new RangeError('GhostTrail: lifespanMs pozitif olmalı');
    }

    this.options = {
      ...options,
      captureIntervalMs: Math.max(0, options.captureIntervalMs ?? 0),
      endAlpha: options.endAlpha ?? 0,
    };

    for (let i = 0; i < options.maxGhosts; i++) {
      this.ghosts.push({
        sprites: new PoseSpriteSet(scene, {
          depth: options.depth,
          tint: options.tint,
          blendMode: options.blendMode,
        }),
        samples: [],
        ageMs: 0,
        alive: false,
      });
    }
  }

  /** Yaşayan hayalet sayısı — teşhis ve test için. */
  get activeCount(): number {
    let count = 0;
    for (const ghost of this.ghosts) if (ghost.alive) count++;
    return count;
  }

  /**
   * Kaynağın o anki pozundan bir hayalet bırakır.
   *
   * `captureIntervalMs` dolmadıysa çağrı yok sayılır: her karede yakalamak
   * hayaletleri üst üste yığar ve iz bir bulanıklığa dönüşür. En eski hayalet
   * dolu havuzda geri dönüştürülür.
   */
  capture(root: PoseSourceNode): void {
    if (this.destroyed) return;
    if (this.sinceCaptureMs < this.options.captureIntervalMs) return;

    const ghost = this.ghosts[this.next];
    samplePose(root, ghost.samples, this.scratch);
    if (ghost.samples.length === 0) {
      // Boş poz hayalet üretmez ve SAYACI DA TÜKETMEZ: aksi halde bir kare
      // görünmez kalan bir kaynak, izin ritmini sessizce kaydırırdı.
      return;
    }

    this.sinceCaptureMs = 0;
    this.next = (this.next + 1) % this.ghosts.length;
    ghost.ageMs = 0;
    ghost.alive = true;
    this.draw(ghost);
  }

  /** Yaşayan hayaletleri söndürür. Yakalamadan bağımsız, her kare çağrılır. */
  update(deltaMs: number): void {
    if (this.destroyed) return;
    const dt = Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
    this.sinceCaptureMs += dt;
    if (dt === 0) return;

    for (const ghost of this.ghosts) {
      if (!ghost.alive) continue;
      ghost.ageMs += dt;
      if (ghost.ageMs >= this.options.lifespanMs) {
        ghost.alive = false;
        ghost.sprites.hide();
        continue;
      }
      this.draw(ghost);
    }
  }

  /** Tüm hayaletleri anında yok eder (sahne geçişi, ışınlanma). */
  clear(): void {
    for (const ghost of this.ghosts) {
      ghost.alive = false;
      ghost.samples.length = 0;
      ghost.sprites.hide();
    }
    this.sinceCaptureMs = Number.POSITIVE_INFINITY;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const ghost of this.ghosts) ghost.sprites.destroy();
    this.ghosts.length = 0;
  }

  private draw(ghost: Ghost): void {
    const t = clamp01(ghost.ageMs / this.options.lifespanMs);
    ghost.sprites.render(ghost.samples, lerp(this.options.startAlpha, this.options.endAlpha, t));
  }
}
