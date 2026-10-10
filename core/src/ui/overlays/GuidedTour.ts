import { i18next } from '../../i18n/I18n';
import { Button } from '../primitives/Button';
import { previousFocusTarget } from '../primitives/buttonBehavior';
import { Text } from '../primitives/Text';
import { Popup, type PopupPlacement } from './Popup';

export interface TourStep {
  /** İşaret edilen öğe ya da onu çözen işlev; çözülemeyen/görünmeyen adım atlanır. */
  readonly target: HTMLElement | (() => HTMLElement | null | undefined);
  readonly title: string;
  readonly body: string;
  readonly placement?: PopupPlacement;
}

/** `completed`: kullanıcı turu sonuna kadar götürdü; `skipped`: atladı, Escape/geri/sinyal ya da hiç adım gösterilemedi. */
export type TourOutcome = 'completed' | 'skipped';

export interface GuidedTourOptions {
  readonly steps: readonly TourStep[];
  readonly container?: HTMLElement;
  readonly className?: string;
  /** Sahne kapanırken turu `skipped` ile sonlandırır. */
  readonly signal?: AbortSignal;
  /** Bir adım göründüğünde çağrılır (özgün adım dizini ve toplam). */
  readonly onStep?: (index: number, total: number) => void;
}

export interface GuidedTourHandle {
  /** Asla reddedilmez. */
  readonly result: Promise<TourOutcome>;
  /** Turu hemen `skipped` ile bitirir; bitmişse etkisizdir. */
  skip(): void;
}

const TARGET_CLASS = 'vol-tour-target';
let tourSequence = 0;

function visible(element: HTMLElement | null | undefined): element is HTMLElement {
  return !!element && element.isConnected && element.getClientRects().length > 0;
}

/**
 * İlk kullanım yönlendirmesi: hedef öğeyi işaretleyip yanında kısa bir açıklama kutusu (adım sayacı, Geri/İleri/Atla)
 * gösterir. Engelleyici DEĞİLDİR: scrim ve odak tuzağı yoktur, sayfa kullanılabilir kalır; `Popup` üzerine
 * kuruludur (Escape/Android geri `skipped`, hedef kaybolursa adım kendiliğinden atlanır).
 *
 * Odak: her adımda "İleri" düğmesine geçer (klavye/kol turu sürdürebilsin); tur bitince odak, tur öncesi sahibine
 * (hâlâ bağlıysa) döner. Hedef sınıfı `vol-tour-target` yalnız o adım boyunca durur.
 */
