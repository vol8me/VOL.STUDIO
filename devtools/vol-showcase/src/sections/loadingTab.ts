import { DisposableScope, type CancellableDisposable } from '@volstudio/core/lifecycle';
import {
  Button,
  LoadingScreen,
  type LoadingScreenOptions,
  type LoadingIndicatorType,
  type LoadingTransitionType,
  type LoadingContentPosition,
  Text,
} from '@volstudio/core/ui';
import { i18next } from '@volstudio/core/i18n';
import { card, paletteGrid } from './shared';

/** Aktif loading preview'ı takip eder — aynı anda yalnızca bir tane olur. */
let activePreview: {
  loading: LoadingScreen;
  interval: CancellableDisposable | null;
  hideTimeout: CancellableDisposable | null;
} | null = null;

function clearActivePreview(): void {
  if (!activePreview) return;
  activePreview.interval?.cancel();
  activePreview.hideTimeout?.cancel();
  activePreview.loading.destroy();
  activePreview = null;
}

/** Loading preview başlat — önceki preview'ı temizler, yenisini takip eder. */
function startPreview(
  disposables: DisposableScope,
  options: LoadingScreenOptions,
  progressStep: number,
  progressIntervalMs: number,
  hideDelayMs = 200,
): void {
  clearActivePreview();

  const loading = new LoadingScreen({
    ...options,
    onComplete: () => {
      clearActivePreview();
    },
  });
  document.body.appendChild(loading.element);
  loading.show();

  let percent = 0;
  const preview: NonNullable<typeof activePreview> = {
    loading,
    interval: null,
    hideTimeout: null,
  };
  activePreview = preview;
  preview.interval = disposables.addInterval(() => {
    percent = Math.min(100, percent + progressStep);
    loading.update(percent);
    if (percent >= 100) {
      preview.interval?.cancel();
      preview.interval = null;
      preview.hideTimeout = disposables.addTimeout(() => loading.hide(), hideDelayMs);
    }
  }, progressIntervalMs);
}

/** Orbital-rings + energy-core gösterge tipi seçici. */
function buildIndicatorTypeDemo(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const info = new Text(i18next.t('volui:loading.selectTypeHint'), {
    variant: 'muted',
  });
  disposables.addDestroyables(info);
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
  disposables.addDestroyables(typeBtn);
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
  disposables.addDestroyables(transBtn);
  btnRow.appendChild(transBtn.element);

  const previewBtn = new Button(i18next.t('volui:loading.fullScreenPreview'), {
    variant: 'primary',
    onClick: () => {
      startPreview(
        disposables,
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
  disposables.addDestroyables(previewBtn);
  btnRow.appendChild(previewBtn.element);

  wrap.appendChild(btnRow);
  return wrap;
}

/** Min. gösterim süresi demosu — hızlı yükleme ama yine de 2s göster. */
function buildMinDisplayDemo(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const info = new Text(i18next.t('volui:loading.minDisplayHint'), {
    variant: 'muted',
  });
  disposables.addDestroyables(info);
  wrap.appendChild(info.element);

  const btn = new Button(i18next.t('volui:loading.fastLoading'), {
    variant: 'primary',
    onClick: () => {
      startPreview(
        disposables,
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
  disposables.addDestroyables(btn);
  wrap.appendChild(btn.element);

  return wrap;
}

/** Başlık + alt başlık demosu. */
function buildTextDemo(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const btn = new Button(i18next.t('volui:loading.titledLoading'), {
    variant: 'primary',
    onClick: () => {
      startPreview(
        disposables,
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
  disposables.addDestroyables(btn);
  wrap.appendChild(btn.element);

  return wrap;
}

/** İçerik konumu demosu — göstergeyi ekranın farklı köşelerine yerleştir. */
function buildContentPositionDemo(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const info = new Text(i18next.t('volui:loading.selectPositionHint'), {
    variant: 'muted',
  });
  disposables.addDestroyables(info);
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
  disposables.addDestroyables(posBtn);
  btnRow.appendChild(posBtn.element);

  const previewBtn = new Button(i18next.t('volui:loading.fullScreenPreview'), {
    variant: 'primary',
    onClick: () => {
      startPreview(
        disposables,
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
  disposables.addDestroyables(previewBtn);
  btnRow.appendChild(previewBtn.element);

  wrap.appendChild(btnRow);
  return wrap;
}

/** Progress animasyon hızı demosu — hızlı vs yavaş geçiş. */
function buildProgressSpeedDemo(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const info = new Text(i18next.t('volui:loading.progressSpeedHint'), {
    variant: 'muted',
  });
  disposables.addDestroyables(info);
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
          disposables,
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
    disposables.addDestroyables(btn);
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
  const disposables = new DisposableScope();

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
      disposables.dispose();
    },
  };
}
