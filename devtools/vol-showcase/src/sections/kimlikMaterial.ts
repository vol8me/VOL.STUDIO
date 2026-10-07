import { DisposableScope } from '@volstudio/core/lifecycle';
import {
  Bar,
  Button,
  Icon,
  IconButton,
  JUICE_KINDS,
  Text,
  playJuice,
  type JuiceKind,
} from '@volstudio/core/ui';
import { i18next } from '@volstudio/core/i18n';
import { card } from './shared';

function swatch(className: string, name: string): HTMLElement {
  const element = document.createElement('div');
  element.className = `vol-showcase-material__swatch ${className}`;
  element.dataset.material = name;
  const label = new Text(name, { variant: 'muted', tag: 'span' });
  element.appendChild(label.element);
  return element;
}

function row(...children: HTMLElement[]): HTMLElement {
  const element = document.createElement('div');
  element.className = 'vol-showcase-ses__row';
  element.append(...children);
  return element;
}

export interface MaterialSection {
  cards: HTMLElement[];
  destroy: () => void;
}

/**
 * Kimlik sekmesinin malzeme bölümü (UI-01.7): aynı yüzeyler her skinde. Yüzeyler tek ışık
 * yönüyle (üstten) aydınlanır; çerçeve, bar ve düğmeler aynı token ve parametrelerden gelir.
 */
export function buildMaterialSection(): MaterialSection {
  const disposables = new DisposableScope();

  const surfaces = document.createElement('div');
  surfaces.className = 'vol-showcase-material__surfaces';
  surfaces.append(
    swatch('vol-mat', i18next.t('volui:kimlik.material.plate')),
    swatch('vol-mat vol-mat--panel', i18next.t('volui:kimlik.material.panel')),
    swatch('vol-mat vol-mat--well', i18next.t('volui:kimlik.material.well')),
    swatch('vol-mat vol-mat--pressed', i18next.t('volui:kimlik.material.pressed')),
  );

  const frame = document.createElement('div');
  frame.className = 'vol-showcase-material__frame vol-frame vol-mat vol-mat--panel';
  const header = document.createElement('div');
  header.className = 'vol-frame__header vol-showcase-material__frame-header';
  const title = new Text(i18next.t('volui:kimlik.material.frameTitle'), {
    variant: 'muted',
    tag: 'span',
  });
  header.appendChild(title.element);
  const divider = document.createElement('hr');
  divider.className = 'vol-frame__divider';
  const body = new Text(i18next.t('volui:kimlik.material.frameBody'), { variant: 'muted' });
  disposables.addDestroyables(title, body);
  frame.append(header, body.element, divider);

  const bars = [
    new Bar({ variant: 'health', max: 100, value: 100, label: (v, m) => `${v} / ${m}` }),
    new Bar({ variant: 'stamina', max: 100, value: 70, label: (v, m) => `${v} / ${m}` }),
    new Bar({ variant: 'cooldown', max: 100, value: 35, label: (v, m) => `${v} / ${m}` }),
    new Bar({
      variant: 'health',
      max: 100,
      value: 15,
      lowThreshold: 0.25,
      label: (v, m) => `${v} / ${m}`,
    }),
  ];
  disposables.addDestroyables(...bars);
  const barBody = document.createElement('div');
  barBody.className = 'vol-showcase-panel-demo';
  barBody.append(...bars.map((bar) => bar.element));

  const buttons = [
    new Button(i18next.t('volui:kimlik.material.buttonDefault'), { fullWidth: false }),
    new Button(i18next.t('volui:kimlik.material.buttonPrimary'), {
      variant: 'primary',
      fullWidth: false,
    }),
    new Button(i18next.t('volui:kimlik.material.buttonDanger'), {
      variant: 'danger',
      fullWidth: false,
    }),
    new Button(i18next.t('volui:kimlik.material.buttonDisabled'), {
      disabled: true,
      fullWidth: false,
    }),
  ];
  const icons = (['attack', 'build', 'repair', 'target'] as const).map(
    (name, index) =>
      new IconButton(new Icon({ name, size: 28 }).element, {
        label: name,
        variant: index === 1 ? 'primary' : 'default',
      }),
  );
  disposables.addDestroyables(...buttons, ...icons);
  const buttonBody = document.createElement('div');
  buttonBody.className = 'vol-showcase-panel-demo';
  buttonBody.append(
    row(...buttons.map((button) => button.element)),
    row(...icons.map((button) => button.element)),
  );

  // Juice: her düğme, hedef çubuğunda ilgili etkiyi bir kez oynatır.
  const juiceTarget = bars[0].element;
  const juiceLabels: Record<JuiceKind, string> = {
    pop: i18next.t('volui:kimlik.material.juicePop'),
    flash: i18next.t('volui:kimlik.material.juiceFlash'),
    shake: i18next.t('volui:kimlik.material.juiceShake'),
    enter: i18next.t('volui:kimlik.material.juiceEnter'),
  };
  const juiceButtons = JUICE_KINDS.map(
    (kind) =>
      new Button(juiceLabels[kind], {
        fullWidth: false,
        onClick: () => playJuice(juiceTarget, kind),
      }),
  );
  disposables.addDestroyables(...juiceButtons);
  buttonBody.append(row(...juiceButtons.map((button) => button.element)));

  return {
    cards: [
      card(i18next.t('volui:kimlik.material.surfaces'), surfaces, { span: 6 }),
      card(i18next.t('volui:kimlik.material.frame'), frame, { span: 6 }),
      card(i18next.t('volui:kimlik.material.bars'), barBody, { span: 6 }),
      card(i18next.t('volui:kimlik.material.buttons'), buttonBody, { span: 6 }),
    ],
    destroy: () => disposables.dispose(),
  };
}
