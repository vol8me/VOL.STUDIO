import { Bar, type BarLabel } from './Bar';
import { UI_TIMING } from '../../constants';

export interface XPBarOptions {
  /** Başlangıç seviyesi. Varsayılan 1. */
  level?: number;
  /** Başlangıçta mevcut seviye içindeki XP. Varsayılan 0. */
  xp?: number;
  /** Bir sonraki seviyeye geçmek için gereken XP miktarını hesaplar. */
  xpForLevel: (level: number) => number;
  /** Bar üzerindeki metin; varsayılan "xp / xpForLevel". */
  label?: BarLabel;
  animateMs?: number;
}

/**
 * Bar üzerine kurulu seviye/ilerleme göstergesi. **Saf görüntüdür:** durumu
 * `setState()` ile dışarıdan alır, kendi defterini TUTMAZ.
 */
export class XPBar {
  readonly element: HTMLDivElement;
  private readonly bar: Bar;
  private level: number;
  private xp: number;
  private readonly xpForLevel: (level: number) => number;
  private levelUpTimeout?: ReturnType<typeof setTimeout>;

  constructor(options: XPBarOptions) {
    const {
      level = 1,
      xp = 0,
      xpForLevel,
      label,
      animateMs = UI_TIMING.BAR_DEFAULT_ANIMATE,
    } = options;
    this.level = level;
    this.xp = xp;
    this.xpForLevel = xpForLevel;

    this.bar = new Bar({
      variant: 'cooldown',
      max: xpForLevel(level),
      value: xp,
      animateMs,
      // XP dolan bir değerdir: seviye başında bar boş olur. Tükenen kaynaklara
      // ait "düşük = kritik" kırmızısı burada yanlış algı yaratırdı; bar tek renk.
      lowThreshold: null,
      label: label ?? ((v, m) => `Lv.${this.level} — ${v} / ${m}`),
    });
    this.bar.element.classList.add('vol-xp-bar');
    this.element = this.bar.element;
  }

  /**
   * Barı dışarıdaki kaynağın (oyun durumu) seviyesine ve ilerlemesine eşitler.
   * Seviye arttıysa level-up vurgusu oynar — bu tamamen görsel bir tepkidir,
   * bileşen hiçbir şeye karar vermez.
   */
  setState(level: number, xp: number): void {
    const leveledUp = level > this.level;
    this.level = level;
    this.xp = Math.max(0, xp);

    this.bar.setMax(this.xpForLevel(level));
    this.bar.setValue(this.xp);

    if (leveledUp) {
      this.triggerLevelUpEffect();
    }
  }

  getLevel(): number {
    return this.level;
  }

  getXP(): number {
    return this.xp;
  }

  destroy(): void {
    clearTimeout(this.levelUpTimeout);
    this.bar.destroy();
  }

  private triggerLevelUpEffect(): void {
    this.element.classList.remove('vol-xp-bar--level-up');
    // Yeniden tetiklemek için reflow zorunlu (AnimatedLabel/Counter'daki aynı desen).
    void this.element.offsetWidth;
    this.element.classList.add('vol-xp-bar--level-up');

    clearTimeout(this.levelUpTimeout);
    this.levelUpTimeout = setTimeout(() => {
      this.element.classList.remove('vol-xp-bar--level-up');
    }, UI_TIMING.XP_LEVEL_UP_EFFECT);
  }
}

/** `applyXpGain` sonucu. */
export interface XpGainResult {
  level: number;
  /** Yeni seviyenin İÇİNDEKİ ilerleme. */
  xp: number;
  /** Bu çağrıda kaç seviye atlandı (0 = atlanmadı). */
  levelsGained: number;
}

/**
 * Klasik "taşan XP sonraki seviyeye devreder" ilerleme kuralı — OPSİYONEL tarif.
 *
 * "Taşan XP yanar" ya da "seviye başına sabit eşik" isteyen bir oyun bu
 * fonksiyonu çağırmaz, kendi hesabını yapıp `bar.setState()` der.
 *
 * ```ts
 * const next = applyXpGain(level, xp, kazanılan, xpForLevel);
 * bar.setState(next.level, next.xp);
 * ```
 *
 * `xpForLevel` sıfır ya da negatif dönerse döngü DURUR: aksi halde sonsuz
 * seviye atlama olurdu (eşiksiz seviye her zaman aşılmış sayılır).
 */
export function applyXpGain(
  level: number,
  xp: number,
  amount: number,
  xpForLevel: (level: number) => number,
): XpGainResult {
  let currentLevel = level;
  let remaining = xp + amount;
  let levelsGained = 0;

  let threshold = xpForLevel(currentLevel);
  while (threshold > 0 && remaining >= threshold) {
    remaining -= threshold;
    currentLevel += 1;
    levelsGained += 1;
    threshold = xpForLevel(currentLevel);
  }

  return { level: currentLevel, xp: Math.max(0, remaining), levelsGained };
}
