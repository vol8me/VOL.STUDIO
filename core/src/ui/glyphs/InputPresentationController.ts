import { DisposableScope } from '../../lifecycle/DisposableScope';
import { GamepadController, InputModeArbiter, type PadLike } from '../../input/gamepad';
import { Glyph } from './Glyph';
import { resolveGlyphFamily, type GlyphFamilyContext } from './glyphFamily';
import type { GlyphName } from './glyphMap';

export interface InputPresentationOptions {
  initialMode?: string;
  /** Sahip girdi yöneticisinin durumu; verilince kol ve kip yeniden yoklanmaz. */
  readState?: () => { mode: string | undefined; padId: string; padConnected: boolean };
  getGamepads?: () => readonly (PadLike | null)[];
  context?: () => GlyphFamilyContext;
  root?: ParentNode;
  now?: () => number;
}

export interface ControlGlyphBinding {
  padName?: GlyphName;
  keyboardName?: GlyphName;
  key?: string;
  label: string;
}

export class InputPresentationController {
  private readonly scope = new DisposableScope();
  private readonly pad: GamepadController<never> | null;
  private readonly arbiter: InputModeArbiter | null;
  private sharedMode: string | undefined;
  private readonly now: () => number;
  private readonly glyphs = new WeakMap<
    HTMLElement,
    { glyph: Glyph; binding: ControlGlyphBinding }
  >();
  private pcEdge = -Infinity;
  private touchEdge = -Infinity;
  private started = false;
  private padId = '';
  private padConnected = false;
  private hadPad = false;

  constructor(private readonly options: InputPresentationOptions = {}) {
    this.now = options.now ?? (() => performance.now());
    this.pad = options.readState
      ? null
      : new GamepadController({ actions: [], getGamepads: options.getGamepads });
    this.arbiter = options.readState
      ? null
      : new InputModeArbiter({ initial: options.initialMode, now: this.now });
  }

  get mode(): string | undefined {
    return this.options.readState ? this.sharedMode : this.arbiter?.mode;
  }

  createGlyph(binding: ControlGlyphBinding): HTMLElement {
    const glyph = new Glyph({
      name: binding.padName ?? binding.keyboardName ?? 'key',
      label: binding.label,
    });
    glyph.element.dataset.volInputGlyph = '';
    this.glyphs.set(glyph.element, { glyph, binding });
    this.updateGlyph(glyph, binding);
    return glyph.element;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    if (this.options.readState) return;
    this.scope.addListener(document, 'keydown', () => {
      this.pcEdge = this.now();
    });
    const pointer = (event: PointerEvent): void => {
      if (event.pointerType === 'gamepad') return;
      if (event.pointerType === 'touch') this.touchEdge = this.now();
      else this.pcEdge = this.now();
    };
    this.scope.addListener(document, 'pointerdown', pointer);
    this.scope.addListener(document, 'pointermove', pointer);
    const tick = (): void => {
      if (!this.started) return;
      this.poll();
      this.scope.addAnimationFrame(tick);
    };
    this.scope.addAnimationFrame(tick);
  }

  poll(): void {
    if (this.options.readState) {
      const state = this.options.readState();
      this.sharedMode = state.mode;
      this.padId = state.padId;
      this.padConnected = state.padConnected;
      if (this.padConnected) this.hadPad = true;
    } else {
      this.pad?.update(0);
      const snapshot = this.pad?.getDebugSnapshot().providers?.gamepad;
      this.padId = typeof snapshot?.padId === 'string' ? snapshot.padId : '';
      this.padConnected = typeof snapshot?.padIndex === 'number' && snapshot.padIndex >= 0;
      if (this.padConnected) this.hadPad = true;
      const now = this.now();
      this.arbiter?.observe([
        { id: 'touch', active: now - this.touchEdge < 250 },
        { id: 'pc', active: now - this.pcEdge < 250 },
        { id: 'gamepad', active: this.pad?.isActive ?? false },
      ]);
    }
    for (const element of (this.options.root ?? document).querySelectorAll<HTMLElement>(
      '[data-vol-input-glyph]',
    )) {
      const view = this.glyphs.get(element);
      if (view) this.updateGlyph(view.glyph, view.binding);
    }
  }

  private updateGlyph(glyph: Glyph, binding: ControlGlyphBinding): void {
    const context = { ...this.options.context?.(), gamepadId: this.padId };
    const family =
      this.mode === 'gamepad' && !this.padConnected && (this.hadPad || !context.steamDeckSession)
        ? null
        : resolveGlyphFamily(this.mode, context);
    if (family === 'keyboard') {
      glyph.setName(binding.keyboardName ?? 'key', binding.key);
      glyph.setFamily(binding.keyboardName ? family : null);
    } else {
      glyph.setName(binding.padName ?? 'key');
      glyph.setFamily(binding.padName ? family : null);
    }
  }

  destroy(): void {
    this.started = false;
    this.scope.dispose();
    this.pad?.destroy();
  }
}
