import { XPBar, i18next } from '@volstudio/core';
import type { RunEconomy } from '@/runtime/systems/RunEconomy';

/**
 * Spark (deneyim) göstergesi — can ve dash barlarının altındaki HUD yuvası.
 *
 * Bar, `RunEconomy`'nin GÖRÜNTÜSÜDÜR: seviye/eşik defterini ekonomi tutar,
 * bar yalnızca `setState()` ile güncellenir. Seviye atlayınca XPBar'ın kendi
 * level-up vurgusu oynar.
 *
 */
export class SparkBar {
  readonly element: HTMLDivElement;
  private readonly bar: XPBar;
  private readonly economy: RunEconomy;
  private lastLevel: number;
  private lastSpark: number;

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

  /** Ekonomideki değişimi bara yansıtır — değer değişmediyse DOM'a dokunmaz. */
  refresh(): void {
    const level = this.economy.getLevel();
    const spark = this.economy.getSparkInLevel();
    if (level === this.lastLevel && spark === this.lastSpark) return;

    this.lastLevel = level;
    this.lastSpark = spark;
    this.bar.setState(level, spark);
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
    return base;
  }
}
