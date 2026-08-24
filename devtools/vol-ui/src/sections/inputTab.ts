import { i18next } from '@volstudio/core/i18n';
import { VOL_COLORS } from '@volstudio/core/ui/colors';
import {
  DomCursorRenderer,
  VolCursorTheme,
  VOL_CURSOR_ASSETS,
  VOL_CURSOR_COLORS,
  applyCssCursor,
  type CursorAsset,
  type CursorColorTokens,
  type CursorId,
} from '@volstudio/core/input/cursor/dom';
import { Text } from '@volstudio/core/ui';
import { card, cardGrid } from './shared';

const SIZES = [16, 24, 32] as const;
const ACCENTS = [
  { name: 'accent', value: VOL_COLORS.accentSolid },
  { name: 'brand', value: VOL_COLORS.brandHover },
  { name: 'success', value: VOL_COLORS.successSolid },
  { name: 'danger', value: VOL_COLORS.dangerSolid },
];

type Destroyable = { destroy(): void };

/** `CursorAsset` içeriğinden canlı SVG elementi üretir. */
function buildCursorSvg(
  asset: CursorAsset,
  size: number,
  colors: CursorColorTokens,
): SVGSVGElement {
  const viewBox = asset.viewBox;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${viewBox} ${viewBox}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));

  for (const l of asset.layers) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', l.d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', colorForRole(l.role, colors));
    path.setAttribute('stroke-width', String(l.strokeWidth));
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
  }

  // Sıcak nokta gösterimi.
  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('cx', String(asset.hotspotX));
  dot.setAttribute('cy', String(asset.hotspotY));
  dot.setAttribute('r', String(1.25));
  dot.setAttribute('fill', '#ff4d4d');
  dot.setAttribute('stroke', '#ffffff');
  dot.setAttribute('stroke-width', '0.5');
  dot.setAttribute('class', 'vol-cursor-hotspot');
  svg.appendChild(dot);

  return svg;
}

function colorForRole(role: string, tokens: CursorColorTokens): string {
  if (role === 'outline') return tokens.outline;
  if (role === 'body') return tokens.body;
  if (role === 'accent') return tokens.accent;
  if (role === 'danger') return tokens.danger;
  if (role === 'disabled') return tokens.disabled;
  return tokens.body;
}

interface DemoState {
  size: number;
  colors: CursorColorTokens;
  selectedId: CursorId;
  sizeButtons: HTMLButtonElement[];
  colorButtons: HTMLButtonElement[];
  gridItems: Map<CursorId, HTMLElement>;
  liveSvg: SVGSVGElement;
  renderer: DomCursorRenderer;
}

function buildControls(state: DemoState, disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo__controls';

  const sizeGroup = document.createElement('div');
  sizeGroup.className = 'vol-cursor-control-group';
  const sizeLabel = new Text(i18next.t('volui:input.size'), { variant: 'muted' });
  disposables.push(sizeLabel);
  sizeGroup.appendChild(sizeLabel.element);

  for (const size of SIZES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vol-cursor-control-button';
    btn.textContent = `${size}`;
    btn.addEventListener('click', () => {
      state.size = size;
      state.sizeButtons.forEach((b) => b.classList.remove('vol-cursor-control-button--active'));
      btn.classList.add('vol-cursor-control-button--active');
      state.renderer.setSize(size);
      updateGrid(state);
      updateLivePreview(state);
    });
    if (size === state.size) btn.classList.add('vol-cursor-control-button--active');
    state.sizeButtons.push(btn);
    sizeGroup.appendChild(btn);
  }

  const colorGroup = document.createElement('div');
  colorGroup.className = 'vol-cursor-control-group';
  const colorLabel = new Text(i18next.t('volui:input.accent'), { variant: 'muted' });
  disposables.push(colorLabel);
  colorGroup.appendChild(colorLabel.element);

  for (const accent of ACCENTS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vol-cursor-control-button vol-cursor-control-button--color';
    btn.style.backgroundColor = accent.value;
    btn.title = accent.name;
    btn.addEventListener('click', () => {
      state.colors = { ...state.colors, accent: accent.value };
      state.colorButtons.forEach((b) => b.classList.remove('vol-cursor-control-button--active'));
      btn.classList.add('vol-cursor-control-button--active');
      state.renderer.setTheme({ ...VolCursorTheme, colors: state.colors });
      updateGrid(state);
      updateLivePreview(state);
    });
    if (accent.value === state.colors.accent)
      btn.classList.add('vol-cursor-control-button--active');
    state.colorButtons.push(btn);
    colorGroup.appendChild(btn);
  }

  wrap.appendChild(sizeGroup);
  wrap.appendChild(colorGroup);

  return wrap;
}

