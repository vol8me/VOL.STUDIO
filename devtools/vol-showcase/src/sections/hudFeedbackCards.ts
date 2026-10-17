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
  FLOATING_TEXT_MAX_ACTIVE,
  FloatingTextManager,
  ResourceBar,
  ResourceCounter,
  Text,
  XPBar,
  applyXPGain,
} from '@volstudio/core/ui';
import type { BarVariant } from '@volstudio/core/ui';
import { i18n, i18next } from '@volstudio/core/i18n';
import { getAppSoundKit } from '../appSound';
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

/**
 * HUD durum kartı: tek çubukta boş/dolu, meşgul (belirsiz ilerleme), hata ve geçersiz sayı; 6 haneli sayaç sıfıra düşer.
 * Bileşenler yalnız sunar — hangi durumun ne zaman geçerli olduğuna burada düğmeler karar verir.
 */
export function buildHudStatesCard(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const bar = new Bar({
    variant: 'health',
    max: 100,
    value: 60,
    ariaLabel: i18next.t('volui:hud.health'),
    label: (value, max) => `${value} / ${max}`,
  });
  bar.element.dataset.hudState = 'bar';
  disposables.addDestroyables(bar);
  wrap.appendChild(bar.element);

  const note = new Text(i18next.t('volui:hud.statesHint'), { variant: 'muted' });
  disposables.addDestroyables(note);
  wrap.appendChild(note.element);

  const barControls = document.createElement('div');
  barControls.className = 'vol-showcase-panel-demo__controls';
  const toggleStatus = (status: 'busy' | 'error'): void =>
    bar.setStatus(bar.getStatus() === status ? 'normal' : status);
  const buttons = [
    new Button(i18next.t('volui:hud.barEmpty'), { onClick: () => bar.setValue(0) }),
    new Button(i18next.t('volui:hud.barFull'), { onClick: () => bar.setValue(100) }),
    new Button(i18next.t('volui:hud.barBusy'), { onClick: () => toggleStatus('busy') }),
    new Button(i18next.t('volui:hud.barError'), { onClick: () => toggleStatus('error') }),
    new Button(i18next.t('volui:hud.barInvalid'), { onClick: () => bar.setValue(Number.NaN) }),
  ];
  for (const button of buttons) {
    disposables.addDestroyables(button);
    barControls.appendChild(button.element);
  }
  wrap.appendChild(barControls);

  const score = new Counter({
    value: 999_999,
    animateMs: 600,
    format: (value) => i18next.t('volui:hud.scoreValue', { value: Math.round(value) }),
    announcePrefix: i18next.t('volui:hud.score'),
  });
  score.element.dataset.hudState = 'score';
  score.element.style.fontSize = '32px';
  disposables.addDestroyables(score);
  wrap.appendChild(score.element);

  const scoreControls = document.createElement('div');
  scoreControls.className = 'vol-showcase-panel-demo__controls';
  const drop = new Button(i18next.t('volui:hud.scoreDrop'), {
    variant: 'danger',
    onClick: () => score.setValue(0),
  });
  const restore = new Button(i18next.t('volui:hud.scoreRestore'), {
    onClick: () => score.setValue(999_999),
  });
  disposables.addDestroyables(drop, restore);
  scoreControls.appendChild(drop.element);
  scoreControls.appendChild(restore.element);
  wrap.appendChild(scoreControls);

  return card(i18next.t('volui:hud.statesCard'), wrap);
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

/**
 * Dikey bar: dolgu TABANDAN yukarı büyür. Dar bir HUD sütununda (yan boşluk,
 * araç çubuğu kenarı) yatay bir bar okunmaz; eksen `orientation` ile çevrilir.
 */
export function buildVerticalBarCard(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const row = document.createElement('div');
  row.className = 'vol-showcase-vertical-bars';

  const bars = (['health', 'stamina', 'cooldown'] as const).map((variant) => {
    const bar = new Bar({
      variant,
      orientation: 'vertical',
      max: 100,
      value: 100,
      ariaLabel: i18n.tDynamic(VARIANT_KEYS[variant]),
    });
    disposables.addDestroyables(bar);
    row.appendChild(bar.element);
    return bar;
  });

  wrap.appendChild(row);

  const hint = new Text(i18next.t('volui:hud.verticalBarHint'), { variant: 'muted' });
  disposables.addDestroyables(hint);
  wrap.appendChild(hint.element);

  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';

  const decButton = new Button('-20', {
    onClick: () => {
      for (const bar of bars) bar.setValue(Math.max(0, bar.getValue() - 20));
    },
  });
  const incButton = new Button('+20', {
    variant: 'primary',
    onClick: () => {
      for (const bar of bars) bar.setValue(Math.min(100, bar.getValue() + 20));
    },
  });
  disposables.addDestroyables(decButton, incButton);

  controls.appendChild(decButton.element);
  controls.appendChild(incButton.element);
  wrap.appendChild(controls);

  return card(i18next.t('volui:hud.verticalBar'), wrap);
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
    format: (v) => i18next.t('volui:hud.goldAmount', { value: Math.round(v) }),
    // Ödül sayımı: hedefi hafifçe aşıp oturur (yalnız görsel; duyuru ve değer hedeftir).
    animateMs: 450,
    overshoot: true,
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
 * bileşende değil, CORE'un opsiyonel `applyXPGain` tarifindedir — bar yalnızca
 * `setState()` ile eşitlenir. Farklı bir kural isteyen oyun tarifi çağırmaz.
 */
export function buildXPBarCard(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const xpForLevel = (level: number): number => 50 + level * 25;
  let progress = { level: 1, xp: 0 };

  const xpBar = new XPBar({ level: progress.level, xp: progress.xp, xpForLevel });

  const gainXp = (amount: number): void => {
    const next = applyXPGain(progress.level, progress.xp, amount, xpForLevel);
    // Seviye atlandıysa host duyurur (XPBar ses çalmaz; olay oyundadır).
    getAppSoundKit()?.play(next.level > progress.level ? 'levelUp' : 'reward');
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
  const addHugeButton = new Button(i18next.t('volui:hud.add2000XP'), {
    onClick: () => gainXp(2000),
  });
  disposables.addDestroyables(addSmallButton, addBigButton, addHugeButton);

  controls.appendChild(addSmallButton.element);
  controls.appendChild(addBigButton.element);
  controls.appendChild(addHugeButton.element);
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
  // Yoğun çatışma: aynı anda ekranda duran metin sayısı sınırlıdır, en eskiler toplanır.
  const status = new Text('', { variant: 'muted' });
  const reportActive = (): void => {
    status.setContent(
      i18next.t('volui:hud.floatingActive', {
        count: manager.activeCount,
        max: FLOATING_TEXT_MAX_ACTIVE,
      }),
    );
  };
  const crowdButton = new Button(i18next.t('volui:hud.crowd'), {
    onClick: () => {
      const { x, y } = spawnAt();
      for (let index = 0; index < 60; index += 1) {
        manager.spawn(x + (index % 10) * 14 - 63, y, `-${index + 1}`, { variant: 'negative' });
      }
      reportActive();
    },
  });
  disposables.addDestroyables(damageButton, healButton, criticalButton, crowdButton, status);

  controls.appendChild(damageButton.element);
  controls.appendChild(healButton.element);
  controls.appendChild(criticalButton.element);
  controls.appendChild(crowdButton.element);
  wrap.appendChild(controls);
  status.element.setAttribute('role', 'status');
  wrap.appendChild(status.element);
  reportActive();

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
