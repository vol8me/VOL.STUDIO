import { Bar, DisposableScope, i18next } from '@volstudio/core';
import { uiConfig } from '@/config/ui';
import type { AbilityRuntime } from '@/runtime/ability/AbilityRuntime';
import type { Player } from '@/runtime/entity/Player';
import type { RunEconomy } from '@/runtime/systems/RunEconomy';
import { AbilityHud } from './AbilityHud';
import { HUDStats } from './HUDStats';
import { SparkBar } from './SparkBar';
import { WaveBanner } from './WaveBanner';

export interface GameHudOptions {
  /** Masaüstü Q/E yetenek satırı kurulsun mu; dokunmatikte `false` (bkz. kurucu). */
  readonly abilitySlots?: boolean;
}

/** HUD'un ekranın üst ve alt kenarında kapladığı bant, parent'a göre CSS pikseli. */
export interface GameHudReserve {
  readonly top: number;
  readonly bottom: number;
}

/**
 * Oyun içi HUD'un tamamı: üst şerit (can/dash/Spark, dalga, istatistikler) ve
 * masaüstünde Q/E yetenek satırı. Değerler DEĞİŞMEDİKÇE DOM'a dokunulmaz;
 * kıyaslar burada tutulur.
 */
export class GameHud {
  private readonly scope = new DisposableScope();
  private readonly healthBar: Bar;
  private readonly dashBar: Bar;
  private readonly stats: HUDStats;
  private readonly sparkBar: SparkBar;
  private readonly abilityHud: AbilityHud | null;
  private readonly waveBanner: WaveBanner;
  private readonly topStrip: HTMLDivElement;
  private prevHealth: number;
  private prevMaxHealth: number;
  private prevDashCharge = 1;

  constructor(
    private readonly parent: HTMLElement,
    player: Player,
    economy: RunEconomy,
    options: GameHudOptions = {},
  ) {
    parent.style.setProperty('--vol-hud-bar-width', `${uiConfig.hud.barWidth}px`);
    this.scope.add({
      dispose: () => parent.style.removeProperty('--vol-hud-bar-width'),
    });

    this.topStrip = document.createElement('div');
    this.topStrip.className = 'vol-hud-top';
    const vitals = document.createElement('div');
    vitals.className = 'vol-hud-top__vitals';
    this.topStrip.appendChild(vitals);
    parent.appendChild(this.topStrip);
    this.scope.add({ dispose: () => this.topStrip.remove() });

    const maxHealth = player.getMaxHealth();
    this.prevHealth = maxHealth;
    this.prevMaxHealth = maxHealth;

    this.healthBar = this.scope.addDestroyable(
      new Bar({
        variant: 'health',
        max: maxHealth,
        value: maxHealth,
        lowThreshold: uiConfig.lowHealthThreshold,
        label: i18next.t('volhell:hud.health'),
      }),
    );
    this.healthBar.element.classList.add('vol-hud__slot', 'vol-hud__slot--health');
    vitals.appendChild(this.healthBar.element);

    this.dashBar = this.scope.addDestroyable(
      new Bar({
        variant: 'stamina',
        max: 1,
        value: 1,
        animateMs: uiConfig.hud.dashBar.animateMs,
        label: i18next.t('volhell:hud.dash'),
      }),
    );
    this.dashBar.element.classList.add('vol-hud__slot', 'vol-hud__slot--dash');
    vitals.appendChild(this.dashBar.element);

    this.sparkBar = this.scope.addDestroyable(new SparkBar(vitals, economy));
    this.waveBanner = this.scope.addDestroyable(new WaveBanner(this.topStrip));
    this.stats = this.scope.addDestroyable(new HUDStats(this.topStrip));
    // Dokunmatikte yeteneklerin TEK temsili `TouchControls` düğmeleridir: simge,
    // bekleme dolumu, hazır/boş durumu ve adı taşıyan etiket orada. Bu satır aynı
    // iki yuvayı ikinci kez çizer ve dokunmatikte karşılığı olmayan Q/E yazardı.
    this.abilityHud =
      options.abilitySlots === false ? null : this.scope.addDestroyable(new AbilityHud(parent));
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

  /**
   * Şeridin alt kenarı ve yetenek satırının üst kenarı, parent'a göre. Oyun tuvali
   * parent'ı birebir kapladığı için değerler dünya birimidir; `Border` sahayı bu
   * bantların dışında kurar.
   */
  measureReserve(): GameHudReserve {
    const parentRect = this.parent.getBoundingClientRect();
    const topRect = this.topStrip.getBoundingClientRect();
    const abilityRect = this.abilityHud?.element.getBoundingClientRect();
    return {
      top: Math.max(0, topRect.bottom - parentRect.top),
      bottom: abilityRect ? Math.max(0, parentRect.bottom - abilityRect.top) : 0,
    };
  }

  /** Şerit ya da yetenek satırı boyut değiştirince (dil, satır kırılması, dokunmatik kip) haber verir. */
  observeLayout(listener: () => void): () => void {
    const scope = new DisposableScope();
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(listener);
      observer.observe(this.parent);
      observer.observe(this.topStrip);
      if (this.abilityHud) observer.observe(this.abilityHud.element);
      scope.add({ dispose: () => observer.disconnect() });
    } else {
      scope.addListener(window, 'resize', listener);
    }
    return () => scope.dispose();
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
    this.abilityHud?.refresh(state.abilities);
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
    this.abilityHud?.refreshLabels();
    this.waveBanner.refreshLabels();
  }

  destroy(): void {
    this.scope.dispose();
  }
}
