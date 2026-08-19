import { DisposableScope } from '../../lifecycle/DisposableScope';
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
 * Bu kural bir dönem `SkillTree`in İÇİNDE gömülüydü ve bileşen kendi
 * `unlockedIds` defterini tutuyordu — yani CORE, bir oyunun beceri ağacının
 * nasıl açıldığına karar veriyordu ve oyunun kendi ilerleme sistemiyle iki
 * ayrı defter kaçınılmaz olarak kayıyordu.
 *
 * Kural silinmedi, DIŞARI ALINDI: en yaygın davranış hazır durur ve tek
 * satırda kullanılır, ama bileşen onu arkanda varsaymaz. "Önkoşullardan
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
   * tamamen çağıranındır. Karar sonrası `setStates()` çağrılır.
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
   * Varsayılan false (küçük/orta ağaçlarda gereksiz karmaşıklık).
   */
  zoomable?: boolean;
}

/** .vol-skill-tree__canvas--resetting gecisi (hud.css: transform 0.4s) + kare payi. */
const RESET_VIEW_TRANSITION_MS = 420;
/** Baglanti dolum animasyonunun suresi; bittiginde --filling class'i kaldirilir. */
const CONNECTION_FILL_MS = 500;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
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
export const NODE_LABEL_FONT = "600 12px 'Jura', sans-serif";

interface NodeLayout {
  centerX: number;
  centerY: number;
  width: number;
}

let measureCanvasContext: CanvasRenderingContext2D | null = null;

