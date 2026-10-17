import { i18next } from '@volstudio/core/i18n';
import { DisposableScope } from '@volstudio/core/lifecycle';
import {
  ActivityFeed,
  RankList,
  Text,
  VersusBar,
  type RankListRow,
  type VersusBarPip,
  type VersusBarSide,
} from '@volstudio/core/ui';
import { ONLINE_VIEW, PING_GRADES } from '@/config/onlineView';
import type { MessageKey } from '@/i18n/keys';
import type { ConnectionStatus } from '@/network/OnlineSession';
import { WAR } from '@/config/war';
import { NO_TEAM } from '@/network/schema';
import type { BoardRow, FeedLine, WarView } from '@/network/warView';
import './online.css';

/** Bağlantının panele gösterilen özeti. */
export interface LinkView {
  readonly status: ConnectionStatus;
  readonly pingMs: number;
  readonly jitterMs: number;
  /**
   * Öngörü sapması (dünya birimi): uzlaştırma düzeltmesinin üstel ortalaması, sönümlü tepesi ve
   * oturum boyunca görülen en büyük tepe. Sönümlü tepe yama başına %10 azalır; yalnız `driftMax`
   * kısa bir sapmanın olup olmadığını sonradan da söyler.
   */
  readonly driftEma: number;
  readonly driftPeak: number;
  readonly driftMax: number;
  /** Öngörülen (görüntülenen) araç konumu, dünya birimi; ölçüm ve teşhis için `data-pose-*` yazılır. */
  readonly poseX: number;
  readonly poseY: number;
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Cephenin çizim rengi; cepheye girmemişte `undefined`. */
export function teamColor(team: number): number | undefined {
  return team === NO_TEAM ? undefined : ONLINE_VIEW.colors.teams[team];
}

const FACTION_KEYS = ['voltest:war.faction.amber', 'voltest:war.faction.blue'] as const;

const ZONE_KEYS: Readonly<Record<string, MessageKey>> = {
  core: 'voltest:war.zone.core',
  outpostWest: 'voltest:war.zone.outpostWest',
  outpostEast: 'voltest:war.zone.outpostEast',
  ridgeNorth: 'voltest:war.zone.ridgeNorth',
  ridgeSouth: 'voltest:war.zone.ridgeSouth',
  frontNorth: 'voltest:war.zone.frontNorth',
  frontSouth: 'voltest:war.zone.frontSouth',
};

const ZONE_SHORT_KEYS: Readonly<Record<string, MessageKey>> = {
  core: 'voltest:war.zoneShort.core',
  outpostWest: 'voltest:war.zoneShort.outpostWest',
  outpostEast: 'voltest:war.zoneShort.outpostEast',
  ridgeNorth: 'voltest:war.zoneShort.ridgeNorth',
  ridgeSouth: 'voltest:war.zoneShort.ridgeSouth',
  frontNorth: 'voltest:war.zoneShort.frontNorth',
  frontSouth: 'voltest:war.zoneShort.frontSouth',
};

/** Cephenin görünen adı; bilinmeyen indeks için sıra numarası. */
export function factionName(faction: number): string {
  const key = FACTION_KEYS[faction];
  return key ? i18next.t(key) : String(faction + 1);
}

/** Bölgenin görünen adı; bilinmeyen kimlik için kimliğin kendisi. */
export function zoneName(id: string): string {
  const key = ZONE_KEYS[id];
  return key ? i18next.t(key) : id;
}

/** Bölgenin haritadaki kısa adı (bir ya da iki harf); bilinmeyen kimlik için boş (etiket çizilmez). */
export function zoneShortName(id: string): string {
  const key = ZONE_SHORT_KEYS[id];
  return key ? i18next.t(key) : '';
}

function feedText(line: FeedLine): string {
  switch (line.kind) {
    case 'joined':
      return i18next.t('voltest:online.feed.joined', { name: line.name });
    case 'left':
      return i18next.t('voltest:online.feed.left', { name: line.name });
    case 'kill':
      return i18next.t('voltest:online.feed.kill', { killer: line.killer, victim: line.victim });
    case 'down':
      return i18next.t('voltest:online.feed.down', { victim: line.victim });
    case 'drowned':
      return i18next.t('voltest:online.feed.drowned', { victim: line.victim });
    case 'zone':
      return line.owner === -1
        ? i18next.t('voltest:online.feed.zoneLost', { zone: zoneName(line.zone) })
        : i18next.t('voltest:online.feed.zoneTaken', {
            zone: zoneName(line.zone),
            faction: factionName(line.owner),
          });
    case 'warWon':
      return i18next.t('voltest:online.feed.warWon', {
        faction: factionName(line.faction),
        wins: line.wins,
      });
  }
}

function grade(pingMs: number): 'good' | 'fair' | 'bad' {
  return pingMs <= PING_GRADES.good ? 'good' : pingMs <= PING_GRADES.fair ? 'fair' : 'bad';
}

/**
 * Kalıcı savaşın HUD parçaları: cephe puanları ve bölge rozetleri (`VersusBar`), bağlantı göstergesi
 * (şeridin ek öğesi), skor tablosu (`RankList`), bildirim akışı (`ActivityFeed`) ve bağlantı uyarısı.
 * Tamamı CORE bileşenidir; panel yalnız savaş görüntüsünü (`WarView`) okur ve değişmeyen yerlere DOM
 * yazmaz.
 */
export class OnlinePanel {
  readonly element: HTMLElement;
  private readonly scope = new DisposableScope();
  private readonly banner: VersusBar;
  private readonly ping: HTMLElement;
  private readonly pingText: Text;
  private readonly board: HTMLElement;
  private readonly ranking: RankList;
  private readonly notice: Text;
  private readonly feed: ActivityFeed;
  private view: WarView | undefined;
  private link: LinkView | undefined;
  private signature = '';

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'vt-online';
    this.element.dataset.testid = 'online';

