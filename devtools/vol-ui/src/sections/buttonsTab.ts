import { Button, IconButton, Tooltip } from '@volstudio/core/ui';
import { i18next } from '@volstudio/core/i18n';
import { card, cardGrid, svgIcon } from './shared';
import {
  ICON_CENTER,
  ICON_CHECK,
  ICON_CLOSE,
  ICON_COIN,
  ICON_FAST_FORWARD,
  ICON_FOLLOW,
  ICON_GEAR,
  ICON_GUARD,
  ICON_LOCK,
  ICON_PAUSE,
  ICON_PLAY,
  ICON_SAVE,
  ICON_STOP,
  ICON_TRASH,
  ICON_VOLUME_OFF,
  ICON_VOLUME_ON,
  ICON_ZOOM_IN,
  ICON_ZOOM_OUT,
} from './icons';

interface Destroyable {
  destroy(): void;
}

/** equalWidth:true (varsayılan) en geniş butona hizalar; false doğal genişlik korur. */
function buttonGroup(
  buttons: Button[],
  disposables: Destroyable[],
  equalWidth = true,
): HTMLElement {
  const group = document.createElement('div');
  group.className = equalWidth ? 'vol-button-group' : 'vol-button-group vol-button-group--natural';
  for (const button of buttons) {
    group.appendChild(button.element);
    disposables.push(button);
  }
  return group;
}

/** Sürekli dönen, tıklanamaz loading demo butonu. */
function buildLoadingButton(): Button {
  const button = new Button(i18next.t('volui:buttons.loading'), { fullWidth: false });
  button.setLoading(true);
  return button;
}

/** Başlık + yatay icon-button satırı sarmalayıcı. */
function iconButtonGroup(title: string, buttons: IconButton[]): HTMLElement {
  const group = document.createElement('div');
  group.className = 'vol-showcase-icon-button-group';

  const heading = document.createElement('span');
  heading.className = 'vol-showcase-icon-button-group__title';
  heading.textContent = title;
  group.appendChild(heading);

  const row = document.createElement('div');
  row.className = 'vol-showcase-icon-button-group__row';
  for (const button of buttons) {
    row.appendChild(button.element);
  }
  group.appendChild(row);

  return group;
}