/**
 * Bir etiketin piksel genişliğini, DOM'a bağlı olup olmadığından TAMAMEN
 * BAĞIMSIZ ölçer — önceki tasarım `button.scrollWidth` kullanıyordu, ama
 * bu yalnızca element gerçekten `document`'a mount edilip layout aldıktan
 * SONRA doğru değer döner (bağlı olmayan/henüz mount edilmemiş bir alt
 * ağaçta her zaman 0'dır). SkillTree constructor'ı, kendi elementini
 * tüketicinin DOM'a EKLEMESİNDEN ÖNCE (bir showcase kartı, bir sahne
 * container'ı içine appendChild ile eklenmeden önce) `recomputeLayout()`'u
 * çağırdığı için scrollWidth ölçümü her zaman 0 dönüyordu, tüm düğümler
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
 * Beceri ağacı / teknoloji ağacı görünümü. Temel kullanım minimaldir —
 * yalnızca `nodes` (id, label, x, y, requires) ile basit bir açılabilir
 * düğüm ağı elde edilir. İhtiyaç arttıkça katman katman zenginleştirilebilir:
 * `branch` ile dal renklendirmesi, `cost`/`description` + `showTooltips`
 * ile hover'da maliyet/açıklama kartı, `zoomable` ile büyük ağaçlarda
 * yakınlaştır/kaydır. Hiçbiri zorunlu değildir — geliştirici ihtiyacı
 * kadarını kullanır.
 *
 * Düğümler arası önkoşul bağımlılıkları bağlantı çizgileriyle gösterilir,
 * her düğüm üç durumdan birinde olur: unlocked (açık), available
 * (önkoşulları tamam, açılabilir), locked (önkoşulu eksik, tıklanamaz).
 * Tree'nin hiyerarşik tek-kök listesinden farkı: düğümler serbest 2B
 * yerleşimde durur, birden fazla önkoşula (çoklu bağımlılık/AND) sahip
 * olabilir — RTS teknoloji ağacı, RPG beceri ağacı, otomasyon oyunlarında
 * araştırma ağacı için.
 *
 * Yerleşim: `x`/`y` yalnızca SIRA bildiren grid koordinatlarıdır, piksel
 * değildir. Her satır (aynı `y`) kendi içinde soldan sağa dizilir; her
 * düğümün gerçek genişliği etiket metnine göre otomatik büyür (metin asla
 * kırpılmaz) ve komşu düğümlerle çakışırsa aralarında en az `MIN_NODE_GAP`
 * kalacak şekilde birbirini iter. Tüm ağaç canvas'ın en geniş satırına göre
 * yatayda ortalanır — küçük ağaçlar viewport'ta sola yapışık durmaz.
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
  /** Bekleyen zamanlayici/rAF handle'lari — destroy() hepsini iptal eder. */
  private readonly pendingTimers = new Set<number>();
  private readonly pendingFrames = new Set<number>();
  private destroyed = false;
  private layout = new Map<string, NodeLayout>();
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private isPanning = false;
  private panStartX = 0;
  private panStartY = 0;

  constructor(options: SkillTreeOptions) {
    this.nodes = options.nodes;
    this.cellSize = options.cellSize ?? 120;
    this.onNodeClickHandler = options.onNodeClick;
    this.showTooltips = options.showTooltips ?? false;
    this.zoomable = options.zoomable ?? false;

    this.element = document.createElement('div');
    this.element.className = 'vol-skill-tree';
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
    }

    // Yerleşim hesabı burada senkron yapılır (requestAnimationFrame'e
    // gerek yok) — measureLabelWidth() canvas tabanlı olduğu için elementin
    // DOM'a bağlı olması gerekmez, tüketici bu component'i henüz sayfaya
    // eklemeden önce constructor'ı çağırsa bile doğru genişlikler hesaplanır
    // (önceki scrollWidth tabanlı ölçüm burada her zaman 0 dönüyordu, bkz.
    // measureLabelWidth yorum bloğu).
    this.recomputeLayout();
    this.renderConnections();
    this.renderStates(false);

    this.recomputeWhenFontReady();
  }

  /**
   * measureLabelWidth() 'Jura' metriklerine gore olcum yapar, ama font
   * createVolGame tarafindan asenkron yuklenir. SkillTree font hazir olmadan
   * kurulursa olcumler sistem fontuyla yapilir ve dugum genislikleri kalici
   * olarak yanlis kalir — uzun etiketler kutudan tasar. Font yerlesince tek
   * seferlik yeniden olcum yapilir.
   *
   * Container yeniden boyutlanmasi dinlenmez: recomputeLayout() yalnizca
   * etiket metnine ve cellSize'a bagli, container genisligini hic okumaz.
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
  resetView(): void {
    this.canvas.classList.add('vol-skill-tree__canvas--resetting');
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.applyTransform();
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
    for (const tooltip of this.tooltips.values()) tooltip.destroy();
    this.element.remove();
  }

  /** destroy() sonrasi calismayan, handle'i takip edilen setTimeout. */
  private trackTimeout(fn: () => void, delayMs: number): void {
    const id = window.setTimeout(() => {
      this.pendingTimers.delete(id);
      if (!this.destroyed) fn();
    }, delayMs);
    this.pendingTimers.add(id);
  }

  /** destroy() sonrasi calismayan, handle'i takip edilen requestAnimationFrame. */
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

    const onClick = (): void => this.handleNodeClick(node);
    button.addEventListener('click', onClick);
    this.scope.add({ dispose: () => button.removeEventListener('click', onClick) });

    if (this.showTooltips && (node.description || node.cost?.length)) {
      const tooltip = new RichTooltip(button, {
        title: node.label,
        description: node.description,
        stats: node.cost?.map((c) => ({ label: c.label, value: String(c.amount) })),
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
   * Tıklamayı NİYET olarak bildirir. Kilitli düğüm zaten `disabled` olduğu için
   * buraya ulaşmaz; kararı çağıran verir ve sonucu `setStates()` ile geri yazar.
   */
  private handleNodeClick(node: SkillNodeDefinition): void {
    this.onNodeClickHandler?.(node.id, this.getState(node));
  }

  private renderConnections(): void {
    this.svg.replaceChildren();

    for (const node of this.nodes) {
      for (const reqId of node.requires ?? []) {
        // layout yalnizca tanimli dugumler icin doldurulur; ayrica nodes.find()
        // ile aramak ayni kontrolu O(n) maliyetle tekrarlardi.
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
        button.disabled = state === 'locked';
        button.setAttribute('aria-disabled', String(state === 'locked'));

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

  /** zoomable:true iken tekerlek ile yakınlaştırma, sürükleyerek kaydırma (pan) kurar. */
  private setupZoomPan(): void {
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const delta = event.deltaY > 0 ? -0.1 : 0.1;
      this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom + delta));
      this.applyTransform();
    };
    this.viewport.addEventListener('wheel', onWheel, { passive: false });
    this.scope.add({ dispose: () => this.viewport.removeEventListener('wheel', onWheel) });

    const onPointerDown = (event: PointerEvent): void => {
      // Düğüm butonlarının tıklamasıyla çakışmasın diye yalnızca boş
      // viewport/canvas alanına basılınca pan başlar.
      if ((event.target as HTMLElement).closest('.vol-skill-tree__node')) return;
      this.isPanning = true;
      this.panStartX = event.clientX - this.panX;
      this.panStartY = event.clientY - this.panY;
      this.viewport.setPointerCapture(event.pointerId);
      this.viewport.classList.add('vol-skill-tree__viewport--panning');
    };
    const onPointerMove = (event: PointerEvent): void => {
      if (!this.isPanning) return;
      this.panX = event.clientX - this.panStartX;
      this.panY = event.clientY - this.panStartY;
      this.applyTransform();
    };
    const onPointerUp = (event: PointerEvent): void => {
      this.isPanning = false;
      this.viewport.releasePointerCapture(event.pointerId);
      this.viewport.classList.remove('vol-skill-tree__viewport--panning');
    };

    this.viewport.addEventListener('pointerdown', onPointerDown);
    this.viewport.addEventListener('pointermove', onPointerMove);
    this.viewport.addEventListener('pointerup', onPointerUp);
    this.viewport.addEventListener('pointercancel', onPointerUp);
    this.scope.add({
      dispose: () => {
        this.viewport.removeEventListener('pointerdown', onPointerDown);
        this.viewport.removeEventListener('pointermove', onPointerMove);
        this.viewport.removeEventListener('pointerup', onPointerUp);
        this.viewport.removeEventListener('pointercancel', onPointerUp);
      },
    });
  }

  private applyTransform(): void {
    this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
  }
}
