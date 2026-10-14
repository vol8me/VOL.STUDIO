import { afterEach, describe, expect, it } from 'vitest';
import { i18next } from '../../../src/i18n/I18n';
import { readUiCss } from '../../support/uiCss';
import { ActivityFeed } from '../../../src/ui/hud/ActivityFeed';
import { RankList, type RankListRow } from '../../../src/ui/hud/RankList';
import { VersusBar, type VersusBarSide } from '../../../src/ui/hud/VersusBar';

/**
 * Sıkı HUD bileşenleri: VersusBar (iki taraflı hedef şeridi), RankList (sabit satırlı sıralama) ve
 * ActivityFeed (kısa ömürlü olay akışı). Üçü de kaydırmasızdır ve değerleri yerinde günceller.
 */
const tracked: Array<{ destroy(): void }> = [];
function track<T extends { destroy(): void }>(instance: T): T {
  tracked.push(instance);
  return instance;
}

afterEach(async () => {
  while (tracked.length > 0) tracked.pop()!.destroy();
  document.body.replaceChildren();
  await i18next.changeLanguage('tr');
});

const css = readUiCss('hud/scoreboard.css');

const amber: VersusBarSide = { id: 'a', label: 'Kehribar', value: 40, color: '#e0a030', own: true };
const blue: VersusBarSide = { id: 'b', label: 'Mavi', value: 10, color: '#3080e0', wins: 2 };

const texts = (root: Element, selector: string): Array<string | null> =>
  [...root.querySelectorAll(selector)].map((node) => node.textContent);

describe('VersusBar', () => {
  it('iki tarafın değerini yazar; iz hedefe oranla uçlardan yarıya uzanır', () => {
    const bar = track(new VersusBar({ target: 100 }));
    document.body.append(bar.element);
    bar.setSides([amber, blue]);
    expect(texts(bar.element, '.vol-versus__value')).toEqual(['40', '10']);
    const fills = [...bar.element.querySelectorAll<HTMLElement>('.vol-versus__fill')];
    expect(fills[0].style.width).toBe('20%');
    expect(fills[1].style.width).toBe('5%');
    bar.setSides([{ ...amber, value: 250 }, blue]);
    expect(fills[0].style.width).toBe('50%');
  });

  it('kök adlı bir gruptur; okuyucu özeti her tarafı hedefle söyler', () => {
    const bar = track(new VersusBar({ target: 100 }));
    bar.setSides([amber, blue]);
    expect(bar.element.getAttribute('role')).toBe('group');
    expect(bar.element.getAttribute('aria-label')).toBe('Skor');
    expect(bar.element.querySelector('.vol-sr-only')!.textContent).toBe(
      'Kehribar 40 / 100, Mavi 10 / 100',
    );
  });

  it('kendi tarafı ve galibiyet sayısı işaretlenir', () => {
    const bar = track(new VersusBar({ target: 100 }));
    bar.setSides([amber, blue]);
    const [own, other] = [...bar.element.querySelectorAll<HTMLElement>('.vol-versus__side')];
    expect(own.dataset.own).toBe('true');
    expect(other.dataset.own).toBe('false');
    const wins = [...bar.element.querySelectorAll<HTMLElement>('.vol-versus__wins')];
    expect(wins[0].hidden).toBe(true);
    expect(wins[1].textContent).toBe('2');
  });

  it('işaretler kimliğe göre yerinde güncellenir, kalkanlar silinir, çekişme çerçevelenir', () => {
    const bar = track(new VersusBar({ target: 100 }));
    bar.setPips([
      { id: 'z1', label: 'Çekirdek', color: '#e0a030' },
      { id: 'z2', label: 'Sırt', contested: true },
    ]);
    const first = bar.element.querySelector('[aria-label="Çekirdek"]');
    expect(bar.element.querySelectorAll('.vol-versus__pip')).toHaveLength(2);
    bar.setPips([{ id: 'z1', label: 'Çekirdek', color: '#3080e0' }]);
    expect(bar.element.querySelector('[aria-label="Çekirdek"]')).toBe(first);
    expect(bar.element.querySelectorAll('.vol-versus__pip')).toHaveLength(1);
    bar.setPips([{ id: 'z3', label: 'Cephe', contested: true }]);
    expect((bar.element.querySelector('.vol-versus__pip') as HTMLElement).dataset.contested).toBe(
      'true',
    );
  });

  it('sağdaki ek öğe konur ve kaldırılır', () => {
    const bar = track(new VersusBar({ target: 100 }));
    const trailing = bar.element.querySelector<HTMLElement>('.vol-versus__trailing')!;
    expect(trailing.hidden).toBe(true);
    const ping = document.createElement('span');
    bar.setTrailing(ping);
    expect(trailing.hidden).toBe(false);
    expect(trailing.contains(ping)).toBe(true);
    bar.setTrailing(null);
    expect(trailing.hidden).toBe(true);
  });

  it('altı haneli değerler (999999) taşmadan yazılır ve biçimleyici uygulanır', () => {
    const digits6 = 999999;
    const bar = track(
      new VersusBar({ target: digits6, formatValue: (value) => value.toLocaleString('en-US') }),
    );
    bar.setSides([
      { ...amber, value: digits6 },
      { ...blue, value: 123456 },
    ]);
    expect(texts(bar.element, '.vol-versus__value')).toEqual(['999,999', '123,456']);
  });

  it('uzun taraf adı ipucunda ve okuyucu özetinde olduğu gibi kalır', () => {
    const long = 'Uzun'.repeat(30);
    const bar = track(new VersusBar({ target: 10 }));
    bar.setSides([{ ...amber, label: long }, blue]);
    expect((bar.element.querySelector('.vol-versus__side') as HTMLElement).title).toBe(long);
    expect(bar.element.querySelector('.vol-sr-only')!.textContent).toContain(long);
  });

  it('dil değişince adı yenilenir; yanlış taraf sayısı ve geçersiz hedef atar', async () => {
    const bar = track(new VersusBar({ target: 10 }));
    await i18next.changeLanguage('en');
    expect(bar.element.getAttribute('aria-label')).toBe('Score');
    expect(() => bar.setSides([amber])).toThrow(RangeError);
    expect(() => new VersusBar({ target: 0 })).toThrow(RangeError);
  });

  it('indirgenmiş harekette iz geçişi kapanır (CSS)', () => {
    const reducedMotion = css.slice(css.indexOf('prefers-reduced-motion'));
    expect(reducedMotion).toMatch(/\.vol-versus__fill[\s\S]*transition: none/);
    const bar = track(new VersusBar({ target: 1 }));
    expect(bar.element.classList.contains('vol-versus')).toBe(true);
  });
});

