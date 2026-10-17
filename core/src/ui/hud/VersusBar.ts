import { requiredAt } from '../../collections/requiredAt';
import { i18next } from '../../i18n/I18n';

/** Karşılaşmanın bir tarafı: sunum verisi; puan kuralı çağırana aittir. */
export interface VersusBarSide {
  readonly id: string;
  /** Okuyucuya ve ipucuna giden tam ad. */
  readonly label: string;
  /** Hedefe doğru ilerleme (0 ile `target` arası kenetlenir). */
  readonly value: number;
  /** Tarafın CSS rengi (iz dolgusu ve işaret noktası). */
  readonly color: string;
  /** Önceki turlardaki galibiyet sayısı; verilmezse gösterilmez. */
  readonly wins?: number;
  /** Oyuncunun kendi tarafı: değeri vurgulanır. */
  readonly own?: boolean;
}

/** Orta şeritteki küçük işaret (bölge, nokta, tur): rengi sahibini, çerçevesi çekişmeyi söyler. */
export interface VersusBarPip {
  readonly id: string;
  readonly label: string;
  /** Sahibin rengi; verilmezse işaret sahipsizdir (boş çerçeve). */
  readonly color?: string;
  readonly contested?: boolean;
}

export interface VersusBarOptions {
  /** Kazanma eşiği: iki iz ortada `target`te buluşur. Pozitif sonlu sayı olmalı. */
  target: number;
  /** Ekran okuyucu adı; verilmezse CORE dil anahtarı. Sağlayıcı dil değişiminde yeniden okunur. */
  ariaLabel?: string | (() => string);
  /** Değerin gösterim biçimi; varsayılan tam sayıya yuvarlar (aşağı). */
  formatValue?: (value: number) => string;
  /** Okuyucu özeti; verilmezse "Ad değer / hedef" listesi. */
  describe?: (sides: readonly VersusBarSide[], target: number) => string;
  className?: string;
}

interface SideView {
  readonly root: HTMLElement;
  readonly swatch: HTMLSpanElement;
  readonly value: HTMLSpanElement;
  readonly wins: HTMLSpanElement;
  readonly fill: HTMLSpanElement;
}

const SIDE_COUNT = 2;

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * İki tarafın hedefe doğru yarışını gösteren sıkı HUD şeridi: sol ve sağ uçta tarafın rengi ve değeri,
 * ortada iki ucundan hedefe uzanan iz; iz ortada buluştuğunda taraf kazanmıştır. İz altında isteğe bağlı
 * işaret sırası (bölgeler) ve sağda tüketicinin koyduğu bir ek öğe (ör. bağlantı göstergesi) durur.
 * Etkileşimsizdir; değerler `setSides` ile yerinde güncellenir (DOM yıkılıp kurulmaz). Puan kuralı ve
 * renk seçimi çağırana aittir.
 */
export class VersusBar {
  readonly element: HTMLElement;
  private readonly sides: SideView[] = [];
  private readonly track: HTMLElement;
  private readonly summary: HTMLSpanElement;
  private readonly pips: HTMLElement;
  private readonly trailing: HTMLElement;
  private readonly pipViews = new Map<string, HTMLElement>();
  private readonly labelIsI18n: boolean;
  private target: number;
  private current: readonly VersusBarSide[] = [];
  private destroyed = false;

  constructor(private readonly options: VersusBarOptions) {
    this.target = VersusBar.checkTarget(options.target);
    this.labelIsI18n = options.ariaLabel === undefined;

    this.element = document.createElement('div');
    this.element.className = ['vol-versus', options.className].filter(Boolean).join(' ');
    this.element.setAttribute('role', 'group');

    this.track = document.createElement('div');
    this.track.className = 'vol-versus__track';
    const [first, second] = [this.createSide(0), this.createSide(1)];
    this.sides.push(first, second);
    this.track.append(first.fill, second.fill);

    this.pips = document.createElement('div');
    this.pips.className = 'vol-versus__pips';
    this.pips.setAttribute('role', 'list');

    this.trailing = document.createElement('div');
    this.trailing.className = 'vol-versus__trailing';
    this.trailing.hidden = true;

    this.summary = document.createElement('span');
    this.summary.className = 'vol-sr-only';

    const middle = document.createElement('div');
    middle.className = 'vol-versus__middle';
    middle.append(this.track, this.pips);

    this.element.append(first.root, middle, second.root, this.trailing, this.summary);
    this.applyLabel();
    i18next.on('languageChanged', this.handleLanguageChanged);
  }

  /** Hedef eşiği değiştirir; yeni oranlar hemen yansır. */
  setTarget(target: number): void {
    if (this.destroyed) return;
    this.target = VersusBar.checkTarget(target);
    this.paint();
  }

