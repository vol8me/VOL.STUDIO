export interface DialogueChoice {
  label: string;
  onSelect: () => void;
}

export interface DialogueLine {
  speaker?: string;
  text: string;
  /** Portre görsel URL'i veya hazır DOM elementi. */
  portrait?: string | Node;
  /** Verilirse, yazım bitince otomatik ilerleme yerine seçim butonları gösterir; kuyruk yalnızca bir seçim seçilince ilerler (dallanan diyalog). */
  choices?: DialogueChoice[];
}

export interface DialogueBoxOptions {
  /** Yazım animasyon hızı, karakter başına (ms). 0 = anında. */
  typeSpeedMs?: number;
  /** true ise sağ-üst köşede kapatılabilir hızlandır/atla kontrol çifti gösterir (⚡ toggle + ⏭ satır-atla). Varsayılan false. `setTypeSpeed()`/`skipAll()` her durumda kullanılabilir — çağıranın çizdiği bir HUD kontrolü için. */
  showControls?: boolean;
  /** Hızlandırılan yazım hızı (ms/karakter), showControls true iken ⚡ ile değiştirilir. Varsayılan 2. */
  fastTypeSpeedMs?: number;
  onComplete?: () => void;
  /** Ek CSS class'ı — kullanıcı kendi stilini geçersiz kılmak için. */
  className?: string;
}

/**
 * NPC/hikaye diyalog kutusu. Bir satır kuyruğunu (`show`) daktilo efektiyle
 * tek tek oynatır; tıklama/`next()` ilerletir. Kuyruk boşalınca `onComplete`
 * tetiklenir. `choices`'lı satırlar otomatik ilerlemek yerine oyuncunun seçim
 * yapmasını bekler (dallanan diyalog). `setTypeSpeed()`/`skipAll()` tekrar
 * oynatışlarda hızlandırma/atlamayı destekler; `showControls: true` bunları
 * buton olarak sunar.
 */
export class DialogueBox {
  readonly element: HTMLDivElement;
  private readonly portraitSlot: HTMLDivElement;
  private readonly speakerLabel: HTMLDivElement;
  private readonly textLabel: HTMLDivElement;
  private readonly choicesContainer: HTMLDivElement;
  private readonly continueIndicator: HTMLDivElement;
  private readonly normalTypeSpeedMs: number;
  private readonly fastTypeSpeedMs: number;
  private typeSpeedMs: number;
  private fastForward = false;
  private onComplete?: () => void;
  private queue: DialogueLine[] = [];
  private currentLine: DialogueLine | null = null;
  private currentText = '';
  private typingTimer?: ReturnType<typeof setInterval>;
  private isTyping = false;
  private awaitingChoice = false;
  private boundClick: (event: MouseEvent) => void;

  constructor(options: DialogueBoxOptions = {}) {
    this.normalTypeSpeedMs = options.typeSpeedMs ?? 24;
    this.fastTypeSpeedMs = options.fastTypeSpeedMs ?? 2;
    this.typeSpeedMs = this.normalTypeSpeedMs;
    this.onComplete = options.onComplete;

    this.element = document.createElement('div');
    this.element.className = ['vol-dialogue', options.className].filter(Boolean).join(' ');
    this.element.inert = true;

    this.portraitSlot = document.createElement('div');
    this.portraitSlot.className = 'vol-dialogue__portrait';
    this.portraitSlot.hidden = true;
    this.element.appendChild(this.portraitSlot);

    const body = document.createElement('div');
    body.className = 'vol-dialogue__body';

    this.speakerLabel = document.createElement('div');
    this.speakerLabel.className = 'vol-dialogue__speaker';
    body.appendChild(this.speakerLabel);

    this.textLabel = document.createElement('div');
    this.textLabel.className = 'vol-dialogue__text';
    body.appendChild(this.textLabel);

    this.choicesContainer = document.createElement('div');
    this.choicesContainer.className = 'vol-dialogue__choices';
    this.choicesContainer.hidden = true;
    body.appendChild(this.choicesContainer);

    this.element.appendChild(body);

    this.continueIndicator = document.createElement('div');
    this.continueIndicator.className = 'vol-dialogue__continue';
    this.continueIndicator.textContent = '▼';
    this.element.appendChild(this.continueIndicator);

    if (options.showControls) {
      this.element.appendChild(this.buildControls());
    }

    // Seçimler gösteriliyorken kutuya tıklamak ilerletmemeli (next()) — oyuncu
    // önce seçmeli. awaitingChoice bunu merkezden kontrol eder, çünkü seçim
    // butonu tıklamaları da buraya bubble eder.
    this.boundClick = () => {
      if (this.awaitingChoice) return;
      this.next();
    };
    this.element.addEventListener('click', this.boundClick);
  }

