/**
 * HUD sekmesinin GERİ BİLDİRİM kartları — CORE `ui/feedback/` ailesi.
 *
 * `hudTab.ts` tek dosyada 824 satıra çıkmıştı (anti-borç sınırı ~600). Bölme
 * CORE'un KENDİ dizin ayrımını izler (`ui/feedback/` ve `ui/hud/`), böylece
 * bir bileşenin demo'sunun hangi dosyada olduğu tahmin gerektirmez ve README
 * tablosundaki aile adlarıyla birebir örtüşür.
 */
import type { DisposableScope } from '@volstudio/core/lifecycle';
import {
  Bar,
  Button,
  Counter,
  FloatingTextManager,
  ResourceBar,
  ResourceCounter,
  Text,
  XPBar,
  applyXpGain,
} from '@volstudio/core/ui';
import type { BarVariant } from '@volstudio/core/ui';
import { i18n, i18next } from '@volstudio/core/i18n';
import { card, svgIcon } from './shared';
import { ICON_AMMO, ICON_GOLD, ICON_MANA, ICON_WOOD } from './icons';

const VARIANT_KEYS: Record<BarVariant, string> = {
  health: 'volui:hud.health',
  stamina: 'volui:hud.stamina',
  cooldown: 'volui:hud.cooldown',
};

export function buildBarVariantCard(
  variant: BarVariant,
  disposables: DisposableScope,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const bar = new Bar({ variant, max: 100, value: 100, label: (v, m) => `${v} / ${m}` });
  disposables.addDestroyables(bar);
  wrap.appendChild(bar.element);

  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';

  const decButton = new Button('-20', {
    onClick: () => {
      const next = Math.max(0, bar.getValue() - 20);
      bar.setValue(next);
    },
  });
  const incButton = new Button('+20', {
    variant: 'primary',
    onClick: () => {
      const next = Math.min(100, bar.getValue() + 20);
      bar.setValue(next);
    },
  });
  disposables.addDestroyables(decButton, incButton);

  controls.appendChild(decButton.element);
  controls.appendChild(incButton.element);
  wrap.appendChild(controls);

  return card(i18n.tDynamic(VARIANT_KEYS[variant]), wrap);
}

/** lowThreshold altında kırmızıya döner. Varsayılan %25, burada %50. */
export function buildLowThresholdCard(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const bar = new Bar({
    variant: 'health',
    max: 100,
    value: 100,
    lowThreshold: 0.5,
    label: (v, m) => `${v} / ${m}`,
  });
  disposables.addDestroyables(bar);
  wrap.appendChild(bar.element);

  const hint = new Text(i18next.t('volui:hud.lowThresholdHint'), {
    variant: 'muted',
  });
  disposables.addDestroyables(hint);
  wrap.appendChild(hint.element);

  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';

  const decButton = new Button('-10', {
    variant: 'danger',
    onClick: () => bar.setValue(Math.max(0, bar.getValue() - 10)),
  });
  const resetButton = new Button(i18next.t('volui:hud.reset'), {
    onClick: () => bar.setValue(100),
  });
  disposables.addDestroyables(decButton, resetButton);

  controls.appendChild(decButton.element);
  controls.appendChild(resetButton.element);
  wrap.appendChild(controls);

  return card(i18next.t('volui:hud.criticalThreshold'), wrap);
}

export function buildCounterCard(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const counter = new Counter({ value: 0 });
  counter.element.style.fontSize = '32px';
  disposables.addDestroyables(counter);
  wrap.appendChild(counter.element);

  const button = new Button(i18next.t('volui:hud.addScore'), {
    variant: 'primary',
    onClick: () => counter.setValue(counter.getValue() + 10, { pulse: true }),
  });
  disposables.addDestroyables(button);
  wrap.appendChild(button.element);

  return card(i18next.t('volui:hud.counter'), wrap);
}

/** Özel format (binlik ayraç + para birimi) örneği. */
export function buildFormattedCounterCard(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const counter = new Counter({
    value: 0,
    format: (v) => `${Math.round(v).toLocaleString('tr-TR')} ₺`,
  });
  counter.element.style.fontSize = '32px';
  disposables.addDestroyables(counter);
  wrap.appendChild(counter.element);

  const button = new Button(i18next.t('volui:hud.addGold'), {
    variant: 'primary',
    onClick: () => counter.setValue(counter.getValue() + 500, { pulse: true }),
  });
  disposables.addDestroyables(button);
  wrap.appendChild(button.element);

  return card(i18next.t('volui:hud.counterFormatted'), wrap);
}

/**
 * XPBar: saf görüntü. İlerleme KURALI (taşan XP sonraki seviyeye devreder)
 * bileşende değil, CORE'un opsiyonel `applyXpGain` tarifindedir — bar yalnızca
 * `setState()` ile eşitlenir. Farklı bir kural isteyen oyun tarifi çağırmaz.
 */
export function buildXPBarCard(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const xpForLevel = (level: number): number => 50 + level * 25;
  let progress = { level: 1, xp: 0 };

  const xpBar = new XPBar({ level: progress.level, xp: progress.xp, xpForLevel });

  const gainXp = (amount: number): void => {
    const next = applyXpGain(progress.level, progress.xp, amount, xpForLevel);
    progress = { level: next.level, xp: next.xp };
    xpBar.setState(progress.level, progress.xp);
  };
  disposables.addDestroyables(xpBar);
  wrap.appendChild(xpBar.element);

  const hint = new Text(i18next.t('volui:hud.xpHint'), {
    variant: 'muted',
  });
  disposables.addDestroyables(hint);
  wrap.appendChild(hint.element);

  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';

  const addSmallButton = new Button(i18next.t('volui:hud.add20XP'), {
    onClick: () => gainXp(20),
  });
  const addBigButton = new Button(i18next.t('volui:hud.add150XP'), {
    variant: 'primary',
    onClick: () => gainXp(150),
  });
  disposables.addDestroyables(addSmallButton, addBigButton);

  controls.appendChild(addSmallButton.element);
  controls.appendChild(addBigButton.element);
  wrap.appendChild(controls);

  return card(i18next.t('volui:hud.xpBar'), wrap);
}

