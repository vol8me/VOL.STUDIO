import { afterEach, describe, expect, it } from 'vitest';
import { i18next } from '@volstudio/core/i18n';
import { OnlinePanel, teamColor, type LinkView } from '@/hud/OnlinePanel';
import type { BoardRow, MatchView } from '@/network/matchView';
import { NO_TEAM } from '@/network/schema';

const panels: OnlinePanel[] = [];

function mount(): OnlinePanel {
  const panel = new OnlinePanel();
  document.body.append(panel.element);
  panels.push(panel);
  return panel;
}

afterEach(() => {
  for (const panel of panels.splice(0)) panel.destroy();
});

function row(id: number, patch: Partial<BoardRow> = {}): BoardRow {
  return {
    id,
    name: `Oyuncu${id}`,
    team: NO_TEAM,
    kills: 0,
    deaths: 0,
    connected: true,
    self: false,
    rank: id,
    ...patch,
  };
}

function view(patch: Partial<MatchView> = {}): MatchView {
  return {
    code: '',
    mode: 'ffa',
    phase: 'live',
    scoreLimit: 10,
    intermissionMs: 0,
    winner: '',
    rows: [row(1, { self: true })],
    teamScores: [],
    ...patch,
  };
}

const live: LinkView = { status: 'live', pingMs: 42, jitterMs: 3, driftEma: 0.25, driftPeak: 1.5 };

const text = (panel: OnlinePanel, id: string): string =>
  panel.element.querySelector(`[data-testid="${id}"]`)?.textContent ?? '';
const tableRows = (panel: OnlinePanel): string[] =>
  [...panel.element.querySelectorAll('.vol-datatable__row')].map((tr) => tr.textContent ?? '');

describe('OnlinePanel çubuk', () => {
  it('herkese açık odada açık oda yazar, özel odada kodu gösterir', () => {
    const panel = mount();
    panel.update(view(), live);
    expect(text(panel, 'online-room')).toBe(i18next.t('voltest:online.publicRoom'));
    panel.update(view({ code: 'ABCDE' }), live);
    expect(text(panel, 'online-room')).toContain('ABCDE');
    expect(text(panel, 'online-kind')).toContain(i18next.t('voltest:online.modeKind.ffa'));
    expect(text(panel, 'online-kind')).toContain('10');
  });

  it('ping rozeti gecikmeye göre derecelenir; bağlantı yoksa kötü sayılır', () => {
    const panel = mount();
    const grade = (): string | undefined =>
      panel.element.querySelector<HTMLElement>('[data-testid="online-ping"]')?.dataset.grade;
    panel.update(view(), { ...live, pingMs: 40 });
    expect(grade()).toBe('good');
    expect(text(panel, 'online-ping')).toBe('40 ms');
    panel.update(view(), { ...live, pingMs: 120 });
    expect(grade()).toBe('fair');
    panel.update(view(), { ...live, pingMs: 300 });
    expect(grade()).toBe('bad');
    panel.update(view(), { ...live, status: 'reconnecting', pingMs: 10 });
    expect(grade()).toBe('bad');
  });

  it('takımlı maçta takım skorları renkli noktayla görünür, takımsızda gizlidir', () => {
    const panel = mount();
    const scores = panel.element.querySelector<HTMLElement>('[data-testid="online-scores"]')!;
    panel.update(view(), live);
    expect(scores.hidden).toBe(true);
    panel.update(view({ mode: 'teams', teamScores: [7, 2] }), live);
    expect(scores.hidden).toBe(false);
    expect(scores.textContent).toBe('72');
    expect(scores.querySelectorAll('.vt-online__dot')).toHaveLength(2);
  });

  it('öngörü sapmasını ölçüm özniteliklerine yazar', () => {
    const panel = mount();
    panel.update(view(), { ...live, driftEma: 0.1234, driftPeak: 4.5678 });
    const ping = panel.element.querySelector<HTMLElement>('[data-testid="online-ping"]')!;
    expect(ping.dataset.driftEma).toBe('0.123');
    expect(ping.dataset.driftPeak).toBe('4.568');
  });

  it('bağlantı koptuğunda uyarı çıkar, dönünce kaybolur', () => {
    const panel = mount();
    const notice = panel.element.querySelector<HTMLElement>('[data-testid="online-notice"]')!;
    panel.update(view(), live);
    expect(notice.hidden).toBe(true);
    panel.update(view(), { ...live, status: 'reconnecting' });
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toBe(i18next.t('voltest:online.reconnecting'));
    panel.update(view(), live);
    expect(notice.hidden).toBe(true);
  });
});