  show(lines: DialogueLine[]): void {
    this.queue = [...lines];
    this.element.classList.add('vol-dialogue--visible');
    this.element.inert = false;
    this.advance();
  }

  /** Yazım sürüyorsa anında tamamlar; değilse (ve seçim beklenmiyorsa) sonraki satıra geçer. */
  next(): void {
    if (this.awaitingChoice) return;
    if (this.isTyping) {
      this.completeTyping();
      return;
    }
    this.advance();
  }

  /** Yazım hızını canlı değiştirir (ör. "hızlandır" butonu). Düşük ms = hızlı; 0 = anında. */
  setTypeSpeed(typeSpeedMs: number): void {
    this.typeSpeedMs = typeSpeedMs;
  }

  /** Bir sonraki (ve dahil) seçim satırına kadar tüm satırları anında tamamlayıp kuyruktan çıkarır, sonra kuyruk boşalırsa kapatır — "tekrarda atla" butonu için. Seçim satırında durur çünkü oyuncu karar vermelidir. */
  skipAll(): void {
    clearInterval(this.typingTimer);
    this.isTyping = false;
    while (this.queue.length > 0) {
      const line = this.queue[0];
      if (line.choices?.length) {
        // advance() normal hızda yazım başlatır; seçim butonları (onTypingDone'da
        // render edilen) yazım bitene kadar gizli kalmasın diye hemen tam-la.
        this.advance();
        this.completeTyping();
        return;
      }
      this.queue.shift();
    }
    this.hide();
    this.onComplete?.();
  }

  hide(): void {
    clearInterval(this.typingTimer);
    this.isTyping = false;
    this.awaitingChoice = false;
    this.choicesContainer.hidden = true;
    this.choicesContainer.replaceChildren();
    this.element.classList.remove('vol-dialogue--visible');
    this.element.inert = true;
    this.queue = [];
  }

  destroy(): void {
    clearInterval(this.typingTimer);
    this.element.removeEventListener('click', this.boundClick);
    this.element.remove();
  }