/** IconButton örnekleri: oyun kategorilerine göre gruplanmış, toggle ile gerçek durum değişimi gösterir. */
function buildIconButtonDemo(disposables: Destroyable[], uiRootElement: HTMLElement): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-icon-button-groups';

  // Oyun akışı: duraklat/oynat + hızlandır + ses aç/kapat.
  let paused = false;
  const pausePlay = new IconButton(svgIcon(ICON_PAUSE), {
    label: i18next.t('volui:buttons.pause'),
  });
  const onPausePlayClick = (): void => {
    paused = !paused;
    pausePlay.setIcon(svgIcon(paused ? ICON_PLAY : ICON_PAUSE));
    pausePlay.setLabel(
      paused ? i18next.t('volui:buttons.resume') : i18next.t('volui:buttons.pause'),
    );
  };
  pausePlay.element.addEventListener('click', onPausePlayClick);

  const speeds = [1, 2, 3];
  let speedIndex = 0;
  const fastForward = new IconButton(svgIcon(ICON_FAST_FORWARD), {
    label: i18next.t('volui:buttons.fastForward', { n: 1 }),
  });
  const onFastForwardClick = (): void => {
    speedIndex = (speedIndex + 1) % speeds.length;
    fastForward.setLabel(i18next.t('volui:buttons.fastForward', { n: speeds[speedIndex] }));
  };
  fastForward.element.addEventListener('click', onFastForwardClick);

  let muted = false;
  const volume = new IconButton(svgIcon(ICON_VOLUME_ON), {
    label: i18next.t('volui:buttons.mute'),
  });
  const onVolumeClick = (): void => {
    muted = !muted;
    volume.setIcon(svgIcon(muted ? ICON_VOLUME_OFF : ICON_VOLUME_ON));
    volume.setLabel(muted ? i18next.t('volui:buttons.unmute') : i18next.t('volui:buttons.mute'));
  };
  volume.element.addEventListener('click', onVolumeClick);

  // Kamera/harita: zoom + merkezle.
  const zoomIn = new IconButton(svgIcon(ICON_ZOOM_IN), {
    label: i18next.t('volui:buttons.zoomIn'),
  });
  const zoomOut = new IconButton(svgIcon(ICON_ZOOM_OUT), {
    label: i18next.t('volui:buttons.zoomOut'),
  });
  const recenter = new IconButton(svgIcon(ICON_CENTER), {
    label: i18next.t('volui:buttons.recenter'),
  });

  // Birim komutları: dur, takip et, muhafız.
  const stop = new IconButton(svgIcon(ICON_STOP), {
    variant: 'danger',
    label: i18next.t('volui:buttons.stop'),
  });
  const follow = new IconButton(svgIcon(ICON_FOLLOW), { label: i18next.t('volui:buttons.follow') });
  const guard = new IconButton(svgIcon(ICON_GUARD), {
    label: i18next.t('volui:buttons.guardMode'),
  });

  // Envanter/ekonomi: kilitle, satın al, onayla, reddet.
  const lock = new IconButton(svgIcon(ICON_LOCK), { label: i18next.t('volui:buttons.lock') });
  const buy = new IconButton(svgIcon(ICON_COIN), {
    variant: 'primary',
    label: i18next.t('volui:buttons.buy'),
  });
  const confirm = new IconButton(svgIcon(ICON_CHECK), {
    variant: 'success',
    label: i18next.t('volui:buttons.confirm'),
  });
  const reject = new IconButton(svgIcon(ICON_CLOSE), {
    variant: 'danger',
    label: i18next.t('volui:buttons.reject'),
  });

  /*
   * Asenkron sözleşme: IconButton, `Button` ile aynı garantileri verir —
   * söz beklenirken buton `aria-busy` + `disabled` olur ve tekrar tetiklenemez.
   * Showcase'de görünmezse yetenek yalnızca testte var olur.
   */
  const asyncSave = new IconButton(svgIcon(ICON_CHECK), {
    label: i18next.t('volui:buttons.asyncIconSave'),
    variant: 'primary',
    onClick: () => new Promise<void>((resolve) => setTimeout(resolve, 1200)),
  });

  // Boyut + tooltip: 3 boyut, her biri tooltip'li.
  const small = new IconButton(svgIcon(ICON_GEAR), {
    label: i18next.t('volui:buttons.smallSm'),
    size: 'sm',
  });
  const gear = new IconButton(svgIcon(ICON_GEAR), { label: i18next.t('volui:buttons.mediumMd') });
  const large = new IconButton(svgIcon(ICON_GEAR), {
    label: i18next.t('volui:buttons.largeLg'),
    size: 'lg',
  });
  const smallTooltip = new Tooltip(small.element, i18next.t('volui:buttons.tooltipSmall'), {
    container: uiRootElement,
  });
  const gearTooltip = new Tooltip(gear.element, i18next.t('volui:buttons.tooltipMedium'), {
    container: uiRootElement,
  });
  const largeTooltip = new Tooltip(large.element, i18next.t('volui:buttons.tooltipLarge'), {
    container: uiRootElement,
  });

  disposables.push(
    pausePlay,
    fastForward,
    volume,
    zoomIn,
    zoomOut,
    recenter,
    stop,
    follow,
    guard,
    lock,
    buy,
    confirm,
    reject,
    asyncSave,
    small,
    gear,
    large,
    smallTooltip,
    gearTooltip,
    largeTooltip,
    {
      destroy: () => {
        pausePlay.element.removeEventListener('click', onPausePlayClick);
        fastForward.element.removeEventListener('click', onFastForwardClick);
        volume.element.removeEventListener('click', onVolumeClick);
      },
    },
  );

  wrap.appendChild(
    iconButtonGroup(i18next.t('volui:buttons.gameFlow'), [pausePlay, fastForward, volume]),
  );
  wrap.appendChild(
    iconButtonGroup(i18next.t('volui:buttons.cameraMap'), [zoomIn, zoomOut, recenter]),
  );
  wrap.appendChild(iconButtonGroup(i18next.t('volui:buttons.unitCommands'), [stop, follow, guard]));
  wrap.appendChild(
    iconButtonGroup(i18next.t('volui:buttons.inventoryEconomy'), [lock, buy, confirm, reject]),
  );
  wrap.appendChild(iconButtonGroup(i18next.t('volui:buttons.sizeTooltip'), [small, gear, large]));
  wrap.appendChild(iconButtonGroup(i18next.t('volui:buttons.asyncIconButton'), [asyncSave]));

  return wrap;
}

