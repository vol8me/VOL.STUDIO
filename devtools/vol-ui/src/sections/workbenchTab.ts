import {
  Button,
  CanvasViewportController,
  VOL_ICONS,
  Checkbox,
  CommandHistory,
  Input,
  KeyedVirtualList,
  Icon,
  PropertyField,
  Slider,
  SplitPane,
  Text,
  type CommandHistorySnapshot,
} from '@volstudio/core/ui';
import { i18next } from '@volstudio/core/i18n';
import { card, cardGrid3 } from './shared';

interface Destroyable {
  destroy(): void;
}

function buildPropertyDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-workbench-fields';
  const commitState = new Text(i18next.t('volui:workbench.noCommit'), { variant: 'muted' });
  const input = new Input({
    value: i18next.t('volui:workbench.nameValue'),
    onCommit: (value) =>
      commitState.setContent(i18next.t('volui:workbench.commitState', { value })),
  });
  const nameField = new PropertyField({
    label: i18next.t('volui:workbench.name'),
    control: input,
    description: i18next.t('volui:workbench.nameDescription'),
    resetLabel: i18next.t('volui:workbench.reset'),
    onReset: () => input.setValue(i18next.t('volui:workbench.nameValue')),
  });
  const opacity = new Slider({ min: 0, max: 100, value: 82, step: 1 });
  const opacityField = new PropertyField({
    label: i18next.t('volui:workbench.opacity'),
    control: opacity,
    resetLabel: i18next.t('volui:workbench.reset'),
    onReset: () => opacity.setValue(100),
  });
  const visible = new Checkbox({ label: i18next.t('volui:workbench.visible'), checked: true });

  wrap.append(nameField.element, opacityField.element, visible.element, commitState.element);
  disposables.push(input, nameField, opacity, opacityField, visible, commitState);
  return wrap;
}

function buildHistoryDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-workbench-history';
  let value = 0;
  const state = new Text('', { variant: 'muted' });
  // `undo`/`redo` aşağıda kurulur. `CommandHistory` yapıcısı `onChange`
  // çağırmaz; `render` ilk kez ikisi de hazır olduktan sonra koşar.
  const render = (snapshot: CommandHistorySnapshot): void => {
    state.setContent(
      i18next.t('volui:workbench.historyState', {
        value,
        undo: snapshot.undoCount,
        redo: snapshot.redoCount,
      }),
    );
    undo.setDisabled(!snapshot.canUndo);
    redo.setDisabled(!snapshot.canRedo);
  };
  const history = new CommandHistory({ maxBytes: 1024, onChange: render });
  const apply = new Button(i18next.t('volui:workbench.applyChange'), {
    variant: 'primary',
    onClick: () => {
      const before = value;
      history.execute({
        label: i18next.t('volui:workbench.applyChange'),
        byteCost: 8,
        apply: () => {
          value = before + 1;
        },
        revert: () => {
          value = before;
        },
      });
    },
  });
  const undo = new Button(i18next.t('volui:workbench.undo'), {
    onClick: () => void history.undo(),
  });
  const redo = new Button(i18next.t('volui:workbench.redo'), {
    onClick: () => void history.redo(),
  });
  render(history.getSnapshot());
  const actions = document.createElement('div');
  actions.className = 'vol-showcase-row__group';
  actions.append(apply.element, undo.element, redo.element);
  wrap.append(actions, state.element);
  disposables.push(apply, undo, redo, state);
  return wrap;
}

