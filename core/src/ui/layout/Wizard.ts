import { i18next } from '../../systems/I18n';

export interface WizardStep {
  id: string;
  title: string;
  content: { element: HTMLElement; destroy?: () => void };
  /** Sonraki adıma geçmeden önce çağrılır; false (veya Promise<false>) dönerse geçişi engeller. */
  validate?: () => boolean | Promise<boolean>;
}

export interface WizardOptions {
  steps: WizardStep[];
  /** Son adımda "İleri" yerine gösterilecek metin. Varsayılan 'Bitir'. */
  finishLabel?: string;
  onFinish?: () => void;
  onStepChange?: (index: number, step: WizardStep) => void;
}

/**
 * Adım göstergeli (aktif/tamamlandı/yaklaşan durumlar) ve ileri/geri navigasyonlu
 * çok adımlı akış — doğrusal, tek seferlik süreçler için (karakter oluşturma,
 * onboarding, ayar sihirbazı). Accordion'ın her zaman erişilebilir düz
 * listesinin aksine adımlar sıralıdır ve `validate` ile kilitlenir.
 */
export class Wizard {
  readonly element: HTMLDivElement;
  private readonly steps: WizardStep[];
  private readonly stepIndicators: HTMLDivElement[] = [];
  private readonly contentViewport: HTMLDivElement;
  private readonly contentSlot: HTMLDivElement;
  private readonly backButton: HTMLButtonElement;
  private readonly nextButton: HTMLButtonElement;
  private finishLabel: string;
  private readonly finishLabelIsI18n: boolean;
  private readonly onFinishHandler?: () => void;
  private readonly onStepChangeHandler?: (index: number, step: WizardStep) => void;
  private currentIndex = 0;
  private boundBackClick: () => void;
  private boundNextClick: () => void;
  private transitionToken = 0;
  /** Bekleyen gecis zamanlayicisi/karesi — destroy() iptal eder. */
  private transitionTimer: number | null = null;
  private transitionFrame: number | null = null;
  /** validate() beklenirken ikinci bir ilerleme baslatilmasini engeller. */
  private advancing = false;

  constructor(options: WizardOptions) {
    // Boş adım listesi tüm indekslemeleri (renderStep, handleNext, updateChrome)
    // undefined'a düşürür; hatayı anlaşılmaz bir TypeError yerine burada ver.
    if (options.steps.length === 0) {
      throw new Error('Wizard: en az bir adım gerekli (steps boş olamaz)');
    }

    this.steps = options.steps;
    this.finishLabelIsI18n = options.finishLabel === undefined;
    this.finishLabel = options.finishLabel ?? i18next.t('core:wizard.finish');
    this.onFinishHandler = options.onFinish;
    this.onStepChangeHandler = options.onStepChange;

    this.element = document.createElement('div');
    this.element.className = 'vol-wizard';

    const indicatorRow = document.createElement('div');
    indicatorRow.className = 'vol-wizard__indicators';
    indicatorRow.setAttribute('role', 'list');
    for (const [index, step] of this.steps.entries()) {
      indicatorRow.appendChild(this.buildIndicator(index, step));
    }
    this.element.appendChild(indicatorRow);

    this.contentViewport = document.createElement('div');
    this.contentViewport.className = 'vol-wizard__content-viewport';
    this.element.appendChild(this.contentViewport);

    this.contentSlot = document.createElement('div');
    this.contentSlot.className = 'vol-wizard__content';
    this.contentViewport.appendChild(this.contentSlot);

    const footer = document.createElement('div');
    footer.className = 'vol-wizard__footer';

    this.backButton = document.createElement('button');
    this.backButton.type = 'button';
    this.backButton.className = 'vol-wizard__nav-button vol-wizard__nav-button--back';
    this.backButton.textContent = i18next.t('core:wizard.back');
    this.boundBackClick = () => this.goToStep(this.currentIndex - 1);
    this.backButton.addEventListener('click', this.boundBackClick);
    footer.appendChild(this.backButton);

    this.nextButton = document.createElement('button');
    this.nextButton.type = 'button';
    this.nextButton.className = 'vol-wizard__nav-button vol-wizard__nav-button--next';
    this.boundNextClick = () => void this.handleNext();
    this.nextButton.addEventListener('click', this.boundNextClick);
    footer.appendChild(this.nextButton);

    this.element.appendChild(footer);

    // İlk render'da geçiş animasyonu yok — kayacak önceki içerik yoktur.
    this.contentSlot.replaceChildren(this.steps[this.currentIndex].content.element);
    // notify:false — tüketici henüz Wizard referansına sahip degil; constructor'dan
    // onStepChange tetiklemek cagirani hazir olmadigi bir callback'e sokar.
    this.updateChrome({ notify: false });

    i18next.on('languageChanged', this.onLanguageChanged);
  }

  private readonly onLanguageChanged = (): void => {
    this.backButton.textContent = i18next.t('core:wizard.back');
    if (this.finishLabelIsI18n) this.finishLabel = i18next.t('core:wizard.finish');
    this.updateChrome();
  };

