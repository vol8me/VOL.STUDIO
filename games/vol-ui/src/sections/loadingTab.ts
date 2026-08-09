import {
  Button,
  LoadingScreen,
  type LoadingScreenOptions,
  type LoadingIndicatorType,
  type LoadingTransitionType,
  type LoadingContentPosition,
  Text,
  i18next,
} from '@volstudio/core';
import { card, paletteGrid } from './shared';

interface Destroyable {
  destroy(): void;
}

/** Aktif loading preview'ı takip eder — aynı anda yalnızca bir tane olur. */
let activePreview: {
  loading: LoadingScreen;
  interval: ReturnType<typeof setInterval> | null;
  hideTimeout: ReturnType<typeof setTimeout> | null;
} | null = null;

function clearActivePreview(): void {
  if (!activePreview) return;
  if (activePreview.interval) clearInterval(activePreview.interval);
  if (activePreview.hideTimeout) clearTimeout(activePreview.hideTimeout);
  activePreview.loading.destroy();
  activePreview = null;
}

/** Loading preview başlat — önceki preview'ı temizler, yenisini takip eder. */
function startPreview(
  options: LoadingScreenOptions,
  progressStep: number,
  progressIntervalMs: number,
  hideDelayMs = 200,
): void {
  clearActivePreview();

  const loading = new LoadingScreen({
    ...options,
    onComplete: () => {
      loading.destroy();
      activePreview = null;
    },
  });
  document.body.appendChild(loading.element);
  loading.show();

  let percent = 0;
  const interval = setInterval(() => {
    percent = Math.min(100, percent + progressStep);
    loading.update(percent);
    if (percent >= 100) {
      clearInterval(interval);
      const hideTimeout = setTimeout(() => loading.hide(), hideDelayMs);
      if (activePreview) activePreview.hideTimeout = hideTimeout;
    }
  }, progressIntervalMs);

  activePreview = { loading, interval, hideTimeout: null };
}

/** Orbital-rings + energy-core gösterge tipi seçici. */
function buildIndicatorTypeDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const info = new Text(i18next.t('volui:loading.selectTypeHint'), {
    variant: 'muted',
  });
  disposables.push(info);
  wrap.appendChild(info.element);

  const btnRow = document.createElement('div');
  btnRow.style.display = 'flex';
  btnRow.style.gap = 'var(--vol-space-sm)';
  btnRow.style.flexWrap = 'wrap';

  let currentType: LoadingIndicatorType = 'orbital-rings';
  let currentTransition: LoadingTransitionType = 'fade';

  const typeLabels: Record<LoadingIndicatorType, string> = {
    'orbital-rings': i18next.t('volui:loading.orbitalRings'),
    'energy-core': i18next.t('volui:loading.energyCore'),
    'particle-orbit': i18next.t('volui:loading.particleOrbit'),
    'hexagon-pulse': i18next.t('volui:loading.hexagonPulse'),
    bar: i18next.t('volui:loading.bar'),
  };

  const typeOrder: LoadingIndicatorType[] = [
    'orbital-rings',
    'energy-core',
    'particle-orbit',
    'hexagon-pulse',
    'bar',
  ];

  const typeBtn = new Button(i18next.t('volui:loading.orbitalRings'), {
    variant: 'default',
    onClick: () => {
      const idx = typeOrder.indexOf(currentType);
      currentType = typeOrder[(idx + 1) % typeOrder.length];
      typeBtn.element.textContent = typeLabels[currentType];
    },
  });
  disposables.push(typeBtn);
  btnRow.appendChild(typeBtn.element);

  const transLabels: Record<LoadingTransitionType, string> = {
    fade: i18next.t('volui:loading.fade'),
    slide: i18next.t('volui:loading.slide'),
    zoom: i18next.t('volui:loading.zoom'),
  };

  const transBtn = new Button(i18next.t('volui:loading.fade'), {
    variant: 'default',
    onClick: () => {
      const order: LoadingTransitionType[] = ['fade', 'slide', 'zoom'];
      const idx = order.indexOf(currentTransition);
      currentTransition = order[(idx + 1) % order.length];
      transBtn.element.textContent = transLabels[currentTransition];
    },
  });
  disposables.push(transBtn);
  btnRow.appendChild(transBtn.element);

  const previewBtn = new Button(i18next.t('volui:loading.fullScreenPreview'), {
    variant: 'primary',
    onClick: () => {
      startPreview(
        {
          indicator: { type: currentType, size: 140 },
          showPercent: true,
          transitionType: currentTransition,
          transitionMs: 500,
          minDisplayMs: 2000,
        },
        Math.random() * 15 + 5,
        150,
      );
    },
  });
  disposables.push(previewBtn);
  btnRow.appendChild(previewBtn.element);

  wrap.appendChild(btnRow);
  return wrap;
}

/** Min. gösterim süresi demosu — hızlı yükleme ama yine de 2s göster. */
function buildMinDisplayDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const info = new Text(i18next.t('volui:loading.minDisplayHint'), {
    variant: 'muted',
  });
  disposables.push(info);
  wrap.appendChild(info.element);

  const btn = new Button(i18next.t('volui:loading.fastLoading'), {
    variant: 'primary',
    onClick: () => {
      startPreview(
        {
          indicator: { type: 'orbital-rings' },
          showPercent: true,
          minDisplayMs: 2000,
          transitionMs: 400,
        },
        25,
        120,
        0,
      );
    },
  });
  disposables.push(btn);
  wrap.appendChild(btn.element);

  return wrap;
}

