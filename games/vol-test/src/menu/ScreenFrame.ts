import { DisposableScope } from '@volstudio/core/lifecycle';
import { Icon, IconButton, Panel, ScrollView, Text } from '@volstudio/core/ui';
import './menu.css';

/**
 * `sheet`: sol şerit, arkasında oyun sunumu görünür (ana menü). `full`: ekranı kaplar (garaj, ayarlar);
 * sunum için `stage` bölgesi ayırabilir. İkisi de aynı başlık, gövde ve eylem şeridinden kurulur.
 */
export type ScreenVariant = 'sheet' | 'full';

export interface ScreenFrameOptions {
  readonly testid: string;
  readonly variant: ScreenVariant;
  /** Verilirse başlığın solunda geri düğmesi çıkar; ana menüde yoktur. */
  readonly onBack?: () => void;
}

/**
 * Menü, garaj ve ayarların ortak iskeleti: başlık şeridi (geri düğmesi, başlık, alt başlık), kayan gövde
 * ve eylem şeridi. Yalnız CORE bileşenlerinden kurulur (`Panel`, `Text`, `IconButton`, `ScrollView`);
 * oyun yerleşimi `menu.css` verir, görünüm CORE'undur. Ekranlar içeriklerini `body`ye, düğmelerini
 * `footer`a koyar; böylece üç ekran aynı taksonomiden gelir.
 */
export class ScreenFrame {
  readonly panel: Panel;
  readonly body: ScrollView;
  readonly title: Text;
  readonly subtitle: Text;
  /** Eylem düğmelerinin şeridi. */
  readonly footer: HTMLElement;
  private readonly back: IconButton | undefined;
  private readonly scope = new DisposableScope();

  constructor(options: ScreenFrameOptions) {
    this.panel = this.scope.addDestroyable(
      new Panel({ className: `vt-screen vt-screen--${options.variant}` }),
    );
    this.panel.element.dataset.testid = options.testid;

    const header = document.createElement('header');
    header.className = 'vt-screen__header';
    if (options.onBack) {
      this.back = this.scope.addDestroyable(
        new IconButton(new Icon({ name: 'chevronLeft' }).element, {
          label: '',
          onClick: () => options.onBack?.(),
        }),
      );
      this.back.element.dataset.testid = `${options.testid}-back`;
      header.append(this.back.element);
    }
    const heading = document.createElement('div');
    heading.className = 'vt-screen__heading';
    this.title = this.scope.addDestroyable(
      new Text('', { variant: options.variant === 'sheet' ? 'title' : 'heading', tag: 'h1' }),
    );
    this.subtitle = this.scope.addDestroyable(new Text('', { variant: 'muted', tag: 'p' }));
    heading.append(this.title.element, this.subtitle.element);
    header.append(heading);

    this.body = this.scope.addDestroyable(new ScrollView());
    this.body.element.classList.add('vt-screen__body');
    this.footer = document.createElement('div');
    this.footer.className = 'vt-screen__actions';
    this.panel.element.append(header, this.body.element, this.footer);
    this.panel.show();
  }

  get element(): HTMLElement {
    return this.panel.element;
  }

  setTitle(title: string, subtitle = ''): void {
    this.title.setContent(title);
    this.subtitle.setContent(subtitle);
    this.subtitle.element.hidden = subtitle === '';
  }

  setBackLabel(label: string): void {
    this.back?.setLabel(label);
  }

  /** Geri düğmesi varsa onu, yoksa gövdedeki ilk odaklanabilir öğeyi odaklar. */
  focusFirst(selector: string): void {
    this.element.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
  }

  destroy(): void {
    this.scope.dispose();
    this.element.remove();
  }
}