  /**
   * Hızlandır + satır-atla buton çiftini oluşturur (showControls:true). İkonlar
   * emoji yerine inline SVG olarak çizilir — core'un emoji karakteri kullanmama
   * kuralıyla uyumlu (platformlar arasında tutarsız render).
   */
  private buildControls(): HTMLDivElement {
    const controls = document.createElement('div');
    controls.className = 'vol-dialogue__controls';

    const fastForwardButton = document.createElement('button');
    fastForwardButton.type = 'button';
    fastForwardButton.className = 'vol-dialogue__control';
    fastForwardButton.appendChild(this.buildControlIcon('fast-forward'));
    fastForwardButton.setAttribute('aria-label', 'Yazımı hızlandır');
    fastForwardButton.setAttribute('aria-pressed', 'false');
    fastForwardButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.fastForward = !this.fastForward;
      this.typeSpeedMs = this.fastForward ? this.fastTypeSpeedMs : this.normalTypeSpeedMs;
      fastForwardButton.setAttribute('aria-pressed', String(this.fastForward));
      fastForwardButton.classList.toggle('vol-dialogue__control--active', this.fastForward);
    });
    controls.appendChild(fastForwardButton);

    const skipLineButton = document.createElement('button');
    skipLineButton.type = 'button';
    skipLineButton.className = 'vol-dialogue__control';
    skipLineButton.appendChild(this.buildControlIcon('skip'));
    skipLineButton.setAttribute('aria-label', 'Satırı tamamla');
    skipLineButton.addEventListener('click', (event) => {
      event.stopPropagation();
      this.next();
    });
    controls.appendChild(skipLineButton);

    return controls;
  }

  /** 'fast-forward': çift ok (▶▶). 'skip': ok + çubuk (▶|), "tamamla/sonraki" için standart medya sembolü. */
  private buildControlIcon(kind: 'fast-forward' | 'skip'): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('class', 'vol-dialogue__control-icon');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute(
      'd',
      kind === 'fast-forward' ? 'M4 5v14l8-7Z M12 5v14l8-7Z' : 'M5 5v14l10-7Z M18 5h2v14h-2Z',
    );
    svg.appendChild(path);
    return svg;
  }

  private advance(): void {
    const line = this.queue.shift();
    if (!line) {
      this.hide();
      this.onComplete?.();
      return;
    }
    this.currentLine = line;

    this.speakerLabel.textContent = line.speaker ?? '';
    this.speakerLabel.hidden = !line.speaker;

    this.portraitSlot.replaceChildren();
    if (line.portrait) {
      if (typeof line.portrait === 'string') {
        const img = document.createElement('img');
        img.src = line.portrait;
        img.alt = line.speaker ?? '';
        this.portraitSlot.appendChild(img);
      } else {
        this.portraitSlot.appendChild(line.portrait);
      }
      this.portraitSlot.classList.remove('vol-dialogue__portrait--placeholder');
    } else if (line.speaker) {
      this.portraitSlot.textContent = line.speaker.charAt(0).toUpperCase();
      this.portraitSlot.classList.add('vol-dialogue__portrait--placeholder');
    } else {
      this.portraitSlot.classList.remove('vol-dialogue__portrait--placeholder');
    }
    this.portraitSlot.hidden = !line.portrait && !line.speaker;

    this.typeText(line.text);
  }

  private typeText(text: string): void {
    clearInterval(this.typingTimer);
    this.currentText = text;
    this.textLabel.textContent = '';
    this.continueIndicator.classList.remove('vol-dialogue__continue--visible');
    this.awaitingChoice = false;
    this.choicesContainer.hidden = true;
    this.choicesContainer.replaceChildren();

    if (this.typeSpeedMs <= 0) {
      this.textLabel.textContent = text;
      this.onTypingDone();
      return;
    }

    this.isTyping = true;
    let index = 0;
    this.typingTimer = setInterval(() => {
      index += 1;
      this.textLabel.textContent = text.slice(0, index);
      if (index >= text.length) {
        this.onTypingDone();
      }
    }, this.typeSpeedMs);
  }

  private completeTyping(): void {
    clearInterval(this.typingTimer);
    this.textLabel.textContent = this.currentText;
    this.onTypingDone();
  }

  private onTypingDone(): void {
    clearInterval(this.typingTimer);
    this.isTyping = false;

    const choices = this.currentLine?.choices;
    if (choices?.length) {
      this.awaitingChoice = true;
      this.renderChoices(choices);
      return;
    }

    this.continueIndicator.classList.add('vol-dialogue__continue--visible');
  }

  private renderChoices(choices: DialogueChoice[]): void {
    this.choicesContainer.hidden = false;
    for (const choice of choices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'vol-dialogue__choice';
      button.textContent = choice.label;
      button.addEventListener('click', (event) => {
        // Bunun kutunun click listener'ına (next()) bubble olmasına izin verme —
        // seçim sonrası ilerleme burada açıkça ele alınır.
        event.stopPropagation();
        this.awaitingChoice = false;
        this.choicesContainer.hidden = true;
        this.choicesContainer.replaceChildren();
        choice.onSelect();
        this.advance();
      });
      this.choicesContainer.appendChild(button);
    }
  }
}
