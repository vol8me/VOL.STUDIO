import {
  Button,
  ContextMenu,
  Modal,
  Panel,
  Popup,
  Text,
  ToastManager,
  i18next,
  showConfirm,
} from '@volstudio/core';
import { card, cardGrid, svgIcon } from './shared';
import { ICON_COPY, ICON_EDIT, ICON_SHARE, ICON_TRASH } from './icons';

interface Destroyable {
  destroy(): void;
}

function buildFadeDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const stage = document.createElement('div');
  stage.className = 'vol-showcase-panel-stage';

  const demoPanel = new Panel({ className: 'vol-showcase-demo-panel' })
    .add(new Text(i18next.t('volui:panels.panelVisible'), { variant: 'body', tag: 'h2' }))
    .add(new Text(i18next.t('volui:panels.fadeTransition'), { variant: 'muted' }));
  disposables.push(demoPanel);

  stage.appendChild(demoPanel.element);
  wrap.appendChild(stage);

  const toggle = new Button(i18next.t('volui:panels.togglePanel'), {
    variant: 'primary',
    onClick: () => {
      if (demoPanel.isVisible()) {
        demoPanel.hide();
      } else {
        demoPanel.show();
      }
    },
  });
  disposables.push(toggle);
  wrap.appendChild(toggle.element);

  return wrap;
}

function buildDynamicContentDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const stage = document.createElement('div');
  stage.className = 'vol-showcase-panel-stage';

  const listPanel = new Panel({ className: 'vol-showcase-demo-panel vol-showcase-list-panel' }).add(
    new Text(i18next.t('volui:panels.inventory'), { variant: 'body', tag: 'h2' }),
  );
  listPanel.show();
  disposables.push(listPanel);

  stage.appendChild(listPanel.element);
  wrap.appendChild(stage);

  const items: { text: Text }[] = [];
  let counter = 0;

  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';

  const addButton = new Button(i18next.t('volui:panels.addItem'), {
    variant: 'primary',
    onClick: () => {
      counter += 1;
      const item = new Text(i18next.t('volui:panels.itemN', { n: counter }), {
        variant: 'muted',
        tag: 'span',
      });
      item.element.classList.add('vol-showcase-list-panel__item');
      listPanel.add(item);
      items.push({ text: item });
    },
  });

  const removeButton = new Button(i18next.t('volui:panels.removeLast'), {
    onClick: () => {
      const last = items.pop();
      if (last) {
        listPanel.remove(last.text);
      }
    },
  });
  disposables.push(addButton, removeButton);

  controls.appendChild(addButton.element);
  controls.appendChild(removeButton.element);
  wrap.appendChild(controls);

  return wrap;
}

function buildStaticMenuDemo(disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const stage = document.createElement('div');
  stage.className = 'vol-showcase-panel-stage';

  const menuPanel = new Panel({ className: 'vol-showcase-demo-panel' })
    .add(new Text('VOL.HELL', { variant: 'heading', tag: 'h2' }))
    .add(new Text(i18next.t('volui:text.sampleBody'), { variant: 'muted' }));
  disposables.push(menuPanel);

  const startButton = new Button(i18next.t('volui:panels.start'), { variant: 'primary' });
  disposables.push(startButton);
  menuPanel.add(startButton);
  menuPanel.show();

  stage.appendChild(menuPanel.element);
  wrap.appendChild(stage);

  const hint = new Text(i18next.t('volui:panels.staticMenuHint'), { variant: 'muted' });
  disposables.push(hint);
  wrap.appendChild(hint.element);

  return wrap;
}

function buildModalDemo(uiRootElement: HTMLElement, disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const result = new Text(i18next.t('volui:panels.modalClosed'), { variant: 'muted' });
  disposables.push(result);

  const modal = new Modal({
    onClose: () => result.setContent(i18next.t('volui:panels.modalClosed')),
  }).add(new Text(i18next.t('volui:panels.gamePaused'), { variant: 'heading', tag: 'h2' }));
  disposables.push(modal);

  const resumeButton = new Button(i18next.t('volui:panels.resume'), {
    variant: 'primary',
    fullWidth: false,
    onClick: () => modal.close(),
  });
  modal.add(resumeButton);
  disposables.push(resumeButton);

  uiRootElement.appendChild(modal.element);

  const lockedModal = new Modal({
    closeOnScrimClick: false,
    onClose: () => result.setContent(i18next.t('volui:panels.modalClosed')),
  }).add(new Text(i18next.t('volui:panels.criticalWarning'), { variant: 'heading', tag: 'h2' }));
  disposables.push(lockedModal);

  const acknowledgeButton = new Button(i18next.t('volui:panels.acknowledge'), {
    variant: 'danger',
    fullWidth: false,
    onClick: () => lockedModal.close(),
  });
  lockedModal.add(acknowledgeButton);
  disposables.push(acknowledgeButton);

  uiRootElement.appendChild(lockedModal.element);

  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';

  const openButton = new Button(i18next.t('volui:panels.openModal'), {
    variant: 'primary',
    onClick: () => {
      result.setContent(i18next.t('volui:panels.modalOpenPaused'));
      modal.open();
    },
  });
  const openLockedButton = new Button(i18next.t('volui:panels.openLockedModal'), {
    onClick: () => {
      result.setContent(i18next.t('volui:panels.modalOpenWarning'));
      lockedModal.open();
    },
  });
  disposables.push(openButton, openLockedButton);

  controls.appendChild(openButton.element);
  controls.appendChild(openLockedButton.element);
  wrap.appendChild(controls);
  wrap.appendChild(result.element);

  return wrap;
}

