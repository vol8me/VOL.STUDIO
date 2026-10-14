import { i18next } from '@volstudio/core/i18n';
import { DisposableScope } from '@volstudio/core/lifecycle';
import { DataTable, EventLog, Text, type DataTableColumn } from '@volstudio/core/ui';
import { ONLINE_VIEW, PING_GRADES } from '@/config/onlineView';
import type { MessageKey } from '@/i18n/keys';
import type { ConnectionStatus } from '@/network/OnlineSession';
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

/** Akış, son satırdan bu kadar sonra soluklaşır. */
const FEED_IDLE_MS = 6000;

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
 * Kalıcı savaşın HUD parçaları: cephe puanları ve bölge rozetleri, bağlantı göstergesi, skor
 * tablosu, bildirim akışı ve bağlantı uyarısı. Tamamı CORE bileşenidir (`DataTable`, `EventLog`,
 * `Text`); panel yalnız savaş görüntüsünü (`WarView`) okur ve değişmeyen yerlere DOM yazmaz.
 */
export class OnlinePanel {
  readonly element: HTMLElement;
  private readonly scope = new DisposableScope();
  private readonly banner: HTMLElement;
  private readonly factions: HTMLElement;
  private readonly zones: HTMLElement;
  private readonly ping: HTMLElement;
  private readonly pingText: Text;
  private readonly board: HTMLElement;
  private table: DataTable<BoardRow>;
  private readonly notice: Text;
  private readonly feed: HTMLElement;
  private readonly log: EventLog;
  private view: WarView | undefined;
  private link: LinkView | undefined;
  private signature = '';
  private lastFeedMs = 0;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'vt-online';
    this.element.dataset.testid = 'online';

    this.banner = document.createElement('div');
    this.banner.className = 'vt-online__banner';
    this.factions = document.createElement('span');
    this.factions.className = 'vt-online__scores';
    this.factions.dataset.testid = 'online-factions';
    this.zones = document.createElement('span');
    this.zones.className = 'vt-online__zones';
    this.zones.dataset.testid = 'online-zones';
    this.ping = document.createElement('span');
    this.ping.className = 'vt-online__ping';
    this.ping.dataset.testid = 'online-ping';
    this.pingText = new Text('', { variant: 'muted', tag: 'span' });
    this.ping.append(this.pingText.element);
    this.banner.append(this.factions, this.zones, this.ping);

    this.board = document.createElement('div');
    this.board.className = 'vt-online__board';
    this.board.dataset.testid = 'online-board';
    this.table = this.createTable();
    this.board.append(this.table.element);

    this.notice = new Text('', { variant: 'body', tag: 'p' });
    this.notice.element.classList.add('vt-online__notice');
    this.notice.element.dataset.testid = 'online-notice';
    this.notice.element.setAttribute('role', 'status');
    this.notice.element.hidden = true;

    this.log = new EventLog({
      height: 22 * ONLINE_VIEW.feedEntries,
      maxEntries: ONLINE_VIEW.feedEntries,
    });
    this.feed = document.createElement('div');
    this.feed.className = 'vt-online__feed';
    this.feed.dataset.testid = 'online-feed';
    this.feed.append(this.log.element);

    this.element.append(this.banner, this.board, this.feed, this.notice.element);
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

  /** Bildirim akışına bir satır ekler. */
  push(line: FeedLine): void {
    this.log.push({ text: feedText(line), tone: line.tone });
    this.lastFeedMs = performance.now();
    this.feed.classList.remove('vt-online__feed--idle');
  }

  /** Bildirim akışını sessizce soluklaştırır; sürücü her karede sürer. */
  tick(nowMs: number): void {
    this.feed.classList.toggle('vt-online__feed--idle', nowMs - this.lastFeedMs > FEED_IDLE_MS);
  }

  refreshLabels(): void {
    this.table.destroy();
    this.table = this.createTable();
    this.board.replaceChildren(this.table.element);
    this.signature = '';
    this.paint();
  }

  destroy(): void {
    this.scope.dispose();
    this.table.destroy();
    this.log.destroy();
    this.pingText.destroy();
    this.notice.destroy();
    this.element.remove();
  }

