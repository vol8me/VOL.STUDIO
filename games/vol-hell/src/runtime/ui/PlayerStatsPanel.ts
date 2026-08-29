import {
  IconButton,
  StatsPanel,
  i18next,
  type StatsPanelEntry,
  type StatsPanelGroup,
} from '@volstudio/core';
import { getAbilityDefinition, type AbilityKind } from '@/config/abilities';
import type { AbilityRuntime } from '@/runtime/ability/AbilityRuntime';
import type { AbilityUpgradeKey } from '@/runtime/ability/AbilityUpgrades';
import { ABILITY_SLOTS, type AbilitySlot } from '@/runtime/ability/types';
import {
  scaleAbilityDamage,
  scaleTurretFireInterval,
  scaleTurretHealth,
} from '@/runtime/ability/abilityScaling';
import type { Player } from '@/runtime/entity/Player';
import { createAbilityIcon, getAbilityDisplayName } from './abilityPresentation';

/**
 * Shop içindeki oyuncu istatistikleri çekmecesi.
 *
 * `StatsPanel` yalnızca CORE sunum mekanizmasıdır; VOL.HELL'e özgü hangi
 * değerlerin ve yetenek tariflerinin çizileceği burada kalır. Böylece oyun HUD'u
 * her frame istatistik paneli üretmez ve aynı görünüm başka oyunlara sızmaz.
 */
export class PlayerStatsPanel {
  private readonly panel: StatsPanel;
  private readonly button: IconButton;
  private lastStatsKey = '';
  private visible = false;
  private destroyed = false;

  constructor(
    buttonParent: HTMLElement,
    panelParent: HTMLElement,
    private readonly player: Player,
    private readonly abilities: AbilityRuntime,
    onOpen?: () => void,
  ) {
    this.panel = new StatsPanel({
      title: i18next.t('volhell:stats.title'),
      closeLabel: i18next.t('volhell:stats.close'),
      className: 'vol-volhell-stats-panel',
    });
    this.button = new IconButton('☷', {
      label: i18next.t('volhell:stats.open'),
      onClick: () => {
        if (this.destroyed || !this.visible) return;
        onOpen?.();
        this.panel.open();
      },
    });
    this.button.element.classList.add('vol-card-shop__stats-toggle');
    this.button.element.hidden = true;

    buttonParent.appendChild(this.button.element);
    panelParent.appendChild(this.panel.element);
  }

  /** Buton yalnızca shop görünürken erişilebilir olur. */
  setVisible(visible: boolean): void {
    if (this.destroyed) return;
    this.visible = visible;
    this.button.element.hidden = !visible;
    if (!visible) this.panel.close();
  }

  /** Satın alma/equip/unequip sonrasında gerçek stat defterini yeniden çizer. */
  refresh(): void {
    if (this.destroyed) return;

    const stats = this.player.getStats();
    const health = `${Math.ceil(this.player.getHealth())} / ${Math.ceil(
      this.player.getMaxHealth(),
    )}`;
    const damage = formatStat(stats.getValue('damage'));
    const speed = formatStat(stats.getValue('speed'));
    const fireRateMs = Math.max(1, stats.getValue('fireRate'));
    const abilityState = ABILITY_SLOTS.map(
      (slot) => `${slot}:${this.abilities.getAbility(slot)?.id ?? ''}`,
    ).join('|');
    const upgradeState = [
      this.getUpgrade('chainBounces'),
      this.getUpgrade('turretDamage'),
      this.getUpgrade('fireZoneDurationMs'),
      this.getUpgrade('multiShotProjectiles'),
    ].join('|');
    const key = `${health}|${damage}|${speed}|${fireRateMs}|${abilityState}|${upgradeState}`;
    if (key === this.lastStatsKey) return;
    this.lastStatsKey = key;

    const groups: StatsPanelGroup[] = [
      {
        id: 'player',
        label: i18next.t('volhell:stats.player'),
        entries: [
          this.statEntry('health', 'health', i18next.t('volhell:stats.health'), health),
          this.statEntry('damage', 'damage', i18next.t('volhell:stats.damage'), damage),
          this.statEntry('speed', 'speed', i18next.t('volhell:stats.speed'), speed),
          this.statEntry(
            'fireRate',
            'fireRate',
            i18next.t('volhell:stats.fireRate'),
            formatPerSecond(fireRateMs),
            formatDuration(fireRateMs),
          ),
        ],
      },
      {
        id: 'abilities',
        label: i18next.t('volhell:stats.abilities'),
        entries: [this.abilitySummary('primary'), this.abilitySummary('secondary')],
      },
      ...ABILITY_SLOTS.map((slot) => this.createAbilityGroup(slot)),
    ];

    this.panel.setGroups(groups);
  }

  refreshLabels(): void {
    if (this.destroyed) return;
    this.panel.setTitle(i18next.t('volhell:stats.title'));
    this.panel.setCloseLabel(i18next.t('volhell:stats.close'));
    this.button.setLabel(i18next.t('volhell:stats.open'));
    this.lastStatsKey = '';
    this.refresh();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.button.destroy();
    this.panel.destroy();
  }

  private abilitySummary(slot: AbilitySlot): StatsPanelEntry {
    const ability = this.abilities.getAbility(slot);
    if (!ability) {
      return {
        id: `summary-${slot}`,
        label: i18next.t(`volhell:stats.${slot}`),
        value: i18next.t('volhell:ability.empty'),
        icon: '＋',
      };
    }
    const definition = getAbilityDefinition(ability.id);
    return {
      id: `summary-${slot}`,
      label: i18next.t(`volhell:stats.${slot}`),
      value: getAbilityDisplayName(ability.id),
      icon: createAbilityIcon(definition.kind),
    };
  }

