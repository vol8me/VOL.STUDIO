import { DisposableScope } from '../../lifecycle/DisposableScope';
import { i18next } from '../../i18n/I18n';
import { isViewportKeyTarget, viewportKeyAction, VIEWPORT_SHORTCUTS } from '../camera/viewportKeys';
import { emitUiIntent } from '../feedback/uiIntent';
import { Icon } from '../primitives/Icon';
import { IconButton } from '../primitives/IconButton';
import { pickDirectionalTarget, type NavDirection } from '../focus/directional';
import { prefersReducedMotion } from '../motion/reducedMotion';
import { RichTooltip } from '../overlays/RichTooltip';

export interface SkillNodeCost {
  label: string;
  amount: number;
}

export interface SkillNodeDefinition {
  id: string;
  label: string;
  /** Grid koordinatı (satır/sütun birimi, piksel değil) — layout bunlara göre konumlanır. */
  x: number;
  y: number;
  /**
   * Bu düğüme bağlanan üst düğüm id'leri — ÇİZİLECEK KENARLARI tanımlar.
   *
   * Bileşen bunu yalnızca grafiği çizmek için okur; açılabilirliğe KARAR
   * VERMEZ (bkz. `resolveSkillStates`). Bir oyun "herhangi biri yeterli"
   * derse kenarlar aynı kalır, yalnızca durum hesabı değişir.
   */
  requires?: string[];
  /**
   * Kategori/dal etiketi — aynı branch değerine sahip düğümler ve onları
   * birbirine bağlayan çizgiler aynı vurgu rengini paylaşır (ör. "saldırı"
   * dalı kırmızımsı, "savunma" dalı mavimsi). Verilmezse nötr renk kullanılır.
   */
  branch?: 'primary' | 'support' | 'accent';
  /** Açma maliyeti (ör. beceri puanı, araştırma kaynağı) — showTooltips açıkken hover kartında gösterilir. */
  cost?: SkillNodeCost[];
  /** Hover'da (showTooltips açıkken) gösterilecek açıklama metni. */
  description?: string;
}

/** Bir düğümün o anki durumu. Çağıran hesaplar, bileşen yalnızca çizer. */
export type SkillNodeState = 'unlocked' | 'available' | 'locked';

/**
 * Klasik "TÜM önkoşullar açık olmalı" (AND) kuralını uygulayan saf fonksiyon.
 *
 * Kural bileşenin DIŞINDADIR: `SkillTree` kendi `unlockedIds` defterini
 * TUTMAZ, yalnızca verilen durumları çizer — açılma kararının tek sahibi
 * oyunun ilerleme sistemidir, ikinci bir defter doğmaz. En yaygın davranış
 * burada hazır durur ve tek satırda kullanılır. "Önkoşullardan
 * HERHANGİ biri yeterli" (OR) ya da "dalda N puan harcanmış olmalı" gibi bir
 * kural isteyen oyun kendi eşlemesini yazar ve `setStates()`e verir.
 *
 * ```ts
 * tree.setStates(resolveSkillStates(nodes, unlockedIds));
 * ```
 */
export function resolveSkillStates(
  nodes: readonly SkillNodeDefinition[],
  unlockedIds: ReadonlySet<string>,
): Record<string, SkillNodeState> {
  const states: Record<string, SkillNodeState> = {};
  for (const node of nodes) {
    if (unlockedIds.has(node.id)) {
      states[node.id] = 'unlocked';
      continue;
    }
    const requires = node.requires ?? [];
    states[node.id] = requires.every((id) => unlockedIds.has(id)) ? 'available' : 'locked';
  }
  return states;
}

export interface SkillTreeOptions {
  nodes: SkillNodeDefinition[];
  /**
   * Bir düğüme tıklandığında NİYETİ bildirir; düğümün o anki durumu da
   * verilir. Bileşen hiçbir şey açmaz — açma kararı (maliyet, puan, onay)
   * tamamen çağıranındır. Karar sonrası `setStates()` çağrılır. KİLİTLİ düğüm
   * eylem değildir: bu çağrı yapılmaz, bunun yerine nedeni (önkoşul) balonla gösterilir ve `reject` niyeti yayılır.
   */
  onNodeClick?: (id: string, state: SkillNodeState) => void;
  /** Grid biriminin piksel karşılığı (satır yüksekliği ve minimum sütun genişliği). Varsayılan 120. */
  cellSize?: number;
  /**
   * true ise her düğüme RichTooltip bağlanır (başlık + açıklama + maliyet
   * satırları). Basit kullanımda (yalnızca nodes/requires ile) kapalı
   * bırakılabilir — component'in temel API'si tooltip'siz de tam işlevseldir,
   * bu sadece detaylı bir envanter/araştırma ağacı için opsiyonel katmandır.
   * Varsayılan false.
   */
  showTooltips?: boolean;
  /**
   * true ise fare tekerleğiyle yakınlaştırma/uzaklaştırma ve sürükleyerek
   * kaydırma (pan) etkinleşir — büyük, çok dallı ağaçlarda tüm düğümleri
   * sabit boyutta sığdırmak yerine kullanıcının gezinmesine izin verir.
   * Tekerlek/sürükleme tek yol DEĞİLDİR: görünüm denetim düğmeleri (+, −, 1:1) ve klavye (`+`/`-`/`0`/`Home`/oklar
   * görünüm odaktayken; düğüm odaktayken `+`/`-`/`0`, Shift+ok) aynı işi yapar.
   * Varsayılan false (küçük/orta ağaçlarda gereksiz karmaşıklık).
   */
  zoomable?: boolean;
  /** Ağacın okuyucu adı. Verilmezse çeviriden gelir ("Yetenek ağacı") ve dil değişince yenilenir. */
  ariaLabel?: string;
  /** Balonların (`showTooltips`) ekleneceği kapsayıcı (varsayılan `document.body`; UI kökü içinde tutmak için `uiRoot.element`). */
  tooltipContainer?: HTMLElement;
}

