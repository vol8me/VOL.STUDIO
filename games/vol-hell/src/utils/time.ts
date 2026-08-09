/**
 * Milisaniyeyi "m:ss" formatına çevirir.
 * Örnek: 65000 -> "1:05", 123000 -> "2:03".
 */
export function formatTimeMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