const row = (id: string, patch: Partial<RankListRow> = {}): RankListRow => ({
  id,
  label: id.toUpperCase(),
  value: '10',
  ...patch,
});

describe('RankList', () => {
  it('kapasite kadar satır gösterir; sıra numarası dizideki konumdur', () => {
    const list = track(new RankList({ capacity: 3 }));
    list.setRows([row('a'), row('b'), row('c'), row('d'), row('e')]);
    expect(texts(list.element, '.vol-rank__rank')).toEqual(['1', '2', '3']);
    expect(list.element.querySelectorAll('.vol-rank__row')).toHaveLength(3);
  });

  it('kendi satırı kapasite dışında kalırsa son yuvayı alır, gerçek sırası ve ayırıcıyla', () => {
    const list = track(new RankList({ capacity: 3 }));
    list.setRows([row('a'), row('b'), row('c'), row('d'), row('me', { self: true })]);
    const rows = [...list.element.querySelectorAll<HTMLElement>('.vol-rank__row')];
    expect(rows).toHaveLength(3);
    expect(rows[2].querySelector('.vol-rank__rank')!.textContent).toBe('5');
    expect(rows[2].dataset.self).toBe('true');
    expect(rows[2].dataset.gap).toBe('true');
    expect(rows[2].getAttribute('aria-current')).toBe('true');
    expect(rows[1].dataset.gap).toBe('false');
  });

  it('satırlar kimliğe göre yerinde güncellenir; giden satır silinir', () => {
    const list = track(new RankList({ capacity: 4 }));
    list.setRows([row('a', { value: '1' }), row('b', { value: '2' })]);
    const first = list.element.querySelector('.vol-rank__row');
    list.setRows([row('a', { value: '9', secondary: '3', tag: 'bot' })]);
    expect(list.element.querySelector('.vol-rank__row')).toBe(first);
    expect(list.element.querySelectorAll('.vol-rank__row')).toHaveLength(1);
    expect(list.element.querySelector('.vol-rank__value')!.textContent).toBe('9');
    expect(list.element.querySelector('.vol-rank__secondary')!.textContent).toBe('3');
    expect(list.element.querySelector('.vol-rank__tag')!.textContent).toBe('bot');
  });

  it('boş liste boş metni gösterir ve listeyi gizler; dil değişince yenilenir', async () => {
    const list = track(new RankList({ capacity: 3, title: 'Skor' }));
    const empty = list.element.querySelector<HTMLElement>('.vol-rank__empty')!;
    const body = list.element.querySelector<HTMLElement>('.vol-rank__list')!;
    list.setRows([]);
    expect(empty.hidden).toBe(false);
    expect(body.hidden).toBe(true);
    expect(empty.textContent).toBe('Kayıt yok');
    await i18next.changeLanguage('en');
    expect(empty.textContent).toBe('No entries');
    expect(list.element.getAttribute('aria-label')).toBe('Ranking');
    list.setRows([row('a')]);
    expect(empty.hidden).toBe(true);
  });

  it('sönük satır işaretlenir; renk noktası yalnız renk verilince çizilir', () => {
    const list = track(new RankList({ capacity: 3 }));
    list.setRows([row('a', { muted: true, color: '#e0a030' }), row('b')]);
    const [muted, plain] = [...list.element.querySelectorAll<HTMLElement>('.vol-rank__row')];
    expect(muted.dataset.muted).toBe('true');
    expect(muted.querySelector<HTMLElement>('.vol-rank__swatch')!.hidden).toBe(false);
    expect(plain.querySelector<HTMLElement>('.vol-rank__swatch')!.hidden).toBe(true);
  });

  it('altı haneli değerler (999999) ve uzun adlar satırı bozmadan yazılır', () => {
    const list = track(new RankList({ capacity: 2 }));
    const longLabel = 'Çok'.repeat(40);
    list.setRows([row('a', { value: '999999', label: longLabel })]);
    expect(list.element.querySelector('.vol-rank__value')!.textContent).toBe('999999');
    expect(list.element.querySelector('.vol-rank__name')!.textContent).toBe(longLabel);
    expect(css).toMatch(/\.vol-rank__name[^}]*text-overflow: ellipsis/);
  });

  it('geçersiz kapasite atar', () => {
    expect(() => new RankList({ capacity: 0 })).toThrow(RangeError);
  });
});

