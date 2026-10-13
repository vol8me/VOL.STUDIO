/** Küçük ardışık tohumların ilk çekilişleri birbirine yakın düşer; tohum önce karıştırılır. */
function scramble(seed: number): number {
  let h = ((seed >>> 0) + 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Tohumlu, deterministik rastgele (mulberry32): aynı tohum aynı yerleşimi ve hareketi verir. */
export function seeded(seed: number): () => number {
  let state = scramble(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