function buildCursorGrid(state: DemoState, disposables: Destroyable[]): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'vol-cursor-grid';

  const ids = Object.keys(VOL_CURSOR_ASSETS) as CursorId[];
  for (const id of ids) {
    const asset = VOL_CURSOR_ASSETS[id];
    const cell = document.createElement('div');
    cell.className = 'vol-cursor-cell';
    cell.setAttribute('role', 'button');
    cell.setAttribute('tabindex', '0');
    cell.setAttribute('aria-label', id);

    const svg = buildCursorSvg(asset, state.size, state.colors);
    const label = document.createElement('span');
    label.className = 'vol-cursor-cell__label';
    label.textContent = id;

    cell.appendChild(svg);
    cell.appendChild(label);
    grid.appendChild(cell);
    state.gridItems.set(id, cell);

    const select = (): void => {
      state.selectedId = id;
      state.renderer.set(id);
      applyCssCursor(grid, asset, state.size, state.colors);
      updateGrid(state);
      updateLivePreview(state);
    };

    cell.addEventListener('click', select);
    cell.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select();
      }
    });

    disposables.push({ destroy: () => cell.removeEventListener('click', select) });
  }

  return grid;
}

function buildLivePreview(state: DemoState, disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-cursor-live';

  const hint = new Text(i18next.t('volui:input.liveHint'), { variant: 'muted' });
  disposables.push(hint);
  wrap.appendChild(hint.element);

  state.liveSvg = buildCursorSvg(VOL_CURSOR_ASSETS[state.selectedId], state.size * 3, state.colors);
  state.liveSvg.classList.add('vol-cursor-live__svg');
  wrap.appendChild(state.liveSvg);

  return wrap;
}

function updateGrid(state: DemoState): void {
  for (const [id, cell] of state.gridItems) {
    const svg = cell.querySelector('svg');
    if (svg) {
      const newSvg = buildCursorSvg(VOL_CURSOR_ASSETS[id], state.size, state.colors);
      svg.replaceWith(newSvg);
    }
    const asset = VOL_CURSOR_ASSETS[id];
    applyCssCursor(cell, asset, state.size, state.colors);
    if (id === state.selectedId) {
      cell.classList.add('vol-cursor-cell--selected');
    } else {
      cell.classList.remove('vol-cursor-cell--selected');
    }
  }
}

function updateLivePreview(state: DemoState): void {
  const asset = VOL_CURSOR_ASSETS[state.selectedId];
  const newSvg = buildCursorSvg(asset, state.size * 3, state.colors);
  newSvg.classList.add('vol-cursor-live__svg');
  state.liveSvg.replaceWith(newSvg);
  state.liveSvg = newSvg;
}

export function buildInputTab(root: HTMLElement = document.body): {
  element: HTMLElement;
  destroy: () => void;
} {
  const container = document.createElement('div');
  container.className = 'vol-showcase-section';

  const disposables: Destroyable[] = [];

  const state: DemoState = {
    size: 24,
    colors: { ...VOL_CURSOR_COLORS },
    selectedId: 'default',
    sizeButtons: [],
    colorButtons: [],
    gridItems: new Map(),
    liveSvg: document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
    renderer: new DomCursorRenderer(root, { ...VolCursorTheme, colors: { ...VOL_CURSOR_COLORS } }),
  };
  disposables.push(state.renderer);

  const controls = buildControls(state, disposables);
  const grid = buildCursorGrid(state, disposables);
  const live = buildLivePreview(state, disposables);

  const cards = [
    card(i18next.t('volui:input.title'), live, { spanAll: true, center: true }),
    card(i18next.t('volui:input.controls'), controls, { spanAll: true }),
    card(i18next.t('volui:input.gallery'), grid, { spanAll: true }),
  ];

  const gridEl = cardGrid(cards);
  container.appendChild(gridEl);

  // İlk seçili cursoru overlay ve grid'e uygula.
  state.renderer.set('default');
  updateGrid(state);

  return {
    element: container,
    destroy: () => {
      for (const d of disposables) d.destroy();
      container.remove();
    },
  };
}
