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
  onLevelUp?: (newLevel: number) => void;
}

/** Bar üzerine kurulu XP/seviye göstergesi. `addXP()` eşiği aşan XP'yi otomatik sonraki seviyeye taşır (zincirleme atlama olabilir), her geçişte `onLevelUp` tetiklenir. */
export class XPBar {
  readonly element: HTMLDivElement;
  private readonly bar: Bar;
  private level: number;
  private xp: number;
  private readonly xpForLevel: (level: number) => number;
  private readonly onLevelUpHandler?: (newLevel: number) => void;
  private levelUpTimeout?: ReturnType<typeof setTimeout>;

  constructor(options: XPBarOptions) {
    const {
      level = 1,
      xp = 0,
      xpForLevel,
      label,
      animateMs = UI_TIMING.BAR_DEFAULT_ANIMATE,
      onLevelUp,
    } = options;
    this.level = level;
    this.xp = xp;
    this.xpForLevel = xpForLevel;
    this.onLevelUpHandler = onLevelUp;

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

  /** Verilen miktarda XP ekler; eşiği aşarsa otomatik seviye atlar (zincirleme olabilir). */
  addXP(amount: number): void {
    let remaining = this.xp + amount;
    let leveledUp = false;

    let threshold = this.xpForLevel(this.level);
    while (remaining >= threshold && threshold > 0) {
      remaining -= threshold;
      this.level += 1;
      leveledUp = true;
      threshold = this.xpForLevel(this.level);
    }

    this.xp = Math.max(0, remaining);

    if (leveledUp) {
      this.bar.setMax(threshold);
      this.bar.setValue(this.xp);
      this.triggerLevelUpEffect();
      this.onLevelUpHandler?.(this.level);
    } else {
      this.bar.setValue(this.xp);
    }
  }

  /**
   * Barı dışarıdaki bir kaynağın (oyun durumu) seviyesine ve XP'sine eşitler.
   *
   * `addXP()` barı KENDİ defteriyle sürer; seviye mantığı oyun tarafında zaten
   * varsa iki ayrı sayaç tutmak kaçınılmaz olarak birbirinden kayar. Bu metotla
   * bar saf bir görüntü olur. Seviye arttıysa level-up vurgusu oynar; olayın
   * sahibi dışarısı olduğu için `onLevelUp` YENİDEN tetiklenmez.
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
