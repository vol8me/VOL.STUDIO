import { DisposableScope } from '@volstudio/core/lifecycle';
import { API_ERROR_CODES } from '../../shared/index';
import type { AssetEvent, AssetSummary, ProjectResponse } from '../../shared/index';
import {
  AssetStudioApiError,
  type AssetEventSubscription,
  type AssetStudioClient,
} from '../api/AssetStudioClient';
import { AssetLibrary, type Translate } from '../catalog/AssetLibrary';
import { AudioEditorPanel } from '../audio/AudioEditorPanel';
import { EditorPanel } from '../editor/EditorPanel';
import { QuickLook } from '../preview/QuickLook';
import { VisualInspector } from '../preview/VisualInspector';
import { Tooltip } from '@volstudio/core/ui';
import { element, replaceChildren } from '../ui/dom';
import { icon } from '../ui/icons';

export interface AssetStudioAppOptions {
  root: HTMLElement;
  client: AssetStudioClient;
  t: Translate;
  locale: () => string;
  onToggleLanguage: () => Promise<void>;
}

type ConnectionState = 'live' | 'offline' | 'reconnecting';

/** Katalog, canlı repo olayları ve Quick Look yaşam döngüsünü yöneten uygulama kabuğu. */
// Sunucunun bütün kodları + istemcinin kendi ağ hatası. Liste sözleşmeden
// türer; elle kopyalandığı dönemde yeni kodlar sessizce genel metne düşüyordu.
const TRANSLATABLE_ERROR_CODES: ReadonlySet<string> = new Set<string>([
  ...API_ERROR_CODES,
  'request_failed',
]);

