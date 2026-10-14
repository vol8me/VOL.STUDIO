import { i18next } from '../../i18n/I18n';

/** Sıralama satırının sunum verisi: puanlama ve sıralama kuralı çağırana aittir. */
export interface RankListRow {
  readonly id: string;
  readonly label: string;
  /** Ana değer (puan, öldürme…); biçimlendirme çağırana aittir. */
  readonly value: string;
  /** Ana değerin yanında sönük gösterilen ikinci değer (ölüm sayısı…). */
  readonly secondary?: string;
  /** Satırın işaret noktasının CSS rengi (takım, oyuncu rengi). */
  readonly color?: string;
  /** Oyuncunun kendi satırı: vurgulanır ve kapasite dışına düşse bile görünür kalır. */
  readonly self?: boolean;
  /** Sönük satır (bağlantısı kopan, pasif). */
  readonly muted?: boolean;
  /** Ada eklenen kısa etiket (ör. "bot"). */
  readonly tag?: string;
}

export interface RankListOptions {
  /** Aynı anda görünen en çok satır (kaydırma yoktur). Pozitif tam sayı olmalı. */
  capacity: number;
  /** Başlık; verilmezse başlık satırı çizilmez. */
  title?: string;
  /** Liste adı (okuyucu); verilmezse CORE dil anahtarı. */
  ariaLabel?: string | (() => string);
  /** Satır yokken yazılan metin; verilmezse CORE dil anahtarı. */
  emptyText?: string | (() => string);
  className?: string;
}

interface RowView {
  readonly root: HTMLLIElement;
  readonly rank: HTMLSpanElement;
  readonly swatch: HTMLSpanElement;
  readonly name: HTMLSpanElement;
  readonly tag: HTMLSpanElement;
  readonly value: HTMLSpanElement;
  readonly secondary: HTMLSpanElement;
}

function resolve(source: string | (() => string) | undefined, fallback: () => string): string {
  if (typeof source === 'function') return source();
  return source ?? fallback();
}

/**
 * Sabit satır sayılı sıralama listesi (skor tablosu): ilk `capacity` satır görünür, oyuncunun kendi satırı
 * dışarıda kalırsa son satırın yerine gerçek sırasıyla gelir ve üstüne ayırıcı çizilir. Kaydırma ve
 * sayfalama yoktur: HUD'da çabuk okunur, boyutu sabittir. Satırlar kimliğe göre yerinde güncellenir.
 * Sıra numarası verilen dizideki konumdur (1 tabanlı).
 */
export class RankList {
  readonly element: HTMLElement;
  private readonly heading: HTMLElement | null;
  private readonly list: HTMLOListElement;
  private readonly empty: HTMLElement;
  private readonly views = new Map<string, RowView>();
  private readonly capacity: number;
  private readonly ariaIsI18n: boolean;
  private readonly emptyIsI18n: boolean;
  private rows: readonly RankListRow[] = [];
  private destroyed = false;

  constructor(private readonly options: RankListOptions) {
    if (!Number.isInteger(options.capacity) || options.capacity < 1)
      throw new RangeError(
        `RankList.capacity pozitif tam sayı olmalı (gelen: ${options.capacity}).`,
      );
    this.capacity = options.capacity;
    this.ariaIsI18n = options.ariaLabel === undefined;
    this.emptyIsI18n = options.emptyText === undefined;

    this.element = document.createElement('section');
    this.element.className = ['vol-rank', options.className].filter(Boolean).join(' ');

    if (options.title !== undefined) {
      this.heading = document.createElement('h3');
      this.heading.className = 'vol-rank__title';
      this.heading.textContent = options.title;
      this.element.appendChild(this.heading);
    } else this.heading = null;

    this.list = document.createElement('ol');
    this.list.className = 'vol-rank__list';
    this.empty = document.createElement('p');
    this.empty.className = 'vol-rank__empty';
    this.element.append(this.list, this.empty);
    this.applyLabels();
    this.paintEmpty();
    i18next.on('languageChanged', this.handleLanguageChanged);
  }