    this.banner = new VersusBar({ target: WAR.score.dominance, className: 'vt-online__banner' });
    this.banner.element.dataset.testid = 'online-banner';
    this.ping = document.createElement('span');
    this.ping.className = 'vt-online__ping';
    this.ping.dataset.testid = 'online-ping';
    this.pingText = new Text('', { variant: 'muted', tag: 'span' });
    this.ping.append(this.pingText.element);
    this.banner.setTrailing(this.ping);

    this.ranking = new RankList({
      capacity: ONLINE_VIEW.board.compactRows,
      title: this.boardTitle(),
      ariaLabel: () => i18next.t('voltest:online.board.title'),
      emptyText: () => i18next.t('voltest:online.board.empty'),
    });
    this.board = document.createElement('div');
    this.board.className = 'vt-online__board';
    this.board.dataset.testid = 'online-board';
    this.board.append(this.ranking.element);

    this.notice = new Text('', { variant: 'body', tag: 'p' });
    this.notice.element.classList.add('vt-online__notice');
    this.notice.element.dataset.testid = 'online-notice';
    this.notice.element.setAttribute('role', 'status');
    this.notice.element.hidden = true;

    this.feed = new ActivityFeed({
      capacity: ONLINE_VIEW.feedEntries,
      lifetimeMs: ONLINE_VIEW.feedLifetimeMs,
      className: 'vt-online__feed',
    });
    this.feed.element.dataset.testid = 'online-feed';

    this.element.append(this.banner.element, this.board, this.feed.element, this.notice.element);
    this.refreshLabels();
    const onLanguage = (): void => this.refreshLabels();
    i18next.on('languageChanged', onLanguage);
    this.scope.addSubscription(() => i18next.off('languageChanged', onLanguage));
  }

  /** Sayaçları ve tabloyu yeniler; değişmeyen parçalara dokunmaz. */
  update(view: WarView, link: LinkView): void {
    this.view = view;
    this.link = link;
    // Ölçüm ve E2E için: öngörü sapması imzaya girmez (her yenilemede değişir), yalnız özniteliğe yazılır.
    this.ping.dataset.driftEma = link.driftEma.toFixed(3);
    this.ping.dataset.driftPeak = link.driftPeak.toFixed(3);
    this.ping.dataset.driftMax = link.driftMax.toFixed(3);
    this.ping.dataset.poseX = link.poseX.toFixed(1);
    this.ping.dataset.poseY = link.poseY.toFixed(1);
    this.paint();
  }

  /** Bildirim akışına bir satır ekler; satırlar kendi süresi dolunca söner. */
  push(line: FeedLine): void {
    this.feed.push({ text: feedText(line), tone: line.tone }, performance.now());
  }

