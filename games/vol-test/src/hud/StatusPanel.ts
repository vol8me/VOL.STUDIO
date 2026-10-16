import { i18next } from '@volstudio/core/i18n';
import type { SkillId } from '@/config/skills';
import { Bar, Panel, Text } from '@volstudio/core/ui';
import type { MessageKey } from '@/i18n/keys';
import type { HudFrame } from './HudFrame';

interface Gauge {
  readonly bar: Bar;
  /** Okuyucuya okunan ad; çubuğun üstünde yazı yoktur, doluluk çubuğun kendisidir. */
  readonly name: MessageKey;
}

/**
 * Araç göstergeleri ve yaşam durumu: can, hızlanma deposu ve atış dolumu yazısız yatay `Bar`lardır (doluluk
 * çubuğun kendisidir, değer okuyucuya `aria-valuetext` ile söylenir) ve tek bir CORE `Panel` içinde durur; yeniden doğma ve koruma bildirimi `Text`tir. Sürüş hızı ve yön
 * HUD'da yoktur: ayrıntı oyuncuya değil teşhise aittir, harita yön ve konumu verir.
 */
export class StatusPanel {
  readonly elements: readonly HTMLElement[];
  private readonly vitals: Panel;
  private readonly gauges: Readonly<Record<'health' | 'boost' | 'reload', Gauge>>;
  private readonly lifecycle: Text;
  private skill: SkillId | null = null;

  constructor() {
    this.vitals = new Panel({ className: 'vt-hud__vitals' });
    this.vitals.element.dataset.testid = 'vitals';
    const gauge = (
      variant: string,
      name: MessageKey,
      options: { lowThreshold: number | null; trail: boolean; percent?: boolean },
    ): Gauge => {
      const text = (value: number, max: number): string =>
        options.percent ? `${Math.round(value)}%` : `${Math.ceil(value)}/${Math.ceil(max)}`;
      const bar = new Bar({
        max: 100,
        value: 100,
        variant,
        lowThreshold: options.lowThreshold,
        trail: options.trail,
        animateMs: 0,
        ariaLabel: i18next.t(name),
        valueText: text,
      });
      this.vitals.add(bar);
      return { bar, name };
    };
    this.gauges = {
      health: gauge('health', 'voltest:hud.health', {
        lowThreshold: 0.25,
        trail: true,
      }),
      boost: gauge('stamina', 'voltest:hud.boost', {
        lowThreshold: 0.2,
        trail: false,
      }),
      reload: gauge('cooldown', 'voltest:hud.fireReload', {
        lowThreshold: null,
        trail: false,
        percent: true,
      }),
    };
    this.vitals.show();
    this.lifecycle = new Text('', { variant: 'muted', tag: 'p' });
    this.lifecycle.element.classList.add('vt-hud__lifecycle');
    this.lifecycle.element.dataset.testid = 'lifecycle';
    this.lifecycle.element.setAttribute('role', 'status');
    this.elements = [this.vitals.element, this.lifecycle.element];
  }

  update(frame: HudFrame): void {
    const { health, boost, reload } = this.gauges;
    const skill = frame.kind === 'tank' ? null : frame.skill;
    if (skill !== this.skill) {
      this.skill = skill;
      this.refreshLabels();
    }
    health.bar.setMax(frame.maxHealth);
    health.bar.setValue(frame.health);
    boost.bar.setMax(frame.boostCapacity);
    boost.bar.setValue(frame.boost);
    reload.bar.setValue(frame.fireProgress * 100);
    this.lifecycle.setContent(
      !frame.alive
        ? i18next.t('voltest:hud.respawnIn', {
            seconds: Math.ceil(frame.respawnRemainingMs / 1000),
          })
        : frame.protectionRemainingMs > 0
          ? i18next.t('voltest:hud.protection', {
              seconds: Math.ceil(frame.protectionRemainingMs / 1000),
            })
          : '',
    );
  }

  refreshLabels(): void {
    for (const [key, { bar, name }] of Object.entries(this.gauges))
      bar.element.setAttribute(
        'aria-label',
        i18next.t(key === 'boost' && this.skill ? `voltest:hud.skill.${this.skill}` : name),
      );
  }

  destroy(): void {
    for (const { bar } of Object.values(this.gauges)) bar.destroy();
    this.vitals.destroy();
    this.lifecycle.destroy();
  }
}
