import { DisposableScope } from '../../lifecycle/DisposableScope';
import { isActivationIntent, isFocusActivating } from './activationIntent';

type Intent = { target: HTMLElement; generation: number };
type PointerIntent = Intent & { pointerId: number; released: boolean };

function activationKey(key: string): boolean {
  return key === 'Enter' || key === ' ';
}

export class ActivationIntentGuard {
  private readonly scope = new DisposableScope();
  private readonly heldKeys = new Set<string>();
  private readonly heldPointers = new Set<number>();
  private generation = 0;
  private spaceIntent: Intent | null = null;
  private pointerIntent: PointerIntent | null = null;
  private synchronousIntent: Intent | null = null;
  private focusIntent: Intent | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly isActive: () => boolean,
  ) {
    this.scope.addListener(
      document,
      'keydown',
      (event: KeyboardEvent) => this.onKeydown(event),
      true,
    );
    this.scope.addListener(document, 'keyup', (event: KeyboardEvent) => this.onKeyup(event), true);
    this.scope.addListener(
      document,
      'pointerdown',
      (event: PointerEvent) => {
        const held = this.heldPointers.has(event.pointerId);
        this.heldPointers.add(event.pointerId);
        this.pointerIntent = null;
        const target = this.target(event.target);
        if (target && !held && event.button === 0 && !event.defaultPrevented) {
          this.pointerIntent = {
            target,
            generation: this.generation,
            pointerId: event.pointerId,
            released: false,
          };
        }
      },
      true,
    );
    this.scope.addListener(
      document,
      'pointerup',
      (event: PointerEvent) => {
        this.heldPointers.delete(event.pointerId);
        if (this.pointerIntent?.pointerId !== event.pointerId) return;
        if (this.valid(this.pointerIntent, this.target(event.target)) && !event.defaultPrevented) {
          this.pointerIntent.released = true;
        } else {
          this.pointerIntent = null;
        }
      },
      true,
    );
    this.scope.addListener(
      document,
      'pointercancel',
      (event: PointerEvent) => {
        this.heldPointers.delete(event.pointerId);
        if (this.pointerIntent?.pointerId === event.pointerId) this.pointerIntent = null;
      },
      true,
    );
    this.scope.addListener(window, 'blur', () => {
      this.heldKeys.clear();
      this.heldPointers.clear();
      this.reset();
    });
    this.scope.addListener(root, 'vol:focusactivate', (event: Event) => {
      if (!isActivationIntent(event)) return;
      const target = this.target(event.target);
      if (target) this.focusIntent = { target, generation: this.generation };
      else event.preventDefault();
    });
    this.scope.addListener(
      root,
      'click',
      (event: MouseEvent) => {
        if (!this.actionTarget(event.target)) return;
        const target = this.target(event.target);
        const allowed =
          this.valid(this.synchronousIntent, target) ||
          (target !== null && isFocusActivating(target) && this.valid(this.focusIntent, target)) ||
          (this.pointerIntent?.released === true && this.valid(this.pointerIntent, target));
        this.synchronousIntent = null;
        this.focusIntent = null;
        this.pointerIntent = null;
        if (!allowed) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      true,
    );
  }

  reset(): void {
    this.generation++;
    this.root.dataset.volActivationGeneration = String(this.generation);
    this.spaceIntent = null;
    this.pointerIntent = null;
    this.synchronousIntent = null;
    this.focusIntent = null;
  }

  destroy(): void {
    this.reset();
    this.scope.dispose();
  }

  private target(target: EventTarget | null): HTMLElement | null {
    if (!this.isActive()) return null;
    const element = this.actionTarget(target);
    return element &&
      this.root.contains(element) &&
      !element.matches(':disabled') &&
      !element.closest('[inert]')
      ? element
      : null;
  }

  private actionTarget(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    const element = target.closest<HTMLElement>(
      'button, a[href], area[href], input[type="button"], input[type="submit"], input[type="reset"], [role="button"]',
    );
    return element && this.root.contains(element) ? element : null;
  }

  private valid(intent: Intent | null, target: HTMLElement | null): boolean {
    return (
      intent !== null &&
      target !== null &&
      intent.target === target &&
      intent.generation === this.generation
    );
  }

  private onKeydown(event: KeyboardEvent): void {
    if (!activationKey(event.key)) return;
    const held = this.heldKeys.has(event.key);
    this.heldKeys.add(event.key);
    const target = this.target(event.target);
    if (!target || event.defaultPrevented) return;
    event.preventDefault();
    this.pointerIntent = null;
    if (held || event.repeat) return;
    if (event.key === 'Enter') this.click(target);
    else this.spaceIntent = { target, generation: this.generation };
  }

  private onKeyup(event: KeyboardEvent): void {
    if (!activationKey(event.key)) return;
    this.heldKeys.delete(event.key);
    const intent = this.spaceIntent;
    this.spaceIntent = null;
    const target = this.target(event.target);
    if (!target) return;
    event.preventDefault();
    if (event.key === ' ' && this.valid(intent, target)) this.click(target);
  }

  private click(target: HTMLElement): void {
    this.synchronousIntent = { target, generation: this.generation };
    try {
      target.click();
    } finally {
      this.synchronousIntent = null;
    }
  }
}