/** .vol-skill-tree__canvas--resetting geçişi (skillTree.css: transform 0.4s) + kare payi. */
const RESET_VIEW_TRANSITION_MS = 420;
/** Baglanti dolum animasyonunun süresi; bittiğinde --filling class'i kaldırılır. */
const CONNECTION_FILL_MS = 500;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
/** Klavye/düğme yakınlaştırma adımı (tekerlek adımıyla aynı). */
const ZOOM_STEP = 0.1;
/** Klavye ile kaydırma adımı (px). */
const PAN_STEP = 48;
/** Ağaç kaydırılırken görünümde en az bu kadar piksel görünür kalır (ağacı tamamen kaybetmek yok). */
const PAN_VISIBLE_MARGIN = 64;
/** Odaklanan düğüm görünüm kenarına bu kadar yaklaşırsa görünüm kaydırılır (px). */
const FOCUS_MARGIN = 16;
/** Düğüm kutusunun yüksekliği (CSS `.vol-skill-tree__node` ile BİREBİR). */
export const NODE_HEIGHT = 44;
/** Aynı satırdaki iki düğüm arasında bırakılacak minimum boşluk (piksel) — metin uzunluğu ne olursa olsun düğümler asla bu paydan daha yakın duramaz. */
const MIN_NODE_GAP = 24;
/** Düğüm etiketinin yatay iç boşluğu (px, her iki taraf toplamı) — genişlik hesaplanırken metnin ölçülen genişliğine eklenir. */
const NODE_PADDING_X = 28;
/** .vol-skill-tree__node'un CSS min-width'i ile BİREBİR eşleşmeli. */
export const MIN_NODE_WIDTH = 88;
/**
 * .vol-skill-tree__node-label'ın theme.css'teki gerçek font'uyla BİREBİR
 * eşleşmeli — measureLabelWidth() bu font'la bir canvas context üzerinden
 * ölçüm yapar (bkz. aşağıdaki yorum, DOM'a bağlı olma zorunluluğunu
 * ortadan kaldırmak için).
 */
export const NODE_LABEL_FONT = "600 13px 'Jura', sans-serif";

interface NodeLayout {
  centerX: number;
  centerY: number;
  width: number;
}

let measureCanvasContext: CanvasRenderingContext2D | null = null;

/**
 * Bir etiketin piksel genişliğini, DOM'a bağlı olup olmadığından TAMAMEN
 * BAĞIMSIZ ölçer. `button.scrollWidth` bu işi GÖREMEZ: yalnız element
 * `document`'a mount edilip layout aldıktan sonra doğru değer döner, bağlı
 * olmayan bir alt ağaçta her zaman 0'dır. SkillTree constructor'ı kendi
 * elementini tüketici DOM'a EKLEMEDEN ÖNCE `recomputeLayout()` çağırır;
 * scrollWidth ile ölçseydi her düğüm 0 genişlik alırdı, tüm düğümler
 * MIN_NODE_WIDTH'e sabitlenip uzun etiketler (ör. "Hızlı Toparlanma")
 * kutudan taşıyordu. `<canvas>` 2D context'in `measureText()`'i ise saf
 * bir font-metrikleri hesaplamasıdır, hiçbir DOM bağlantısı gerektirmez —
 * bu yüzden constructor içinde senkron ve HER ZAMAN doğru sonuç verir.
 */
function measureLabelWidth(label: string): number {
  if (!measureCanvasContext) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return label.length * 7; // canvas desteklenmiyorsa kaba bir tahmin
    measureCanvasContext = context;
  }
  measureCanvasContext.font = NODE_LABEL_FONT;
  return measureCanvasContext.measureText(label).width;
}

/**
 * Serbest 2B yerleşimli, çoklu önkoşullu (AND) düğüm ağı. `Tree`den farkı
 * budur: orada tek kök ve hiyerarşi vardır, burada düğüm birden fazla
 * önkoşula bağlanabilir. Düğüm üç durumdan birindedir: unlocked, available
 * (önkoşulları tamam), locked.
 *
 * **`x`/`y` piksel DEĞİL, SIRA bildirir.** Aynı `y` bir satırdır ve soldan
 * sağa dizilir; düğüm genişliği etiket metnine göre büyür (metin kırpılmaz),
 * çakışan komşular arasında en az `MIN_NODE_GAP` kalacak şekilde birbirini
 * iter. Ağaç en geniş satıra göre yatayda ortalanır.
 *
 * `branch`, `cost`/`description` + `showTooltips` ve `zoomable` opsiyoneldir.
 */