export function buildResourceCounterCard(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const ammo = new ResourceCounter({
    icon: svgIcon(ICON_AMMO),
    label: i18next.t('volui:hud.ammo'),
    value: 30,
  });
  ammo.element.style.fontSize = '24px';
  disposables.addDestroyables(ammo);

  const mana = new ResourceCounter({
    icon: svgIcon(ICON_MANA),
    label: i18next.t('volui:hud.mana'),
    value: 80,
  });
  mana.element.style.fontSize = '24px';
  disposables.addDestroyables(mana);

  const row = document.createElement('div');
  row.className = 'vol-showcase-panel-demo__controls';
  row.appendChild(ammo.element);
  row.appendChild(mana.element);
  wrap.appendChild(row);

  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';

  const fireButton = new Button(i18next.t('volui:hud.fire'), {
    variant: 'danger',
    onClick: () => ammo.setValue(Math.max(0, ammo.getValue() - 1), { pulse: true }),
  });
  const spellButton = new Button(i18next.t('volui:hud.castSpell'), {
    variant: 'primary',
    onClick: () => mana.setValue(Math.max(0, mana.getValue() - 15), { pulse: true }),
  });
  disposables.addDestroyables(fireButton, spellButton);

  controls.appendChild(fireButton.element);
  controls.appendChild(spellButton.element);
  wrap.appendChild(controls);

  return card(i18next.t('volui:hud.resourceCounter'), wrap);
}

/**
 * FloatingTextManager: kayıp/kazanç/vurgu sayıları belirli x/y'de belirir, yukarı süzülür ve kaybolur.
 *
 * Varyant adları GÖRSELDİR (negative/positive/emphasis); oyun anlamını çağıran
 * eşler — bu demoda hasar/iyileşme/kritik vuruş olarak gösteriliyor.
 */
export function buildFloatingTextCard(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const stage = document.createElement('div');
  stage.className = 'vol-showcase-panel-stage vol-showcase-panel-stage--wide';
  wrap.appendChild(stage);

  const manager = new FloatingTextManager(stage, { anchor: 'absolute' });
  disposables.addDestroyables({ destroy: () => manager.destroy() });

  const spawnAt = (): { x: number; y: number } => {
    const rect = stage.getBoundingClientRect();
    return { x: rect.width / 2, y: rect.height / 2 };
  };

  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';

  const damageButton = new Button(i18next.t('volui:hud.damage'), {
    variant: 'danger',
    onClick: () => {
      const { x, y } = spawnAt();
      manager.spawn(x, y, `-${Math.ceil(Math.random() * 30) + 5}`, { variant: 'negative' });
    },
  });
  const healButton = new Button(i18next.t('volui:hud.heal'), {
    variant: 'primary',
    onClick: () => {
      const { x, y } = spawnAt();
      manager.spawn(x, y, `+${Math.ceil(Math.random() * 20) + 5}`, { variant: 'positive' });
    },
  });
  const criticalButton = new Button(i18next.t('volui:hud.critical'), {
    onClick: () => {
      const { x, y } = spawnAt();
      manager.spawn(
        x,
        y,
        i18next.t('volui:hud.floatingCritical', { value: Math.ceil(Math.random() * 50) + 40 }),
        { variant: 'emphasis' },
      );
    },
  });
  disposables.addDestroyables(damageButton, healButton, criticalButton);

  controls.appendChild(damageButton.element);
  controls.appendChild(healButton.element);
  controls.appendChild(criticalButton.element);
  wrap.appendChild(controls);

  return card(i18next.t('volui:hud.floatingText'), wrap, { spanAll: true });
}

/** ResourceBar: RTS/otomasyon için sabit çoklu-kaynak şeridi. */
export function buildResourceBarCard(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const resourceBar = new ResourceBar({
    resources: [
      { key: 'gold', icon: svgIcon(ICON_GOLD), label: i18next.t('volui:hud.gold'), value: 250 },
      { key: 'wood', icon: svgIcon(ICON_WOOD), label: i18next.t('volui:hud.wood'), value: 120 },
    ],
  });
  disposables.addDestroyables(resourceBar);
  wrap.appendChild(resourceBar.element);

  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';

  const gatherButton = new Button(i18next.t('volui:hud.gather'), {
    onClick: () =>
      resourceBar.setResource('wood', (resourceBar.getResource('wood') ?? 0) + 10, { pulse: true }),
  });
  const spendButton = new Button(i18next.t('volui:hud.spend'), {
    variant: 'danger',
    onClick: () =>
      resourceBar.setResource('gold', Math.max(0, (resourceBar.getResource('gold') ?? 0) - 50), {
        pulse: true,
      }),
  });
  disposables.addDestroyables(gatherButton, spendButton);

  controls.appendChild(gatherButton.element);
  controls.appendChild(spendButton.element);
  wrap.appendChild(controls);

  return card(i18next.t('volui:hud.resourceBar'), wrap);
}
