/**
 * Equal-power panning: sol/sağ kazançların KARELERİ toplamı sabit kalır, bu
 * yüzden kaynak merkezden kenara giderken algılanan yükseklik düşmez (lineer
 * pan'da merkezde -3 dB'lik çukur oluşur).
 */
export function getPanGains(pan: number): [number, number] {
  const clamped = Math.max(-1, Math.min(1, pan));
  const left = Math.sqrt((1 - clamped) * 0.5);
  const right = Math.sqrt((1 + clamped) * 0.5);
  return [left, right];
}