  /** İki tarafın güncel durumu; tam iki taraf verilmelidir. Değişmeyen değerler DOM'a yazılmaz. */
  setSides(sides: readonly VersusBarSide[]): void {
    if (this.destroyed) return;
    if (sides.length !== SIDE_COUNT)
      throw new RangeError(`VersusBar tam ${SIDE_COUNT} taraf ister (gelen: ${sides.length}).`);
    this.current = sides;
    this.paint();
  }

  /** Orta şeritteki işaretler; kimliğe göre yerinde güncellenir, kalkanlar silinir. */
  setPips(pips: readonly VersusBarPip[]): void {
    if (this.destroyed) return;
    const keep = new Set<string>();
    for (const pip of pips) {
      keep.add(pip.id);
      let view = this.pipViews.get(pip.id);
      if (!view) {
        view = document.createElement('span');
        view.className = 'vol-versus__pip';
        view.setAttribute('role', 'listitem');
        this.pipViews.set(pip.id, view);
      }
      view.dataset.pipId = pip.id;
      view.title = pip.label;
      view.setAttribute('aria-label', pip.label);
      view.style.background = pip.color ?? 'transparent';
      view.dataset.contested = String(pip.contested === true);
      view.dataset.owned = String(pip.color !== undefined);
      this.pips.appendChild(view);
    }
    for (const [id, view] of this.pipViews) {
      if (keep.has(id)) continue;
      view.remove();
      this.pipViews.delete(id);
    }
    this.pips.hidden = this.pipViews.size === 0;
  }

  /** Sağdaki ek öğe (ör. bağlantı göstergesi); `null` kaldırır. Öğenin sahibi çağırandır. */
  setTrailing(content: Element | null): void {
    if (this.destroyed) return;
    this.trailing.replaceChildren();
    if (content) this.trailing.appendChild(content);
    this.trailing.hidden = content === null;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    i18next.off('languageChanged', this.handleLanguageChanged);
    this.pipViews.clear();
    this.element.remove();
  }

  private static checkTarget(target: number): number {
    if (!Number.isFinite(target) || target <= 0)
      throw new RangeError(`VersusBar.target pozitif sonlu sayı olmalı (gelen: ${target}).`);
    return target;
  }

  private createSide(index: number): SideView {
    const root = document.createElement('div');
    root.className = `vol-versus__side vol-versus__side--${index === 0 ? 'start' : 'end'}`;
    const swatch = document.createElement('span');
    swatch.className = 'vol-versus__swatch';
    swatch.setAttribute('aria-hidden', 'true');
    const value = document.createElement('span');
    value.className = 'vol-versus__value';
    const wins = document.createElement('span');
    wins.className = 'vol-versus__wins';
    wins.hidden = true;
    // Başlangıç tarafında rozet dıştan içe, bitiş tarafında içten dışa dizilir (ayna).
    if (index === 0) root.append(swatch, value, wins);
    else root.append(wins, value, swatch);
    const fill = document.createElement('span');
    fill.className = `vol-versus__fill vol-versus__fill--${index === 0 ? 'start' : 'end'}`;
    return { root, swatch, value, wins, fill };
  }

  private paint(): void {
    if (this.current.length !== SIDE_COUNT) return;
    const format =
      this.options.formatValue ?? ((value: number): string => String(Math.floor(value)));
    this.current.forEach((side, index) => {
      const view = requiredAt(this.sides, index);
      view.swatch.style.background = side.color;
      view.fill.style.background = side.color;
      view.fill.style.width = `${(clamp01(side.value / this.target) * 50).toFixed(2)}%`;
      const text = format(side.value);
      if (view.value.textContent !== text) view.value.textContent = text;
      view.root.title = side.wins === undefined ? side.label : `${side.label} · ${side.wins}`;
      view.root.dataset.own = String(side.own === true);
      view.wins.hidden = side.wins === undefined;
      if (side.wins !== undefined) view.wins.textContent = String(side.wins);
    });
    const describe = this.options.describe ?? this.defaultDescribe;
    const summary = describe(this.current, this.target);
    if (this.summary.textContent !== summary) this.summary.textContent = summary;
  }

  private readonly defaultDescribe = (sides: readonly VersusBarSide[], target: number): string => {
    const format =
      this.options.formatValue ?? ((value: number): string => String(Math.floor(value)));
    return sides
      .map((side) =>
        i18next.t('core:versusBar.side', {
          name: side.label,
          value: format(side.value),
          target: format(target),
        }),
      )
      .join(', ');
  };

  private applyLabel(): void {
    const { ariaLabel } = this.options;
    const label =
      typeof ariaLabel === 'function'
        ? ariaLabel()
        : (ariaLabel ?? i18next.t('core:versusBar.label'));
    this.element.setAttribute('aria-label', label);
  }

  private readonly handleLanguageChanged = (): void => {
    if (this.destroyed) return;
    if (this.labelIsI18n || typeof this.options.ariaLabel === 'function') this.applyLabel();
    this.paint();
  };
}
