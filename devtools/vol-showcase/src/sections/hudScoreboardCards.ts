/**
 * HUD sekmesinin SKOR kartları — CORE `ui/hud/` ailesinin sıkı, kaydırmasız bileşenleri
 * (`VersusBar`, `RankList`, `ActivityFeed`). Bölme gerekçesi için bkz. `hudFeedbackCards.ts`.
 */
import type { DisposableScope } from '@volstudio/core/lifecycle';
import {
  ActivityFeed,
  Button,
  RankList,
  Text,
  VersusBar,
  type ActivityFeedTone,
  type RankListRow,
} from '@volstudio/core/ui';
import { i18next } from '@volstudio/core/i18n';
import { card } from './shared';

const AMBER = '#e0a030';
const BLUE = '#3080e0';
const TARGET = 1200;
/** Bölge sahipleri: 0 kehribar, 1 mavi, tanımsız tarafsız. */
const INITIAL_OWNERS: ReadonlyArray<0 | 1 | undefined> = [0, 1, undefined, undefined, undefined];

function controlsRow(): HTMLElement {
  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';
  return controls;
}

/** VersusBar: iki taraf, hedefe uzanan iz, bölge işaretleri ve sağda bağlantı göstergesi. */
export function buildVersusBarCard(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const bar = new VersusBar({ target: TARGET });
  const link = new Text(i18next.t('volui:hud.versusLink', { ms: 42 }), {
    variant: 'muted',
    tag: 'span',
  });
  bar.setTrailing(link.element);
  disposables.addDestroyables(bar, link);

  let amber = 300;
  let blue = 180;
  let owners: Array<0 | 1 | undefined> = [...INITIAL_OWNERS];
  const paint = (): void => {
    bar.setSides([
      {
        id: 'amber',
        label: i18next.t('volui:hud.versusAmber'),
        value: amber,
        color: AMBER,
        own: true,
      },
      { id: 'blue', label: i18next.t('volui:hud.versusBlue'), value: blue, color: BLUE, wins: 1 },
    ]);
    bar.setPips(
      owners.map((owner, index) => ({
        id: `zone-${index}`,
        label: i18next.t('volui:hud.versusZone', { index: index + 1 }),
        color: owner === undefined ? undefined : owner === 0 ? AMBER : BLUE,
        contested: owner === undefined && index === 2,
      })),
    );
  };
  paint();
  wrap.appendChild(bar.element);

  const controls = controlsRow();
  const score = new Button(i18next.t('volui:hud.versusScore'), {
    variant: 'primary',
    onClick: () => {
      amber = Math.min(TARGET, amber + 120);
      paint();
    },
  });
  const flip = new Button(i18next.t('volui:hud.versusFlip'), {
    onClick: () => {
      const next = owners.findIndex((owner) => owner === undefined);
      if (next >= 0) owners = owners.map((owner, index) => (index === next ? 0 : owner));
      blue = Math.min(TARGET, blue + 40);
      paint();
    },
  });
  const reset = new Button(i18next.t('volui:hud.versusReset'), {
    onClick: () => {
      amber = 300;
      blue = 180;
      owners = [...INITIAL_OWNERS];
      paint();
    },
  });
  disposables.addDestroyables(score, flip, reset);
  controls.append(score.element, flip.element, reset.element);
  wrap.appendChild(controls);

  return card(i18next.t('volui:hud.versusBar'), wrap, { spanAll: true });
}

/** RankList: sabit satır sayısı; kendi satırı dışarıda kalırsa gerçek sırasıyla son yuvaya gelir. */
export function buildRankListCard(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const list = new RankList({
    capacity: 4,
    title: i18next.t('volui:hud.rankTitle'),
    emptyText: () => i18next.t('volui:hud.rankEmpty'),
  });
  disposables.addDestroyables(list);

  const players: Array<{ id: number; kills: number; deaths: number; bot: boolean }> = [
    { id: 1, kills: 7, deaths: 2, bot: false },
    { id: 2, kills: 5, deaths: 3, bot: true },
    { id: 3, kills: 3, deaths: 4, bot: false },
  ];
  let nextId = 4;
  const rows = (): RankListRow[] =>
    [...players]
      .sort((a, b) => b.kills - a.kills)
      .map((player) => ({
        id: String(player.id),
        label: i18next.t('volui:hud.rankPlayer', { index: player.id }),
        value: String(player.kills),
        secondary: String(player.deaths),
        color: player.id % 2 === 0 ? BLUE : AMBER,
        self: player.id === 3,
        tag: player.bot ? i18next.t('volui:hud.rankBot') : undefined,
      }));
  const paint = (): void => list.setRows(rows());
  paint();
  wrap.appendChild(list.element);

  const controls = controlsRow();
  const kill = new Button(i18next.t('volui:hud.rankKill'), {
    variant: 'primary',
    onClick: () => {
      const own = players.find((player) => player.id === 3);
      if (own) own.kills += 1;
      paint();
    },
  });
  const join = new Button(i18next.t('volui:hud.rankJoin'), {
    onClick: () => {
      players.push({ id: nextId, kills: nextId % 5, deaths: nextId % 3, bot: nextId % 2 === 0 });
      nextId += 1;
      paint();
    },
  });
  disposables.addDestroyables(kill, join);
  controls.append(kill.element, join.element);
  wrap.appendChild(controls);

  return card(i18next.t('volui:hud.rankList'), wrap);
}

/** ActivityFeed: zamanı sürücü verir (`push`/`tick`); bileşen kendi zamanlayıcısını açmaz. */
export function buildActivityFeedCard(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const feed = new ActivityFeed({ capacity: 4 });
  disposables.addDestroyables(feed);
  wrap.appendChild(feed.element);
  disposables.addInterval(() => feed.tick(performance.now()), 250);

  const hint = new Text(i18next.t('volui:hud.activityHint'), { variant: 'muted' });
  disposables.addDestroyables(hint);
  wrap.appendChild(hint.element);

  const tones: ActivityFeedTone[] = ['success', 'danger', 'info', 'warning', 'default'];
  let count = 0;
  const controls = controlsRow();
  const push = new Button(i18next.t('volui:hud.activityPush'), {
    variant: 'primary',
    onClick: () => {
      count += 1;
      feed.push(
        {
          text: i18next.t('volui:hud.activityEvent', { index: count }),
          tone: tones[count % tones.length],
        },
        performance.now(),
      );
    },
  });
  disposables.addDestroyables(push);
  controls.appendChild(push.element);
  wrap.appendChild(controls);

  return card(i18next.t('volui:hud.activityFeed'), wrap);
}
