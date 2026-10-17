import type { DisposableScope } from '@volstudio/core/lifecycle';
import {
  Button,
  Text,
  openActionDialog,
  showDestructiveConfirm,
  showDialog,
  showExitPrompt,
  showLegalDocument,
  showPermissionPrompt,
  showSyncConflict,
  startGuidedTour,
  type TourStep,
} from '@volstudio/core/ui';
import { i18next } from '@volstudio/core/i18n';
import { CREDIT_ENTRIES } from '../credits';

/** Not anahtarları düz metin: çeviri yüzeyi denetimi şablonlu anahtar adlarını göremez. */
const CREDIT_NOTES = {
  cc0: () => i18next.t('volui:panels.legalCc0Note'),
  icons: () => i18next.t('volui:panels.legalIconsNote'),
  font: () => i18next.t('volui:panels.legalFontNote'),
} as const;

/** Sahne yıkılınca açık diyalog/tur/belge iptal edilsin diye tek bir iptal sinyali. */
function sceneSignal(disposables: DisposableScope): AbortSignal {
  const controller = new AbortController();
  disposables.add({ dispose: () => controller.abort() });
  return controller.signal;
}

/** Benzetilmiş gecikme: iptal edilirse reddedilir (gerçek bir ağ/disk işi gibi). */
function simulatedWork(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        reject(new DOMException('iptal', 'AbortError'));
      },
      { once: true },
    );
  });
}

function resultLine(wrap: HTMLElement, disposables: DisposableScope, idle: string): Text {
  const result = new Text(idle, { variant: 'muted' });
  // Sonuç satırı okuyucuya da bildirilir: görsel sonuç tek başına yeterli sayılmaz.
  result.element.setAttribute('role', 'status');
  result.element.classList.add('vol-showcase-dialog-result');
  disposables.addDestroyables(result);
  wrap.appendChild(result.element);
  return result;
}

function controlRow(wrap: HTMLElement): HTMLElement {
  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';
  wrap.appendChild(controls);
  return controls;
}

/** Yıkıcı onay, çıkış, izin, özel ve kendiliğinden kapanan diyalog; her biri çekirdeğin kalıbıdır. */
export function buildDialogPatternsDemo(
  disposables: DisposableScope,
  container: HTMLElement,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';
  const signal = sceneSignal(disposables);
  const controls = controlRow(wrap);
  const result = resultLine(wrap, disposables, i18next.t('volui:panels.dpIdle'));
  const report = (value: string): void =>
    result.setContent(i18next.t('volui:panels.dpResult', { value }));

  // Tetikleyici işleyici HEMEN döner: söz beklenirse düğme diyalog boyunca `disabled` kalır ve kapanışta odak ona verilemez.
  const add = (label: string, run: () => Promise<void>, variant?: 'danger'): void => {
    const button = new Button(label, {
      variant,
      fullWidth: false,
      onClick: () => {
        void run();
      },
    });
    button.element.classList.add('vol-showcase-dialog-trigger');
    disposables.addDestroyables(button);
    controls.appendChild(button.element);
  };

  add(
    i18next.t('volui:panels.dpDestructive'),
    async () => {
      const confirmed = await showDestructiveConfirm({
        title: i18next.t('volui:panels.dpDestructiveTitle'),
        message: i18next.t('volui:panels.dpDestructiveMessage'),
        confirmLabel: i18next.t('volui:panels.dpDestructiveConfirm'),
        container,
        signal,
      });
      report(confirmed ? 'confirm' : 'cancel');
    },
    'danger',
  );

  const exitDemo = (failFirst: boolean) => async (): Promise<void> => {
    let attempts = 0;
    const choice = await showExitPrompt({
      container,
      signal,
      save: async (saveSignal) => {
        attempts += 1;
        await simulatedWork(600, saveSignal);
        if (failFirst && attempts === 1) throw new Error('simulated disk error');
      },
    });
    report(choice);
  };
  add(i18next.t('volui:panels.dpExit'), exitDemo(false));
  add(i18next.t('volui:panels.dpExitFails'), exitDemo(true));

  add(i18next.t('volui:panels.dpPermission'), async () => {
    const choice = await showPermissionPrompt({
      title: i18next.t('volui:panels.dpPermissionTitle'),
      reason: i18next.t('volui:panels.dpPermissionReason'),
      request: (requestSignal) => simulatedWork(500, requestSignal),
      container,
      signal,
    });
    report(choice);
  });

  add(i18next.t('volui:panels.dpCustom'), async () => {
    const picked = await showDialog({
      title: i18next.t('volui:panels.dpCustomTitle'),
      message: i18next.t('volui:panels.dpCustomMessage'),
      actions: [
        { id: 'next', label: i18next.t('volui:panels.dpCustomNext'), variant: 'primary' },
        { id: 'map', label: i18next.t('volui:panels.dpCustomMap') },
        { id: 'stay', label: i18next.t('volui:panels.dpCustomStay') },
      ],
      cancelId: 'stay',
      container,
      signal,
    });
    report(picked);
  });

  add(i18next.t('volui:panels.dpAuto'), async () => {
    const handle = openActionDialog({
      title: i18next.t('volui:panels.dpAutoTitle'),
      message: i18next.t('volui:panels.dpAutoMessage'),
      actions: [{ id: 'ok', label: i18next.t('volui:panels.dpAutoOk'), variant: 'primary' }],
      cancelId: 'ok',
      container,
      signal,
    });
    const timer = window.setTimeout(() => handle.close('timeout'), 3000);
    const picked = await handle.result;
    window.clearTimeout(timer);
    report(picked);
  });

  return wrap;
}

