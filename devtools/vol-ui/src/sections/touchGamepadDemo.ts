import { Glyph, Text, resolveGlyphFamily } from '@volstudio/core/ui';
import type { DisposableScope } from '@volstudio/core/lifecycle';
import { i18next } from '@volstudio/core/i18n';
import { GAMEPAD_BUTTON, GamepadController, InputModeArbiter } from '@volstudio/core/input/gamepad';

type DemoAction = 'fire' | 'dash';
const DEMO_ACTIONS: readonly DemoAction[] = ['fire', 'dash'];
/** DOM kenarının "etkin" sayıldığı pencere — gerçek isActive sözleşmesinin vitrin karşılığı. */
const MODE_WINDOW_MS = 250;

function axisReadout(x: number, y: number): string {
  return i18next.t('volui:touch.axisReadout', { x: x.toFixed(2), y: y.toFixed(2) });
}

/**
 * Gamepad demosu CANLI çalışır: gerçek `navigator.getGamepads` yoklanır,
 * `InputModeArbiter` DOM kenarlarıyla (keydown/pointer) beslenir — klavye,
 * fare, dokunmatik ve kol arasındaki kip geçişi ekranda görünür.
 */
export function buildGamepadDemo(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';
  wrap.style.alignItems = 'center';

  const padStatus = new Text(i18next.t('volui:touch.gamepadNone'), { variant: 'muted' });
  const modeReadout = new Text('', { variant: 'muted' });
  const moveReadout = new Text('', { variant: 'muted' });
  const actionReadout = new Text(i18next.t('volui:touch.released'), { variant: 'muted' });
  const hint = new Text(i18next.t('volui:touch.gamepadHint'), { variant: 'muted' });
  disposables.addDestroyables(padStatus, modeReadout, moveReadout, actionReadout, hint);

  // Glif satırı: kip kiminse onun glifi görünür (pad↔klavye/fare karşılıklı gizlenir).
  const glyphRow = document.createElement('div');
  glyphRow.className = 'vol-showcase-gamepad-glyphs';
  const fireGlyph = new Glyph({ name: 'rightTrigger', label: 'RT' });
  const dashGlyph = new Glyph({ name: 'faceDown', label: 'A' });
  const fireKeyGlyph = new Glyph({ name: 'mouseLeft', label: 'LMB' });
  const dashKeyGlyph = new Glyph({ name: 'key', key: 'space', label: 'Space' });
  for (const g of [fireGlyph, dashGlyph, fireKeyGlyph, dashKeyGlyph]) {
    glyphRow.appendChild(g.element);
  }
  disposables.addDestroyables(fireGlyph, dashGlyph, fireKeyGlyph, dashKeyGlyph);

  const pad = new GamepadController<DemoAction>({
    actions: DEMO_ACTIONS,
    actionBindings: {
      fire: { source: 'button', button: GAMEPAD_BUTTON.rightTrigger },
      dash: { source: 'button', button: GAMEPAD_BUTTON.primary },
    },
  });
  disposables.addDestroyables(pad);

  const arbiter = new InputModeArbiter();
  let pcEdgeAt = -Infinity;
  let touchEdgeAt = -Infinity;
  disposables.addListener(window, 'keydown', () => {
    pcEdgeAt = performance.now();
  });
  disposables.addListener<PointerEvent>(window, 'pointerdown', (event) => {
    const at = performance.now();
    if (event.pointerType === 'touch') touchEdgeAt = at;
    else pcEdgeAt = at;
  });
  disposables.addListener<PointerEvent>(window, 'pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    pcEdgeAt = performance.now();
  });

  const tick = (): void => {
    const now = performance.now();
    pad.update(16);
    arbiter.observe([
      { id: 'touch', active: now - touchEdgeAt < MODE_WINDOW_MS },
      { id: 'pc', active: now - pcEdgeAt < MODE_WINDOW_MS },
      { id: 'gamepad', active: pad.isActive },
    ]);

    const snapshot = pad.getDebugSnapshot().providers?.gamepad;
    const padId = typeof snapshot?.padId === 'string' ? snapshot.padId : '';

    const mode = arbiter.mode;
    const padFamily =
      mode === 'gamepad' ? resolveGlyphFamily('gamepad', { gamepadId: padId }) : null;
    fireGlyph.setFamily(padFamily);
    dashGlyph.setFamily(padFamily);
    fireKeyGlyph.setFamily(mode === 'pc' ? 'keyboard' : null);
    dashKeyGlyph.setFamily(mode === 'pc' ? 'keyboard' : null);

    padStatus.setContent(
      padId !== ''
        ? i18next.t('volui:touch.gamepadPad', { id: padId })
        : i18next.t('volui:touch.gamepadNone'),
    );
    modeReadout.setContent(i18next.t('volui:touch.gamepadMode', { mode: mode ?? '—' }));

    const state = pad.getState();
    moveReadout.setContent(axisReadout(state.move.x, state.move.y));
    const pressed = DEMO_ACTIONS.filter((action) => state.actions[action]);
    actionReadout.setContent(
      pressed.length > 0
        ? i18next.t('volui:touch.gamepadPressed', { actions: pressed.join(', ') })
        : i18next.t('volui:touch.released'),
    );

    disposables.addAnimationFrame(tick);
  };
  disposables.addAnimationFrame(tick);

  wrap.appendChild(padStatus.element);
  wrap.appendChild(modeReadout.element);
  wrap.appendChild(moveReadout.element);
  wrap.appendChild(actionReadout.element);
  wrap.appendChild(glyphRow);
  wrap.appendChild(hint.element);
  return wrap;
}
