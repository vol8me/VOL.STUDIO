import { afterEach, describe, expect, it } from 'vitest';
import { i18next } from '@volstudio/core/i18n';
import { WAR } from '@/config/war';
import { OnlinePanel, factionName, teamColor, zoneName, type LinkView } from '@/hud/OnlinePanel';
import { NO_TEAM } from '@/network/schema';
import type { BoardRow, FactionView, WarView, ZoneView } from '@/network/warView';

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
    bot: false,
    self: false,
    rank: id,
    ...patch,
  };
}

const factions: FactionView[] = Array.from({ length: WAR.factions }, (_, index) => ({
  index,
  score: 0,
  wins: 0,
  zones: 0,
  vehicles: 0,
  humans: 0,
}));

const zones: ZoneView[] = WAR.zones.map((zone, index) => ({
  index,
  id: zone.id,
  owner: -1,
  progress: 0,
  contested: false,
  presentFirst: 0,
  presentSecond: 0,
}));

function view(patch: Partial<WarView> = {}): WarView {
  return {
    rows: [row(1, { self: true })],
    factions,
    zones,
    selfFaction: 0,
    dominance: WAR.score.dominance,
    ...patch,
  };
}

const live: LinkView = {
  status: 'live',
  pingMs: 42,
  jitterMs: 3,
  driftEma: 0.25,
  driftPeak: 1.5,
  driftMax: 6,
  poseX: 0,
  poseY: 0,
};

const text = (panel: OnlinePanel, id: string): string =>
  panel.element.querySelector(`[data-testid="${id}"]`)?.textContent ?? '';
const tableRows = (panel: OnlinePanel): string[] =>
  [...panel.element.querySelectorAll('.vol-datatable__row')].map((tr) => tr.textContent ?? '');