  /** Süresi dolan akış satırlarını söndürür; sürücü her karede sürer. */
  tick(nowMs: number): void {
    this.feed.tick(nowMs);
  }

  refreshLabels(): void {
    this.ranking.setTitle(this.boardTitle());
    this.signature = '';
    this.paint();
  }

  destroy(): void {
    this.scope.dispose();
    this.banner.destroy();
    this.ranking.destroy();
    this.feed.destroy();
    this.pingText.destroy();
    this.notice.destroy();
    this.element.remove();
  }

  /** Başlık sütun anlamını da taşır: değer öldürme, sönük ikinci değer ölümdür. */
  private boardTitle(): string {
    return i18next.t('voltest:online.board.titleLegend', {
      title: i18next.t('voltest:online.board.title'),
      kills: i18next.t('voltest:online.board.killsShort'),
      deaths: i18next.t('voltest:online.board.deathsShort'),
    });
  }

  private nameText(row: BoardRow): string {
    if (row.self) return i18next.t('voltest:online.board.you', { name: row.name });
    if (!row.connected) return i18next.t('voltest:online.board.away', { name: row.name });
    return row.name;
  }

  private paint(): void {
    const { view, link } = this;
    if (!view || !link) return;
    const rows = view.rows;
    const signature = JSON.stringify([
      view.factions.map((faction) => [faction.score, faction.wins, faction.zones]),
      view.zones.map((zone) => [zone.owner, zone.contested]),
      view.selfFaction,
      view.dominance,
      rows.map((row) => [
        row.id,
        row.name,
        row.kills,
        row.deaths,
        row.connected,
        row.bot,
        row.team,
      ]),
      link.status,
      link.pingMs,
      i18next.language,
    ]);
    if (signature === this.signature) return;
    this.signature = signature;

    this.paintBanner(view);
    this.paintPing(link);
    this.ranking.setRows(rows.map((row) => this.rankRow(row)));
    const reconnecting = link.status !== 'live';
    this.notice.element.hidden = !reconnecting;
    if (reconnecting) this.notice.setContent(i18next.t('voltest:online.reconnecting'));
  }

  private rankRow(row: BoardRow): RankListRow {
    const color = teamColor(row.team);
    return {
      id: String(row.id),
      label: this.nameText(row),
      value: String(row.kills),
      secondary: String(row.deaths),
      color: color === undefined ? undefined : hex(color),
      self: row.self,
      muted: !row.connected,
      tag: row.bot ? i18next.t('voltest:online.board.botTag') : undefined,
    };
  }

  /** Cephe puanları iki uçta, bölgeler ortada rozet: sahibin rengi dolgu, tartışmalı bölge çerçevelidir. */
  private paintBanner(view: WarView): void {
    this.banner.setTarget(view.dominance);
    const sides = view.factions.map<VersusBarSide>((faction) => ({
      id: String(faction.index),
      label: factionName(faction.index),
      value: faction.score,
      color: hex(ONLINE_VIEW.colors.teams[faction.index] ?? ONLINE_VIEW.colors.foe),
      wins: faction.wins > 0 ? faction.wins : undefined,
      own: faction.index === view.selfFaction,
    }));
    this.banner.setSides(sides);
    // Taraf kökleri ölçüm ve E2E için cephe indeksini taşır.
    this.banner.element
      .querySelectorAll<HTMLElement>('.vol-versus__side')
      .forEach((side, index) => {
        side.dataset.testid = 'online-faction';
        side.dataset.faction = sides[index].id;
      });
    const pips = view.zones.map<VersusBarPip>((zone) => {
      const owner = zone.owner === -1 ? i18next.t('voltest:war.neutral') : factionName(zone.owner);
      const color = teamColor(zone.owner);
      return {
        id: zone.id,
        label: `${zoneName(zone.id)} · ${zone.contested ? i18next.t('voltest:war.contested') : owner}`,
        color: color === undefined ? undefined : hex(color),
        contested: zone.contested,
      };
    });
    this.banner.setPips(pips);
    const zones = this.banner.element.querySelector<HTMLElement>('.vol-versus__pips');
    if (zones) zones.dataset.testid = 'online-zones';
  }

  private paintPing(link: LinkView): void {
    this.ping.dataset.grade = link.status === 'live' ? grade(link.pingMs) : 'bad';
    this.pingText.setContent(i18next.t('voltest:online.ping', { ms: link.pingMs }));
  }
}
