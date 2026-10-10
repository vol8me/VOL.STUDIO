import { MotionController } from './MotionController';
import { MOTION_JUICE, MOTION_PRESETS, MOTION_SAFETY_MARGIN_MS } from './presets';

/** Oyun hissi etkisi: sayı patlaması, vuruş flaşı, sınırlı sarsıntı, panel girişi. */
export const JUICE_KINDS = ['pop', 'flash', 'shake', 'enter'] as const;
export type JuiceKind = (typeof JUICE_KINDS)[number];

/**
 * Parlaklık flaşı sınırı (WCAG 2.3.1/2.3.2): saniyede en çok 3 flaş ve 1024×768 ekranın 10°'lik
 * görüş alanının %25'i (341×256 CSS px) altında bir alan. Sınırı aşan flaş uygulanmaz; değer
 * değişimi ve diğer etkiler (sarsıntı, patlama) etkilenmez.
 */
export const JUICE_FLASH_LIMIT = {
  perSecond: 3,
  maxAreaPx: 341 * 256,
  /** Bir saniye + animasyon başlangıcının kareye kayma payı: ekranda görünen pencere de 1 sn'yi aşar. */
  windowMs: 1000 + MOTION_SAFETY_MARGIN_MS,
} as const;

/** Sıralı girişte basamak başına gecikme (ms) ve en çok basamak: toplam bekleme sınırlı kalır. */
export const JUICE_SEQUENCE = {
  stepMs: MOTION_PRESETS.cardStagger.ms,
  maxSteps: 6,
} as const;

const DURATION_MS: Record<JuiceKind, number> = {
  pop: MOTION_JUICE.numberPopDurationMs,
  flash: MOTION_JUICE.hitFlashMs,
  shake: MOTION_JUICE.shakeDurationMs,
  enter: MOTION_PRESETS.dialogIn.ms,
};

/** Öncelik ve hareket türü: flaş/sarsıntı anlamı hareket azaltmada da taşır, patlama/giriş dekordur. */
const BUDGET_CLASS: Record<JuiceKind, Parameters<MotionController['requestGroup']>[0]> = {
  pop: { priority: 'user', kind: 'decor', durationMs: DURATION_MS.pop },
  flash: { priority: 'user', kind: 'semantic', durationMs: DURATION_MS.flash },
  shake: { priority: 'user', kind: 'semantic', durationMs: DURATION_MS.shake },
  enter: { priority: 'decor', kind: 'decor', durationMs: DURATION_MS.enter },
};

const active = new WeakMap<HTMLElement, () => void>();
const controllers = new WeakMap<Document, MotionController>();
/** Belge başına son saniyede başlayan flaş sayısı. */
const flashStarts = new WeakMap<Document, number>();

/** Belge başına tek bütçe: eşzamanlı üç geçiş grubu (`MOTION_BUDGET`), öncelikli, dekor kesilir. */
function controllerFor(document: Document): MotionController {
  let controller = controllers.get(document);
  if (!controller) {
    controller = new MotionController({ visibilityTarget: document });
    controllers.set(document, controller);
  }
  return controller;
}

/** Pencere içindeki flaş sayısı sınırın altındaysa bu flaşı sayar ve `true` döner (saat değil zamanlayıcı). */
function takeFlashSlot(document: Document): boolean {
  const count = flashStarts.get(document) ?? 0;
  if (count >= JUICE_FLASH_LIMIT.perSecond) return false;
  flashStarts.set(document, count + 1);
  window.setTimeout(() => {
    flashStarts.set(document, (flashStarts.get(document) ?? 1) - 1);
  }, JUICE_FLASH_LIMIT.windowMs);
  return true;
}

function flashFits(element: HTMLElement): boolean {
  const { width, height } = element.getBoundingClientRect();
  return width * height <= JUICE_FLASH_LIMIT.maxAreaPx;
}

interface PlayOptions {
  delayMs?: number;
  /** Sıralı girişte grup hakkı dizi başına tek alınır; öğe kendi hakkını istemez. */
  shared?: { finish: () => void };
}