describe('ActivityFeed', () => {
  it('satır ekler; kapasite aşılınca en eski satır hemen kalkar', () => {
    const feed = track(new ActivityFeed({ capacity: 2 }));
    feed.push({ text: 'bir' }, 0);
    feed.push({ text: 'iki', tone: 'danger' }, 10);
    feed.push({ text: 'üç', tone: 'success' }, 20);
    expect(texts(feed.element, '.vol-feed__line')).toEqual(['iki', 'üç']);
    expect(feed.size).toBe(2);
    expect(feed.element.querySelector('.vol-feed__line--danger')).not.toBeNull();
  });

  it('süresi dolan satır söner, sönme süresi bitince kalkar; boşalınca akış gizlenir', () => {
    const feed = track(new ActivityFeed({ capacity: 4, lifetimeMs: 1000, fadeMs: 200 }));
    expect(feed.element.hidden).toBe(true);
    feed.push({ text: 'a' }, 0);
    feed.push({ text: 'b' }, 800);
    expect(feed.element.hidden).toBe(false);
    feed.tick(999);
    expect(feed.element.querySelector('[data-leaving]')).toBeNull();
    feed.tick(1050);
    expect((feed.element.querySelector('.vol-feed__line') as HTMLElement).dataset.leaving).toBe(
      'true',
    );
    feed.tick(1200);
    expect(feed.size).toBe(1);
    feed.tick(2100);
    expect(feed.size).toBe(0);
    expect(feed.element.hidden).toBe(true);
  });

  it('kök okunabilir bir günlüktür ama canlı bölge değildir; kaydırma bölgesi yoktur', () => {
    const feed = track(new ActivityFeed({ capacity: 3 }));
    expect(feed.element.getAttribute('role')).toBe('log');
    expect(feed.element.getAttribute('aria-live')).toBe('off');
    expect(feed.element.getAttribute('aria-label')).toBe('Etkinlik');
    expect(feed.element.querySelector('[tabindex]')).toBeNull();
    expect(css).toMatch(/\.vol-feed \{[^}]*overflow: hidden/);
  });

  it('temizle satırları siler; kapanıştan sonra çağrılar etkisizdir', () => {
    const feed = track(new ActivityFeed({ capacity: 3 }));
    feed.push({ text: 'a' }, 0);
    feed.clear();
    expect(feed.size).toBe(0);
    feed.destroy();
    feed.push({ text: 'b' }, 0);
    feed.tick(10_000);
    expect(feed.size).toBe(0);
    expect(() => new ActivityFeed({ capacity: 0 })).toThrow(RangeError);
  });

  it('indirgenmiş harekette satır geçişi kapanır (CSS)', () => {
    const reducedMotion = css.slice(css.indexOf('prefers-reduced-motion'));
    expect(reducedMotion).toMatch(/\.vol-feed__line[\s\S]*transition: none/);
    const feed = track(new ActivityFeed({ capacity: 1 }));
    expect(feed.element.classList.contains('vol-feed')).toBe(true);
  });
});
