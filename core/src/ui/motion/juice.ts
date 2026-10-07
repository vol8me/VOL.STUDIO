import { MOTION_JUICE, MOTION_PRESETS, MOTION_SAFETY_MARGIN_MS } from './presets';

/** Oyun hissi etkisi: sayı patlaması, vuruş flaşı, sınırlı sarsıntı, panel girişi. */
export const JUICE_KINDS = ['pop', 'flash', 'shake', 'enter'] as const;
export type JuiceKind = (typeof JUICE_KINDS)[number];

const DURATION_MS: Record<JuiceKind, number> = {
  pop: MOTION_JUICE.numberPopDurationMs,
  flash: MOTION_JUICE.hitFlashMs,
  shake: MOTION_JUICE.shakeDurationMs,
  enter: MOTION_PRESETS.dialogIn.ms,
};

const active = new WeakMap<HTMLElement, () => void>();

/**
 * Elemanda bir juice etkisini bir kez oynatır (`vol-juice--<tür>` sınıfı, bitince kalkar).
 * Aynı etki sürerken yeniden çağrı animasyonu baştan başlatır; sınıf animasyon bitişinde ya da
 * emniyet payı sonunda temizlenir, böylece animationend gelmese de takılı kalmaz. Hareket
 * azaltma CSS'te çözülür (ölçek/sarsıntı yok, flaş kalır); burada sayaç ya da zamanlayıcı
 * tutulmaz.
 */
export function playJuice(element: HTMLElement, kind: JuiceKind): void {
  const className = `vol-juice--${kind}`;
  // Önceki etkinin zamanlayıcısı ve dinleyicisi yenisini kesmesin.
  active.get(element)?.();
  for (const other of JUICE_KINDS) element.classList.remove(`vol-juice--${other}`);
  // Aynı sınıf yeniden eklenince animasyon başlasın diye yerleşim zorlanır.
  void element.offsetWidth;
  element.classList.add(className);
  const finish = (): void => {
    element.classList.remove(className);
    element.removeEventListener('animationend', onEnd);
    window.clearTimeout(timer);
    if (active.get(element) === finish) active.delete(element);
  };
  // Alt elemanların kabarcıklanan animasyon bitişi bu etkiyi erken bitirmesin.
  const onEnd = (event: Event): void => {
    if (event.target === element) finish();
  };
  const timer = window.setTimeout(finish, DURATION_MS[kind] + MOTION_SAFETY_MARGIN_MS);
  element.addEventListener('animationend', onEnd);
  active.set(element, finish);
}
