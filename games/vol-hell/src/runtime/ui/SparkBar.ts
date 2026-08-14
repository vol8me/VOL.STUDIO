import { XPBar, i18next } from '@volstudio/core';
import type { RunEconomy } from '@/runtime/systems/RunEconomy';

/**
 * Spark (deneyim) göstergesi — can ve dash barlarının altındaki HUD yuvası.
 *
 * Bar, `RunEconomy`'nin GÖRÜNTÜSÜDÜR: seviye/eşik defterini ekonomi tutar,
 * bar yalnızca `setState()` ile güncellenir. Seviye atlayınca XPBar'ın kendi
 * level-up vurgusu oynar.
 *
 * Seviye atlaması dalga içinde kart ekranı açmadığı için, bekleyen kart hakkı
 * etikette gösterilir: oyuncu dalga sonunda kendisini ne beklediğini bilir.
 */
export class SparkBar {
  readonly element: HTMLDivElement;
  private readonly bar: XPBar;
  private readonly economy: RunEconomy;
  private lastLevel: number;
  private lastSpark: number;
  private lastPending = 0;

  constructor(parent: HTMLElement, economy: RunEconomy) {
    this.economy = economy;
    // Etiket callback'i XPBar constructor'ında HEMEN çağrılır; seviye alanları
    // ondan önce dolmalı, yoksa ilk çizimde "Sv.undefined" yazar.
    this.lastLevel = economy.getLevel();
    this.lastSpark = economy.getSparkInLevel();

    this.element = document.createElement('div');
    this.element.className = 'vol-hud__slot vol-hud__slot--spark';

    this.bar = new XPBar({
      level: economy.getLevel(),
      xp: economy.getSparkInLevel(),
      xpForLevel: (level) => economy.getLevelSpan(level),
      label: (value, max) => this.formatLabel(value, max),
    });
    this.element.appendChild(this.bar.element);
    parent.appendChild(this.element);
  }

  /**
   * Ekonomideki değişimi bara yansıtır — değer değişmediyse DOM'a dokunmaz.
   * @param pendingLevelUps Dalga sonunda seçilmeyi bekleyen kart hakkı.
   */
  refresh(pendingLevelUps = 0): void {
    const level = this.economy.getLevel();
    const spark = this.economy.getSparkInLevel();
    if (
      level === this.lastLevel &&
      spark === this.lastSpark &&
      pendingLevelUps === this.lastPending
    )
      return;

    this.lastLevel = level;
    this.lastSpark = spark;
    this.lastPending = pendingLevelUps;
    this.bar.setState(level, spark);
    this.element.classList.toggle('vol-hud__slot--pending', pendingLevelUps > 0);
  }

  /** Dil değişiminde etiketi yeniden yazdırır. */
  refreshLabel(): void {
    this.bar.setState(this.lastLevel, this.lastSpark);
  }

  destroy(): void {
    this.bar.destroy();
    this.element.remove();
  }

  private formatLabel(value: number, max: number): string {
    const base = `${i18next.t('volhell:hud.spark')} ${i18next.t('volhell:hud.level', {
      level: this.lastLevel,
    })} — ${value} / ${max}`;

    if (this.lastPending <= 0) return base;
    return `${base} · ${i18next.t('volhell:hud.pendingCards', { count: this.lastPending })}`;
  }
}