  private createTable(): DataTable<BoardRow> {
    const columns: DataTableColumn<BoardRow>[] = [
      {
        key: 'rank',
        header: i18next.t('voltest:online.board.rank'),
        align: 'right',
        width: '2.5em',
      },
      {
        key: 'name',
        header: i18next.t('voltest:online.board.player'),
        render: (row) => this.nameCell(row),
      },
      { key: 'kills', header: i18next.t('voltest:online.board.kills'), align: 'right' },
      { key: 'deaths', header: i18next.t('voltest:online.board.deaths'), align: 'right' },
    ];
    return new DataTable<BoardRow>({
      columns,
      rows: [],
      rowKey: 'id',
      emptyText: i18next.t('voltest:online.board.empty'),
      ariaLabel: i18next.t('voltest:online.board.title'),
    });
  }

  private nameCell(row: BoardRow): Node {
    const cell = document.createElement('span');
    cell.className = 'vt-online__player';
    const color = teamColor(row.team);
    if (color !== undefined) {
      const dot = document.createElement('span');
      dot.className = 'vt-online__dot';
      dot.style.background = hex(color);
      cell.append(dot);
    }
    const label = document.createElement('span');
    label.textContent = this.nameText(row);
    if (row.self) label.className = 'vt-online__self';
    cell.append(label);
    return cell;
  }

  private nameText(row: BoardRow): string {
    if (row.self) return i18next.t('voltest:online.board.you', { name: row.name });
    if (!row.connected) return i18next.t('voltest:online.board.away', { name: row.name });
    return row.bot ? i18next.t('voltest:online.board.bot', { name: row.name }) : row.name;
  }

  private paint(): void {
    const { view, link } = this;
    if (!view || !link) return;
    const rows = this.compactRows(view.rows);
    const signature = JSON.stringify([
      view.factions.map((faction) => [faction.score, faction.wins, faction.zones]),
      view.zones.map((zone) => [zone.owner, Math.round(zone.progress * 20), zone.contested]),
      view.selfFaction,
      rows.map((row) => [
        row.id,
        row.name,
        row.kills,
        row.deaths,
        row.connected,
        row.bot,
        row.rank,
        row.team,
      ]),
      link.status,
      link.pingMs,
      i18next.language,
    ]);
    if (signature === this.signature) return;
    this.signature = signature;

    this.paintFactions(view);
    this.paintZones(view);
    this.paintPing(link);
    this.table.setRows([...rows]);
    const reconnecting = link.status !== 'live';
    this.notice.element.hidden = !reconnecting;
    if (reconnecting) this.notice.setContent(i18next.t('voltest:online.reconnecting'));
  }

  /** Skor tablosunda en çok `compactRows` satır; kendi satırınız dışarıda kalırsa sona eklenir. */
  private compactRows(rows: readonly BoardRow[]): BoardRow[] {
    const limit = ONLINE_VIEW.board.compactRows;
    const top = rows.slice(0, limit);
    const own = rows.find((row) => row.self);
    if (own && !top.includes(own)) top[top.length - 1] = own;
    return top;
  }

  private paintFactions(view: WarView): void {
    this.factions.replaceChildren();
    for (const faction of view.factions) {
      const chip = document.createElement('span');
      chip.className = 'vt-online__score';
      chip.dataset.faction = String(faction.index);
      chip.dataset.own = String(faction.index === view.selfFaction);
      chip.title = `${factionName(faction.index)} · ${i18next.t('voltest:online.wins', { count: faction.wins })}`;
      const dot = document.createElement('span');
      dot.className = 'vt-online__dot';
      dot.style.background = hex(ONLINE_VIEW.colors.teams[faction.index] ?? ONLINE_VIEW.colors.foe);
      chip.append(dot, `${Math.floor(faction.score)}/${view.dominance}`);
      this.factions.append(chip);
    }
  }

  /** Her bölge bir rozet: sahibin rengi, tartışmalıysa çerçeveli, ilerleme alt çizgide. */
  private paintZones(view: WarView): void {
    this.zones.replaceChildren();
    for (const zone of view.zones) {
      const pip = document.createElement('span');
      pip.className = 'vt-online__zone';
      pip.dataset.zone = zone.id;
      pip.dataset.owner = String(zone.owner);
      pip.dataset.contested = String(zone.contested);
      const owner = zone.owner === -1 ? i18next.t('voltest:war.neutral') : factionName(zone.owner);
      pip.title = `${zoneName(zone.id)} · ${zone.contested ? i18next.t('voltest:war.contested') : owner}`;
      const color = teamColor(zone.owner);
      if (color !== undefined) pip.style.background = hex(color);
      this.zones.append(pip);
    }
  }

  private paintPing(link: LinkView): void {
    this.ping.dataset.grade = link.status === 'live' ? grade(link.pingMs) : 'bad';
    this.pingText.setContent(i18next.t('voltest:online.ping', { ms: link.pingMs }));
  }
}
