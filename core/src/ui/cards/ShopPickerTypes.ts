import type { CardPickerOptions } from './CardPicker';
import type { CardTile, CardTileData } from './CardTile';

/**
 * `ShopPicker`ın VERİ SÖZLEŞMESİ — tüketicinin gördüğü yüzey.
 *
 * Dosya, `ShopPicker.ts` anti-borç sınırını (~600 satır) aştığı için ayrıldı.
 * Ayrım keyfî değil: burada oyunun panele NE anlattığı yaşar; `ShopPicker.ts`
 * o veriyi DOM'a nasıl çevirdiğini bilir. Bir oyun bu dosyayı okuyarak paneli
 * beslemeyi öğrenir, render stratejisine hiç bakmak zorunda kalmaz.
 */
/** Dükkanda satılan bir kart ve o anki alım durumu. */
export interface ShopOffer {
  card: CardTileData;
  /** Bu dükkan ziyaretinde satın alındı mı? */
  purchased: boolean;
  /** Bakiye yetiyor mu? */
  affordable: boolean;
  /**
   * Kilitli mi — yalnızca `ShopPickerOptions.lock` verildiyse anlamlı.
   * Kilit MANTIĞI (hangi tekliflerin reroll'da korunacağı) burada değil,
   * çağırandan yaşar; bu alan yalnızca o kararın görsel yansımasıdır.
   */
  locked?: boolean;
}

/** Oyuncunun geri satabileceği kart. */
export interface ShopInventoryEntry {
  /** Kart ÖRNEĞİNİN kimliği — aynı karttan birden fazla olabilir. */
  instanceId: string;
  card: CardTileData;
  /** Satış butonunun metni (örn. "SAT +5"). */
  sellLabel: string;
  /**
   * Verilirse kartta ikinci bir buton çıkar (örn. "TAK"). Sürükle-bırak her
   * girdi yönteminde çalışmaz; aynı işi yapan açık bir buton şart.
   */
  equipLabel?: string;
  /**
   * Verilirse kart sürüklenebilir olur ve bırakma hedefine bu değer taşınır
   * (yetenek kartlarını slota atamak için).
   */
  dragData?: string;
}

/** Reroll butonunun o anki durumu — yalnızca `ShopPickerOptions.reroll` verildiyse anlamlı. */
export interface ShopPickerRerollState {
  /** Maliyet satırı (örn. "5 Flux"). `priceLabel` ile aynı biçimde. */
  costLabel: string;
  /** Bakiye reroll'u karşılıyor mu? */
  affordable: boolean;
}

export interface ShopPickerState {
  offers: readonly ShopOffer[];
  /** Pasif etkiler — slot gerektirmeyen buff/takas kartları. */
  passives: readonly ShopInventoryEntry[];
  /** Yetenek kartları — slota atanabilirler. */
  abilities: readonly ShopInventoryEntry[];
  /** Bakiye satırı (örn. "Flux: 42"). */
  balanceLabel: string;
  title?: string;
  hint?: string;
  /** Verilirse (ve `reroll` option'ı açıksa) reroll butonu bu bilgiyle güncellenir. */
  reroll?: ShopPickerRerollState;
  /**
   * Bu render'ın NİYETİ. Panel bunu tahmin ETMEZ, çağıran söyler.
   *
   * - `'reroll'`: teklifler yeniden çekildi; kilitli olmayanlar yenilenir.
   * - `'refresh'` (varsayılan): bakiye/satın alma durumu değişti, kartlar yerinde güncellenir.
   */
  transition?: 'reroll' | 'refresh';
  /** Bakiye değişiminin yönü; shop bunu tahmin etmez, çağıran bildirir. */
  balanceChange?: 'increase' | 'decrease';
}

export interface ShopPickerLabels {
  /** Satın alma butonunun metni. */
  buy: string;
  /** Satın alınmış kartın durum metni. */
  owned: string;
  /** Bakiye yetmediğinde gösterilen durum metni. */
  tooExpensive: string;
  /** Yetenek kartları bölümünün başlığı. */
  abilitiesTitle: string;
  /** Pasif kartlar bölümünün başlığı. */
  passivesTitle: string;
  /** Bölüm boşken gösterilen metin. */
  empty: string;
  /** Kapatma butonunun metni. */
  close: string;
}

/**
 * Reroll — teklifi yeniler. OPSİYONELDİR: verilmezse buton hiç render
 * edilmez (geriye uyumlu — mevcut tüketiciler değişiklik yapmadan çalışmaya
 * devam eder). Maliyet/uygunluk hesabı, HANGİ kartların yeniden çekileceği
 * ve kilitli tekliflerin korunması ÇAĞIRANIN sorumluluğudur — `ShopPicker`
 * bir kart havuzu ya da RNG bilmez, yalnızca butonu çizer ve tıklamayı
 * `onReroll` ile bildirir (bkz. `onBuy`/`onSell` ile aynı desen).
 */
export interface ShopPickerRerollOptions {
  /** Buton metni (örn. "YENİDEN ÇEVİR"). Maliyet `render()`'da eklenir. */
  label: string;
  onReroll: () => void;
}

/**
 * Kilit — bir teklifin reroll'da korunmasını işaretlemek için. OPSİYONELDİR:
 * verilmezse kartlarda kilit butonu hiç çıkmaz. Kilitli tekliflerin reroll
 * sırasında gerçekten korunması ÇAĞIRANIN sorumluluğudur (bkz. yukarıdaki
 * `ShopPickerRerollOptions` notu) — `ShopPicker` yalnızca durumu görsel
 * olarak yansıtır (`ShopOffer.locked`) ve tıklamayı `onToggle` ile bildirir.
 */
export interface ShopPickerLockOptions {
  /** Kilitli değilken gösterilen buton metni (örn. "KİLİTLE"). */
  lockLabel: string;
  /** Kilitliyken gösterilen buton metni (örn. "KİLİDİ AÇ"). */
  unlockLabel: string;
  onToggle: (cardId: string) => void;
}

export interface ShopPickerOptions extends CardPickerOptions {
  labels: ShopPickerLabels;
  onBuy: (cardId: string) => void;
  onSell: (instanceId: string) => void;
  /** Kartın ikinci butonu (örn. "TAK") tıklandığında. */
  onEquip?: (instanceId: string) => void;
  onClose: () => void;
  reroll?: ShopPickerRerollOptions;
  lock?: ShopPickerLockOptions;
}

/** Bir liste bölümünün (envanter) kalıcı DOM iskeleti — başlık + kart listesi + boş-durum metni. */
export interface ShopSection {
  section: HTMLDivElement;
  list: HTMLDivElement;
  empty: HTMLDivElement;
}

export interface LeavingTile {
  tile: CardTile;
  timeout: ReturnType<typeof setTimeout>;
}

/** Bir teklif kartının panel tarafındaki tüm durumu. */
export interface OfferEntry {
  tile: CardTile;
  /** Son render'da satın alınmış mıydı — "yeni alındı" vurgusunu tetiklemek için. */
  purchased: boolean;
}