function buildSplitViewportDemo(disposables: Destroyable[]): HTMLElement {
  const assets = Array.from({ length: 240 }, (_, index) => ({
    id: `asset-${index + 1}`,
    label: i18next.t('volui:workbench.assetRow', { index: index + 1 }),
  }));
  const list = new KeyedVirtualList({
    items: assets,
    getKey: (item) => item.id,
    itemHeight: 38,
    height: '100%',
    ariaLabel: i18next.t('volui:workbench.assetList'),
    renderItem: (item) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'vol-showcase-workbench-asset';
      row.textContent = item.label;
      return row;
    },
  });

  const viewport = document.createElement('div');
  viewport.className = 'vol-showcase-workbench-viewport';
  viewport.tabIndex = 0;
  viewport.setAttribute('aria-label', i18next.t('volui:workbench.viewport'));
  const artwork = document.createElement('div');
  artwork.className = 'vol-showcase-workbench-artwork';
  for (const tone of ['brand', 'support', 'accent', 'warning']) {
    const block = document.createElement('span');
    block.className = `vol-showcase-workbench-artwork__block vol-showcase-workbench-artwork__block--${tone}`;
    artwork.appendChild(block);
  }
  viewport.appendChild(artwork);

  const zoomState = new Text('', { variant: 'muted', tag: 'span' });
  const controller = new CanvasViewportController(viewport, {
    documentWidth: 256,
    documentHeight: 256,
    minZoom: 0.25,
    maxZoom: 8,
    onChange: (transform) => {
      artwork.style.transform = `translate(${transform.offsetX}px, ${transform.offsetY}px) scale(${transform.zoom})`;
      zoomState.setContent(
        i18next.t('volui:workbench.zoomState', { zoom: Math.round(transform.zoom * 100) }),
      );
    },
  });
  controller.actualSize();
  const fit = new Button(i18next.t('volui:workbench.fit'), {
    size: 'sm',
    onClick: () => controller.fit(),
  });
  const actual = new Button(i18next.t('volui:workbench.actualSize'), {
    size: 'sm',
    onClick: () => controller.actualSize(),
  });
  const viewportWrap = document.createElement('div');
  viewportWrap.className = 'vol-showcase-workbench-viewport-wrap';
  const viewportBar = document.createElement('div');
  viewportBar.className = 'vol-showcase-workbench-viewport-bar';
  const hint = new Text(i18next.t('volui:workbench.viewportHint'), {
    variant: 'muted',
    tag: 'span',
  });
  viewportBar.append(hint.element, zoomState.element, fit.element, actual.element);
  viewportWrap.append(viewportBar, viewport);

  const split = new SplitPane({
    primary: list,
    secondary: viewportWrap,
    initialSize: 220,
    minPrimary: 150,
    minSecondary: 280,
    separatorLabel: i18next.t('volui:workbench.splitPane'),
  });
  split.element.classList.add('vol-showcase-workbench-split');
  disposables.push(list, controller, zoomState, hint, fit, actual, split);
  return split.element;
}

/**
 * CORE ikon kaydının TAMAMI.
 *
 * Liste elle yazılmaz, `VOL_ICONS` üzerinde gezilir: kayda yeni bir ikon
 * eklendiğinde showcase'e ayrıca eklenmesi gerekmez ve hiçbir ikon görsel
 * denetimden kaçamaz.
 */
function buildIconRegistry(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-workbench-icons';
  for (const name of Object.keys(VOL_ICONS) as (keyof typeof VOL_ICONS)[]) {
    const cell = document.createElement('div');
    cell.className = 'vol-showcase-workbench-icons__cell';
    const instance = new Icon({ name, label: name });
    disposables.push(instance);
    const caption = document.createElement('span');
    caption.textContent = name;
    cell.append(instance.element, caption);
    wrap.appendChild(cell);
  }
  return wrap;
}

export function buildWorkbenchTab(): {
  element: HTMLElement;
  destroy: () => void;
} {
  const disposables: Destroyable[] = [];
  const section = document.createElement('div');
  section.className = 'vol-showcase-section';
  section.append(
    cardGrid3([
      card(i18next.t('volui:workbench.propertyFields'), buildPropertyDemo(disposables), {
        spanAll: true,
      }),
      card(i18next.t('volui:workbench.history'), buildHistoryDemo(disposables)),
    ]),
    card(i18next.t('volui:workbench.iconRegistry'), buildIconRegistry(disposables), {
      spanAll: true,
    }),
    card(i18next.t('volui:workbench.splitPane'), buildSplitViewportDemo(disposables), {
      spanAll: true,
    }),
  );
  return {
    element: section,
    destroy: () => {
      for (const disposable of disposables.reverse()) disposable.destroy();
    },
  };
}
