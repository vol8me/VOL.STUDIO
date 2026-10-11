import { UI_SIZE } from '../../constants';

export type ArrowScrollAxis = 'vertical' | 'horizontal';

const STEP_KEYS: Record<ArrowScrollAxis, Readonly<Record<string, 1 | -1>>> = {
  vertical: { ArrowDown: 1, ArrowUp: -1 },
  horizontal: { ArrowRight: 1, ArrowLeft: -1 },
};

/**
 * Odaklanabilir yerel kaydırma yüzeyinin ok tuşu adımı. `FocusNavController` ok tuşlarını uzamsal gezinme için
 * `preventDefault` ile tükettiğinden tarayıcının yerel ok kaydırması bu yüzeylerde çalışmaz; yüzey kendi adımını
 * atar. Tuş yalnız yüzeyin KENDİSİ odaktayken işlenir (içerideki denetim ok tuşlarını kendi işi için kullanır).
 * Kaydırılacak yer kalmadıysa olay iptal edilmez: gezinme yüzeyden dışarı çıkabilir (kaydırma tuzağı yok).
 */
export function scrollByArrowKey(
  element: HTMLElement,
  event: KeyboardEvent,
  axis: ArrowScrollAxis,
): void {
  if (event.target !== element || event.defaultPrevented) return;
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  const sign = STEP_KEYS[axis][event.key];
  if (sign === undefined) return;
  const property = axis === 'vertical' ? 'scrollTop' : 'scrollLeft';
  const before = element[property];
  element[property] = before + sign * UI_SIZE.SCROLL_KEY_STEP_PX;
  if (element[property] !== before) event.preventDefault();
}
