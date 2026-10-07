import { DisposableScope } from '@volstudio/core/lifecycle';
import {
  CursorController,
  RETICLES,
  RTS_CURSORS,
  SegmentedControl,
  Slider,
  Text,
  UI_CURSORS,
  rtsCursorFor,
  scrollContextAt,
  type CursorId,
  type CursorTone,
  type ReticleId,
  type RtsContext,
} from '@volstudio/core/ui';
import { i18next } from '@volstudio/core/i18n';
import { card } from './shared';

function labelOf(text: string): HTMLSpanElement {
  const label = document.createElement('span');
  label.className = 'vol-showcase-icon-cell__name';
  label.textContent = text;
  return label;
}

/** Galeri hücresi: önizleme SVG'si, ad ve üzerine gelince GERÇEK imleç. */
function cursorCell(
  controller: CursorController,
  id: CursorId,
  tone: CursorTone = 'neutral',
): HTMLElement {
  const cell = document.createElement('div');
  cell.className = 'vol-showcase-icon-cell';
  cell.dataset.cursorId = id;
  const preview = document.createElement('div');
  preview.className = 'vol-showcase-cursor-preview';
  const svg = controller.previewSvg(id, tone, 48);
  if (svg) preview.innerHTML = svg;
  // Gerçek imleç görseli üzerine gelince kurulur: 60 hücreye baştan veri URL'si yazmak sekmenin ilk
  // gösterimini (başsız WebKit'te ≈150 ms) yavaşlatıyordu.
  cell.addEventListener(
    'pointerenter',
    () => {
      const css = controller.cssValue(id, tone);
      if (css) cell.style.cursor = css;
    },
    { once: true },
  );
  cell.append(preview, labelOf(id));
  return cell;
}

function reticleCell(controller: CursorController, id: ReticleId): HTMLElement {
  const cell = document.createElement('div');
  cell.className = 'vol-showcase-icon-cell';
  cell.dataset.reticleId = id;
  const preview = document.createElement('div');
  preview.className = 'vol-showcase-cursor-preview vol-showcase-cursor-preview--reticle';
  const svg = controller.reticleMarkup(id);
  if (svg) preview.innerHTML = svg;
  cell.append(preview, labelOf(id));
  return cell;
}

function readoutOf(key: string): HTMLElement {
  const element = document.createElement('div');
  element.className = 'vol-showcase-ses__readout';
  element.dataset.ses = key;
  return element;
}

const RTS_THINGS: ReadonlyArray<{ ctx: RtsContext; left: number; top: number }> = [
  { ctx: 'friendly', left: 14, top: 22 },
  { ctx: 'hostile', left: 58, top: 24 },
  { ctx: 'resource', left: 22, top: 62 },
  { ctx: 'tree', left: 46, top: 64 },
  { ctx: 'build', left: 70, top: 60 },
  { ctx: 'repair', left: 36, top: 40 },
  { ctx: 'garrison', left: 78, top: 36 },
  { ctx: 'blocked', left: 6, top: 44 },
];

/** RTS test alanı: imlecin altındaki şey bağlamı belirler; kenara yaklaşınca kaydırma oku çıkar. */
function buildRtsArena(disposables: DisposableScope): HTMLElement {
  const arena = document.createElement('div');
  arena.className = 'vol-showcase-arena';
  arena.dataset.arena = 'rts';
  for (const thing of RTS_THINGS) {
    const element = document.createElement('div');
    element.className = `vol-showcase-arena__thing vol-showcase-arena__thing--${thing.ctx}`;
    element.dataset.ctx = thing.ctx;
    element.style.left = `${thing.left}%`;
    element.style.top = `${thing.top}%`;
    element.textContent = thing.ctx;
    arena.appendChild(element);
  }
  const controller = new CursorController({ chrome: false, mode: 'rts', target: arena });
  disposables.add(controller);
  const readout = readoutOf('arena-rts');
  const update = (context: RtsContext): void => {
    controller.setContext(context);
    const choice = rtsCursorFor(context);
    readout.textContent = i18next.t('volui:kimlik.arena.state', {
      kind: context,
      cursor: choice.id,
      tone: choice.tone,
    });
    readout.dataset.value = `${context}/${choice.id}/${choice.tone}`;
  };
  disposables.addListener(arena, 'pointermove', (event) => {
    const pointer = event as PointerEvent;
    const rect = arena.getBoundingClientRect();
    const edge = scrollContextAt(
      { x: pointer.clientX - rect.left, y: pointer.clientY - rect.top },
      { width: rect.width, height: rect.height },
      14,
    );
    const thing = (event.target as HTMLElement).closest<HTMLElement>('[data-ctx]');
    update(edge ?? (thing?.dataset.ctx as RtsContext | undefined) ?? 'idle');
  });
  disposables.addListener(arena, 'pointerleave', () => update('idle'));
  update('idle');
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';
  const hint = new Text(i18next.t('volui:kimlik.arena.rtsHint'), { variant: 'muted' });
  disposables.addDestroyables(hint);
  wrap.append(hint.element, arena, readout);
  return wrap;
}