export class SkillTree {
  readonly element: HTMLDivElement;
  private readonly viewport: HTMLDivElement;
  private readonly canvas: HTMLDivElement;
  private readonly svg: SVGSVGElement;
  private readonly nodesLayer: HTMLDivElement;
  private readonly nodes: SkillNodeDefinition[];
  private readonly cellSize: number;
  private readonly showTooltips: boolean;
  private readonly zoomable: boolean;
  /** Dışarıdan verilen durum haritası — bileşenin KENDİ defteri yoktur. */
  private states: Readonly<Record<string, SkillNodeState>> = {};
  private readonly nodeElements = new Map<string, HTMLButtonElement>();
  private readonly tooltips = new Map<string, RichTooltip>();
  private readonly onNodeClickHandler?: (id: string, state: SkillNodeState) => void;
  /**
   * Bu bileşenin ömrüne bağlı kaynaklar.
   *
   * Elle yönetilen bir `(() => void)[]` dizisiydi. `DisposableScope`in üç
   * farkı var ve üçü de davranışsal: kapatma TERS sırada yapılır (kaynaklar
   * arası bağımlılık genelde bu yönde kurulur), ikinci `dispose()` no-op'tur
   * ve bir kaynağın kapatılması FIRLATIRSA geri kalanlar yine kapatılır —
   * düz `for` döngüsü ilk hatada duruyor ve kalan her şeyi sızdırıyordu.
   */
  private readonly scope = new DisposableScope();
  /** Bekleyen zamanlayıcı/rAF handle'lari — destroy() hepsini iptal eder. */
  private readonly pendingTimers = new Set<number>();
  private readonly pendingFrames = new Set<number>();
  private destroyed = false;
  private layout = new Map<string, NodeLayout>();
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private isPanning = false;
  private panPointerId: number | null = null;
  private panStartX = 0;
  private panStartY = 0;
  /** Dolaşma hedefi: Tab'ın indiği tek düğüm (son odaklanan; yoksa ilk açılabilir, o da yoksa ilk). */
  private activeNodeId: string | null = null;
  private readonly customLabel: boolean;
  private readonly tooltipContainer?: HTMLElement;
  private zoomStatus: HTMLDivElement | null = null;
  private controlsElement: HTMLDivElement | null = null;
  private viewControls: { zoomIn: IconButton; zoomOut: IconButton; reset: IconButton } | null =
    null;
  private readonly onLanguageChanged = (): void => {
    if (!this.customLabel)
      this.element.setAttribute('aria-label', i18next.t('core:skillTree.label'));
    this.labelViewControls();
    this.renderStates(false);
  };

  constructor(options: SkillTreeOptions) {
    this.nodes = options.nodes;
    this.cellSize = options.cellSize ?? 120;
    this.onNodeClickHandler = options.onNodeClick;
    this.showTooltips = options.showTooltips ?? false;
    this.zoomable = options.zoomable ?? false;
    this.customLabel = options.ariaLabel !== undefined;
    this.tooltipContainer = options.tooltipContainer;

    this.element = document.createElement('div');
    this.element.className = 'vol-skill-tree';
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-label', options.ariaLabel ?? i18next.t('core:skillTree.label'));
    if (this.zoomable) this.element.classList.add('vol-skill-tree--zoomable');

    this.viewport = document.createElement('div');
    this.viewport.className = 'vol-skill-tree__viewport';
    this.element.appendChild(this.viewport);

    this.canvas = document.createElement('div');
    this.canvas.className = 'vol-skill-tree__canvas';
    this.viewport.appendChild(this.canvas);

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('vol-skill-tree__connections');
    this.canvas.appendChild(this.svg);

    this.nodesLayer = document.createElement('div');
    this.nodesLayer.className = 'vol-skill-tree__nodes';
    this.canvas.appendChild(this.nodesLayer);

    for (const node of this.nodes) {
      this.nodesLayer.appendChild(this.buildNode(node));
    }

    if (this.zoomable) {
      this.setupZoomPan();
      this.buildViewControls();
    }
    this.scope.addListener(this.nodesLayer, 'keydown', ((event: KeyboardEvent) =>
      this.onNodeKeyDown(event)) as EventListener);
    this.scope.addListener(this.nodesLayer, 'focusin', ((event: FocusEvent) => {
      const id = (event.target as HTMLElement | null)?.dataset?.nodeId;
      if (id === undefined) return;
      if (id !== this.activeNodeId) {
        this.activeNodeId = id;
        this.applyRovingTabindex();
      }
      this.ensureVisible(id);
    }) as EventListener);
    i18next.on('languageChanged', this.onLanguageChanged);

    // Yerleşim hesabı burada senkron yapılır (requestAnimationFrame'e
    // gerek yok) — measureLabelWidth() canvas tabanlı olduğu için elementin
    // DOM'a bağlı olması gerekmez, tüketici bu component'i henüz sayfaya
    // eklemeden önce constructor'ı çağırsa bile doğru genişlikler hesaplanır
    // (önceki scrollWidth tabanlı ölçüm burada her zaman 0 dönüyordu, bkz.
    // measureLabelWidth yorum bloğu).
    this.recomputeLayout();
    this.renderConnections();
    this.renderStates(false);
    this.applyRovingTabindex();

    this.recomputeWhenFontReady();
  }

  /**
   * measureLabelWidth() 'Jura' metriklerine göre ölçüm yapar, ama font
   * createVolGame tarafından asenkron yüklenir. SkillTree font hazir olmadan
   * kurulursa olcumler sistem fontuyla yapılır ve dugum genislikleri kalıcı
   * olarak yanlış kalır — uzun etiketler kutudan taşar. Font yerleşince tek
   * seferlik yeniden ölçüm yapılır.
   *
   * Container yeniden boyutlanmasi dinlenmez: recomputeLayout() yalnızca
   * etiket metnine ve cellSize'a bağlı, container genişliğini hiç okumaz.
   */
  private recomputeWhenFontReady(): void {
    if (typeof document === 'undefined' || !document.fonts) return;

    void document.fonts.ready.then(() => {
      if (this.destroyed) return;
      this.recomputeLayout();
      this.renderConnections();
      this.renderStates(false);
    });
  }

  /**
   * Düğüm durumlarını dışarıdan alır ve çizer. Haritada olmayan düğüm
   * `'locked'` sayılır.
   *
   * Yeni açılan düğüm önceki haritayla KARŞILAŞTIRILARAK bulunur ve vurgu
   * animasyonu oynatılır — "hangi düğüm az önce açıldı" bilgisi çağırandan
   * ayrıca istenmez, ama kararın sahibi yine çağırandır.
   */
  setStates(states: Readonly<Record<string, SkillNodeState>>): void {
    const previous = this.states;
    this.states = states;

    const newlyUnlocked = this.nodes.find(
      (node) => states[node.id] === 'unlocked' && previous[node.id] !== 'unlocked',
    );
    this.renderStates(newlyUnlocked !== undefined, newlyUnlocked?.id);
  }