describe('OnlinePanel skor tablosu', () => {
  it('canlı maçta en çok beş satır gösterir ve dışarıda kalan kendi satırını sona koyar', () => {
    const panel = mount();
    const all = Array.from({ length: 8 }, (_, index) =>
      row(index + 1, { self: index === 6, kills: 9 - index }),
    );
    panel.update(view({ rows: all }), live);
    const shown = tableRows(panel);
    expect(shown).toHaveLength(5);
    expect(shown[0]).toContain('Oyuncu1');
    expect(shown[4]).toContain(i18next.t('voltest:online.board.you', { name: 'Oyuncu7' }));
    expect(shown.join('')).not.toContain('Oyuncu5');
  });

  it('kendi satırı ilk beşteyse yerinde kalır; bağlantısı olmayan oyuncu işaretlenir', () => {
    const panel = mount();
    panel.update(
      view({ rows: [row(1, { self: true }), row(2, { connected: false }), row(3)] }),
      live,
    );
    const shown = tableRows(panel);
    expect(shown[0]).toContain(i18next.t('voltest:online.board.you', { name: 'Oyuncu1' }));
    expect(shown[1]).toContain(i18next.t('voltest:online.board.away', { name: 'Oyuncu2' }));
    expect(shown[2]).toContain('Oyuncu3');
  });

  it('takım rengi satırda nokta olur', () => {
    const panel = mount();
    panel.update(
      view({ mode: 'teams', rows: [row(1, { team: 0 }), row(2, { team: NO_TEAM })] }),
      live,
    );
    expect(panel.element.querySelectorAll('.vol-datatable .vt-online__dot')).toHaveLength(1);
    expect(teamColor(0)).toBeDefined();
    expect(teamColor(NO_TEAM)).toBeUndefined();
    expect(teamColor(9)).toBeUndefined();
  });

  it('aynı görüntüyü tekrar yazmaz', () => {
    const panel = mount();
    const first = view({ rows: [row(1, { self: true })] });
    panel.update(first, live);
    const body = panel.element.querySelector('tbody')!;
    const before = body.firstElementChild;
    panel.update({ ...first }, { ...live });
    expect(body.firstElementChild).toBe(before);
    panel.update(view({ rows: [row(1, { self: true, kills: 1 })] }), live);
    expect(body.firstElementChild).not.toBe(before);
  });
});

describe('OnlinePanel maç sonu', () => {
  const over = (patch: Partial<MatchView>): MatchView =>
    view({
      phase: 'intermission',
      intermissionMs: 4200,
      rows: [
        row(1, { self: true, kills: 10 }),
        row(2, { kills: 3 }),
        row(3),
        row(4),
        row(5),
        row(6),
      ],
      ...patch,
    });

  it('tam tabloyu ve geri sayımı gösterir; canlıya dönünce gizler', () => {
    const panel = mount();
    const result = panel.element.querySelector<HTMLElement>('[data-testid="online-result"]')!;
    panel.update(view(), live);
    expect(result.hidden).toBe(true);
    panel.update(over({ winner: 'p:1' }), live);
    expect(result.hidden).toBe(false);
    expect(panel.element.classList.contains('vt-online--result')).toBe(true);
    expect(tableRows(panel)).toHaveLength(6);
    expect(result.textContent).toContain(i18next.t('voltest:online.matchEnd'));
    expect(result.textContent).toContain(i18next.t('voltest:online.winner.self'));
    expect(result.textContent).toContain(i18next.t('voltest:online.next', { seconds: 5 }));
    panel.update(view(), live);
    expect(result.hidden).toBe(true);
    expect(panel.element.classList.contains('vt-online--result')).toBe(false);
  });

  it('kazananı oyuncu, takım ya da berabere olarak yazar', () => {
    const panel = mount();
    const result = panel.element.querySelector<HTMLElement>('[data-testid="online-result"]')!;
    const winner = (patch: Partial<MatchView>): string => {
      panel.update(over(patch), live);
      return result.textContent ?? '';
    };
    expect(winner({ winner: 'p:2' })).toContain(
      i18next.t('voltest:online.winner.player', { name: 'Oyuncu2' }),
    );
    expect(winner({ winner: 'p:99' })).toContain(
      i18next.t('voltest:online.winner.player', { name: '?' }),
    );
    expect(winner({ mode: 'teams', winner: 't:1' })).toContain(
      i18next.t('voltest:online.winner.team', { team: i18next.t('voltest:online.team.blue') }),
    );
    expect(winner({ mode: 'teams', winner: 't:7' })).toContain(
      i18next.t('voltest:online.winner.team', { team: '8' }),
    );
    expect(winner({ winner: '' })).toContain(i18next.t('voltest:online.winner.none'));
  });
});

describe('OnlinePanel akış', () => {
  it('satırları yazar ve sessizlikte soluklaştırır', () => {
    const panel = mount();
    const feed = panel.element.querySelector<HTMLElement>('[data-testid="online-feed"]')!;
    panel.push({ kind: 'kill', killer: 'Ben', victim: 'Rakip', tone: 'success' });
    panel.push({ kind: 'down', victim: 'Ben', tone: 'danger' });
    panel.push({ kind: 'joined', name: 'Yeni', tone: 'default' });
    panel.push({ kind: 'left', name: 'Giden', tone: 'default' });
    panel.push({ kind: 'matchStart', tone: 'info' });
    expect(feed.textContent).toContain('Ben » Rakip');
    expect(feed.textContent).toContain(i18next.t('voltest:online.feed.matchStart'));
    panel.tick(performance.now());
    expect(feed.classList.contains('vt-online__feed--idle')).toBe(false);
    panel.tick(performance.now() + 60_000);
    expect(feed.classList.contains('vt-online__feed--idle')).toBe(true);
    panel.push({ kind: 'matchStart', tone: 'info' });
    expect(feed.classList.contains('vt-online__feed--idle')).toBe(false);
  });

  it('dil değişince etiketleri yeniden kurar', async () => {
    const panel = mount();
    panel.update(view({ code: 'ABCDE' }), live);
    const before = text(panel, 'online-room');
    const language = i18next.language;
    try {
      await i18next.changeLanguage(language === 'en' ? 'tr' : 'en');
      expect(text(panel, 'online-room')).not.toBe(before);
      expect(panel.element.querySelector('th')?.textContent).toContain(
        i18next.t('voltest:online.board.rank'),
      );
    } finally {
      await i18next.changeLanguage(language);
    }
  });
});