  private createAbilityGroup(slot: AbilitySlot): StatsPanelGroup {
    const ability = this.abilities.getAbility(slot);
    if (!ability) {
      return {
        id: `ability-${slot}`,
        label: `${i18next.t(`volhell:stats.${slot}`)} · ${i18next.t('volhell:ability.empty')}`,
        icon: createAbilityIcon(null),
        entries: [
          {
            id: 'empty',
            label: i18next.t('volhell:stats.emptyAbility'),
            value: '—',
            icon: '＋',
          },
        ],
      };
    }

    const definition = getAbilityDefinition(ability.id);
    return {
      id: `ability-${slot}`,
      label: `${i18next.t(`volhell:stats.${slot}`)} · ${getAbilityDisplayName(ability.id)}`,
      icon: createAbilityIcon(definition.kind),
      entries: this.createAbilityEntries(definition.kind, definition),
    };
  }

  private createAbilityEntries(
    kind: AbilityKind,
    definition: ReturnType<typeof getAbilityDefinition>,
  ): StatsPanelEntry[] {
    const stats = this.player.getStats();
    switch (kind) {
      case 'turret': {
        const params = definition.turret;
        if (!params) return [];
        const fireIntervalMs = scaleTurretFireInterval(params.fireIntervalMs, stats);
        return [
          this.statEntry(
            'damage',
            'damage',
            i18next.t('volhell:stats.damagePerShot'),
            formatStat(scaleAbilityDamage(params.damage + this.getUpgrade('turretDamage'), stats)),
          ),
          this.statEntry(
            'health',
            'health',
            i18next.t('volhell:stats.turretHealth'),
            formatStat(scaleTurretHealth(params.health, stats)),
          ),
          this.statEntry(
            'fireRate',
            'fireRate',
            i18next.t('volhell:stats.fireRate'),
            formatPerSecond(fireIntervalMs),
            formatDuration(fireIntervalMs),
          ),
          this.statEntry(
            'range',
            'range',
            i18next.t('volhell:stats.range'),
            formatPixels(params.rangePx),
          ),
        ];
      }
      case 'chainLightning': {
        const params = definition.chain;
        if (!params) return [];
        const bounces = Math.max(0, params.bounces + this.getUpgrade('chainBounces'));
        return [
          this.statEntry(
            'damage',
            'damage',
            i18next.t('volhell:stats.damagePerHit'),
            formatStat(scaleAbilityDamage(params.damage, stats)),
          ),
          this.statEntry(
            'bounces',
            'bounces',
            i18next.t('volhell:stats.totalTargets'),
            formatStat(1 + bounces),
            i18next.t('volhell:stats.bounceHint', { count: bounces }),
          ),
          this.statEntry(
            'range',
            'range',
            i18next.t('volhell:stats.firstRange'),
            formatPixels(params.firstRangePx),
          ),
        ];
      }
      case 'fireZone': {
        const params = definition.fire;
        if (!params) return [];
        const durationMs = Math.max(
          params.tickMs,
          params.durationMs + this.getUpgrade('fireZoneDurationMs'),
        );
        return [
          this.statEntry(
            'damage',
            'damage',
            i18next.t('volhell:stats.damagePerTick'),
            formatStat(scaleAbilityDamage(params.damagePerTick, stats)),
          ),
          this.statEntry(
            'duration',
            'range',
            i18next.t('volhell:stats.duration'),
            formatDuration(durationMs),
          ),
          this.statEntry(
            'radius',
            'range',
            i18next.t('volhell:stats.radius'),
            formatPixels(params.radius),
          ),
        ];
      }
      case 'multiShot': {
        const params = definition.multiShot;
        if (!params) return [];
        return [
          this.statEntry(
            'projectiles',
            'projectiles',
            i18next.t('volhell:stats.projectiles'),
            formatStat(Math.max(1, params.projectiles + this.getUpgrade('multiShotProjectiles'))),
          ),
          this.statEntry(
            'damage',
            'damage',
            i18next.t('volhell:stats.damagePerProjectile'),
            formatStat(Math.max(0, stats.getValue('damage') * params.damageScale)),
          ),
          this.statEntry(
            'spread',
            'range',
            i18next.t('volhell:stats.spread'),
            i18next.t('volhell:stats.degrees', { value: formatStat(params.spreadDeg) }),
          ),
        ];
      }
    }
  }

  private statEntry(
    id: string,
    icon: keyof typeof STAT_ICONS,
    label: string,
    value: string,
    hint?: string,
  ): StatsPanelEntry {
    return { id, label, value, hint, icon: STAT_ICONS[icon] };
  }

  private getUpgrade(key: AbilityUpgradeKey): number {
    return this.abilities.upgrades?.get(key) ?? 0;
  }
}

function formatStat(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

const STAT_ICONS = {
  health: '♥',
  damage: '✦',
  speed: '➤',
  fireRate: '◷',
  bounces: '↝',
  range: '⌖',
  projectiles: '⁙',
} as const;

function formatPerSecond(intervalMs: number): string {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return '—';
  return i18next.t('volhell:stats.perSecond', { value: (1000 / intervalMs).toFixed(1) });
}

function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) return '—';
  return i18next.t('volhell:stats.seconds', { value: (durationMs / 1000).toFixed(1) });
}

function formatPixels(value: number): string {
  return i18next.t('volhell:stats.pixels', { value: formatStat(value) });
}
