/**
 * Bellekte tutulan chunk dokularından düşülecekler: sınırı aşan kısım, görünür olmayanlar arasında en uzun
 * süredir kullanılmayandan başlar. Görünür chunk hiçbir zaman düşmez; hepsi görünürse sınır aşılabilir.
 */
export function evictionOrder(
  lastUsed: ReadonlyMap<number, number>,
  limit: number,
  visible: (chunk: number) => boolean,
): number[] {
  const excess = lastUsed.size - limit;
  if (excess <= 0) return [];
  const candidates: [number, number][] = [];
  for (const [chunk, used] of lastUsed) if (!visible(chunk)) candidates.push([chunk, used]);
  candidates.sort((a, b) => a[1] - b[1]);
  return candidates.slice(0, excess).map(([chunk]) => chunk);
}