function buildConfirmDemo(disposables: Destroyable[], uiRootElement: HTMLElement): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const result = new Text(i18next.t('volui:panels.awaitingResult'), { variant: 'muted' });
  disposables.push(result);

  const controls = document.createElement('div');
  controls.className = 'vol-showcase-panel-demo__controls';

  const deleteButton = new Button(i18next.t('volui:panels.deleteRecord'), {
    variant: 'danger',
    onClick: async () => {
      const confirmed = await showConfirm({
        title: i18next.t('volui:panels.deleteRecordConfirm'),
        confirmLabel: i18next.t('volui:panels.delete'),
        cancelLabel: i18next.t('volui:panels.cancel'),
        variant: 'danger',
        container: uiRootElement,
      });
      result.setContent(
        confirmed
          ? i18next.t('volui:panels.resultConfirmed')
          : i18next.t('volui:panels.resultCancelled'),
      );
    },
  });

  const saveButton = new Button(i18next.t('volui:panels.saveSettings'), {
    variant: 'primary',
    onClick: async () => {
      const confirmed = await showConfirm({
        title: i18next.t('volui:panels.saveChangesConfirm'),
        confirmLabel: i18next.t('volui:panels.save'),
        cancelLabel: i18next.t('volui:panels.abort'),
        container: uiRootElement,
      });
      result.setContent(
        confirmed
          ? i18next.t('volui:panels.resultConfirmed')
          : i18next.t('volui:panels.resultCancelled'),
      );
    },
  });
  disposables.push(deleteButton, saveButton);

  controls.appendChild(deleteButton.element);
  controls.appendChild(saveButton.element);
  wrap.appendChild(controls);
  wrap.appendChild(result.element);

  return wrap;
}

function buildToastDemo(uiRootElement: HTMLElement, disposables: Destroyable[]): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const toasts = new ToastManager(uiRootElement);
  disposables.push(toasts);

  const hint = new Text(i18next.t('volui:panels.toastHint'), { variant: 'muted' });
  disposables.push(hint);
  wrap.appendChild(hint.element);

  const buttons = document.createElement('div');
  buttons.className = 'vol-showcase-panel-demo__controls';
  const infoButton = new Button(i18next.t('volui:panels.showInfo'), {
    onClick: () => toasts.show(i18next.t('volui:panels.waveStarted')),
  });
  const successButton = new Button(i18next.t('volui:panels.showSuccess'), {
    variant: 'primary',
    onClick: () => toasts.show(i18next.t('volui:panels.newWeapon'), { variant: 'success' }),
  });
  const dangerButton = new Button(i18next.t('volui:panels.showDanger'), {
    variant: 'danger',
    onClick: () => toasts.show(i18next.t('volui:panels.healthCritical'), { variant: 'danger' }),
  });
  disposables.push(infoButton, successButton, dangerButton);

  buttons.appendChild(infoButton.element);
  buttons.appendChild(successButton.element);
  buttons.appendChild(dangerButton.element);
  wrap.appendChild(buttons);

  return wrap;
}

function buildCornerNotificationDemo(
  uiRootElement: HTMLElement,
  disposables: Destroyable[],
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const hint = new Text(i18next.t('volui:panels.cornerHint'), { variant: 'muted' });
  disposables.push(hint);
  wrap.appendChild(hint.element);

  const cornerPanel = new Panel({ className: 'vol-showcase-corner-panel' })
    .add(new Text(i18next.t('volui:panels.newQuest'), { variant: 'body', tag: 'h3' }))
    .add(new Text(i18next.t('volui:panels.questDesc'), { variant: 'muted' }));
  disposables.push(cornerPanel);

  uiRootElement.appendChild(cornerPanel.element);

  let hideTimeoutId: number | null = null;

  const button = new Button(i18next.t('volui:panels.showNotification'), {
    variant: 'primary',
    onClick: () => {
      if (hideTimeoutId !== null) {
        clearTimeout(hideTimeoutId);
      }
      cornerPanel.show();
      hideTimeoutId = window.setTimeout(() => {
        cornerPanel.hide();
        hideTimeoutId = null;
      }, 2500);
    },
  });
  disposables.push(button);
  disposables.push({
    destroy: () => {
      if (hideTimeoutId !== null) {
        clearTimeout(hideTimeoutId);
        hideTimeoutId = null;
      }
    },
  });
  wrap.appendChild(button.element);

  return wrap;
}

