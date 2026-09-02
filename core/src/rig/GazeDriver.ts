import { clamp, clamp01, lerp, wrap } from '../math/interpolation';
import { requireFinite } from '../math/numeric';
import { createRandom, type Random } from '../random/random';

export interface GazeDriverConfig {
  /** Bakışın merkezden sapabileceği en büyük yarıçap (yerel px). */
  radiusPx: number;
  /** İki sıçrama arasında beklenen en kısa/en uzun süre (ms). */
  holdMsMin: number;
  holdMsMax: number;
  /**
   * Bir sıçramanın süresi (ms). KISA tutulur: bakış kaydırılmaz, atılır —
   * yumuşak bir geçiş canlı değil uyuşuk görünür.
   */
  saccadeMs: number;
  /** Yeni hedefin merkeze en yakın olabileceği yarıçap oranı [0,1]. */
  minRadiusRatio?: number;
  /**
   * Uyanıklık 1'ken bekleme sürelerinin çarpanı. 1'in altında bir değer,
   * tetikteyken bakışın daha sık gezinmesini sağlar.
   */
  alertHoldScale?: number;
}

export interface GazeSignals {
  /** Merkeze göre bakış noktası (yerel px). */
  x: number;
  y: number;
  /** Bakış noktasının merkezden görülen açısı (radyan). */
  angleRad: number;
  /** [0,1] — süren sıçramanın ilerlemesi; 1 = duruyor. */
  settle01: number;
}

const DEFAULT_MIN_RADIUS_RATIO = 0.35;
const DEFAULT_ALERT_HOLD_SCALE = 0.45;
/** Bakışın odak yönüne yapışabileceği en dar yay — tam kilitlenme cansız görünür. */
const FOCUS_SPREAD_RAD = Math.PI * 0.28;

/**
 * Sıçramalı (saccadic) bakış sürücüsü.
 *
 * Canlı bir bakış sürekli değil KESİKLİ hareket eder: bir noktada durur, sonra
 * bir sonrakine atlar. Yay ya da üstel yumuşatmayla sürülen bir "göz" hep aynı
 * uyuşuk kayma hissini verir; buradaki model bekleme + kısa sıçrama döngüsünü
 * doğrudan kurar.
 *
 * Bakış her zaman `radiusPx` yarıçaplı dairenin İÇİNDE kalır — bir yuvanın
 * içindeki göz yuvasından taşamaz. Odak yönü verilirse (ör. hareket ya da
 * tehdit yönü) hedefler o yöne doğru ağırlıklandırılır ama tam kilitlenmez.
 *
 * Rastgelelik enjekte edilebilir: aynı seed her zaman aynı bakış dizisini
 * verir, yani testler zamanlamayı ve sınırları doğrulayabilir.
 */
export class GazeDriver {
  private readonly config: Required<GazeDriverConfig>;
  private readonly random: Random;
  private fromX = 0;
  private fromY = 0;
  private toX = 0;
  private toY = 0;
  private x = 0;
  private y = 0;
  private holdRemainingMs = 0;
  private saccadeElapsedMs = 0;
  private saccading = false;

  constructor(config: GazeDriverConfig, random: Random = createRandom()) {
    requireFinite(config.radiusPx, 'GazeDriverConfig.radiusPx');
    requireFinite(config.holdMsMin, 'GazeDriverConfig.holdMsMin');
    requireFinite(config.holdMsMax, 'GazeDriverConfig.holdMsMax');
    requireFinite(config.saccadeMs, 'GazeDriverConfig.saccadeMs');
    if (config.radiusPx < 0 || config.saccadeMs <= 0) {
      throw new RangeError('GazeDriver: radiusPx negatif, saccadeMs pozitif olmalı');
    }
    if (config.holdMsMin < 0 || config.holdMsMax < config.holdMsMin) {
      throw new RangeError('GazeDriver: holdMsMin >= 0 ve holdMsMax >= holdMsMin olmalı');
    }

    this.config = {
      ...config,
      minRadiusRatio: clamp01(config.minRadiusRatio ?? DEFAULT_MIN_RADIUS_RATIO),
      alertHoldScale: Math.max(0, config.alertHoldScale ?? DEFAULT_ALERT_HOLD_SCALE),
    };
    this.random = random;
    this.holdRemainingMs = this.rollHoldMs(0);
  }

  /**
   * Bir kare ilerletir.
   *
   * @param focusRad Bakışın çekileceği yön (radyan) ya da `null` (serbest tarama).
   * @param alertness01 [0,1] — 1'e yaklaştıkça bekleme kısalır, bakış sık gezinir.
   */
  update(deltaMs: number, focusRad: number | null = null, alertness01 = 0): GazeSignals {
    const dt = Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
    const alert = clamp01(Number.isFinite(alertness01) ? alertness01 : 0);

    if (dt > 0) {
      if (this.saccading) {
        this.saccadeElapsedMs += dt;
        const t = clamp01(this.saccadeElapsedMs / this.config.saccadeMs);
        const eased = easeOutCubic(t);
        this.x = lerp(this.fromX, this.toX, eased);
        this.y = lerp(this.fromY, this.toY, eased);
        if (t >= 1) {
          this.saccading = false;
          this.holdRemainingMs = this.rollHoldMs(alert);
        }
      } else {
        this.holdRemainingMs -= dt;
        if (this.holdRemainingMs <= 0) this.beginSaccade(focusRad);
      }
    }

    return {
      x: this.x,
      y: this.y,
      angleRad: Math.atan2(this.y, this.x),
      settle01: this.saccading ? clamp01(this.saccadeElapsedMs / this.config.saccadeMs) : 1,
    };
  }

  /** Bakışı merkeze alır ve bekleme sayacını yeniden kurar. */
  reset(): void {
    this.x = 0;
    this.y = 0;
    this.fromX = 0;
    this.fromY = 0;
    this.toX = 0;
    this.toY = 0;
    this.saccading = false;
    this.saccadeElapsedMs = 0;
    this.holdRemainingMs = this.rollHoldMs(0);
  }

  private beginSaccade(focusRad: number | null): void {
    const spread = focusRad === null ? Math.PI : FOCUS_SPREAD_RAD;
    const base = focusRad === null ? 0 : wrap(focusRad, -Math.PI, Math.PI);
    const angle = base + this.random.bipolar() * spread;
    const ratio = lerp(this.config.minRadiusRatio, 1, this.random.next());
    const radius = this.config.radiusPx * ratio;

    this.fromX = this.x;
    this.fromY = this.y;
    this.toX = Math.cos(angle) * radius;
    this.toY = Math.sin(angle) * radius;
    this.saccadeElapsedMs = 0;
    this.saccading = true;
  }

  /** Uyanıklık arttıkça bekleme kısalır — avlanan bir bakış yerinde durmaz. */
  private rollHoldMs(alert01: number): number {
    const span = this.config.holdMsMax - this.config.holdMsMin;
    const raw = this.config.holdMsMin + span * this.random.next();
    const scale = lerp(1, this.config.alertHoldScale, alert01);
    return clamp(raw * scale, 0, this.config.holdMsMax);
  }
}

/** Sert başlayıp hedefte oturan eğri — sıçrama yumuşak DEĞİL, keskin olmalı. */
function easeOutCubic(t: number): number {
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}
