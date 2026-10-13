import { i18next } from '@volstudio/core/i18n';
import { DisposableScope } from '@volstudio/core/lifecycle';
import { DataTable, EventLog, Text, type DataTableColumn } from '@volstudio/core/ui';
import { ONLINE_VIEW, PING_GRADES } from '@/config/onlineView';
import { parseWinner, type BoardRow, type FeedLine, type MatchView } from '@/network/matchView';
import type { ConnectionStatus } from '@/network/OnlineSession';
import { NO_TEAM } from '@/network/schema';
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
}

/** Akış, son satırdan bu kadar sonra soluklaşır. */
const FEED_IDLE_MS = 6000;

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Takımın çizim rengi; takımsızda `undefined`. */
export function teamColor(team: number): number | undefined {
  return team === NO_TEAM ? undefined : ONLINE_VIEW.colors.teams[team];
}

const TEAM_KEYS = ['voltest:online.team.amber', 'voltest:online.team.blue'] as const;

function teamLabel(team: number): string {
  const key = TEAM_KEYS[team];
  return key ? i18next.t(key) : String(team + 1);
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
    case 'matchStart':
      return i18next.t('voltest:online.feed.matchStart');
  }
}

function grade(pingMs: number): 'good' | 'fair' | 'bad' {
  return pingMs <= PING_GRADES.good ? 'good' : pingMs <= PING_GRADES.fair ? 'fair' : 'bad';
}

/**
 * Çevrimiçi maçın HUD parçaları: oda ve bağlantı çubuğu, skor tablosu, bildirim akışı, bağlantı
 * uyarısı ve maç sonu sonucu. Tamamı CORE bileşenidir (`DataTable`, `EventLog`, `Text`); panel yalnız
 * maç görüntüsünü (`MatchView`) okur ve değişmeyen yerlere DOM yazmaz.
 */
export class OnlinePanel {
  readonly element: HTMLElement;
  private readonly scope = new DisposableScope();
  private readonly banner: HTMLElement;
  private readonly room: Text;
  private readonly kind: Text;
  private readonly scores: HTMLElement;
  private readonly ping: HTMLElement;
  private readonly pingText: Text;
  private readonly board: HTMLElement;
  private table: DataTable<BoardRow>;
  private readonly result: HTMLElement;
  private readonly resultTitle: Text;
  private readonly resultWinner: Text;
  private readonly resultNext: Text;
  private readonly notice: Text;
  private readonly feed: HTMLElement;
  private readonly log: EventLog;
  private view: MatchView | undefined;
  private link: LinkView | undefined;
  private signature = '';
  private lastFeedMs = 0;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'vt-online';
    this.element.dataset.testid = 'online';

    this.banner = document.createElement('div');
    this.banner.className = 'vt-online__banner';
    this.room = new Text('', { variant: 'body', tag: 'span' });
    this.room.element.dataset.testid = 'online-room';
    this.kind = new Text('', { variant: 'muted', tag: 'span' });
    this.kind.element.dataset.testid = 'online-kind';
    this.scores = document.createElement('span');
    this.scores.className = 'vt-online__scores';
    this.scores.dataset.testid = 'online-scores';
    this.ping = document.createElement('span');
    this.ping.className = 'vt-online__ping';
    this.ping.dataset.testid = 'online-ping';
    this.pingText = new Text('', { variant: 'muted', tag: 'span' });
    this.ping.append(this.pingText.element);
    this.banner.append(this.room.element, this.kind.element, this.scores, this.ping);

    this.result = document.createElement('div');
    this.result.className = 'vt-online__result';
    this.result.dataset.testid = 'online-result';
    this.result.hidden = true;
    this.resultTitle = new Text('', { variant: 'heading', tag: 'h2' });
    this.resultWinner = new Text('', { variant: 'body', tag: 'p' });
    this.resultNext = new Text('', { variant: 'muted', tag: 'p' });
    this.result.append(
      this.resultTitle.element,
      this.resultWinner.element,
      this.resultNext.element,
    );

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

