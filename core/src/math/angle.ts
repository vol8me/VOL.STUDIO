const TAU = Math.PI * 2;

/** Açıyı (-π, π] aralığına sarar. */
export function wrapAngle(angle: number): number {
  let result = (angle + Math.PI) % TAU;
  if (result < 0) result += TAU;
  result -= Math.PI;
  return result <= -Math.PI ? result + TAU : result;
}

/** `from`dan `to`ya en kısa yönlü açı farkı, (-π, π]. */
export function angleDelta(from: number, to: number): number {
  return wrapAngle(to - from);
}

/** `current`ı `target`a en kısa yoldan en çok `maxStep` kadar döndürür. */
export function rotateTowards(current: number, target: number, maxStep: number): number {
  const delta = angleDelta(current, target);
  if (Math.abs(delta) <= maxStep) return wrapAngle(target);
  return wrapAngle(current + Math.sign(delta) * maxStep);
}

/** İki açı arasında en kısa yoldan ara değer. */
export function lerpAngle(from: number, to: number, t: number): number {
  return wrapAngle(from + angleDelta(from, to) * t);
}
