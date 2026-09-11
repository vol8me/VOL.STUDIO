import { DisposableScope } from '../../lifecycle/DisposableScope';
import { IconButton } from '../primitives/IconButton';
import { ScrollView } from '../layout/ScrollView';
import { Modal } from './Modal';

export interface SheetOptions {
  title?: string;
  closeLabel?: string;
  onClose?: () => void;
  className?: string;
}

let nextSheetId = 0;

/**
 * Sağdan açılan, başlıklı ve kendi içinde kayan çekmece. Geniş ekranda en az
 * yarım genişlik kaplar ve arkadaki sahne scrim altında görünür kalır; 480 px
 * ve altında tam genişliğe çıkar. Odak, scrim, Escape ve Android geri
 * sözleşmeleri `Modal`dan gelir.
 */
export class Sheet {
  readonly element: HTMLDivElement;
  private readonly modal: Modal;
  private readonly title: HTMLHeadingElement;
  private readonly closeButton: IconButton;
  private readonly scrollView: ScrollView;
  private readonly scope = new DisposableScope();

  constructor(options: SheetOptions = {}) {
    const id = `vol-sheet-title-${++nextSheetId}`;
    this.modal = new Modal({
      className: ['vol-sheet', options.className].filter(Boolean).join(' '),
      onClose: options.onClose,
    });
    this.element = this.modal.element;

    const header = document.createElement('header');
    header.className = 'vol-sheet__header';

    this.title = document.createElement('h2');
    this.title.id = id;
    this.title.className = 'vol-sheet__title';
    this.title.textContent = options.title ?? '';

    this.closeButton = new IconButton('×', {
      label: options.closeLabel ?? '',
      onClick: () => this.close(),
    });
    this.closeButton.element.classList.add('vol-sheet__close');
    header.append(this.title, this.closeButton.element);

    this.scrollView = new ScrollView();
    this.scrollView.element.classList.add('vol-sheet__body');
    this.modal.add({ element: header }).add(this.scrollView);
    this.element.querySelector<HTMLElement>('[role="dialog"]')?.setAttribute('aria-labelledby', id);

    this.scope.addDestroyables(this.closeButton, this.scrollView, this.modal);
  }

  add(node: { element: HTMLElement }): this {
    this.scrollView.add(node);
    return this;
  }

  open(): void {
    this.modal.open();
  }

  close(): void {
    this.modal.close();
  }

  toggle(): void {
    if (this.isOpen()) this.close();
    else this.open();
  }

  isOpen(): boolean {
    return this.modal.isOpen();
  }

  setTitle(title: string): void {
    this.title.textContent = title;
  }

  setCloseLabel(label: string): void {
    this.closeButton.setLabel(label);
  }

  destroy(): void {
    this.scope.dispose();
  }
}