  /** Bir düğümün o an çizilen durumu. */
  getNodeState(id: string): SkillNodeState {
    return this.states[id] ?? 'locked';
  }

  /**
   * Düğüm tanımları — çağıranın durum hesabı yapabilmesi için
   * (`resolveSkillStates(tree.getNodes(), unlockedIds)`). Böylece tanım
   * listesini ayrıca elde tutmak gerekmez.
   */
  getNodes(): readonly SkillNodeDefinition[] {
    return this.nodes;
  }

  /**
   * Yakınlaştırma/kaydırmayı başlangıç durumuna, kısa bir geçiş
   * animasyonuyla sıfırlar (zoomable:true iken anlamlıdır) — anlık
   * sıçrama yerine kullanıcı "geri toparlanma" hareketini hisseder.
   */
  resetView(announce = false): void {
    this.canvas.classList.add('vol-skill-tree__canvas--resetting');
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.applyTransform();
    if (announce) this.announceZoom();
    this.trackTimeout(() => {
      this.canvas.classList.remove('vol-skill-tree__canvas--resetting');
    }, RESET_VIEW_TRANSITION_MS);
  }

  destroy(): void {
    this.destroyed = true;
    for (const id of this.pendingTimers) window.clearTimeout(id);
    this.pendingTimers.clear();
    for (const id of this.pendingFrames) cancelAnimationFrame(id);
    this.pendingFrames.clear();
    this.scope.dispose();
    i18next.off('languageChanged', this.onLanguageChanged);
    for (const button of Object.values(this.viewControls ?? {})) button.destroy();
    for (const tooltip of this.tooltips.values()) tooltip.destroy();
    this.element.remove();
  }

  /** destroy() sonrası calismayan, handle'i takip edilen setTimeout. */
  private trackTimeout(fn: () => void, delayMs: number): void {
    const id = window.setTimeout(() => {
      this.pendingTimers.delete(id);
      if (!this.destroyed) fn();
    }, delayMs);
    this.pendingTimers.add(id);
  }

  /** destroy() sonrası calismayan, handle'i takip edilen requestAnimationFrame. */
  private trackFrame(fn: () => void): void {
    const id = requestAnimationFrame(() => {
      this.pendingFrames.delete(id);
      if (!this.destroyed) fn();
    });
    this.pendingFrames.add(id);
  }

  private getState(node: SkillNodeDefinition): SkillNodeState {
    return this.states[node.id] ?? 'locked';
  }

  private buildNode(node: SkillNodeDefinition): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'vol-skill-tree__node';
    button.dataset.nodeId = node.id;
    button.tabIndex = -1;
    if (node.branch) button.classList.add(`vol-skill-tree__node--branch-${node.branch}`);

    const label = document.createElement('span');
    label.className = 'vol-skill-tree__node-label';
    label.textContent = node.label;
    button.appendChild(label);

    // Animasyon class'ları (pulse/become-available) bittiklerinde DOM'dan
    // temizlenir — CSS'in animation-fill-mode olmadan zaten görsel bir
    // etkisi kalmaz, ama class'ı kalıcı bırakmak ileride biri bu class'a
    // statik bir stil eklerse (ör. kalıcı bir vurgu rengi) beklenmedik bir
    // yan etki yaratır. onanimationend güvenlidir: yalnızca gerçek bir CSS
    // animasyonu bittiğinde tetiklenir.
    const onAnimationEnd = (event: AnimationEvent): void => {
      if (event.animationName === 'vol-skill-tree-unlock-pulse') {
        button.classList.remove('vol-skill-tree__node--unlock-pulse');
      } else if (event.animationName === 'vol-skill-tree-become-available') {
        button.classList.remove('vol-skill-tree__node--become-available');
      }
    };
    button.addEventListener('animationend', onAnimationEnd);
    this.scope.add({ dispose: () => button.removeEventListener('animationend', onAnimationEnd) });

    const onClick = (event: MouseEvent): void => this.handleNodeClick(node, event);
    button.addEventListener('click', onClick);
    this.scope.add({ dispose: () => button.removeEventListener('click', onClick) });

    // Önkoşulu olan düğüm de balon taşır: kilitliyken NEDEN kilitli olduğu (hangi önkoşul eksik) orada söylenir. Ağaç yukarıdan
    // aşağıya akar (önkoşullar üstte): balon ALTTA açılır ki adını verdiği önkoşul düğümünü örtmesin.
    if (this.showTooltips && (node.description || node.cost?.length || node.requires?.length)) {
      const tooltip = new RichTooltip(button, this.tooltipContent(node), {
        container: this.tooltipContainer,
        placement: 'bottom',
      });
      this.tooltips.set(node.id, tooltip);
    }

