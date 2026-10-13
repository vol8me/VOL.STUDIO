import { PROPS, type PropKind } from './props';

export interface Placement {
  readonly kind: PropKind;
  readonly col: number;
  readonly row: number;
  /** 90°'nin katı. */
  readonly turns: number;
  /** Animasyon faz kayması (sn). */
  readonly phase: number;
}

export interface Layout {
  readonly cols: number;
  readonly rows: number;
  readonly placements: readonly Placement[];
  readonly counts: Readonly<Record<string, number>>;
  /** Boş kalan karo oranı. */
  readonly emptyRatio: number;
}

export interface LayoutOptions {
  readonly cols: number;
  readonly rows: number;
  readonly random: () => number;
  /** Boş zemini dolduran cevher ve duvar yoğunluğu (0..1). */
  readonly fill: number;
}

/**
 * Okunur bir fabrika zemini: ortada çekirdek; aralarında şerit boşluğu olan konveyör hatları, hat
 * başında matkap ve cevher yamaları, hat sonunda dökümhane; kenarlarda taret ve duvar. Tohumludur:
 * aynı girdi aynı yerleşimi verir. Hiçbir yapı bir başkasının karosuna ya da alan dışına taşmaz.
 */
export function layoutFactory(options: LayoutOptions): Layout {
  const { cols, rows, random, fill } = options;
  const taken = new Uint8Array(cols * rows);
  const placements: Placement[] = [];
  const phase = (): number => random() * 3;

  const fits = (kind: PropKind, col: number, row: number): boolean => {
    const [w, h] = PROPS[kind].tiles;
    if (col < 0 || row < 0 || col + w > cols || row + h > rows) return false;
    for (let y = row; y < row + h; y++)
      for (let x = col; x < col + w; x++) if (taken[y * cols + x] === 1) return false;
    return true;
  };
  const put = (kind: PropKind, col: number, row: number, turns = 0): boolean => {
    if (!fits(kind, col, row)) return false;
    const [w, h] = PROPS[kind].tiles;
    for (let y = row; y < row + h; y++) for (let x = col; x < col + w; x++) taken[y * cols + x] = 1;
    placements.push({ kind, col, row, turns, phase: phase() });
    return true;
  };

  // Çekirdek: ortada.
  if (cols >= 9 && rows >= 9) put('core', Math.floor((cols - 3) / 2), Math.floor((rows - 3) / 2));

  // Hatlar: her dördüncü satır; yön rastgele (doğuya ya da batıya). Çekirdek satırlarında hat çekirdeğe dayanır.
  const ores: PropKind[] = ['ore-a', 'ore-b', 'ore-c'];
  for (let row = 3; row < rows - 3; row += 4) {
    const east = random() < 0.5;
    const first = 3;
    const last = cols - 4;
    const head = east ? first : last;
    const tail = east ? last : first;
    const step = east ? 1 : -1;
    const turns = east ? 0 : 2;
    const length = Math.abs(tail - head) + 1;
    for (let index = 1; index < length - 1; index++) {
      const col = head + index * step;
      if (!put('conveyor', col, row, turns)) break; // çekirdeğe çarptı: hat orada biter
    }
    // Hat başı: iki yanda dönüşümlü matkap ve cevher.
    const feeders = 3 + Math.floor(random() * 3);
    for (let index = 0; index < feeders; index++) {
      const col = head + (index + 1) * step;
      for (const dy of [-1, 1]) {
        const kind: PropKind =
          (index + (dy === 1 ? 1 : 0)) % 2 === 0 ? 'drill' : ores[Math.floor(random() * 3)];
        put(kind, col, row + dy);
      }
    }
    put('smelter', tail, row);
    put('wall', tail + step, row);
  }

  // Kenar: duvar halkası (aralıklı) ve taretler.
  for (let col = 0; col < cols; col++) {
    for (const row of [0, rows - 1]) {
      if (col % 5 === 2) put('turret', col, row);
      else put('wall', col, row);
    }
  }
  for (let row = 1; row < rows - 1; row++) {
    for (const col of [0, cols - 1]) {
      if (row % 5 === 2) put('turret', col, row);
      else put('wall', col, row);
    }
  }

  // Boş zemin: seyrek cevher yamaları ve duvar blokları.
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (taken[row * cols + col] === 1) continue;
      const roll = random();
      if (roll < fill * 0.6) put(ores[Math.floor(random() * 3)], col, row);
      else if (roll < fill) put('wall', col, row);
    }
  }

  const counts: Record<string, number> = {};
  for (const placement of placements) counts[placement.kind] = (counts[placement.kind] ?? 0) + 1;
  let used = 0;
  for (const value of taken) used += value;
  return { cols, rows, placements, counts, emptyRatio: 1 - used / (cols * rows) };
}
