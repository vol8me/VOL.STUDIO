import {
  Button,
  DisposableScope,
  SettingsForm,
  SettingsRow,
  SegmentedControl,
} from '@volstudio/core';

/**
 * Kabul oturumu paneli (P1/P2). YALNIZ geliştirme derlemesinde kurulur.
 *
 * Tablette adres çubuğu yoktur: kamera adayını ve audition adayını sorgu
 * yazarak değiştirmek cihazda İMKÂNSIZDIR. Kabul paketleri tam olarak bunu
 * istediği için seçim buraya, kullanıcının elinin altına taşındı.
 *
 * Seçim sorguyu değiştirip sayfayı yeniden yükler: kamera profili ve dünya
 * tohumu açılışta kurulur, sıcak değiştirilemez. Yeniden yükleme bu yüzden
 * gizlenmez, kabul edilen davranıştır.
 */
export interface ResearchPanelAudition {
  readonly entryIndex: number;
  readonly entryCount: number;
  readonly seedIndex: number;
  readonly seedCount: number;
  readonly digest: string;
}

export interface ResearchPanelLabels {
  readonly camera: string;
  readonly audition: string;
  readonly seed: string;
}

export interface ResearchPanelOptions {
  readonly cameraCandidateIds: readonly string[];
  readonly activeCameraId: string;
  /** Katalog yüklüyse aday/tohum gezinmesi; yoksa satırlar kurulmaz. */
  readonly audition: ResearchPanelAudition | null;
  readonly labels: ResearchPanelLabels;
  /** Sorgu yazımı ENJEKTE edilir; test gerçek gezinme yapmaz. */
  readonly navigate: (query: URLSearchParams) => void;
  readonly search?: string;
}

export class LifeResearchPanel {
  readonly element: HTMLDivElement;
  private readonly scope = new DisposableScope();

  constructor(private readonly options: ResearchPanelOptions) {
    const form = this.scope.addDestroyable(new SettingsForm({ className: 'vol-life-research' }));
    this.element = form.element;

    const camera = this.scope.addDestroyable(
      new SegmentedControl({
        options: options.cameraCandidateIds.map((id) => ({ value: id, label: id })),
        value: options.activeCameraId,
        ariaLabel: options.labels.camera,
        onCommit: (value) => this.apply({ camera: value }),
      }),
    );
    this.appendRow(options.labels.camera, camera, 'camera');

    const audition = options.audition;
    if (!audition) return;
    this.appendRow(
      options.labels.audition,
      this.navControl('audition', audition.entryIndex, audition.entryCount),
      'audition',
    );
    this.appendRow(
      options.labels.seed,
      this.navControl('seed', audition.seedIndex, audition.seedCount),
      'seed',
    );
  }

  private appendRow(label: string, control: { element: HTMLElement }, key: string): void {
    const row = this.scope.addDestroyable(new SettingsRow({ label, control, stackOnNarrow: true }));
    row.element.dataset.research = key;
    this.element.appendChild(row.element);
  }

  private navControl(
    kind: 'audition' | 'seed',
    index: number,
    count: number,
  ): { element: HTMLElement } {
    const group = document.createElement('div');
    group.className = 'vol-life-research__nav';
    /*
     * Yerleşim SATIR İÇİ verilir: bu panel yalnız geliştirmede kurulur ve
     * kurallarını `styles.css`e koymak, hiç çizilmeyen bir bileşenin stilini
     * üretim derlemesine taşırdı (yokluk testi bunu yakaladı).
     */
    group.style.display = 'flex';
    group.style.gap = '8px';
    group.style.alignItems = 'center';

    const previous = this.stepButton(kind, index, -1, count);
    const position = document.createElement('span');
    position.className = 'vol-life-research__position';
    position.style.minWidth = '3ch';
    position.style.textAlign = 'center';
    position.style.fontVariantNumeric = 'tabular-nums';
    position.textContent = `${index + 1}/${count}`;
    const next = this.stepButton(kind, index, 1, count);

    group.append(previous.element, position, next.element);
    return { element: group };
  }

  /** Sarmalama YOK: son adaydan sonrası yoktur, düğme devre dışı kalır. */
  private stepButton(
    kind: 'audition' | 'seed',
    index: number,
    step: -1 | 1,
    count: number,
  ): Button {
    const target = index + step;
    return this.scope.addDestroyable(
      new Button(step < 0 ? '‹' : '›', {
        variant: 'default',
        size: 'sm',
        fullWidth: false,
        disabled: target < 0 || target >= count,
        onClick: () => this.apply({ [kind]: String(target + 1) }),
      }),
    );
  }

  /** Var olan sorgu KORUNUR: kamera adayı değişince audition seçimi düşmez. */
  private apply(changes: Record<string, string>): void {
    const current =
      this.options.search ?? (typeof window === 'undefined' ? '' : window.location.search);
    const query = new URLSearchParams(current);
    for (const [key, value] of Object.entries(changes)) query.set(key, value);
    this.options.navigate(query);
  }

  destroy(): void {
    this.scope.dispose();
  }
}
