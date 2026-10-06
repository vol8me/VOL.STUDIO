/**
 * Arayüz "kabuk" ikonları: oyun ikonlarıyla (game-icons.net) aynı 512 ızgarada, kalın
 * yuvarlak uçlu çizgilerle özgün çizilir. Oyun ikonları dolu siluettir; bunlar yön, kapat,
 * onay gibi geometrik işaretlerdir ve aynı ağırlıkta (56/512) durur. Hepsi `currentColor`.
 */
export const CHROME_STROKE = 56;

const circle = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
const path = (d) => `<path d="${d}"/>`;
const dots = (points, r) =>
  points.map(
    ([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`,
  );

/** Dolu şekil: köşeler yuvarlanır (çizgi aynı renkte), böylece çizgi ikonlarla aynı ağırlıkta durur. */
const filled = (d) => `<path fill="currentColor" stroke-width="40" d="${d}"/>`;

/** id → SVG gövdesi (sprite simgesi çizgi öznitelikleriyle sarılır). */
export const CHROME_ICONS = {
  close: path('M136 136L376 376M376 136L136 376'),
  check: path('M120 268L216 364L392 164'),
  plus: path('M256 120V392M120 256H392'),
  minus: path('M120 256H392'),
  menu: path('M120 168H392M120 256H392M120 344H392'),
  more: dots(
    [
      [144, 256],
      [256, 256],
      [368, 256],
    ],
    34,
  ).join(''),
  dot: dots([[256, 256]], 72).join(''),
  play: filled('M176 124L396 256L176 388Z'),
  pause: filled('M158 128H208V384H158Z M304 128H354V384H304Z'),
  stop: filled('M148 148H364V364H148Z'),
  fastForward: filled('M104 132L252 256L104 380Z M260 132L408 256L260 380Z'),
  rewind: filled('M408 132L260 256L408 380Z M252 132L104 256L252 380Z'),
  zoomIn: circle(224, 224, 128) + path('M320 320L416 416') + path('M224 168V280M168 224H280'),
  zoomOut: circle(224, 224, 128) + path('M320 320L416 416') + path('M168 224H280'),
  undo: path('M184 160L112 232L184 304') + path('M120 232H288A108 108 0 0 1 288 448H196'),
  redo: path('M328 160L400 232L328 304') + path('M392 232H224A108 108 0 0 0 224 448H316'),
  chevronUp: path('M144 324L256 212L368 324'),
  chevronDown: path('M144 188L256 300L368 188'),
  chevronLeft: path('M324 144L212 256L324 368'),
  chevronRight: path('M188 144L300 256L188 368'),
  arrowUp: path('M256 400V120M160 216L256 120L352 216'),
  arrowDown: path('M256 112V392M160 296L256 392L352 296'),
  arrowLeft: path('M400 256H120M216 160L120 256L216 352'),
  arrowRight: path('M112 256H392M296 160L392 256L296 352'),
  warning: path('M256 96L432 408H80Z') + path('M256 220V300') + dots([[256, 356]], 26).join(''),
  error: circle(256, 256, 168) + path('M196 196L316 316M316 196L196 316'),
  checkCircle: circle(256, 256, 168) + path('M180 262L238 320L338 200'),
  infoCircle: circle(256, 256, 168) + path('M256 238V334') + dots([[256, 180]], 26).join(''),
  dragHandle: dots(
    [
      [196, 160],
      [316, 160],
      [196, 256],
      [316, 256],
      [196, 352],
      [316, 352],
    ],
    28,
  ).join(''),
  refresh: path('M392 256A136 136 0 1 1 352 160') + path('M352 96V176H432'),
};