    this.nodeElements.set(node.id, button);
    return button;
  }

  /**
   * Her satırı (aynı y) bağımsız olarak yerleştirir: düğümler önce x
   * sırasına göre dizilir, her düğümün genişliği kendi etiketinin
   * `measureLabelWidth()` ile ölçülen genişliğinden hesaplanır (MIN_NODE_WIDTH
   * altına düşmez — DOM'a bağlı olmayı gerektirmeyen canvas tabanlı ölçüm,
   * bkz. dosya başındaki fonksiyon yorumu), sonra soldan sağa gidilerek bir
   * öncekiyle çakışma varsa (MIN_NODE_GAP payı dahil) düğüm sağa itilir.
   * Satırın toplam genişliği çıkarıldıktan sonra tüm satır, en geniş satıra
   * göre ortalanacak şekilde kaydırılır — böylece dar bir satır (ör. tek
   * kök düğüm) geniş bir satırın (ör. 3 dallı orta kat) TAM ORTASINDA
   * durur, sola yaslanmaz.
   */
  private recomputeLayout(): void {
    const rows = new Map<number, SkillNodeDefinition[]>();
    for (const node of this.nodes) {
      const row = rows.get(node.y) ?? [];
      row.push(node);
      rows.set(node.y, row);
    }

    const rowWidths = new Map<number, number>();
    const rowPositions = new Map<number, Map<string, { left: number; width: number }>>();

    for (const [y, rowNodes] of rows) {
      const sorted = [...rowNodes].sort((a, b) => a.x - b.x);
      const positions = new Map<string, { left: number; width: number }>();

      let cursor = 0;
      for (const node of sorted) {
        const measuredWidth = measureLabelWidth(node.label);
        const width = Math.max(MIN_NODE_WIDTH, measuredWidth + NODE_PADDING_X);

        // Node'un "doğal" konumu, grid x koordinatının cellSize katıdır —
        // çakışma olmadığı sürece bu değer kullanılır (öngörülebilir
        // aralıklarla dizilmiş bir ağaç görünümü). Çakışma varsa (bir
        // önceki düğüm + payı bu noktayı geçiyorsa) sağa itilir.
        const naturalLeft = node.x * this.cellSize;
        const left = Math.max(naturalLeft, cursor);

        positions.set(node.id, { left, width });
        cursor = left + width + MIN_NODE_GAP;
      }

      const rowWidth = cursor > 0 ? cursor - MIN_NODE_GAP : 0;
      rowWidths.set(y, rowWidth);
      rowPositions.set(y, positions);
    }

    const maxRowWidth = Math.max(0, ...rowWidths.values());
    const layout = new Map<string, NodeLayout>();

    for (const [y, positions] of rowPositions) {
      const rowWidth = rowWidths.get(y) ?? 0;
      const offsetX = (maxRowWidth - rowWidth) / 2;
      for (const [id, pos] of positions) {
        layout.set(id, {
          centerX: offsetX + pos.left + pos.width / 2,
          centerY: y * this.cellSize + this.cellSize / 2,
          width: pos.width,
        });
      }
    }

    this.layout = layout;

    const maxY = Math.max(0, ...this.nodes.map((n) => n.y));
    this.canvas.style.width = `${maxRowWidth}px`;
    this.canvas.style.height = `${(maxY + 1) * this.cellSize}px`;
    this.svg.setAttribute('width', String(maxRowWidth));
    this.svg.setAttribute('height', String((maxY + 1) * this.cellSize));

    for (const node of this.nodes) {
      const button = this.nodeElements.get(node.id);
      const pos = layout.get(node.id);
      if (!button || !pos) continue;
      button.style.left = `${pos.centerX}px`;
      button.style.top = `${pos.centerY}px`;
      button.style.width = `${pos.width}px`;
    }
  }

  /**
   * Etkinleştirmeyi NİYET olarak bildirir (fare, dokunma, klavye, kol A: tek `press` niyeti). KİLİTLİ düğüm eylem değildir:
   * `onNodeClick` çağrılmaz, nedeni balonla gösterilir (dokunma/klavye/kol için "neden kilitli" yolu) ve `reject` yayılır.
   * Kararı çağıran verir ve sonucu `setStates()` ile geri yazar.
   */
  private handleNodeClick(node: SkillNodeDefinition, event: Event): void {
    const state = this.getState(node);
    const button = this.nodeElements.get(node.id);
    if (state === 'locked' || !button) {
      emitUiIntent({ kind: 'reject', origin: 'SkillTree', target: this.element, event });
      this.tooltips.get(node.id)?.show();
      return;
    }
    emitUiIntent({
      kind: 'press',
      origin: 'SkillTree',
      target: button,
      event,
      defaultHaptic: 'tap',
    });
    this.onNodeClickHandler?.(node.id, state);
  }

  /** Balon içeriği: ad, açıklama, maliyet ve (kilitliyse) eksik önkoşulları söyleyen not. */
  private tooltipContent(node: SkillNodeDefinition): {
    title: string;
    description?: string;
    stats?: { label: string; value: string }[];
    note?: string;
  } {
    const missing =
      this.getState(node) === 'locked'
        ? (node.requires ?? [])
            .filter((id) => this.states[id] !== 'unlocked')
            .map((id) => this.nodes.find((candidate) => candidate.id === id)?.label ?? id)
        : [];
    return {
      title: node.label,
      description: node.description,
      stats: node.cost?.map((c) => ({ label: c.label, value: String(c.amount) })),
      note:
        missing.length > 0
          ? i18next.t('core:skillTree.requires', { names: missing.join(', ') })
          : undefined,
    };
  }

  /** Durumun okuyucu sözcüğü (kilitli/açılabilir/açık): ad renge değil metne dayanır. */
  private stateWord(state: SkillNodeState): string {
    if (state === 'unlocked') return i18next.t('core:skillTree.unlocked');
    if (state === 'available') return i18next.t('core:skillTree.available');
    return i18next.t('core:skillTree.locked');
  }

  private renderConnections(): void {
    this.svg.replaceChildren();

    for (const node of this.nodes) {
      for (const reqId of node.requires ?? []) {
        // layout yalnızca tanımlı düğümler için doldurulur; ayrıca nodes.find()
        // ile aramak aynı kontrolü O(n) maliyetle tekrarlardı.
        const fromPos = this.layout.get(reqId);
        const toPos = this.layout.get(node.id);
        if (!fromPos || !toPos) continue;

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(fromPos.centerX));
        line.setAttribute('y1', String(fromPos.centerY));
        line.setAttribute('x2', String(toPos.centerX));
        line.setAttribute('y2', String(toPos.centerY));
        line.setAttribute('class', 'vol-skill-tree__connection');
        if (node.branch) line.classList.add(`vol-skill-tree__connection--branch-${node.branch}`);
        line.dataset.from = reqId;
        line.dataset.to = node.id;
        this.svg.appendChild(line);
      }
    }
  }

  /**
   * Düğüm durumlarını (locked/available/unlocked) ve bağlantı çizgilerini
   * günceller. `animateId` verilirse (bir unlock sonrası çağrıldığında) o
   * düğüm bir "pulse" animasyonu oynatır ve YALNIZCA o düğüme bağlı
   * bağlantı çizgileri, kaynaktan hedefe doğru "dolarak" aktifleşir
   * (stroke-dasharray/dashoffset ile) — diğer tüm çizgiler anında güncellenir,
   * çünkü onlar bu etkileşimin parçası değildir; her satır geçişinde TÜM
   * ağacı yeniden animasyonlamak gürültülü ve yavaş hissettirirdi.
   */
  private renderStates(animate: boolean, animateId?: string): void {
    for (const node of this.nodes) {
      const state = this.getState(node);
      const button = this.nodeElements.get(node.id);
      if (button) {
        const wasLocked = button.classList.contains('vol-skill-tree__node--locked');
        button.classList.remove(
          'vol-skill-tree__node--unlocked',
          'vol-skill-tree__node--available',
          'vol-skill-tree__node--locked',
        );
        button.classList.add(`vol-skill-tree__node--${state}`);
        // Kilitli düğüm `disabled` DEĞİLDİR: odaklanabilir kalır, böylece klavye/kol/dokunma "neden kilitli"yi öğrenebilir.
        // Durum okuyucuya adın parçası olarak söylenir (renk/opaklık tek taşıyıcı olmaz).
        const word = this.stateWord(state);
        const name = `${node.label}, ${word}`;
        if (button.getAttribute('aria-label') !== name) button.setAttribute('aria-label', name);
        const locked = String(state === 'locked');
        if (button.getAttribute('aria-disabled') !== locked)
          button.setAttribute('aria-disabled', locked);
        this.tooltips.get(node.id)?.setContent(this.tooltipContent(node));

        if (animate && node.id === animateId && state === 'unlocked') {
          button.classList.remove('vol-skill-tree__node--unlock-pulse');
          // Aynı class'ı arka arkaya eklemek (reflow olmadan) animasyonu
          // yeniden tetiklemez — void offsetWidth okuması tarayıcıyı stil
          // hesaplamaya zorlayıp class'ın "yeniden eklenmiş" sayılmasını sağlar.
          void button.offsetWidth;
          button.classList.add('vol-skill-tree__node--unlock-pulse');
        } else if (animate && wasLocked && state === 'available') {
          button.classList.remove('vol-skill-tree__node--become-available');
          void button.offsetWidth;
          button.classList.add('vol-skill-tree__node--become-available');
        }
      }
    }
    // Hiçbir düğüm henüz odaklanmadıysa Tab durağı "ilk açılabilir düğüm"dür: durum değişince yeniden seçilir.
    this.applyRovingTabindex();

    const lines = this.svg.querySelectorAll<SVGLineElement>('.vol-skill-tree__connection');
    lines.forEach((line) => {
      const fromUnlocked = this.states[line.dataset.from ?? ''] === 'unlocked';
      const toUnlocked = this.states[line.dataset.to ?? ''] === 'unlocked';
      const nowActive = fromUnlocked && toUnlocked;
      const wasActive = line.classList.contains('vol-skill-tree__connection--active');

      if (animate && nowActive && !wasActive && line.dataset.to === animateId) {
        this.animateConnectionFill(line);
      } else {
        line.classList.toggle('vol-skill-tree__connection--active', nowActive);
      }
    });
  }

  /** Bir bağlantı çizgisini kaynaktan hedefe doğru "dolarak" aktif hale getirir (stroke-dasharray = uzunluk, dashoffset uzunluktan 0'a animasyonlanır). */
  private animateConnectionFill(line: SVGLineElement): void {
    // Hareket azaltmada dolum animasyonu yok: bağlantı doğrudan son durumda (aktif) görünür.
    if (prefersReducedMotion()) {
      line.classList.add('vol-skill-tree__connection--active');
      return;
    }
    const length = Math.hypot(
      Number(line.getAttribute('x2')) - Number(line.getAttribute('x1')),
      Number(line.getAttribute('y2')) - Number(line.getAttribute('y1')),
    );
    line.style.strokeDasharray = `${length}`;
    line.style.strokeDashoffset = `${length}`;
    line.classList.add('vol-skill-tree__connection--active', 'vol-skill-tree__connection--filling');
    // Tarayıcının dashoffset:length durumunu boyamasını bekleyip (ilk kare)
    // sonra 0'a animasyonlamak gerekir — aksi halde başlangıç ve bitiş
    // değerleri aynı karede uygulanır, geçiş hiç görünmez.
    this.trackFrame(() => {
      this.trackFrame(() => {
        line.style.strokeDashoffset = '0';
      });
    });
    this.trackTimeout(() => {
      line.classList.remove('vol-skill-tree__connection--filling');
      line.style.strokeDasharray = '';
      line.style.strokeDashoffset = '';
    }, CONNECTION_FILL_MS);
  }

  /**
   * zoomable:true iken tekerlek ile yakınlaştırma, sürükleyerek kaydırma (pan) ve klavye eşdeğerini kurar. Tek yol
   * değildir: görünüm denetim düğmeleri (`buildViewControls`) ve düğüm klavyesi aynı `setZoom`/`panBy`i çağırır.
   */
  private setupZoomPan(): void {
    // Görünümün kendisi odaklanabilir: `+`/`-`/`0`/`Home`/oklar (UI-10.4 ortak eşlemesi) yakınlaştırır/kaydırır.
    this.viewport.tabIndex = 0;
    this.viewport.setAttribute('role', 'group');
    this.viewport.setAttribute('aria-keyshortcuts', VIEWPORT_SHORTCUTS);

    const onViewportKey = (event: KeyboardEvent): void => {
      if (!isViewportKeyTarget(event, this.viewport)) return;
      const action = viewportKeyAction(event);
      if (!action) return;
      event.preventDefault();
      if (action.kind === 'zoom') this.setZoom(this.zoom + action.direction * ZOOM_STEP, true);
      else if (action.kind === 'pan') this.panBy(-action.x * PAN_STEP, -action.y * PAN_STEP);
      else this.resetView(true);
    };
    this.scope.addListener(this.viewport, 'keydown', onViewportKey as EventListener);

    const onWheel = (event: WheelEvent): void => {
      const delta = event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom + delta));
      // Sınırda tekerlek sayfayı kaydırmaya devam eder (kaydırma tuzağı yok); yalnız gerçek yakınlaştırma yutulur.
      if (next === this.zoom) return;
      event.preventDefault();
      this.zoom = next;
      this.clampPan();
      this.applyTransform();
    };
    this.viewport.addEventListener('wheel', onWheel, { passive: false });
    this.scope.add({ dispose: () => this.viewport.removeEventListener('wheel', onWheel) });

    const endPan = (event: PointerEvent): void => {
      if (this.panPointerId === null || event.pointerId !== this.panPointerId) return;
      this.panPointerId = null;
      this.isPanning = false;
      if (this.viewport.hasPointerCapture?.(event.pointerId)) {
        this.viewport.releasePointerCapture(event.pointerId);
      }
      this.viewport.classList.remove('vol-skill-tree__viewport--panning');
    };
    const onPointerDown = (event: PointerEvent): void => {
      // Düğüm butonlarının tıklamasıyla çakışmasın diye yalnızca boş viewport/canvas alanına basılınca pan başlar.
      if (
        (event.target as HTMLElement).closest('.vol-skill-tree__node, .vol-skill-tree__controls')
      ) {
        return;
      }
      // Tek sahip: ilk birincil işaretçi; ikinci parmak ya da fare düğmesi (sol dışı) panı devralmaz.
      if (this.panPointerId !== null || event.isPrimary === false) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      this.panPointerId = event.pointerId;
      this.isPanning = true;
      this.panStartX = event.clientX - this.panX;
      this.panStartY = event.clientY - this.panY;
      this.viewport.setPointerCapture(event.pointerId);
      this.viewport.classList.add('vol-skill-tree__viewport--panning');
    };
    const onPointerMove = (event: PointerEvent): void => {
      if (!this.isPanning || event.pointerId !== this.panPointerId) return;
      this.panX = event.clientX - this.panStartX;
      this.panY = event.clientY - this.panStartY;
      this.clampPan();
      this.applyTransform();
    };

    this.viewport.addEventListener('pointerdown', onPointerDown);
    this.viewport.addEventListener('pointermove', onPointerMove);
    this.viewport.addEventListener('pointerup', endPan);
    this.viewport.addEventListener('pointercancel', endPan);
    this.scope.add({
      dispose: () => {
        this.viewport.removeEventListener('pointerdown', onPointerDown);
        this.viewport.removeEventListener('pointermove', onPointerMove);
        this.viewport.removeEventListener('pointerup', endPan);
        this.viewport.removeEventListener('pointercancel', endPan);
      },
    });
  }

  /**
   * Görünüm denetim düğmeleri (+, −, sıfırla) ve yakınlaştırma düzeyini söyleyen canlı bölge. `IconButton` kullanılır:
   * dokunmatikte 44 px hedef tabanı, tek `press` niyeti ve odak halkası ortak sözleşmeden gelir.
   */
  private buildViewControls(): void {
    const controls = document.createElement('div');
    controls.className = 'vol-skill-tree__controls';
    controls.setAttribute('role', 'group');

    const make = (icon: 'plus' | 'minus' | 'refresh', run: () => void): IconButton => {
      const button = new IconButton(new Icon({ name: icon, size: 14 }).element, {
        size: 'sm',
        label: '',
        onClick: run,
      });
      button.element.classList.add('vol-skill-tree__control');
      controls.appendChild(button.element);
      return button;
    };
    this.viewControls = {
      zoomIn: make('plus', () => this.setZoom(this.zoom + ZOOM_STEP, true)),
      zoomOut: make('minus', () => this.setZoom(this.zoom - ZOOM_STEP, true)),
      reset: make('refresh', () => this.resetView(true)),
    };
    this.element.appendChild(controls);
    this.controlsElement = controls;

    const status = document.createElement('div');
    status.className = 'vol-sr-only';
    status.setAttribute('role', 'status');
    this.element.appendChild(status);
    this.zoomStatus = status;
    this.labelViewControls();
    this.updateViewControls();
  }

  /** Düğme/grup/görünüm adları çeviriden; dil değişince yenilenir. */
  private labelViewControls(): void {
    this.viewport.setAttribute('aria-label', i18next.t('core:skillTree.view'));
    this.controlsElement?.setAttribute('aria-label', i18next.t('core:skillTree.controls'));
    this.viewControls?.zoomIn.setLabel(i18next.t('core:skillTree.zoomIn'));
    this.viewControls?.zoomOut.setLabel(i18next.t('core:skillTree.zoomOut'));
    this.viewControls?.reset.setLabel(i18next.t('core:skillTree.resetView'));
  }

  /** Sınırda düğme `disabled` olsaydı odaktaki düğme odağı yitirirdi: yalnız `aria-disabled` ve görünüm değişir. */
  private updateViewControls(): void {
    this.viewControls?.zoomIn.element.setAttribute('aria-disabled', String(this.zoom >= MAX_ZOOM));
    this.viewControls?.zoomOut.element.setAttribute('aria-disabled', String(this.zoom <= MIN_ZOOM));
  }

  /** Yakınlaştırmayı sınırlar içinde ayarlar; `announce` yalnız kullanıcı eyleminde (düğme/klavye) okuyucuya söyler. */
  private setZoom(value: number, announce: boolean): void {
    const next = Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)) * 100) / 100;
    if (next === this.zoom) return;
    this.zoom = next;
    this.clampPan();
    this.applyTransform();
    if (announce) this.announceZoom();
  }

  private panBy(dx: number, dy: number): void {
    this.panX += dx;
    this.panY += dy;
    this.clampPan();
    this.applyTransform();
  }

  private announceZoom(): void {
    if (this.zoomStatus) {
      this.zoomStatus.textContent = i18next.t('core:skillTree.zoomLevel', {
        percent: Math.round(this.zoom * 100),
      });
    }
  }

  /**
   * Ağacı tamamen görünümün dışına itmeyi engeller: en az `PAN_VISIBLE_MARGIN` piksel görünür kalır. Yerleşim yoksa
   * (görünüm sıfır boyutlu: ölçüm dışı/gizli) sınır uygulanmaz.
   */
  private clampPan(): void {
    const view = this.viewport.getBoundingClientRect();
    if (view.width === 0 || view.height === 0) return;
    const width = parseFloat(this.canvas.style.width) || 0;
    const height = parseFloat(this.canvas.style.height) || 0;
    // Tuval yatayda ortalı (merkez sabit), dikeyde üstten ölçeklenir (`transform-origin: 50% 0`).
    const limitX = view.width / 2 + (width * this.zoom) / 2 - PAN_VISIBLE_MARGIN;
    this.panX = Math.min(limitX, Math.max(-limitX, this.panX));
    this.panY = Math.min(
      view.height - PAN_VISIBLE_MARGIN,
      Math.max(PAN_VISIBLE_MARGIN - height * this.zoom, this.panY),
    );
  }

  /** Odaklanan düğüm görünümün dışındaysa görünüm onu içeri alacak kadar kaydırılır (klavye/kol gezinmesi düğümü kaybetmez). */
  private ensureVisible(id: string): void {
    if (!this.zoomable) return;
    const button = this.nodeElements.get(id);
    const view = this.viewport.getBoundingClientRect();
    if (!button || view.width === 0 || view.height === 0) return;
    const rect = button.getBoundingClientRect();
    const shift = (start: number, end: number, from: number, to: number): number => {
      if (start < from + FOCUS_MARGIN) return from + FOCUS_MARGIN - start;
      if (end > to - FOCUS_MARGIN) return to - FOCUS_MARGIN - end;
      return 0;
    };
    const dx = shift(rect.left, rect.right, view.left, view.right);
    const dy = shift(rect.top, rect.bottom, view.top, view.bottom);
    if (dx !== 0 || dy !== 0) this.panBy(dx, dy);
  }

  /** Tek düğüm `tabindex=0` alır: son odaklanan, yoksa ilk açılabilir, o da yoksa ilk düğüm. */
  private applyRovingTabindex(): void {
    const fallback =
      this.nodes.find((node) => this.getState(node) === 'available') ?? this.nodes[0];
    const active =
      this.activeNodeId !== null && this.nodeElements.has(this.activeNodeId)
        ? this.activeNodeId
        : fallback?.id;
    for (const [id, button] of this.nodeElements) button.tabIndex = id === active ? 0 : -1;
  }

  /**
   * Düğüm klavyesi: oklar GÖRÜNEN yerleşimde en yakın düğüme gider (serbest 2B ağ; DOM sırası anlamsızdır), Home/End ilk/son.
   * Yakınlaştırılabilir ağaçta `+`/`-`/`0` yakınlaştırır, Shift+ok görünümü kaydırır. Etkinleştirme (Enter/Space/kol A)
   * yerel düğme tıklamasıdır.
   */
  private onNodeKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const current = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
      '.vol-skill-tree__node',
    );
    const id = current?.dataset.nodeId;
    if (!current || id === undefined) return;

    if (this.zoomable) {
      const action = viewportKeyAction(event);
      if (action?.kind === 'zoom' || (action?.kind === 'reset' && event.key === '0')) {
        event.preventDefault();
        if (action.kind === 'zoom') this.setZoom(this.zoom + action.direction * ZOOM_STEP, true);
        else this.resetView(true);
        return;
      }
      if (action?.kind === 'pan' && event.shiftKey) {
        event.preventDefault();
        this.panBy(-action.x * PAN_STEP, -action.y * PAN_STEP);
        return;
      }
    }

    let next: string | null = null;
    if (event.key === 'Home') next = this.nodes[0]?.id ?? null;
    else if (event.key === 'End') next = this.nodes[this.nodes.length - 1]?.id ?? null;
    else {
      const direction: NavDirection | null =
        event.key === 'ArrowRight'
          ? 'right'
          : event.key === 'ArrowLeft'
            ? 'left'
            : event.key === 'ArrowDown'
              ? 'down'
              : event.key === 'ArrowUp'
                ? 'up'
                : null;
      if (!direction) return;
      next = this.neighborNode(id, direction);
    }
    // Uçta kalınsa olay yine tüketilir: ok tuşu sayfayı/görünümü kaydırmasın.
    event.preventDefault();
    if (next !== null) this.nodeElements.get(next)?.focus();
  }

  /** Yerleşimdeki (tuval koordinatı) kutulara göre ok yönündeki en yakın düğüm; yoksa `null`. */
  private neighborNode(id: string, direction: NavDirection): string | null {
    const rectOf = (
      key: string,
    ): { x: number; y: number; width: number; height: number } | null => {
      const box = this.layout.get(key);
      return box
        ? {
            x: box.centerX - box.width / 2,
            y: box.centerY - NODE_HEIGHT / 2,
            width: box.width,
            height: NODE_HEIGHT,
          }
        : null;
    };
    const from = rectOf(id);
    if (!from) return null;
    const candidates = this.nodes
      .filter((node) => node.id !== id)
      .flatMap((node) => {
        const rect = rectOf(node.id);
        return rect ? [{ element: node.id, rect }] : [];
      });
    return pickDirectionalTarget(from, candidates, direction);
  }

  private applyTransform(): void {
    this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    this.updateViewControls();
  }
}
