import { i18next } from '../../i18n/I18n';
import { MODAL_TRANSITION_MS } from './Confirm';
import { Sheet } from './Sheet';

export interface LegalSection {
  readonly heading: string;
  /** Her öğe ayrı paragraf; düz metindir (HTML yorumlanmaz). */
  readonly paragraphs: readonly string[];
}

/** Üçüncü taraf bir varlığın (ikon, yazı tipi, ses, imleç kümesi) atıf kaydı. */
export interface Attribution {
  readonly name: string;
  readonly author?: string;
  readonly license: string;
  readonly version?: string;
  /** Kaynak adresi; METİN olarak gösterilir (seçilip kopyalanabilir), tıklanınca gezinti başlatılmaz. */
  readonly source?: string;
  readonly note?: string;
}

export interface LegalDocumentOptions {
  readonly title: string;
  readonly sections?: readonly LegalSection[];
  readonly attributions?: readonly Attribution[];
  /** Atıf listesi başlığı; varsayılan çevrilmiş "Atıflar". */
  readonly attributionsTitle?: string;
  readonly closeLabel?: string;
  /** Sheet'in ekleneceği kapsayıcı. Varsayılan document.body. */
  readonly container?: HTMLElement;
  readonly className?: string;
  /** Sahne kapanırken belgeyi kapatır. */
  readonly signal?: AbortSignal;
}

export interface LegalDocumentHandle {
  /** Belge kapanınca çözülür; asla reddedilmez. */
  readonly result: Promise<void>;
  close(): void;
}

function field(label: string, value: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'vol-legal__field';
  const term = document.createElement('dt');
  term.textContent = label;
  const detail = document.createElement('dd');
  detail.textContent = value;
  row.append(term, detail);
  return row;
}

/**
 * Kredi ve yasal metin ekranı (ikon/yazı tipi/ses atıfları dahil): `Sheet` içinde klavyeyle kaydırılabilir
 * bölümler ve atıf listesi. Metin yalnız `textContent` ile yazılır; adresler tıklanabilir bağlantı değil seçilebilir
 * metindir (yerel kabukta dış gezinti platforma bağlıdır; gerekirse çağıran kendi eylemini ekler).
 *
 * Bu bileşen yasal metnin KENDİSİNİ üretmez ve doğrulamaz: içerik uygulamanın depodaki NOTICE/atıf kayıtlarından
 * gelir; doğruluğu içerik sahibinin sorumluluğundadır.
 */
export function showLegalDocument(options: LegalDocumentOptions): LegalDocumentHandle {
  if (options.signal?.aborted) return { result: Promise.resolve(), close: () => undefined };
  let resolved = false;
  let resolveResult!: () => void;
  const result = new Promise<void>((resolve) => (resolveResult = resolve));

  const sheet = new Sheet({
    title: options.title,
    closeLabel: options.closeLabel ?? i18next.t('core:dialog.legal.close'),
    className: ['vol-legal', options.className].filter(Boolean).join(' '),
    onClose: () => {
      if (resolved) return;
      resolved = true;
      options.signal?.removeEventListener('abort', onAbort);
      resolveResult();
      window.setTimeout(() => sheet.destroy(), MODAL_TRANSITION_MS);
    },
  });
  const onAbort = (): void => sheet.close();

  for (const section of options.sections ?? []) {
    const block = document.createElement('section');
    block.className = 'vol-legal__section';
    const heading = document.createElement('h3');
    heading.className = 'vol-legal__heading';
    heading.textContent = section.heading;
    block.appendChild(heading);
    for (const paragraph of section.paragraphs) {
      const text = document.createElement('p');
      text.className = 'vol-legal__paragraph';
      text.textContent = paragraph;
      block.appendChild(text);
    }
    sheet.add({ element: block });
  }

  const attributions = options.attributions ?? [];
  if (attributions.length > 0) {
    const block = document.createElement('section');
    block.className = 'vol-legal__section';
    const heading = document.createElement('h3');
    heading.className = 'vol-legal__heading';
    heading.textContent = options.attributionsTitle ?? i18next.t('core:dialog.legal.attributions');
    const list = document.createElement('ul');
    list.className = 'vol-legal__attributions';
    for (const attribution of attributions) {
      const item = document.createElement('li');
      item.className = 'vol-legal__attribution';
      const name = document.createElement('strong');
      name.className = 'vol-legal__name';
      name.textContent = attribution.version
        ? `${attribution.name} ${attribution.version}`
        : attribution.name;
      const details = document.createElement('dl');
      details.className = 'vol-legal__fields';
      if (attribution.author) {
        details.appendChild(field(i18next.t('core:dialog.legal.author'), attribution.author));
      }
      details.appendChild(field(i18next.t('core:dialog.legal.license'), attribution.license));
      if (attribution.source) {
        details.appendChild(field(i18next.t('core:dialog.legal.source'), attribution.source));
      }
      item.append(name, details);
      if (attribution.note) {
        const note = document.createElement('p');
        note.className = 'vol-legal__note';
        note.textContent = attribution.note;
        item.appendChild(note);
      }
      list.appendChild(item);
    }
    block.append(heading, list);
    sheet.add({ element: block });
  }

  (options.container ?? document.body).appendChild(sheet.element);
  void sheet.element.offsetWidth;
  sheet.open();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  return { result, close: () => sheet.close() };
}
