import {
  InputPresentationController,
  GamepadPointerController,
  Button,
  Input,
  Text,
  clearTextEntryModeProbe,
  setTextEntryModeProbe,
} from '@volstudio/core/ui';
import type { DisposableScope } from '@volstudio/core/lifecycle';
import { i18next } from '@volstudio/core/i18n';
import { GAMEPAD_BUTTON, GamepadController } from '@volstudio/core/input/gamepad';

type DemoAction = 'fire' | 'dash';
const DEMO_ACTIONS: readonly DemoAction[] = ['fire', 'dash'];

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
  wrap.classList.add('vol-showcase-gamepad-demo');
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
  const presentation = disposables.addDestroyable(new InputPresentationController());
  presentation.start();
  const fireGlyph = presentation.createGlyph({ padName: 'rightTrigger', label: 'RT' });
  const dashGlyph = presentation.createGlyph({ padName: 'faceDown', label: 'A' });
  const fireKeyGlyph = presentation.createGlyph({ keyboardName: 'mouseLeft', label: 'LMB' });
  const dashKeyGlyph = presentation.createGlyph({
    keyboardName: 'key',
    key: 'space',
    label: 'Space',
  });
  for (const g of [fireGlyph, dashGlyph, fireKeyGlyph, dashKeyGlyph]) {
    glyphRow.appendChild(g);
  }

  const pad = new GamepadController<DemoAction>({
    actions: DEMO_ACTIONS,
    actionBindings: {
      fire: { source: 'button', button: GAMEPAD_BUTTON.rightTrigger },
      dash: { source: 'button', button: GAMEPAD_BUTTON.primary },
    },
  });
  disposables.addDestroyables(pad);

  // Kolla metin girişi: kol kipinde bu alan odaklanınca ekran klavyesi
  // açılır (Steamworks sağlayıcısı kayıtlıysa o). Input'un kendi focus
  // kancası probu okur; burada yalnız alan ve etiketi durur.
  const textLabel = new Text(i18next.t('volui:touch.gamepadTextLabel'), { variant: 'muted' });
  const textField = new Input({
    placeholder: i18next.t('volui:touch.gamepadTextPlaceholder'),
  });
  disposables.addDestroyables(textLabel, textField);

  const probe = (): boolean => presentation.mode === 'gamepad';
  setTextEntryModeProbe(probe);
  disposables.addSubscription(() => clearTextEntryModeProbe(probe));

  let selected = false;
  const action = disposables.addDestroyable(
    new Button(i18next.t('volui:touch.dash'), {
      fullWidth: false,
      onClick: () => {
        selected = !selected;
        action.element.setAttribute('aria-pressed', String(selected));
        action.setLabel(i18next.t(selected ? 'volui:touch.pressedDash' : 'volui:touch.dash'));
      },
    }),
  );
  action.element.setAttribute('aria-pressed', 'false');
  const cursor = document.createElement('div');
  cursor.className = 'vol-showcase-gamepad-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  cursor.hidden = true;
  const pointer = disposables.addDestroyable(
    new GamepadPointerController({ root: wrap, isActive: () => wrap.isConnected }),
  );
  pointer.start();
  disposables.addListener(
    document,
    'vol:focusactivate',
    (event) => {
      if (pointer.ownsPointer) event.preventDefault();
    },
    true,
  );
  disposables.addListener(wrap, 'pointermove', (event: PointerEvent) => {
    if (event.pointerType !== 'gamepad') return;
    const rect = wrap.getBoundingClientRect();
    const scaleX = rect.width > 0 && wrap.offsetWidth > 0 ? wrap.offsetWidth / rect.width : 1;
    const scaleY = rect.height > 0 && wrap.offsetHeight > 0 ? wrap.offsetHeight / rect.height : 1;
    cursor.style.left = `${(event.clientX - rect.left) * scaleX}px`;
    cursor.style.top = `${(event.clientY - rect.top) * scaleY}px`;
  });

  const tick = (): void => {
    pad.update(16);
    presentation.poll();
    cursor.hidden = !pointer.ownsPointer;

    const snapshot = pad.getDebugSnapshot().providers?.gamepad;
    const padId = typeof snapshot?.padId === 'string' ? snapshot.padId : '';

    const mode = presentation.mode;

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
  wrap.appendChild(action.element);
  wrap.appendChild(textLabel.element);
  wrap.appendChild(textField.element);
  wrap.appendChild(hint.element);
  wrap.appendChild(cursor);
  return wrap;
}