  /** Şu an gösterilen adımın indeksi (0 tabanlı). */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  /** validate() çağırmadan doğrudan verilen adıma atlar (ör. özet ekranından "2. adımı düzenle" bağlantısı). */
  goToStep(index: number): void {
    if (index < 0 || index >= this.steps.length) return;
    const direction: 'forward' | 'backward' = index > this.currentIndex ? 'forward' : 'backward';
    this.currentIndex = index;
    this.renderStep(direction);
  }

  destroy(): void {
    // Gecis zamanlayicisi kopmus DOM uzerinde replaceChildren cagirmamali.
    if (this.transitionTimer !== null) {
      window.clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }
    if (this.transitionFrame !== null) {
      cancelAnimationFrame(this.transitionFrame);
      this.transitionFrame = null;
    }
    i18next.off('languageChanged', this.onLanguageChanged);
    this.backButton.removeEventListener('click', this.boundBackClick);
    this.nextButton.removeEventListener('click', this.boundNextClick);
    for (const step of this.steps) {
      step.content.destroy?.();
    }
    this.element.remove();
  }

  private buildIndicator(index: number, step: WizardStep): HTMLDivElement {
    const indicator = document.createElement('div');
    indicator.className = 'vol-wizard__indicator';
    indicator.setAttribute('role', 'listitem');

    const dot = document.createElement('span');
    dot.className = 'vol-wizard__indicator-dot';
    dot.textContent = String(index + 1);
    indicator.appendChild(dot);

    const label = document.createElement('span');
    label.className = 'vol-wizard__indicator-label';
    label.textContent = step.title;
    indicator.appendChild(label);

    this.stepIndicators.push(indicator);
    return indicator;
  }

  /**
   * Async `validate()` beklenirken buton kilitlenir. Aksi halde yavas bir
   * dogrulama sirasinda cift tiklama iki gecisi kuyruga alir ve bir adim atlanir.
   */
  private async handleNext(): Promise<void> {
    if (this.advancing) return;
    this.advancing = true;
    this.nextButton.disabled = true;

    try {
      const current = this.steps[this.currentIndex];
      if (current.validate) {
        const valid = await current.validate();
        if (!valid) return;
      }

      if (this.currentIndex === this.steps.length - 1) {
        this.onFinishHandler?.();
        return;
      }

      this.goToStep(this.currentIndex + 1);
    } finally {
      this.advancing = false;
      this.nextButton.disabled = false;
    }
  }

  /**
   * Adım içerikleri arasında yön-bilinçli kayma geçişi oynatır (ileri = sağdan-sola,
   * geri = soldan-sağa). `transitionToken` ardışık hızlı çağrılarda eski bir
   * timeout'un yeni içeriği ezmesini önler.
   */
  private renderStep(direction: 'forward' | 'backward' = 'forward'): void {
    const step = this.steps[this.currentIndex];
    const token = ++this.transitionToken;

    const outClass =
      direction === 'forward'
        ? 'vol-wizard__content--exit-forward'
        : 'vol-wizard__content--exit-backward';
    const inClass =
      direction === 'forward'
        ? 'vol-wizard__content--enter-forward'
        : 'vol-wizard__content--enter-backward';

    this.contentSlot.classList.add(outClass);

    this.transitionTimer = window.setTimeout(() => {
      this.transitionTimer = null;
      if (token !== this.transitionToken) return;
      this.contentSlot.classList.remove(
        'vol-wizard__content--exit-forward',
        'vol-wizard__content--exit-backward',
      );
      this.contentSlot.replaceChildren(step.content.element);
      this.contentSlot.classList.add(inClass);

      // Reflow zorla ki tarayıcı "enter" class'ının ilk transform'unu bir sonraki
      // karede kaldırmadan önce boyasın — aksi halde iki class değişikliği tek
      // karede birleşir ve geçiş görünmez.
      void this.contentSlot.offsetWidth;
      this.transitionFrame = requestAnimationFrame(() => {
        this.transitionFrame = null;
        if (token !== this.transitionToken) return;
        this.contentSlot.classList.remove(
          'vol-wizard__content--enter-forward',
          'vol-wizard__content--enter-backward',
        );
      });
    }, 150);

    this.updateChrome();
  }

  /** Adım göstergelerini, geri/ileri buton etiketlerini günceller ve onStepChange tetikler — içerik animasyonundan bağımsız. */
  private updateChrome(options: { notify?: boolean } = {}): void {
    const step = this.steps[this.currentIndex];

    for (const [index, indicator] of this.stepIndicators.entries()) {
      indicator.classList.toggle('vol-wizard__indicator--active', index === this.currentIndex);
      indicator.classList.toggle('vol-wizard__indicator--done', index < this.currentIndex);
    }

    this.backButton.disabled = this.currentIndex === 0;
    const isLast = this.currentIndex === this.steps.length - 1;
    this.nextButton.textContent = isLast ? this.finishLabel : i18next.t('core:wizard.next');

    if (options.notify !== false) {
      this.onStepChangeHandler?.(this.currentIndex, step);
    }
  }
}
