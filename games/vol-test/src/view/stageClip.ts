import type { StageRect } from './Showroom';

/**
 * Sahne bölgesinin kaydırma gövdesinin görünür alanıyla kesişimi. Izgara satırını dolduran sahne
 * görünümden uzun olabilir (kart sütunu uzayan alçak yatay ekran); araç uzun kutunun ortasına değil
 * kullanıcının gördüğü kısmın ortasına oturur. Kesişim yoksa sıfır boyutlu dikdörtgen döner.
 */
export function clipStage(stage: StageRect, clip: StageRect): StageRect {
  const left = Math.max(stage.left, clip.left);
  const top = Math.max(stage.top, clip.top);
  const right = Math.min(stage.left + stage.width, clip.left + clip.width);
  const bottom = Math.min(stage.top + stage.height, clip.top + clip.height);
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}