/** fullWidth:true davranışı. .vol-button-group içine alınmaz — inline-flex fullWidth ile çakışır. */
function buildFullWidthDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  // width:100% olmadan wrap içeriğine küçülür, fullWidth dar referansa göre çözümlenir.
  wrap.style.width = '100%';
  const button = new Button(i18next.t('volui:buttons.confirmRecord'), { variant: 'primary' });
  disposables.push(button);
  wrap.appendChild(button.element);
  return wrap;
}

export function buildButtonsTab(uiRootElement: HTMLElement): {
  element: HTMLElement;
  destroy: () => void;
} {
  const container = document.createElement('div');
  container.className = 'vol-showcase-section';
  const disposables: Destroyable[] = [];
  const auto = { fullWidth: false } as const;

  const cards = [
    card(
      i18next.t('volui:buttons.variant'),
      buttonGroup(
        [
          new Button(i18next.t('volui:buttons.default'), auto),
          new Button(i18next.t('volui:buttons.primary'), { ...auto, variant: 'primary' }),
          new Button(i18next.t('volui:buttons.danger'), { ...auto, variant: 'danger' }),
        ],
        disposables,
      ),
    ),
    card(
      i18next.t('volui:buttons.size'),
      buttonGroup(
        [
          new Button(i18next.t('volui:buttons.small'), { ...auto, size: 'sm' }),
          new Button(i18next.t('volui:buttons.medium'), { ...auto, size: 'md' }),
          new Button(i18next.t('volui:buttons.large'), { ...auto, size: 'lg' }),
        ],
        disposables,
        false,
      ),
    ),
    card(
      i18next.t('volui:buttons.state'),
      buttonGroup(
        [
          new Button(i18next.t('volui:buttons.normal'), auto),
          new Button(i18next.t('volui:buttons.disabled'), { ...auto, disabled: true }),
          buildLoadingButton(),
          new Button(i18next.t('volui:buttons.clickToLoad'), {
            ...auto,
            onClick: () => new Promise((resolve) => setTimeout(resolve, 2000)),
          }),
        ],
        disposables,
      ),
    ),
    card(
      i18next.t('volui:buttons.icon'),
      buttonGroup(
        [
          new Button(i18next.t('volui:buttons.save'), {
            ...auto,
            iconLeft: svgIcon(ICON_SAVE),
            variant: 'primary',
          }),
          new Button(i18next.t('volui:buttons.delete'), {
            ...auto,
            iconLeft: svgIcon(ICON_TRASH),
            variant: 'danger',
          }),
          new Button(i18next.t('volui:buttons.forward'), { ...auto, iconRight: '→' }),
        ],
        disposables,
      ),
    ),
    card(i18next.t('volui:buttons.iconButton'), buildIconButtonDemo(disposables, uiRootElement), {
      spanAll: true,
    }),
    card(i18next.t('volui:buttons.fullWidth'), buildFullWidthDemo(disposables), { spanAll: true }),
  ];

  container.appendChild(cardGrid(cards));

  return {
    element: container,
    destroy: () => disposables.forEach((d) => d.destroy()),
  };
}