export class AssetStudioApp {
  private readonly scope = new DisposableScope();
  private readonly shell: HTMLDivElement;
  private readonly projectName: HTMLSpanElement;
  private readonly connection: HTMLSpanElement;
  private readonly connectionLabel: HTMLSpanElement;
  private readonly fullscreenButton: HTMLButtonElement;
  private readonly fullscreenTooltip: Tooltip;
  private readonly languageButton: HTMLButtonElement;
  private readonly loadingLayer: HTMLDivElement;
  private readonly loadingText: HTMLParagraphElement;
  private readonly errorTitle: HTMLHeadingElement;
  private readonly errorMessage: HTMLParagraphElement;
  private readonly retryButton: HTMLButtonElement;
  private readonly authenticationForm: HTMLFormElement;
  private readonly authenticationTitle: HTMLHeadingElement;
  private readonly authenticationMessage: HTMLParagraphElement;
  private readonly authenticationToken: HTMLInputElement;
  private readonly authenticationSubmit: HTMLButtonElement;
  private readonly toast: HTMLDivElement;
  private readonly library: AssetLibrary;
  private readonly quickLook: QuickLook;
  private readonly editor: EditorPanel;
  private readonly audioEditor: AudioEditorPanel;
  private readonly visualInspector: VisualInspector;
  private t: Translate;
  private assets = new Map<string, AssetSummary>();
  private revision = 0;
  private selectedId: string | null = null;
  private request: AbortController | null = null;
  private subscription: AssetEventSubscription | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private leaseInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly options: AssetStudioAppOptions) {
    this.t = options.t;
    this.projectName = element('span', { className: 'studio-brand__project' });
    const brand = element('div', {
      className: 'studio-brand',
      children: [
        element('span', { className: 'studio-brand__mark', attrs: { 'aria-hidden': 'true' } }),
        element('span', { className: 'studio-brand__name', children: [this.t('app.title')] }),
        this.projectName,
      ],
    });

    this.connectionLabel = element('span');
    this.connection = element('span', {
      className: 'studio-connection',
      attrs: { role: 'status' },
      children: [element('i', { className: 'studio-connection__dot' }), this.connectionLabel],
    });

    this.fullscreenButton = element('button', {
      className: 'icon-action',
      attrs: { type: 'button' },
      children: [icon('fullscreen')],
    });
    this.fullscreenButton.removeAttribute('title');
    this.fullscreenTooltip = new Tooltip(this.fullscreenButton, this.t('app.fullscreen'), {
      placement: 'bottom',
    });
    this.scope.addListener(this.fullscreenButton, 'click', () => void this.toggleFullscreen());
    this.languageButton = element('button', {
      className: 'studio-language',
      attrs: { type: 'button' },
    });
    this.scope.addListener(this.languageButton, 'click', () => void options.onToggleLanguage());

    const actions = element('div', {
      className: 'studio-topbar__actions',
      children: [this.connection, this.languageButton, this.fullscreenButton],
    });
    const topbar = element('header', { className: 'studio-topbar', children: [brand, actions] });

    this.library = new AssetLibrary({
      client: options.client,
      t: this.t,
      onSelect: (asset) => this.selectAsset(asset),
      onRefresh: () => void this.load(),
    });
    this.quickLook = new QuickLook({
      client: options.client,
      t: this.t,
      locale: options.locale,
      onClose: () => this.selectAsset(null),
      onToast: (message) => this.showToast(message),
      onEdit: (asset) => void this.openEditor(asset),
      onEditAudio: (asset) => void this.openAudioEditor(asset),
      onInspect: (asset) => void this.openVisualInspector(asset),
    });
    this.editor = new EditorPanel({
      client: options.client,
      t: this.t,
      onClose: () => this.closeEditor(),
      onToast: (message) => this.showToast(message),
      onSaved: (assetId, revision) => this.applySavedRevision(assetId, revision),
    });

    this.audioEditor = new AudioEditorPanel({
      client: options.client,
      t: this.t,
      onClose: () => this.closeAudioEditor(),
      onToast: (message) => this.showToast(message),
      onSaved: (assetId, revision) => this.applySavedRevision(assetId, revision),
    });
    this.visualInspector = new VisualInspector({
      client: options.client,
      t: this.t,
      onClose: () => this.closeVisualInspector(),
    });

    const workspace = element('main', {
      className: 'studio-workspace',
      children: [this.library.element, this.quickLook.element],
    });
    // Editör yüzeyleri workspace GRID'İNİN İÇİNDE değil, gövdenin üstünde
    // yaşar. Grid çocuğu olarak absolute konumlandıklarında hücre genişliğine
    // sıkışıyor ve QuickLook sütununun 340 pikseline hapsoluyorlardı.
    const body = element('div', {
      className: 'studio-body',
      children: [
        this.library.rail,
        workspace,
        this.editor.element,
        this.audioEditor.element,
        this.visualInspector.element,
      ],
    });

    this.loadingText = element('p');
    this.errorTitle = element('h2');
    this.errorMessage = element('p');
    this.retryButton = element('button', {
      className: 'studio-state__retry',
      attrs: { type: 'button' },
    });
    this.scope.addListener(this.retryButton, 'click', () => void this.load());
    this.authenticationTitle = element('h2');
    this.authenticationMessage = element('p', {
      attrs: { id: 'studio-authentication-message', 'aria-live': 'polite' },
    });
    this.authenticationToken = element('input', {
      className: 'studio-state__token',
      attrs: {
        type: 'password',
        name: 'token',
        autocomplete: 'current-password',
        spellcheck: 'false',
        'aria-describedby': 'studio-authentication-message',
      },
    });
    this.authenticationSubmit = element('button', {
      className: 'studio-state__retry',
      attrs: { type: 'submit' },
    });
    this.authenticationForm = element('form', {
      className: 'studio-state__authentication',
      children: [
        this.authenticationTitle,
        this.authenticationMessage,
        element('label', {
          className: 'studio-state__token-field',
          children: [element('span'), this.authenticationToken],
        }),
        this.authenticationSubmit,
      ],
    });
    this.scope.addListener(this.authenticationForm, 'submit', (event) => {
      event.preventDefault();
      void this.authenticate();
    });
    this.loadingLayer = element('div', {
      className: 'studio-state',
      children: [
        element('div', { className: 'studio-state__spinner', attrs: { 'aria-hidden': 'true' } }),
        this.loadingText,
        element('div', {
          className: 'studio-state__error',
          children: [this.errorTitle, this.errorMessage, this.retryButton],
        }),
        this.authenticationForm,
      ],
    });
    this.toast = element('div', {
      className: 'studio-toast',
      attrs: { role: 'status', 'aria-live': 'polite', hidden: true },
    });
    this.shell = element('div', {
      className: 'studio-shell',
      children: [topbar, body, this.loadingLayer, this.toast],
    });
    replaceChildren(options.root, this.shell);

    this.scope.addListener(document, 'fullscreenchange', () => this.renderFullscreenLabel());
    this.scope.addListener(window, 'keydown', (event) =>
      this.handleKeydown(event as KeyboardEvent),
    );
    this.renderLabels();
    this.setConnection('offline');
  }

  async start(): Promise<void> {
    await this.load();
    if (this.loadingLayer.dataset.state === undefined) {
      await this.#startLease();
    }
  }

  async load(): Promise<void> {
    this.request?.abort();
    const request = new AbortController();
    this.request = request;
    this.showLoading();
    try {
      const [project, catalog] = await Promise.all([
        this.options.client.getProject(request.signal),
        this.options.client.getCatalog(request.signal),
      ]);
      if (request.signal.aborted) return;
      this.applyProject(project);
      this.revision = catalog.revision;
      this.assets = new Map(catalog.assets.map((asset) => [asset.id, asset]));
      this.library.setAssets(catalog.assets);
      this.restoreSelection();
      this.hideState();
      this.ensureSubscription();
    } catch (error) {
      if (!request.signal.aborted) this.showError(error);
    } finally {
      if (this.request === request) this.request = null;
    }
  }

  setTranslator(t: Translate): void {
    this.t = t;
    this.library.setTranslator(t);
    this.quickLook.setTranslator(t);
    this.editor.setTranslator(t);
    this.audioEditor.setTranslator(t);
    this.visualInspector.setTranslator(t);
    this.renderLabels();
  }

  destroy(): void {
    this.request?.abort();
    this.subscription?.close();
    this.subscription = null;
    this.options.client.releaseLease();
    if (this.leaseInterval) {
      clearInterval(this.leaseInterval);
      this.leaseInterval = null;
    }
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.fullscreenTooltip.destroy();
    this.library.destroy();
    this.quickLook.destroy();
    this.editor.destroy();
    this.audioEditor.destroy();
    this.visualInspector.destroy();
    this.scope.dispose();
    this.shell.remove();
  }

  private applyProject(project: ProjectResponse): void {
    this.projectName.textContent = project.name;
    const unavailable = project.roots.filter((root) => !root.available).length;
    this.projectName.classList.toggle('studio-brand__project--warning', unavailable > 0);
  }

  private async handleAssetEvent(event: AssetEvent): Promise<void> {
    if (event.type === 'resync' || event.revision > this.revision + 1) {
      await this.load();
      return;
    }
    if (event.revision <= this.revision) return;

    if (event.type === 'deleted') {
      this.assets.delete(event.assetId);
    } else {
      this.assets.set(event.asset.id, event.asset);
    }
    this.revision = event.revision;
    // Açık belge diskte değiştiyse editör bunu bilmeli; kirli belge otomatik
    // yüklenmez, kullanıcıya seçenek gösterilir.
    if (event.type === 'changed') {
      this.editor.noteExternalRevision(event.asset.id, event.asset.revision);
      this.visualInspector.noteAssetChanged(event.asset);
    }
    this.library.setAssets([...this.assets.values()]);
    this.restoreSelection();
  }

  private selectAsset(asset: AssetSummary | null): void {
    const nextId = asset?.id ?? null;
    if (this.selectedId !== nextId && this.visualInspector.isOpen) {
      this.closeVisualInspector();
    }
    this.selectedId = nextId;
    this.library.setSelected(this.selectedId);
    this.quickLook.setAsset(asset);
    this.shell.classList.toggle('studio-shell--inspecting', Boolean(asset));
  }

  /** Varlığı piksel editöründe açar ve kabuğu düzenleme kipine alır. */
  private async openEditor(asset: AssetSummary): Promise<void> {
    this.shell.classList.add('studio-shell--editing');
    await this.editor.open(asset);
  }

  /** Sesi kendi editöründe açar. */
  private async openAudioEditor(asset: AssetSummary): Promise<void> {
    this.shell.classList.add('studio-shell--editing');
    await this.audioEditor.open(asset);
    this.audioEditor.syncWaveformSize();
  }

  /** VisualSynth graphını kullanıcıya gösterir; bu yüzey salt-okunurdur. */
  private openVisualInspector(asset: AssetSummary): void {
    this.shell.classList.add('studio-shell--visual-inspecting');
    this.visualInspector.open(asset);
  }

  private closeVisualInspector(): void {
    this.visualInspector.close();
    this.shell.classList.remove('studio-shell--visual-inspecting');
  }

  private closeAudioEditor(): void {
    this.audioEditor.close();
    this.shell.classList.remove('studio-shell--editing');
  }

  private closeEditor(): void {
    this.editor.close();
    this.shell.classList.remove('studio-shell--editing');
  }

  /** Kayıttan sonra katalog satırını yeni revizyonla tazeler. */
  private applySavedRevision(assetId: string, revision: string): void {
    const asset = this.assets.get(assetId);
    if (asset === undefined) return;
    this.assets.set(assetId, { ...asset, revision });
    this.library.setAssets([...this.assets.values()]);
    this.restoreSelection();
  }

  private restoreSelection(): void {
    const selected = this.selectedId ? this.assets.get(this.selectedId) ?? null : null;
    this.selectAsset(selected);
  }

  private setConnection(state: ConnectionState): void {
    this.connection.dataset.state = state;
    this.connectionLabel.textContent = this.t(`library.${state}`);
  }

  private showLoading(): void {
    this.loadingLayer.dataset.state = 'loading';
    this.loadingLayer.hidden = false;
  }

  private hideState(): void {
    this.loadingLayer.hidden = true;
    delete this.loadingLayer.dataset.state;
  }

  private showError(error: unknown): void {
    const code = error instanceof AssetStudioApiError ? error.code : 'request_failed';
    if (code === 'authentication_required') {
      this.showAuthentication('authentication.message');
      return;
    }
    this.errorMessage.textContent = this.t(
      `errors.${TRANSLATABLE_ERROR_CODES.has(code) ? code : 'request_failed'}`,
    );
    this.loadingLayer.dataset.state = 'error';
    this.loadingLayer.hidden = false;
  }

  private showAuthentication(messageKey: string): void {
    this.authenticationMessage.textContent = this.t(messageKey);
    this.authenticationSubmit.disabled = false;
    this.loadingLayer.dataset.state = 'authentication';
    this.loadingLayer.hidden = false;
    this.authenticationToken.focus();
  }

  private async authenticate(): Promise<void> {
    const token = this.authenticationToken.value.trim();
    if (!token) {
      this.showAuthentication('authentication.required');
      return;
    }

    this.authenticationSubmit.disabled = true;
    this.authenticationMessage.textContent = this.t('authentication.connecting');
    try {
      await this.options.client.authenticate(token);
      this.authenticationToken.value = '';
      await this.load();
      if (this.loadingLayer.dataset.state === undefined) {
        await this.#startLease();
      }
    } catch (error) {
      if (error instanceof AssetStudioApiError && error.code === 'authentication_required') {
        this.showAuthentication('authentication.invalid');
        return;
      }
      this.showError(error);
    } finally {
      this.authenticationSubmit.disabled = false;
    }
  }

  private ensureSubscription(): void {
    if (this.subscription) return;
    this.subscription = this.options.client.subscribe(
      (event) => void this.handleAssetEvent(event),
      (state) => this.setConnection(state),
    );
  }

  async #startLease(): Promise<void> {
    if (this.leaseInterval !== null) return;
    try {
      await this.options.client.acquireLease();
      this.leaseInterval = setInterval(() => {
        void this.options.client.renewLease();
      }, 15_000);
    } catch (error) {
      this.showError(error);
    }
  }

  private renderLabels(): void {
    document.title = this.t('app.title');
    this.loadingText.textContent = this.t('app.loading');
    this.errorTitle.textContent = this.t('app.loadFailed');
    this.retryButton.textContent = this.t('app.retry');
    this.authenticationTitle.textContent = this.t('authentication.title');
    this.authenticationToken.setAttribute('aria-label', this.t('authentication.token'));
    const tokenLabel = this.authenticationForm.querySelector('label > span');
    if (tokenLabel) tokenLabel.textContent = this.t('authentication.token');
    this.authenticationSubmit.textContent = this.t('authentication.connect');
    this.languageButton.textContent = this.t('app.language');
    this.languageButton.setAttribute('aria-label', this.t('app.language'));
    this.renderFullscreenLabel();
    this.setConnection((this.connection.dataset.state as ConnectionState | undefined) ?? 'offline');
  }

  private renderFullscreenLabel(): void {
    const key = document.fullscreenElement ? 'app.leaveFullscreen' : 'app.fullscreen';
    this.fullscreenTooltip.setText(this.t(key));
    this.fullscreenButton.setAttribute('aria-label', this.t(key));
    this.fullscreenButton.setAttribute('aria-pressed', String(Boolean(document.fullscreenElement)));
  }

  private async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      this.showToast(this.t('app.fullscreenFailed'));
    }
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'F11') {
      event.preventDefault();
      if (!event.repeat) void this.toggleFullscreen();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') {
      event.preventDefault();
      this.library.focusSearch();
      return;
    }
    if (
      event.key === 'Escape' &&
      this.selectedId &&
      !this.visualInspector.isOpen &&
      !this.editor.isOpen &&
      !this.audioEditor.isOpen &&
      !document.fullscreenElement
    ) {
      this.selectAsset(null);
    } else if (event.key === 'Escape' && this.visualInspector.isOpen) {
      this.closeVisualInspector();
    }
  }

  private showToast(message: string): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast.textContent = message;
    this.toast.hidden = false;
    this.toastTimer = setTimeout(() => {
      this.toast.hidden = true;
      this.toastTimer = null;
    }, 2400);
  }
}