    this.element.append(this.banner, this.result, this.board, this.feed, this.notice.element);
    this.refreshLabels();
    const onLanguage = (): void => this.refreshLabels();
    i18next.on('languageChanged', onLanguage);
    this.scope.addSubscription(() => i18next.off('languageChanged', onLanguage));
  }

  /** Sayaçları ve tabloyu yeniler; değişmeyen parçalara dokunmaz. */
  update(view: MatchView, link: LinkView): void {
    this.view = view;
    this.link = link;
    // Ölçüm ve E2E için: öngörü sapması imzaya girmez (her yenilemede değişir), yalnız özniteliğe yazılır.
    this.ping.dataset.driftEma = link.driftEma.toFixed(3);
    this.ping.dataset.driftPeak = link.driftPeak.toFixed(3);
    this.ping.dataset.driftMax = link.driftMax.toFixed(3);
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
    this.resultTitle.setContent(i18next.t('voltest:online.matchEnd'));
    this.paint();
  }

  destroy(): void {
    this.scope.dispose();
    this.table.destroy();
    this.log.destroy();
    for (const text of [
      this.room,
      this.kind,
      this.pingText,
      this.resultTitle,
      this.resultWinner,
      this.resultNext,
      this.notice,
    ])
      text.destroy();
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
    const key = !row.connected ? 'voltest:online.board.away' : 'voltest:online.board.you';
    const label = document.createElement('span');
    label.textContent = row.self || !row.connected ? i18next.t(key, { name: row.name }) : row.name;
    if (row.self) label.className = 'vt-online__self';
    cell.append(label);
    return cell;
  }

  private paint(): void {
    const { view, link } = this;
    if (!view || !link) return;
    const live = view.phase === 'live';
    const rows = live ? this.compactRows(view.rows) : view.rows;
    const signature = JSON.stringify([
      view.code,
      view.mode,
      view.phase,
      view.scoreLimit,
      view.winner,
      Math.ceil(view.intermissionMs / 1000),
      view.teamScores,
      rows.map((row) => [
        row.id,
        row.name,
        row.kills,
        row.deaths,
        row.connected,
        row.rank,
        row.team,
      ]),
      link.status,
      link.pingMs,
      i18next.language,
    ]);
    if (signature === this.signature) return;
    this.signature = signature;

    this.room.setContent(
      view.code
        ? i18next.t('voltest:online.room', { code: view.code })
        : i18next.t('voltest:online.publicRoom'),
    );
    this.kind.setContent(
      `${i18next.t(view.mode === 'teams' ? 'voltest:online.modeKind.teams' : 'voltest:online.modeKind.ffa')} · ${i18next.t('voltest:online.target', { count: view.scoreLimit })}`,
    );
    this.paintScores(view);
    this.paintPing(link);
    this.table.setRows([...rows]);

    this.result.hidden = live;
    this.element.classList.toggle('vt-online--result', !live);
    if (!live) {
      this.resultWinner.setContent(this.winnerText(view));
      this.resultNext.setContent(
        i18next.t('voltest:online.next', { seconds: Math.ceil(view.intermissionMs / 1000) }),
      );
    }
    const reconnecting = link.status !== 'live';
    this.notice.element.hidden = !reconnecting;
    if (reconnecting) this.notice.setContent(i18next.t('voltest:online.reconnecting'));
  }

  /** Canlı maçta en çok `compactRows` satır; kendi satırınız dışarıda kalırsa sona eklenir. */
  private compactRows(rows: readonly BoardRow[]): BoardRow[] {
    const limit = ONLINE_VIEW.board.compactRows;
    const top = rows.slice(0, limit);
    const own = rows.find((row) => row.self);
    if (own && !top.includes(own)) top[top.length - 1] = own;
    return top;
  }

  private paintScores(view: MatchView): void {
    this.scores.replaceChildren();
    this.scores.hidden = view.mode !== 'teams';
    if (view.mode !== 'teams') return;
    ONLINE_VIEW.colors.teams.forEach((color, team) => {
      const chip = document.createElement('span');
      chip.className = 'vt-online__score';
      chip.title = teamLabel(team);
      const dot = document.createElement('span');
      dot.className = 'vt-online__dot';
      dot.style.background = hex(color);
      chip.append(dot, String(view.teamScores[team] ?? 0));
      this.scores.append(chip);
    });
  }

  private paintPing(link: LinkView): void {
    this.ping.dataset.grade = link.status === 'live' ? grade(link.pingMs) : 'bad';
    this.pingText.setContent(i18next.t('voltest:online.ping', { ms: link.pingMs }));
  }

  private winnerText(view: MatchView): string {
    const winner = parseWinner(view.winner);
    if (!winner) return i18next.t('voltest:online.winner.none');
    if (winner.kind === 'team')
      return i18next.t('voltest:online.winner.team', {
        team: teamLabel(winner.team),
      });
    const row = view.rows.find((candidate) => candidate.id === winner.id);
    return row?.self
      ? i18next.t('voltest:online.winner.self')
      : i18next.t('voltest:online.winner.player', { name: row?.name ?? '?' });
  }
}