describe('OnlinePanel çubuk', () => {
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

  it('cephe puanları renkli noktayla ve hedefle görünür; kendi cephe işaretlidir', () => {
    const panel = mount();
    const scores = panel.element.querySelector<HTMLElement>('[data-testid="online-factions"]')!;
    const next = factions.map((faction) => ({
      ...faction,
      score: faction.index === 0 ? 410.7 : 90,
    }));
    panel.update(view({ factions: next, selfFaction: 1 }), live);
    expect(scores.querySelectorAll('.vt-online__dot')).toHaveLength(WAR.factions);
    expect(scores.textContent).toBe(`410/${WAR.score.dominance}90/${WAR.score.dominance}`);
    const own = scores.querySelectorAll<HTMLElement>('[data-own="true"]');
    expect(own).toHaveLength(1);
    expect(own[0].dataset.faction).toBe('1');
  });

  it('her bölge bir rozettir: sahibin rengi dolgu, tartışmalı bölge işaretli', () => {
    const panel = mount();
    const pips = (): HTMLElement[] => [
      ...panel.element.querySelectorAll<HTMLElement>(
        '[data-testid="online-zones"] .vt-online__zone',
      ),
    ];
    const next = zones.map((zone) =>
      zone.index === 0
        ? { ...zone, owner: 0 }
        : zone.index === 1
          ? { ...zone, owner: 1, contested: true }
          : zone,
    );
    panel.update(view({ zones: next }), live);
    expect(pips()).toHaveLength(WAR.zones.length);
    expect(pips()[0].dataset).toMatchObject({
      zone: WAR.zones[0].id,
      owner: '0',
      contested: 'false',
    });
    expect(pips()[0].style.background).not.toBe('');
    expect(pips()[1].dataset).toMatchObject({ owner: '1', contested: 'true' });
    expect(pips()[2].dataset.owner).toBe('-1');
    expect(pips()[2].style.background).toBe('');
    expect(pips()[0].title).toContain(zoneName(WAR.zones[0].id));
    expect(pips()[0].title).toContain(factionName(0));
    expect(pips()[1].title).toContain(i18next.t('voltest:war.contested'));
    expect(pips()[2].title).toContain(i18next.t('voltest:war.neutral'));
  });

  it('öngörü sapmasını ölçüm özniteliklerine yazar', () => {
    const panel = mount();
    panel.update(view(), { ...live, driftEma: 0.1234, driftPeak: 4.5678, driftMax: 9.87654 });
    const ping = panel.element.querySelector<HTMLElement>('[data-testid="online-ping"]')!;
    expect(ping.dataset.driftEma).toBe('0.123');
    expect(ping.dataset.driftPeak).toBe('4.568');
    expect(ping.dataset.driftMax).toBe('9.877');
    panel.update(view(), { ...live, poseX: 1234.56, poseY: -7.04 });
    expect(ping.dataset.poseX).toBe('1234.6');
    expect(ping.dataset.poseY).toBe('-7.0');
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
  it('en çok beş satır gösterir ve dışarıda kalan kendi satırını sona koyar', () => {
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

  it('kendi satırı ilk beşteyse yerinde kalır; kopuk oyuncu ve bot işaretlenir', () => {
    const panel = mount();
    panel.update(
      view({
        rows: [row(1, { self: true }), row(2, { connected: false }), row(3), row(4, { bot: true })],
      }),
      live,
    );
    const shown = tableRows(panel);
    expect(shown[0]).toContain(i18next.t('voltest:online.board.you', { name: 'Oyuncu1' }));
    expect(shown[1]).toContain(i18next.t('voltest:online.board.away', { name: 'Oyuncu2' }));
    expect(shown[2]).toContain('Oyuncu3');
    expect(shown[3]).toContain(i18next.t('voltest:online.board.bot', { name: 'Oyuncu4' }));
  });

  it('cephe rengi satırda nokta olur', () => {
    const panel = mount();
    panel.update(view({ rows: [row(1, { team: 0 }), row(2, { team: NO_TEAM })] }), live);
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

describe('OnlinePanel akış', () => {
  it('satırları yazar ve sessizlikte soluklaştırır', () => {
    const panel = mount();
    const feed = panel.element.querySelector<HTMLElement>('[data-testid="online-feed"]')!;
    panel.push({ kind: 'kill', killer: 'Ben', victim: 'Rakip', tone: 'success' });
    panel.push({ kind: 'down', victim: 'Ben', tone: 'danger' });
    panel.push({ kind: 'drowned', victim: 'Rakip', tone: 'default' });
    panel.push({ kind: 'joined', name: 'Yeni', tone: 'default' });
    panel.push({ kind: 'left', name: 'Giden', tone: 'default' });
    expect(feed.textContent).toContain('Ben » Rakip');
    expect(feed.textContent).toContain('Rakip boğuldu');
    panel.tick(performance.now());
    expect(feed.classList.contains('vt-online__feed--idle')).toBe(false);
    panel.tick(performance.now() + 60_000);
    expect(feed.classList.contains('vt-online__feed--idle')).toBe(true);
    panel.push({ kind: 'left', name: 'Giden', tone: 'default' });
    expect(feed.classList.contains('vt-online__feed--idle')).toBe(false);
  });

  it('bölge ve zafer satırları bölge/cephe adıyla yazılır; tarafsızlaşma ayrı metindir', () => {
    const panel = mount();
    const feed = panel.element.querySelector<HTMLElement>('[data-testid="online-feed"]')!;
    const id = WAR.zones[0].id;
    panel.push({ kind: 'zone', zone: id, owner: 1, tone: 'danger' });
    panel.push({ kind: 'zone', zone: id, owner: -1, tone: 'info' });
    panel.push({ kind: 'warWon', faction: 0, wins: 2, tone: 'success' });
    expect(feed.textContent).toContain(
      i18next.t('voltest:online.feed.zoneTaken', { zone: zoneName(id), faction: factionName(1) }),
    );
    expect(feed.textContent).toContain(
      i18next.t('voltest:online.feed.zoneLost', { zone: zoneName(id) }),
    );
    expect(feed.textContent).toContain(
      i18next.t('voltest:online.feed.warWon', { faction: factionName(0), wins: 2 }),
    );
  });

  it('bilinmeyen cephe ve bölge güvenli adlara düşer', () => {
    expect(factionName(7)).toBe('8');
    expect(zoneName('yok')).toBe('yok');
    expect(zoneName(WAR.zones[0].id)).not.toBe(WAR.zones[0].id);
  });

  it('dil değişince etiketleri yeniden kurar', async () => {
    const panel = mount();
    panel.update(view({ rows: [row(1, { self: true })] }), live);
    const before = panel.element
      .querySelector('[data-testid="online-zones"] .vt-online__zone')!
      .getAttribute('title');
    const language = i18next.language;
    try {
      await i18next.changeLanguage(language === 'en' ? 'tr' : 'en');
      const after = panel.element
        .querySelector('[data-testid="online-zones"] .vt-online__zone')!
        .getAttribute('title');
      expect(after).not.toBe(before);
      expect(panel.element.querySelector('th')?.textContent).toContain(
        i18next.t('voltest:online.board.rank'),
      );
    } finally {
      await i18next.changeLanguage(language);
    }
  });
});
