import { Vector2 } from '../math/Vector2';
import { INPUT } from '../constants';

/**
 * Yalnızca yön gerektiren inputları (sağ joystick vb.) normalize eder; çıktı uzunluğu her zaman 0 ya da 1.
 */
export function normalizeDirection(
  v: Vector2,
  // Tipler AÇIKÇA yazılır: `INPUT` bir `as const` nesnesi olduğu için
  // `INPUT.DEAD_ZONE_RATIO`nun tipi `number` değil `0.15` literalidir.
  // Anotasyon olmadan parametre o literale daralır ve "ayarlanabilir"
  // deadzone 0.15 dışında hiçbir değeri kabul etmez.
  deadZone: number = INPUT.DEAD_ZONE_RATIO,
  maxRadius: number = 1.0,
): Vector2 {
  const len = v.length();
  if (len <= 0 || len / maxRadius < deadZone) {
    return Vector2.zero();
  }

  return v.scale(1 / len);
}

/**
 * Hem yön hem büyüklük taşıyan inputları (sol joystick / WASD) 0..1 aralığına çeker;
 * deadZone sonrası büyüklük yeniden 0..1'e eşlenir.
 */
export function normalizeAnalog(
  v: Vector2,
  // bkz. normalizeDirection — literal daralmasını önleyen açık anotasyon.
  deadZone: number = INPUT.DEAD_ZONE_RATIO,
  maxRadius: number = 1.0,
): Vector2 {
  const len = v.length();
  if (len <= 0) {
    return Vector2.zero();
  }

  const ratio = Math.min(len / maxRadius, 1);
  if (ratio < deadZone) {
    return Vector2.zero();
  }

  const magnitude = (ratio - deadZone) / (1 - deadZone);
  return v.scale(magnitude / len);
}

/**
 * Rasterleme (backing store) pikselini, `scrollFactor: 0` bir katmanın ÇİZİM
 * uzayına çevirir — TEK EKSEN.
 *
 * Kamera yakınlaştırması kameranın ORTA NOKTASI etrafında uygulanır, orijini
 * etrafında değil (`Camera.preRender`: `applyITRS(origin, …)` ardından
 * `translate(-scroll - origin)` ve `origin = boyut × 0.5`). Ölçeği yalnız
 * bölmek merkeze olan uzaklığı gözden kaçırır ve sonucu
 * `yarıBoyut × (1 − 1/zoom)` kadar kaydırır: 2.75x bir telefonda ekranın
 * kenarında bu, parmağın yanında doğan bir joystick demektir.
 *
 * Ters dönüşüm: `ekran = (katman − yarıBoyut) × zoom + yarıBoyut + orijin`.
 *
 * @param screen Rasterleme pikseli (ör. `pointer.x`).
 * @param cameraOrigin Kameranın görüntü alanı başlangıcı (`camera.x`/`camera.y`).
 * @param halfSize Kamera görüntü alanının yarısı (`camera.width / 2`).
 * @param zoom Kamera yakınlaştırması; pozitif ve sonlu değilse 1 sayılır.
 */
export function screenToCameraLayer(
  screen: number,
  cameraOrigin: number,
  halfSize: number,
  zoom: number,
): number {
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return (screen - cameraOrigin - halfSize) / scale + halfSize;
}

/**
 * Görüş alanına göre normalize edilmiş dokunma bölgesi. Değerler [0,1]
 * aralığındadır; (0,0) sol üst, (1,1) sağ alttır.
 */
export interface NormalizedInputRegion {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

/**
 * Opsiyonel bölge yapılandırmasını çözer. `undefined` varsayılanı ister;
 * `null` ise stick'i BİLİNÇLİ olarak kapatır ve varsayılana çevrilmemelidir.
 */
export function resolveNormalizedInputRegion(
  region: NormalizedInputRegion | null | undefined,
  fallback: NormalizedInputRegion,
): NormalizedInputRegion | null {
  return region === undefined ? fallback : region;
}

/**
 * Normalize bir noktanın dokunma bölgesinde olup olmadığını söyler.
 *
 * Geçersiz veri sessizce tüm ekranı kabul etmez: NaN/Infinity ya da ters bir
 * aralık, dokunuşu reddeder. Bir config yazım hatasının oyunun bütün ekranını
 * görünmez joystick'e çevirmesi, kontrolün çalışmamasından daha tehlikelidir.
 */
export function isPointInNormalizedRegion(
  x: number,
  y: number,
  region: NormalizedInputRegion,
): boolean {
  const values = [x, y, region.minX, region.maxX, region.minY, region.maxY];
  if (!values.every(Number.isFinite)) return false;
  if (region.minX > region.maxX || region.minY > region.maxY) return false;
  return x >= region.minX && x <= region.maxX && y >= region.minY && y <= region.maxY;
}