export function startGuidedTour(options: GuidedTourOptions): GuidedTourHandle {
  const { steps, signal } = options;
  if (steps.length === 0) throw new RangeError('Tur en az bir adım ister');
  if (signal?.aborted) return { result: Promise.resolve('skipped'), skip: () => undefined };

  const container = options.container ?? document.body;
  // Tetikleyici bir Button ise tıklama sürerken `disabled` olup odağı gövdeye düşürür; Modal ile aynı yoldan sorulur.
  const previous = previousFocusTarget();
  const returnFocus = previous instanceof HTMLElement ? previous : null;
  let resolved = false;
  let shown = 0;
  let current: { popup: Popup; target: HTMLElement; buttons: Button[] } | null = null;
  let resolveResult!: (outcome: TourOutcome) => void;
  const result = new Promise<TourOutcome>((resolve) => (resolveResult = resolve));

  const targetOf = (step: TourStep): HTMLElement | null => {
    const resolvedTarget = typeof step.target === 'function' ? step.target() : step.target;
    return visible(resolvedTarget) ? resolvedTarget : null;
  };
  /** `from`dan `direction` yönünde ilk gösterilebilir adım; yoksa -1. */
  const find = (from: number, direction: 1 | -1): number => {
    for (let i = from; i >= 0 && i < steps.length; i += direction) {
      if (targetOf(steps[i])) return i;
    }
    return -1;
  };

  const dispose = (): void => {
    if (!current) return;
    const { popup, target, buttons } = current;
    current = null;
    target.classList.remove(TARGET_CLASS);
    popup.destroy();
    for (const button of buttons) button.destroy();
  };

  const finish = (outcome: TourOutcome): void => {
    if (resolved) return;
    resolved = true;
    signal?.removeEventListener('abort', onAbort);
    const hadFocusInside =
      document.activeElement === document.body ||
      (current?.popup.element.contains(document.activeElement) ?? false);
    dispose();
    if (hadFocusInside && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    resolveResult(outcome);
  };
  const onAbort = (): void => finish('skipped');

  const advance = (from: number): void => {
    const next = find(from, 1);
    if (next === -1) finish(shown > 0 ? 'completed' : 'skipped');
    else show(next);
  };

  const show = (stepIndex: number): void => {
    const step = steps[stepIndex];
    const target = targetOf(step);
    if (!target) {
      advance(stepIndex + 1);
      return;
    }
    dispose();
    shown += 1;

    const id = ++tourSequence;
    const titleId = `vol-tour-title-${id}`;
    const bodyId = `vol-tour-body-${id}`;
    const popup = new Popup(target, {
      placement: step.placement ?? 'bottom-start',
      closeOnOutsideClick: false,
      container,
      className: ['vol-tour', options.className].filter(Boolean).join(' '),
      onClose: () => {
        if (resolved || current?.popup !== popup) return;
        // Hedef kaybolduğu için kapandıysa adım atlanır; kullanıcı kapattıysa (Escape/geri) tur biter.
        if (visible(target)) finish('skipped');
        else {
          dispose();
          advance(stepIndex + 1);
        }
      },
    });
    popup.element.setAttribute('role', 'dialog');
    popup.element.setAttribute('aria-labelledby', titleId);
    popup.element.setAttribute('aria-describedby', bodyId);
    popup.element.dataset.placement = (step.placement ?? 'bottom-start').split('-')[0];

    const counter = new Text(
      i18next.t('core:dialog.tour.step', { current: stepIndex + 1, total: steps.length }),
      { variant: 'muted' },
    );
    counter.element.classList.add('vol-tour__counter');
    const title = new Text(step.title, { variant: 'body', tag: 'h3' });
    title.element.classList.add('vol-tour__title');
    title.element.id = titleId;
    const body = new Text(step.body, { variant: 'body' });
    body.element.id = bodyId;

    const hasPrevious = find(stepIndex - 1, -1) !== -1;
    const isLast = find(stepIndex + 1, 1) === -1;
    const buttons: Button[] = [];
    const actions = document.createElement('div');
    actions.className = 'vol-tour__actions';
    const skipButton = new Button(i18next.t('core:dialog.tour.skip'), {
      size: 'sm',
      fullWidth: false,
      onClick: () => finish('skipped'),
    });
    buttons.push(skipButton);
    actions.appendChild(skipButton.element);
    if (hasPrevious) {
      const back = new Button(i18next.t('core:dialog.tour.back'), {
        size: 'sm',
        fullWidth: false,
        onClick: () => {
          const previous = find(stepIndex - 1, -1);
          if (previous !== -1) show(previous);
        },
      });
      buttons.push(back);
      actions.appendChild(back.element);
    }
    const next = new Button(
      isLast ? i18next.t('core:dialog.tour.done') : i18next.t('core:dialog.tour.next'),
      {
        size: 'sm',
        variant: 'primary',
        fullWidth: false,
        onClick: () => (isLast ? finish('completed') : advance(stepIndex + 1)),
      },
    );
    buttons.push(next);
    actions.appendChild(next.element);

    popup.add(counter).add(title).add(body).add({ element: actions });
    current = { popup, target, buttons };
    target.classList.add(TARGET_CLASS);
    target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    popup.show();
    next.element.focus({ preventScroll: true });
    options.onStep?.(stepIndex, steps.length);
  };

  signal?.addEventListener('abort', onAbort, { once: true });
  advance(0);
  return { result, skip: () => finish('skipped') };
}
