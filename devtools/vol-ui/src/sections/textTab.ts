import { AnimatedLabel, Button, Text } from '@volstudio/core/ui';
import type {
  AnimatedLabelContinuousEffect,
  AnimatedLabelEffect,
  TextVariant,
} from '@volstudio/core/ui';
import { i18next } from '@volstudio/core/i18n';
import { card, cardGrid } from './shared';

interface Destroyable {
  destroy(): void;
}

/** Her Text varyantının theme.css'teki font ailesi (Text.ts ile eşleşmeli). */
const VARIANT_FONTS: Record<TextVariant, string> = {
  title: 'Jura',
  heading: 'Jura',
  body: 'Exo 2',
  muted: 'Exo 2',
};

function sampleCard(
  title: string,
  variant: TextVariant,
  sample: string,
  disposables: Destroyable[],
  options: { spanAll?: boolean } = {},
): HTMLElement {
  const sampleText = new Text(sample, { variant, tag: 'p' });
  sampleText.element.style.textAlign = 'left';
  disposables.push(sampleText);

  const body = document.createElement('div');
  body.appendChild(sampleText.element);

  return card(`${title} · ${VARIANT_FONTS[variant]}`, body, options);
}

/** Tıklanabilir efekt: butona basınca bir kez oynar. */
function triggeredEffectCard(
  title: string,
  effect: AnimatedLabelEffect,
  sample: string,
  disposables: Destroyable[],
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const label = new AnimatedLabel(sample, { effect, tag: 'span' });
  label.element.classList.add('vol-showcase-animated-label-sample');
  disposables.push(label);

  const replayButton = new Button(i18next.t('volui:text.play'), { onClick: () => label.replay() });
  disposables.push(replayButton);

  wrap.appendChild(label.element);
  wrap.appendChild(replayButton.element);

  return card(`${title} ${i18next.t('volui:text.clickable')}`, wrap);
}

/** Otomatik efekt: yüklemede sonsuz döngüde oynar. */
function continuousEffectCard(
  title: string,
  effect: AnimatedLabelContinuousEffect,
  sample: string,
  disposables: Destroyable[],
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const label = new AnimatedLabel(sample, { tag: 'span' });
  label.element.classList.add('vol-showcase-animated-label-sample');
  label.setContinuousEffect(effect);
  disposables.push(label);

  const hint = new Text(i18next.t('volui:text.autoPlaying'), { variant: 'muted' });
  disposables.push(hint);

  wrap.appendChild(label.element);
  wrap.appendChild(hint.element);

  return card(`${title} ${i18next.t('volui:text.automatic')}`, wrap);
}

export function buildTextTab(): { element: HTMLElement; destroy: () => void } {
  const container = document.createElement('div');
  container.className = 'vol-showcase-section';
  const disposables: Destroyable[] = [];

  const cards = [
    sampleCard(
      i18next.t('volui:text.title'),
      'title',
      i18next.t('volui:text.sampleTitle'),
      disposables,
      { spanAll: true },
    ),
    sampleCard(
      i18next.t('volui:text.heading'),
      'heading',
      i18next.t('volui:text.sampleHeading'),
      disposables,
    ),
    sampleCard(
      i18next.t('volui:text.body'),
      'body',
      i18next.t('volui:text.sampleBody'),
      disposables,
    ),
    sampleCard(
      i18next.t('volui:text.muted'),
      'muted',
      i18next.t('volui:text.sampleMuted'),
      disposables,
    ),
    triggeredEffectCard(
      i18next.t('volui:text.fade'),
      'fade',
      i18next.t('volui:text.newRecord'),
      disposables,
    ),
    triggeredEffectCard(
      i18next.t('volui:text.slideUp'),
      'slide-up',
      i18next.t('volui:text.wave4'),
      disposables,
    ),
    triggeredEffectCard(
      i18next.t('volui:text.pop'),
      'pop',
      i18next.t('volui:text.comboX5'),
      disposables,
    ),
    triggeredEffectCard(
      i18next.t('volui:text.glow'),
      'glow',
      i18next.t('volui:text.legendary'),
      disposables,
    ),
    continuousEffectCard(
      i18next.t('volui:text.wave'),
      'wave',
      i18next.t('volui:text.waveEffect'),
      disposables,
    ),
    continuousEffectCard(
      i18next.t('volui:text.jump'),
      'jump',
      i18next.t('volui:text.jumpingText'),
      disposables,
    ),
    continuousEffectCard(
      i18next.t('volui:text.shake'),
      'shake',
      i18next.t('volui:text.danger'),
      disposables,
    ),
    continuousEffectCard(
      i18next.t('volui:text.rainbow'),
      'rainbow',
      i18next.t('volui:text.rainbowText'),
      disposables,
    ),
    continuousEffectCard(
      i18next.t('volui:text.gradient'),
      'gradient',
      i18next.t('volui:text.gradientText'),
      disposables,
    ),
  ];

  container.appendChild(cardGrid(cards));

  return {
    element: container,
    destroy: () => disposables.forEach((d) => d.destroy()),
  };
}
