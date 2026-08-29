import { Bar, i18next } from '@volstudio/core';
import { uiConfig } from '@/config/ui';
import type { AbilityRuntime } from '@/runtime/ability/AbilityRuntime';
import type { Player } from '@/runtime/entity/Player';
import type { RunEconomy } from '@/runtime/systems/RunEconomy';
import { AbilityHud } from './AbilityHud';
import { HUDStats } from './HUDStats';
import { SparkBar } from './SparkBar';
import { WaveBanner } from './WaveBanner';

/**
 * Oyun içi HUD'un tamamı — can/dash/Spark barları, skor bloğu ve ability
 * slotları tek bir yerden kurulur ve tazelenir.
 *
 * Sahne dosyasından ayrıldı: HUD kurulumu ve her frame'lik tazeleme oynanış
 * mantığıyla ilgisiz ama `GameScene`'de en çok yer kaplayan bölümdü.
 * Değerler DEĞİŞMEDİKÇE DOM'a dokunulmaz; kıyaslar burada tutulur.
 */
export class GameHud {
  private readonly healthBar: Bar;
  private readonly dashBar: Bar;
  private readonly healthContainer: HTMLDivElement;
  private readonly dashContainer: HTMLDivElement;
  private readonly stats: HUDStats;
  private readonly sparkBar: SparkBar;
  private readonly abilityHud: AbilityHud;
  private readonly waveBanner: WaveBanner;
  private prevHealth: number;
  private prevMaxHealth: number;
  private prevDashCharge = 1;

  constructor(
    private readonly parent: HTMLElement,
    player: Player,
    economy: RunEconomy,
  ) {
    // HUD ölçüleri config'te tek kaynak; CSS bunları custom property olarak okur.
    parent.style.setProperty('--vol-hud-bar-width', `${uiConfig.hud.barWidth}px`);
    parent.style.setProperty('--vol-hud-dash-offset', `${uiConfig.hud.dashBarTopOffset}px`);
    parent.style.setProperty('--vol-hud-spark-offset', `${uiConfig.hud.sparkBarTopOffset}px`);

    const maxHealth = player.getMaxHealth();
    this.prevHealth = maxHealth;
    this.prevMaxHealth = maxHealth;

    this.healthContainer = document.createElement('div');
    this.healthContainer.className = 'vol-hud__slot vol-hud__slot--health';
    this.healthBar = new Bar({
      variant: 'health',
      max: maxHealth,
      value: maxHealth,
      lowThreshold: uiConfig.lowHealthThreshold,
      label: i18next.t('volhell:hud.health'),
    });
    this.healthContainer.appendChild(this.healthBar.element);
    parent.appendChild(this.healthContainer);

    this.dashContainer = document.createElement('div');
    this.dashContainer.className = 'vol-hud__slot vol-hud__slot--dash';
    this.dashBar = new Bar({
      variant: 'stamina',
      max: 1,
      value: 1,
      animateMs: uiConfig.hud.dashBar.animateMs,
      label: i18next.t('volhell:hud.dash'),
    });
    this.dashContainer.appendChild(this.dashBar.element);
    parent.appendChild(this.dashContainer);

    this.stats = new HUDStats(parent);
    this.sparkBar = new SparkBar(parent, economy);
    this.abilityHud = new AbilityHud(parent);
    this.waveBanner = new WaveBanner(parent);
  }

  /** Yeni dalga başladı — ortada duyuru belirir. */
  announceWave(wave: number): void {
    this.waveBanner.announce(wave);
  }

  /** Koşu sayaçlarını başa alır (sahne yeniden başlatıldığında). */
  reset(): void {
    this.stats.setScore(0);
    this.stats.setKills(0);
    this.stats.setTime(0);
    this.stats.setFlux(0);
    this.stats.setFluxVisible(true);
  }

  /** Kart shop'u HUD üzerindeki aynı Flux değerinin iki kez görünmesini engeller. */
  setFluxVisible(visible: boolean): void {
    this.stats.setFluxVisible(visible);
  }

  /** Tüm göstergeleri tazeler — her frame çağrılır. */
  refresh(state: {
    player: Player;
    economy: RunEconomy;
    abilities: AbilityRuntime;
    score: number;
    kills: number;
    elapsedTimeMs: number;
    /** Bu frame'in süresi (ms) — dalga duyurusunun sayacı için. */
    deltaMs: number;
    wave: number;
    waveRemainingMs: number;
    /** Süre doldu ama Elite/Boss hâlâ ayakta. */
    awaitingBlocker: boolean;
    /** Zorunlu engelin kalan can oranı (0-1); engel yoksa null. */
    blockerHealthRatio: number | null;
  }): void {
    // Maks. can kartlarla değişebilir; bar bunu yansıtmazsa dolum oranı yalan söyler.
    const maxHealth = state.player.getMaxHealth();
    if (maxHealth !== this.prevMaxHealth) {
      this.prevMaxHealth = maxHealth;
      this.healthBar.setMax(maxHealth);
    }

    const health = state.player.getHealth();
    if (health !== this.prevHealth) {
      this.prevHealth = health;
      this.healthBar.setValue(health);
    }

    const dashCharge = state.player.getDashChargeRatio();
    if (Math.abs(dashCharge - this.prevDashCharge) > uiConfig.hud.dashBar.updateThreshold) {
      this.prevDashCharge = dashCharge;
      this.dashBar.setValue(dashCharge);
    }

    this.stats.setScore(state.score);
    this.stats.setKills(state.kills);
    this.stats.setTime(state.elapsedTimeMs);
    this.stats.setFlux(state.economy.getFlux());
    this.sparkBar.refresh();
    this.abilityHud.refresh(state.abilities);
    this.waveBanner.refresh(
      state.deltaMs,
      state.wave,
      state.waveRemainingMs,
      state.awaitingBlocker,
      state.blockerHealthRatio,
    );
  }

  /** Dil değişiminde etiketleri yeniden yazdırır. */
  refreshLabels(): void {
    this.healthBar.setLabel(i18next.t('volhell:hud.health'));
    this.dashBar.setLabel(i18next.t('volhell:hud.dash'));
    this.sparkBar.refreshLabel();
    this.abilityHud.refreshLabels();
    this.waveBanner.refreshLabels();
  }

  destroy(): void {
    this.healthBar.destroy();
    this.dashBar.destroy();
    this.healthContainer.remove();
    this.dashContainer.remove();
    this.stats.destroy();
    this.sparkBar.destroy();
    this.abilityHud.destroy();
    this.waveBanner.destroy();
    this.parent.style.removeProperty('--vol-hud-spark-offset');
  }
}
