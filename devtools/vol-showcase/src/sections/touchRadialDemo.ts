import type { DisposableScope } from '@volstudio/core/lifecycle';
import { Button, HoldButton, RadialMenu, Text } from '@volstudio/core/ui';
import { i18next } from '@volstudio/core/i18n';
import { svgIcon } from './shared';
import { ICON_INVENTORY } from './icons';

/** RadialMenu demosu: "Envanter" butonuna basılı tutarak 5 seçenekli radyal menü. Hızlı dokunuş bir şey seçmez. */
export function buildRadialMenuDemo(disposables: DisposableScope): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';
  // card({ center: true }) panel-demo'yu kart içinde ortalar, çocuklarını değil — align-items:center gerekir.
  wrap.style.alignItems = 'center';

  const result = new Text(i18next.t('volui:touch.radialMenuHint'), {
    variant: 'muted',
  });
  disposables.addDestroyables(result);

  const menu = new RadialMenu({
    items: [
      { id: 'sword', label: i18next.t('volui:touch.sword') },
      { id: 'shield', label: i18next.t('volui:touch.shield') },
      { id: 'potion', label: i18next.t('volui:touch.potion') },
      { id: 'bow', label: i18next.t('volui:touch.bow') },
      { id: 'scroll', label: i18next.t('volui:touch.scroll') },
    ],
    onSelect: (id) => {
      result.setContent(i18next.t('volui:touch.selected', { id }));
    },
  });
  disposables.addDestroyables(menu);
  document.body.appendChild(menu.element);
  const menuElement = menu.element;

  const openButton = new HoldButton({
    shape: 'circle',
    label: i18next.t('volui:touch.inventory'),
    icon: svgIcon(ICON_INVENTORY),
    size: 72,
    onPress: () => {
      // HoldButton.onPress koordinat vermez, butonun merkezi kullanılır.
      const rect = openButton.element.getBoundingClientRect();
      menu.open(rect.left + rect.width / 2, rect.top + rect.height / 2);
    },
  });
  disposables.addDestroyables(openButton);
  disposables.addDestroyables({ destroy: () => menuElement.remove() });

  // Klavye/kol yolu: odak menüye taşınır, ok tuşları/D-pad döner, Enter/A seçer, Escape iptal eder.
  const keysButton = new Button(i18next.t('volui:touch.radialMenuKeys'), {
    size: 'sm',
    onClick: () => {
      const rect = keysButton.element.getBoundingClientRect();
      menu.openFocused(rect.left + rect.width / 2, rect.top - 24);
    },
  });
  disposables.addDestroyables(keysButton);

  wrap.appendChild(openButton.element);
  wrap.appendChild(keysButton.element);
  wrap.appendChild(result.element);

  return wrap;
}