  setTitle(title: string): void {
    if (this.destroyed || !this.heading) return;
    this.heading.textContent = title;
  }

  /** Satırları günceller; sıra dizideki konumdur. Değişmeyen metinler DOM'a yazılmaz. */
  setRows(rows: readonly RankListRow[]): void {
    if (this.destroyed) return;
    this.rows = rows;
    const visible = this.visibleRows(rows);
    const keep = new Set<string>();
    let previous = 0;
    visible.forEach(({ row, rank }) => {
      keep.add(row.id);
      let view = this.views.get(row.id);
      if (!view) {
        view = this.createView();
        this.views.set(row.id, view);
      }
      this.paintRow(view, row, rank, previous !== 0 && rank > previous + 1);
      this.list.appendChild(view.root);
      previous = rank;
    });
    for (const [id, view] of this.views) {
      if (keep.has(id)) continue;
      view.root.remove();
      this.views.delete(id);
    }
    this.list.hidden = visible.length === 0;
    this.empty.hidden = visible.length !== 0;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    i18next.off('languageChanged', this.handleLanguageChanged);
    this.views.clear();
    this.element.remove();
  }

  /** Görünen satırlar ve gerçek sıraları: kendi satırı dışarıda kalırsa son yuvayı alır. */
  private visibleRows(rows: readonly RankListRow[]): Array<{ row: RankListRow; rank: number }> {
    const shown = rows.slice(0, this.capacity).map((row, index) => ({ row, rank: index + 1 }));
    const ownIndex = rows.findIndex((row) => row.self === true);
    if (ownIndex >= this.capacity)
      shown[shown.length - 1] = { row: rows[ownIndex], rank: ownIndex + 1 };
    return shown;
  }

  private createView(): RowView {
    const root = document.createElement('li');
    root.className = 'vol-rank__row';
    const rank = document.createElement('span');
    rank.className = 'vol-rank__rank';
    const swatch = document.createElement('span');
    swatch.className = 'vol-rank__swatch';
    swatch.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'vol-rank__name';
    const tag = document.createElement('span');
    tag.className = 'vol-rank__tag';
    const value = document.createElement('span');
    value.className = 'vol-rank__value';
    const secondary = document.createElement('span');
    secondary.className = 'vol-rank__secondary';
    root.append(rank, swatch, name, tag, value, secondary);
    return { root, rank, swatch, name, tag, value, secondary };
  }

  private paintRow(view: RowView, row: RankListRow, rank: number, gap: boolean): void {
    this.write(view.rank, String(rank));
    this.write(view.name, row.label);
    this.write(view.value, row.value);
    this.write(view.secondary, row.secondary ?? '');
    view.secondary.hidden = row.secondary === undefined;
    this.write(view.tag, row.tag ?? '');
    view.tag.hidden = row.tag === undefined;
    view.swatch.style.background = row.color ?? 'transparent';
    view.swatch.hidden = row.color === undefined;
    view.root.dataset.self = String(row.self === true);
    view.root.dataset.muted = String(row.muted === true);
    view.root.dataset.gap = String(gap);
    if (row.self === true) view.root.setAttribute('aria-current', 'true');
    else view.root.removeAttribute('aria-current');
  }

  private write(target: HTMLElement, text: string): void {
    if (target.textContent !== text) target.textContent = text;
  }

  private applyLabels(): void {
    this.element.setAttribute(
      'aria-label',
      resolve(this.options.ariaLabel, () => i18next.t('core:rankList.label')),
    );
  }

  private paintEmpty(): void {
    this.empty.textContent = resolve(this.options.emptyText, () =>
      i18next.t('core:rankList.empty'),
    );
  }

  private readonly handleLanguageChanged = (): void => {
    if (this.destroyed) return;
    if (this.ariaIsI18n || typeof this.options.ariaLabel === 'function') this.applyLabels();
    if (this.emptyIsI18n || typeof this.options.emptyText === 'function') this.paintEmpty();
  };
}