function start(element: HTMLElement, kind: JuiceKind, options: PlayOptions): void {
  const className = `vol-juice--${kind}`;
  const delayMs = options.delayMs ?? 0;
  for (const other of JUICE_KINDS) element.classList.remove(`vol-juice--${other}`);
  if (delayMs > 0) element.style.animationDelay = `${delayMs}ms`;
  // Aynı sınıf yeniden eklenince animasyon başlasın diye yerleşim zorlanır.
  void element.offsetWidth;
  element.classList.add(className);
  const finish = (): void => {
    element.classList.remove(className);
    if (delayMs > 0) element.style.removeProperty('animation-delay');
    element.removeEventListener('animationend', onEnd);
    window.clearTimeout(timer);
    if (active.get(element) === finish) active.delete(element);
    options.shared?.finish();
  };
  // Alt elemanların kabarcıklanan animasyon bitişi bu etkiyi erken bitirmesin.
  const onEnd = (event: Event): void => {
    if (event.target === element) finish();
  };
  const timer = window.setTimeout(finish, DURATION_MS[kind] + delayMs + MOTION_SAFETY_MARGIN_MS);
  element.addEventListener('animationend', onEnd);
  active.set(element, finish);
}

/**
 * Elemanda bir juice etkisini bir kez oynatır (`vol-juice--<tür>` sınıfı, bitince kalkar).
 * Aynı etki sürerken yeniden çağrı animasyonu baştan başlatır; sınıf animasyon bitişinde ya da
 * emniyet payı sonunda temizlenir, böylece animationend gelmese de takılı kalmaz. Hareket
 * azaltma CSS'te çözülür (ölçek/sarsıntı yok, flaş kalır).
 *
 * Etki belge başına hareket bütçesine tabidir (en çok 3 eşzamanlı grup; bütçe doluysa dekor
 * oynatılmaz, değer değişimi etkilenmez). Flaş ayrıca `JUICE_FLASH_LIMIT` ile sınırlıdır.
 */
export function playJuice(element: HTMLElement, kind: JuiceKind): void {
  // Önceki etkinin zamanlayıcısı ve dinleyicisi yenisini kesmesin; hakkı da bırakılır.
  active.get(element)?.();
  for (const other of JUICE_KINDS) element.classList.remove(`vol-juice--${other}`);
  if (kind === 'flash' && !flashFits(element)) return;
  // Hak kesilirse (öncelik, sayfa gizlenmesi) etki son durumuna gider: sınıf kalkar.
  const grant = controllerFor(element.ownerDocument).requestGroup({
    ...BUDGET_CLASS[kind],
    onFinal: () => active.get(element)?.(),
  });
  if (!grant || grant.durationMs <= 0) return;
  if (kind === 'flash' && !takeFlashSlot(element.ownerDocument)) {
    grant.finish();
    return;
  }
  start(element, kind, { shared: grant });
}

/**
 * Öğeleri sırayla (basamak başına `JUICE_SEQUENCE.stepMs`, en çok `maxSteps` basamak) aynı
 * etkiyle oynatır; tek grup hakkı bütün dizi için alınır, böylece uzun bir dizi bütçeyi tek
 * başına doldurmaz ve sonraki öğeler reddedilmez. Gecikmesi dolmamış öğe animasyonun başlangıç
 * durumunda bekler (`enter` için görünmez), hareket azaltmada gecikme yoktur.
 */
export function playJuiceSequence(
  elements: readonly HTMLElement[],
  kind: JuiceKind,
  stepMs: number = JUICE_SEQUENCE.stepMs,
): void {
  const first = elements[0];
  if (!first) return;
  const lastStep = Math.min(elements.length - 1, JUICE_SEQUENCE.maxSteps);
  const request = BUDGET_CLASS[kind];
  const grant = controllerFor(first.ownerDocument).requestGroup({
    ...request,
    durationMs: request.durationMs + lastStep * stepMs,
    onFinal: () => elements.forEach((element) => active.get(element)?.()),
  });
  if (!grant || grant.durationMs <= 0) return;
  let pending = elements.length;
  const shared = {
    finish: () => {
      pending -= 1;
      if (pending === 0) grant.finish();
    },
  };
  elements.forEach((element, index) => {
    active.get(element)?.();
    start(element, kind, { delayMs: Math.min(index, JUICE_SEQUENCE.maxSteps) * stepMs, shared });
  });
}