function buildContextMenuDemo(disposables: Destroyable[], uiRootElement: HTMLElement): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const result = new Text(i18next.t('volui:panels.awaitingAction'), { variant: 'muted' });
  disposables.push(result);

  const trigger = new Button(i18next.t('volui:panels.actions'), { fullWidth: false });
  disposables.push(trigger);

  const menu = new ContextMenu(
    trigger.element,
    [
      {
        label: i18next.t('volui:panels.rename'),
        icon: svgIcon(ICON_EDIT),
        onSelect: () => result.setContent(i18next.t('volui:panels.actionRename')),
      },
      {
        label: i18next.t('volui:panels.copy'),
        icon: svgIcon(ICON_COPY),
        onSelect: () => result.setContent(i18next.t('volui:panels.actionCopy')),
      },
      {
        label: i18next.t('volui:panels.share'),
        icon: svgIcon(ICON_SHARE),
        disabled: true,
        onSelect: () => result.setContent(i18next.t('volui:panels.actionShare')),
      },
      { type: 'separator' },
      {
        label: i18next.t('volui:panels.delete'),
        icon: svgIcon(ICON_TRASH),
        danger: true,
        onSelect: () => result.setContent(i18next.t('volui:panels.actionDelete')),
      },
    ],
    { container: uiRootElement },
  );
  disposables.push({ destroy: () => menu.destroy() });

  wrap.appendChild(trigger.element);
  wrap.appendChild(result.element);

  return wrap;
}

function buildPopupDemo(disposables: Destroyable[], uiRootElement: HTMLElement): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'vol-showcase-panel-demo';

  const result = new Text(i18next.t('volui:panels.popupClosed'), { variant: 'muted' });
  disposables.push(result);

  const trigger = new Button(i18next.t('volui:panels.openPopup'), { fullWidth: false });
  disposables.push(trigger);

  const popup = new Popup(trigger.element, {
    placement: 'bottom-start',
    container: uiRootElement,
    onClose: () => {
      result.setContent(i18next.t('volui:panels.popupClosedMsg'));
      trigger.element.textContent = i18next.t('volui:panels.openPopup');
    },
  });
  disposables.push({ destroy: () => popup.destroy() });

  const popupContent = document.createElement('div');
  popupContent.style.padding = 'var(--vol-space-md)';
  popupContent.style.display = 'flex';
  popupContent.style.flexDirection = 'column';
  popupContent.style.gap = 'var(--vol-space-sm)';
  popupContent.style.minWidth = '180px';

  const popupTitle = new Text(i18next.t('volui:panels.popupContent'), { variant: 'heading' });
  disposables.push(popupTitle);
  popupContent.appendChild(popupTitle.element);

  const popupDesc = new Text(i18next.t('volui:panels.popupDesc'), { variant: 'body' });
  disposables.push(popupDesc);
  popupContent.appendChild(popupDesc.element);

  const closeBtn = new Button(i18next.t('volui:panels.close'), {
    variant: 'primary',
    fullWidth: false,
  });
  disposables.push(closeBtn);
  closeBtn.element.addEventListener('click', () => popup.close());
  popupContent.appendChild(closeBtn.element);

  popup.element.appendChild(popupContent);

  trigger.element.addEventListener('click', () => {
    if (popup.isOpen()) {
      popup.close();
    } else {
      popup.show();
      result.setContent(i18next.t('volui:panels.popupOpen'));
      trigger.element.textContent = i18next.t('volui:panels.closePopup');
    }
  });

  wrap.appendChild(trigger.element);
  wrap.appendChild(result.element);

  return wrap;
}

export function buildPanelsTab(uiRootElement: HTMLElement): {
  element: HTMLElement;
  destroy: () => void;
} {
  const container = document.createElement('div');
  container.className = 'vol-showcase-section';
  const disposables: Destroyable[] = [];

  const cards = [
    card(i18next.t('volui:panels.fade'), buildFadeDemo(disposables)),
    card(i18next.t('volui:panels.dynamicContent'), buildDynamicContentDemo(disposables)),
    card(i18next.t('volui:panels.staticMenu'), buildStaticMenuDemo(disposables)),
    card(i18next.t('volui:panels.contextMenu'), buildContextMenuDemo(disposables, uiRootElement)),
    card(i18next.t('volui:panels.popup'), buildPopupDemo(disposables, uiRootElement)),
    card(i18next.t('volui:panels.modal'), buildModalDemo(uiRootElement, disposables)),
    card(i18next.t('volui:panels.confirm'), buildConfirmDemo(disposables, uiRootElement)),
    card(i18next.t('volui:panels.toast'), buildToastDemo(uiRootElement, disposables)),
    card(
      i18next.t('volui:panels.cornerNotification'),
      buildCornerNotificationDemo(uiRootElement, disposables),
      { span: 4 },
    ),
  ];

  container.appendChild(cardGrid(cards));

  return {
    element: container,
    destroy: () => disposables.forEach((d) => d.destroy()),
  };
}
