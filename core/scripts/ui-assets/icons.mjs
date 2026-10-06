import { el, svg } from './svg.mjs';

/**
 * UI ikonları: oyun rig/sprite'ından AYRI, özgün, tek renkli çizgi ikonlar.
 * Her ikon 24×24 ızgarada çizgi (`stroke`) olarak tanımlanır; dört ölçü
 * (16/24/32/48 CSS px) ayrı SPRITE dosyalarıdır ve çizgi kalınlığı ölçüye göre
 * OPTİK olarak ayarlanır (küçük ölçüde ızgara birimi daha kalın), böylece ekran
 * kalınlığı 1,5/2/2,5/3 px olur. Renk `currentColor`dır: satır içi kullanımda
 * metin rengini izler, `mask-image` olarak kullanımda yalnız alfa önemlidir.
 *
 * Erişilebilirlik: ikon tek başına bir eylemse erişilebilir ad tüketicinin
 * sorumluluğudur (ikon-only eylem etiketsiz bırakılamaz); sprite sembolleri
 * `aria-hidden` değil adsızdır, çünkü ad bağlama göre verilir.
 */
export const ICON_SIZES = [16, 24, 32, 48];

/** Ekran kalınlığı (CSS px) → 24'lük ızgarada çizgi kalınlığı (birim). */
export const STROKE_PX = { 16: 1.5, 24: 2, 32: 2.5, 48: 3 };

const strokeUnits = (size) => (STROKE_PX[size] * 24) / size;

/** Ad → çizim öğeleri (24×24 ızgara). Çizgiler `stroke`, kapalı şekiller dolgusuzdur. */
export const ICONS = {
  close: [['path', 'M6 6l12 12M18 6L6 18']],
  check: [['path', 'M5 12.5l4.5 4.5L19 7.5']],
  plus: [['path', 'M12 5v14M5 12h14']],
  minus: [['path', 'M5 12h14']],
  menu: [['path', 'M4 7h16M4 12h16M4 17h16']],
  chevronUp: [['path', 'M6 15l6-6 6 6']],
  chevronDown: [['path', 'M6 9l6 6 6-6']],
  chevronLeft: [['path', 'M15 6l-6 6 6 6']],
  chevronRight: [['path', 'M9 6l6 6-6 6']],
  arrowLeft: [['path', 'M19 12H5M11 6l-6 6 6 6']],
  arrowRight: [['path', 'M5 12h14M13 6l6 6-6 6']],
  search: [
    ['circle', { cx: 10.5, cy: 10.5, r: 6 }],
    ['path', 'M15 15l5 5'],
  ],
  settings: [
    ['path', 'M4 7h10M18 7h2M4 17h2M10 17h10'],
    ['circle', { cx: 16, cy: 7, r: 2 }],
    ['circle', { cx: 8, cy: 17, r: 2 }],
  ],
  warning: [['path', 'M12 4L3 20h18zM12 10v5M12 17.8v.2']],
  info: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['path', 'M12 11v6M12 7.8v.2'],
  ],
  error: [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['path', 'M9 9l6 6M15 9l-6 6'],
  ],
  play: [['path', 'M8 5l11 7-11 7z']],
  pause: [['path', 'M8 5h3v14H8zM13 5h3v14h-3z']],
  stop: [['path', 'M6 6h12v12H6z']],
  lock: [
    ['rect', { x: 5, y: 11, width: 14, height: 9, rx: 2 }],
    ['path', 'M8 11V8a4 4 0 0 1 8 0v3'],
  ],
  unlock: [
    ['rect', { x: 5, y: 11, width: 14, height: 9, rx: 2 }],
    ['path', 'M8 11V8a4 4 0 0 1 7.5-2'],
  ],
  star: [['path', 'M12 3.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z']],
  refresh: [['path', 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5']],
  volume: [
    ['path', 'M4 9.5h3.5L12 6v12l-4.5-3.5H4z'],
    ['path', 'M15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11'],
  ],
  volumeOff: [
    ['path', 'M4 9.5h3.5L12 6v12l-4.5-3.5H4z'],
    ['path', 'M16 9.5l5 5M21 9.5l-5 5'],
  ],
  gamepad: [
    [
      'path',
      'M7 8h10a4 4 0 0 1 3.9 4.9l-.7 3.4a2.3 2.3 0 0 1-4 .9L14.5 15h-5l-1.7 2.2a2.3 2.3 0 0 1-4-.9l-.7-3.4A4 4 0 0 1 7 8z',
    ],
    ['path', 'M8 10.5v3M6.5 12h3M15.5 11v.2M17.5 13v.2'],
  ],
};

export const ICON_NAMES = Object.keys(ICONS);

function drawing([kind, data]) {
  return typeof data === 'string' ? el(kind, { d: data }) : el(kind, data);
}

/**
 * Bir ölçünün sprite'ı: her ikon `<symbol id="ad">`; çizgi stili sembolün kendi
 * sunum niteliklerindedir (`<style>` yok: dış `<use>` kullanımında stil
 * sayfası karşıya geçmeyebilir, nitelikler her zaman geçer).
 */
export function iconSprite(size) {
  const style = {
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': strokeUnits(size),
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  };
  const symbols = ICON_NAMES.map((name) =>
    el('symbol', { id: name, viewBox: '0 0 24 24', ...style }, ICONS[name].map(drawing).join('')),
  ).join('');
  return svg({ width: size, height: size, viewBox: '0 0 24 24' }, symbols);
}