/** Yerel–uzak çakışması: uzak kopya BENZETİLMİŞTİR; gerçek bir bulut hizmeti gibi sunulmaz. */
export function buildSyncConflictDemo(
  disposables: DisposableScope,
  container: HTMLElement,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';
  const signal = sceneSignal(disposables);
  const note = new Text(i18next.t('volui:panels.scNote'), { variant: 'muted' });
  disposables.addDestroyables(note);
  wrap.appendChild(note.element);
  const controls = controlRow(wrap);
  const result = resultLine(wrap, disposables, i18next.t('volui:panels.dpIdle'));

  const open = (failFirst: boolean) => async (): Promise<void> => {
    let attempts = 0;
    const choice = await showSyncConflict({
      local: { summary: i18next.t('volui:panels.scLocal') },
      remote: { summary: i18next.t('volui:panels.scRemote') },
      container,
      signal,
      resolve: async (_picked, workSignal) => {
        attempts += 1;
        await simulatedWork(700, workSignal);
        if (failFirst && attempts === 1) throw new Error('simulated network error');
      },
    });
    result.setContent(i18next.t('volui:panels.dpResult', { value: choice }));
  };
  for (const [label, failFirst] of [
    [i18next.t('volui:panels.scOpen'), false],
    [i18next.t('volui:panels.scOpenFails'), true],
  ] as const) {
    const run = open(failFirst);
    const button = new Button(label, {
      fullWidth: false,
      onClick: () => {
        void run();
      },
    });
    button.element.classList.add('vol-showcase-dialog-trigger');
    disposables.addDestroyables(button);
    controls.appendChild(button.element);
  }
  return wrap;
}

/** İlk kullanım turu: işaret edilen üç düğme kartın içindedir, adımlar onları sırayla gösterir. */
export function buildGuidedTourDemo(
  disposables: DisposableScope,
  container: HTMLElement,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';
  const signal = sceneSignal(disposables);

  const stage = document.createElement('div');
  stage.className = 'vol-showcase-panel-demo__controls vol-showcase-tour-stage';
  const targets = [
    i18next.t('volui:panels.tourSettings'),
    i18next.t('volui:panels.tourInventory'),
    i18next.t('volui:panels.tourMap'),
  ].map((label) => {
    const button = new Button(label, { fullWidth: false });
    disposables.addDestroyables(button);
    stage.appendChild(button.element);
    return button.element;
  });
  wrap.appendChild(stage);

  const result = resultLine(wrap, disposables, i18next.t('volui:panels.tourIdle'));
  const start = new Button(i18next.t('volui:panels.tourStart'), {
    variant: 'primary',
    fullWidth: false,
    onClick: () => {
      // Anahtarlar düz metin olarak yazılır: çeviri yüzeyi denetimi dinamik anahtar adlarını göremez.
      const texts = [
        {
          title: i18next.t('volui:panels.tourStep1Title'),
          body: i18next.t('volui:panels.tourStep1Body'),
        },
        {
          title: i18next.t('volui:panels.tourStep2Title'),
          body: i18next.t('volui:panels.tourStep2Body'),
        },
        {
          title: i18next.t('volui:panels.tourStep3Title'),
          body: i18next.t('volui:panels.tourStep3Body'),
        },
      ];
      const steps: TourStep[] = targets.map((target, index) => ({ target, ...texts[index] }));
      void startGuidedTour({ steps, container, signal }).result.then((outcome) =>
        result.setContent(i18next.t('volui:panels.tourResult', { value: outcome })),
      );
    },
  });
  start.element.classList.add('vol-showcase-tour-start');
  disposables.addDestroyables(start);
  wrap.appendChild(start.element);
  return wrap;
}

/** Kredi ve yasal metin; satırlar depodaki varlık kayıtlarından (bkz. `credits.ts`) gelir. */
export function buildLegalDemo(disposables: DisposableScope, container: HTMLElement): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';
  const signal = sceneSignal(disposables);
  const open = new Button(i18next.t('volui:panels.legalOpen'), {
    variant: 'primary',
    fullWidth: false,
    onClick: () => {
      showLegalDocument({
        title: i18next.t('volui:panels.legalTitle'),
        sections: [
          {
            heading: i18next.t('volui:panels.legalProjectHeading'),
            paragraphs: [i18next.t('volui:panels.legalProjectText')],
          },
          {
            heading: i18next.t('volui:panels.legalAssetsHeading'),
            paragraphs: [i18next.t('volui:panels.legalAssetsText')],
          },
        ],
        attributions: CREDIT_ENTRIES.map(({ note, ...entry }) => ({
          ...entry,
          note: note ? CREDIT_NOTES[note]() : undefined,
        })),
        container,
        signal,
      });
    },
  });
  open.element.classList.add('vol-showcase-legal-trigger');
  disposables.addDestroyables(open);
  wrap.appendChild(open.element);
  return wrap;
}