/** Başlık + alt başlık demosu. */
function buildTextDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const btn = new Button(i18next.t('volui:loading.titledLoading'), {
    variant: 'primary',
    onClick: () => {
      startPreview(
        {
          indicator: { type: 'energy-core', color: 'var(--vol-ui-support-solid)' },
          title: i18next.t('volui:loading.worldLoading'),
          subtitle: i18next.t('volui:loading.assetsLoading'),
          showPercent: true,
          minDisplayMs: 2000,
        },
        10,
        150,
      );
    },
  });
  disposables.push(btn);
  wrap.appendChild(btn.element);

  return wrap;
}

/** İçerik konumu demosu — göstergeyi ekranın farklı köşelerine yerleştir. */
function buildContentPositionDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const info = new Text(i18next.t('volui:loading.selectPositionHint'), {
    variant: 'muted',
  });
  disposables.push(info);
  wrap.appendChild(info.element);

  const btnRow = document.createElement('div');
  btnRow.style.display = 'flex';
  btnRow.style.gap = 'var(--vol-space-sm)';
  btnRow.style.flexWrap = 'wrap';

  let currentPos: LoadingContentPosition = 'bottom-right';

  const posLabels: Record<LoadingContentPosition, string> = {
    center: i18next.t('volui:loading.center'),
    'top-left': i18next.t('volui:loading.topLeft'),
    'top-right': i18next.t('volui:loading.topRight'),
    'bottom-left': i18next.t('volui:loading.bottomLeft'),
    'bottom-right': i18next.t('volui:loading.bottomRight'),
  };

  const posOrder: LoadingContentPosition[] = [
    'center',
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right',
  ];

  const posBtn = new Button(i18next.t('volui:loading.bottomRight'), {
    variant: 'default',
    onClick: () => {
      const idx = posOrder.indexOf(currentPos);
      currentPos = posOrder[(idx + 1) % posOrder.length];
      posBtn.element.textContent = posLabels[currentPos];
    },
  });
  disposables.push(posBtn);
  btnRow.appendChild(posBtn.element);

  const previewBtn = new Button(i18next.t('volui:loading.fullScreenPreview'), {
    variant: 'primary',
    onClick: () => {
      startPreview(
        {
          indicator: { type: 'bar', size: 200 },
          contentPosition: currentPos,
          showPercent: true,
          title: i18next.t('volui:loading.loading'),
          minDisplayMs: 2000,
          progressMs: 400,
        },
        Math.random() * 15 + 5,
        150,
      );
    },
  });
  disposables.push(previewBtn);
  btnRow.appendChild(previewBtn.element);

  wrap.appendChild(btnRow);
  return wrap;
}

/** Progress animasyon hızı demosu — hızlı vs yavaş geçiş. */
function buildProgressSpeedDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const info = new Text(i18next.t('volui:loading.progressSpeedHint'), {
    variant: 'muted',
  });
  disposables.push(info);
  wrap.appendChild(info.element);

  const btnRow = document.createElement('div');
  btnRow.style.display = 'flex';
  btnRow.style.gap = 'var(--vol-space-sm)';
  btnRow.style.flexWrap = 'wrap';

  function makeBtn(label: string, progressMs: number): void {
    const btn = new Button(label, {
      variant: 'default',
      onClick: () => {
        startPreview(
          {
            indicator: { type: 'orbital-rings' },
            showPercent: true,
            progressMs,
            minDisplayMs: 2000,
          },
          20,
          400,
        );
      },
    });
    disposables.push(btn);
    btnRow.appendChild(btn.element);
  }

  makeBtn(i18next.t('volui:loading.fast'), 100);
  makeBtn(i18next.t('volui:loading.defaultSpeed'), 300);
  makeBtn(i18next.t('volui:loading.slow'), 800);

  wrap.appendChild(btnRow);
  return wrap;
}

export function buildLoadingTab(): {
  element: HTMLElement;
  destroy: () => void;
} {
  const container = document.createElement('div');
  container.className = 'vol-showcase-section';
  const disposables: Destroyable[] = [];

  const cards = [
    card(i18next.t('volui:loading.indicatorTypes'), buildIndicatorTypeDemo(disposables), {
      span: 4,
    }),
    card(i18next.t('volui:loading.minDisplayTime'), buildMinDisplayDemo(disposables), { span: 4 }),
    card(i18next.t('volui:loading.titleSubtitle'), buildTextDemo(disposables), { span: 4 }),
    card(i18next.t('volui:loading.contentPosition'), buildContentPositionDemo(disposables), {
      span: 6,
    }),
    card(i18next.t('volui:loading.progressSpeed'), buildProgressSpeedDemo(disposables), {
      span: 6,
    }),
  ];

  container.appendChild(paletteGrid(cards));

  return {
    element: container,
    destroy: () => {
      clearActivePreview();
      disposables.forEach((d) => d.destroy());
    },
  };
}
