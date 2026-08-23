import {
  Button,
  CanvasViewportController,
  Checkbox,
  CommandHistory,
  Input,
  KeyedVirtualList,
  Popover,
  PropertyField,
  Slider,
  SplitPane,
  Text,
  Toolbar,
  type CommandHistorySnapshot,
} from '@volstudio/core/ui';
import { i18next } from '@volstudio/core/i18n';
import { card, cardGrid } from './shared';

interface Destroyable {
  destroy(): void;
}

function buildToolbarDemo(root: HTMLElement, disposables: Destroyable[]): HTMLElement {
  const toolbar = new Toolbar({
    ariaLabel: i18next.t('volui:workbench.toolbar'),
    selectionMode: 'single',
    value: 'image',
    items: [
      { id: 'image', icon: 'image', label: i18next.t('volui:workbench.imageTool') },
      { id: 'audio', icon: 'audio', label: i18next.t('volui:workbench.audioTool') },
      { id: 'font', icon: 'font', label: i18next.t('volui:workbench.fontTool') },
    ],
  });
  const more = toolbar.add({
    id: 'more',
    icon: 'more',
    label: i18next.t('volui:workbench.moreTool'),
    // Araç değil aksiyon: seçimli toolbarda `toggle: false` verilmezse bu
    // düğmeye basmak aktif aracı düşürür (bkz. Toolbar.add).
    toggle: false,
    // `popover` aşağıda tanımlanır; bu geri çağrı ancak kullanıcı butona
    // bastığında, yani kurulum bittikten sonra koşar.
    onPress: () => popover.toggle(),
  });

  // `aria-expanded` tetikleyicide Popover tarafından yönetilir; burada elle
  // sıfırlamaya gerek yok.
  const popover = new Popover(more.element, {
    container: root,
    ariaLabel: i18next.t('volui:workbench.popoverTitle'),
  });
  const popoverText = new Text(i18next.t('volui:workbench.popoverBody'), { variant: 'body' });
  const close = new Button(i18next.t('volui:workbench.close'), {
    size: 'sm',
    onClick: () => popover.close(),
  });
  popover.add(popoverText).add(close);

  disposables.push(toolbar, popover, popoverText, close);
  return toolbar.element;
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

export function buildWorkbenchTab(root: HTMLElement): {
  element: HTMLElement;
  destroy: () => void;
} {
  const disposables: Destroyable[] = [];
  const section = document.createElement('div');
  section.className = 'vol-showcase-section';
  section.append(
    card(i18next.t('volui:workbench.toolbar'), buildToolbarDemo(root, disposables)),
    cardGrid([
      card(i18next.t('volui:workbench.propertyFields'), buildPropertyDemo(disposables)),
      card(i18next.t('volui:workbench.history'), buildHistoryDemo(disposables)),
    ]),
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