const SHOOTER_RETICLES: readonly ReticleId[] = ['ring', 'ringDot', 'sniper', 'corners'];

/** Nişangâh test alanı: işaretçiyi izler, tık atış (büyüme), hedefe isabet vuruş işareti verir. */
function buildShooterArena(disposables: DisposableScope): HTMLElement {
  const arena = document.createElement('div');
  arena.className = 'vol-showcase-arena vol-showcase-arena--shooter';
  arena.dataset.arena = 'shooter';
  for (let index = 0; index < 5; index += 1) {
    const target = document.createElement('div');
    target.className = 'vol-showcase-arena__target';
    target.dataset.target = String(index);
    target.style.left = `${10 + index * 18}%`;
    target.style.top = `${22 + (index % 2) * 34}%`;
    arena.appendChild(target);
  }
  const controller = new CursorController({
    chrome: false,
    mode: 'shooter',
    target: arena,
    reticle: 'ring',
  });
  disposables.add(controller);
  const readout = readoutOf('arena-shooter');
  let shots = 0;
  let hits = 0;
  const render = (): void => {
    readout.textContent = i18next.t('volui:kimlik.arena.shots', { shots, hits });
    readout.dataset.value = `${shots}/${hits}`;
  };
  disposables.addListener(arena, 'pointerdown', (event) => {
    shots += 1;
    controller.pulseReticle();
    if ((event.target as HTMLElement).closest('[data-target]')) {
      hits += 1;
      controller.markHit('hostile');
    }
    render();
  });
  render();

  const picker = new SegmentedControl({
    options: SHOOTER_RETICLES.map((id) => ({ value: id, label: id })),
    value: 'ring',
    ariaLabel: i18next.t('volui:kimlik.arena.reticle'),
    onInput: (value) => controller.setReticle(value as ReticleId),
  });
  const spread = new Slider({
    label: i18next.t('volui:kimlik.arena.spread'),
    min: 50,
    max: 200,
    value: 100,
    formatValue: (value) => `${Math.round(value)}%`,
    onInput: (value) => controller.setReticleScale(value / 100),
  });
  disposables.addDestroyables(picker, spread);
  const hint = new Text(i18next.t('volui:kimlik.arena.shooterHint'), { variant: 'muted' });
  disposables.addDestroyables(hint);
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';
  wrap.append(hint.element, picker.element, spread.element, arena, readout);
  return wrap;
}

export interface CursorSection {
  cards: HTMLElement[];
  destroy: () => void;
}

/** Kimlik sekmesinin imleç bölümü: kayıt galerileri ve iki canlı test alanı. */
export function buildCursorSection(): CursorSection {
  const disposables = new DisposableScope();
  // Önizleme/CSS değeri sahibi; arayüz imleçlerini kökte KURMAZ (uygulama denetleyicisi kurar).
  const gallery = new CursorController({ chrome: false, mode: 'ui' });
  disposables.add(gallery);

  const uiGrid = document.createElement('div');
  uiGrid.className = 'vol-showcase-icon-grid';
  const rtsGrid = document.createElement('div');
  rtsGrid.className = 'vol-showcase-icon-grid';
  const reticleGrid = document.createElement('div');
  reticleGrid.className = 'vol-showcase-icon-grid';
  void gallery.ready.then(() => {
    uiGrid.replaceChildren(...UI_CURSORS.map((id) => cursorCell(gallery, id)));
    rtsGrid.replaceChildren(
      ...RTS_CURSORS.map((id) => cursorCell(gallery, id, rtsCursorFor('idle').tone)),
    );
    reticleGrid.replaceChildren(...RETICLES.map((id) => reticleCell(gallery, id)));
  });

  const cards = [
    card(i18next.t('volui:kimlik.cursors.rtsArena'), buildRtsArena(disposables), { span: 6 }),
    card(i18next.t('volui:kimlik.cursors.shooterArena'), buildShooterArena(disposables), {
      span: 6,
    }),
    card(i18next.t('volui:kimlik.cursors.ui'), uiGrid, { span: 6 }),
    card(i18next.t('volui:kimlik.cursors.rts'), rtsGrid, { span: 6 }),
    card(i18next.t('volui:kimlik.cursors.reticles'), reticleGrid, { span: 6 }),
  ];
  return { cards, destroy: () => disposables.dispose() };
}
