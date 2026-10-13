import { DisposableScope } from '@volstudio/core/lifecycle';
import { BuildMenu, Button, Input, ToastManager } from '@volstudio/core/ui';
import { BUILDING } from '@/config/forge';
import { TOOLS, type ToolId } from '@/config/game';
import { SYNC_MODE, isSimMismatch } from '@/net/protocol';
import type { ForgeSession, SessionOptions } from '@/net/session';
import { ForgeController, type HudView, type Notice } from './ForgeController';
import {
  parseServer,
  parseWorld,
  rememberServer,
  type ConnectSettings,
  type KeyValueStore,
} from './connect';
import { actionForKey, isTypingTarget } from './hotkeys';
import type { ForgeHost } from './host';
import { DIRECTION_KEYS } from './tools';
import { translate as t } from './translate';

/** Arayüzün dış bağımlılıkları; testte oturum kurucusu ve zamanlayıcı sahtedir. */
export interface AppDeps {
  readonly host: ForgeHost;
  readonly settings: ConnectSettings;
  readonly storage: KeyValueStore | null;
  readonly connect: (options: SessionOptions) => Promise<ForgeSession>;
  /** HUD yenileme aralığı (ms). */
  readonly hudIntervalMs?: number;
}

type Phase = 'connect' | 'joining' | 'playing';

/** Araç simgeleri: her yazı tipinde bulunan geometrik karakterler. */
const TOOL_ICONS: Readonly<Record<ToolId, string>> = {
  conveyor: '»',
  drill: '◍',
  smelter: '▲',
  turret: '◉',
  wall: '■',
  remove: '×',
};

function costText(tool: ToolId): string | undefined {
  const entry = TOOLS.find((candidate) => candidate.id === tool);
  if (!entry || entry.kind === null) return undefined;
  const cost = BUILDING[entry.kind].cost;
  const parts: string[] = [];
  if (cost.ore) parts.push(`${cost.ore} ${t('item.ore')}`);
  if (cost.plate) parts.push(`${cost.plate} ${t('item.plate')}`);
  return parts.length > 0 ? parts.join(' + ') : undefined;
}

function affordable(tool: ToolId, hud: HudView): boolean {
  const entry = TOOLS.find((candidate) => candidate.id === tool);
  if (!entry || entry.kind === null) return true;
  const cost = BUILDING[entry.kind].cost;
  return hud.ore >= (cost.ore ?? 0) && hud.plate >= (cost.plate ?? 0);
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * DOM arayüzü: bağlantı formu, durum çubuğu, araç menüsü ve bildirimler. Oyun mantığı
 * `ForgeController`dadır; bu sınıf yalnız oturumu kurar, denetleyiciyi sahneye (`host`) bağlar ve
 * denetleyici durumunu yazıya çevirir.
 */
export class App {
  private readonly root = element('div', 'forge-app');
  private readonly connectCard = element('form', 'forge-connect');
  private readonly serverInput: Input;
  private readonly worldInput: Input;
  private readonly joinButton: Button;
  private readonly errorLine = element('p', 'forge-connect__error');
  private readonly playing = element('div', 'forge-play');
  private readonly statusLine = element('div', 'forge-hud__status');
  private readonly statLine = element('div', 'forge-hud__stats');
  private readonly menu: BuildMenu;
  private readonly rotateButton: Button;
  private readonly leaveButton: Button;
  private readonly toasts: ToastManager;
  private readonly scope = new DisposableScope();
  private unsubscribeSession: (() => void) | null = null;
  private session: ForgeSession | null = null;
  private controller: ForgeController | null = null;
  private phase: Phase = 'connect';
  private timer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  constructor(
    parent: HTMLElement,
    private readonly deps: AppDeps,
  ) {
    document.title = t('app.title');
    this.serverInput = new Input({
      value: deps.settings.server,
      ariaLabel: t('connect.server'),
      type: 'text',
      enterKeyHint: 'go',
    });
    this.worldInput = new Input({
      value: deps.settings.worldId,
      ariaLabel: t('connect.world'),
      type: 'text',
      enterKeyHint: 'go',
    });
    this.joinButton = new Button(t('connect.join'), {
      variant: 'primary',
      onClick: () => void this.join(),
    });
    this.buildConnect();

    this.menu = new BuildMenu({
      ariaLabel: t('tools.label'),
      items: TOOLS.map((tool) => ({
        id: tool.id,
        icon: TOOL_ICONS[tool.id],
        label: t(`tools.${tool.id}`),
        cost: costText(tool.id),
        hotkey: tool.hotkey,
        onSelect: () => this.controller?.select(tool.id),
        onDeselect: () => this.controller?.select(null),
      })),
    });
    this.rotateButton = new Button(this.rotateLabel(0), {
      size: 'sm',
      fullWidth: false,
      onClick: () => this.rotate(),
    });
    this.leaveButton = new Button(t('connect.leave'), {
      size: 'sm',
      fullWidth: false,
      onClick: () => void this.leave(),
    });
    this.buildPlaying();
    this.toasts = new ToastManager(this.root);

    this.root.append(this.connectCard, this.playing);
    parent.appendChild(this.root);
    this.show('connect');

    this.scope.addListener<KeyboardEvent>(document, 'keydown', (event) => this.onKeyDown(event));
    if (deps.settings.autoJoin) void this.join();
  }

  private buildConnect(): void {
    const card = this.connectCard;
    card.noValidate = true;
    card.dataset.testid = 'forge-connect';
    this.serverInput.element.dataset.testid = 'forge-server';
    this.worldInput.element.dataset.testid = 'forge-world';
    this.joinButton.element.dataset.testid = 'forge-join';
    this.errorLine.dataset.testid = 'forge-error';
    card.append(
      element('h1', 'forge-connect__title', t('connect.title')),
      element('p', 'forge-connect__hint', t('connect.hint')),
      this.labelled(t('connect.server'), this.serverInput.element),
      this.labelled(t('connect.world'), this.worldInput.element),
      this.errorLine,
      this.joinButton.element,
    );
    this.errorLine.setAttribute('role', 'alert');
    card.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.join();
    });
  }

  private labelled(text: string, control: HTMLElement): HTMLLabelElement {
    const label = element('label', 'forge-connect__field');
    label.append(element('span', 'forge-connect__label', text), control);
    return label;
  }

  private buildPlaying(): void {
    const top = element('div', 'forge-hud');
    top.append(this.statusLine, this.statLine, this.leaveButton.element);
    this.statusLine.setAttribute('role', 'status');
    this.statusLine.dataset.testid = 'forge-status';
    this.statLine.dataset.testid = 'forge-stats';
    this.leaveButton.element.dataset.testid = 'forge-leave';
    this.playing.dataset.testid = 'forge-play';
    const bottom = element('div', 'forge-tools');
    bottom.append(this.menu.element, this.rotateButton.element);
    this.playing.append(top, bottom);
  }

  private show(phase: Phase): void {
    this.phase = phase;
    this.connectCard.hidden = phase === 'playing';
    this.playing.hidden = phase !== 'playing';
    this.joinButton.setLoading(phase === 'joining');
    this.serverInput.setDisabled(phase === 'joining');
    this.worldInput.setDisabled(phase === 'joining');
  }

  private setError(key: string | null): void {
    this.errorLine.textContent = key === null ? '' : t(key);
  }

  /** Forma girileni doğrular, oturumu açar ve denetleyiciyi sahneye bağlar. */
  async join(): Promise<void> {
    if (this.phase === 'joining' || this.destroyed) return;
    const server = parseServer(this.serverInput.getValue());
    if (server === null) {
      this.serverInput.setInvalid(true);
      return this.setError('connect.invalidServer');
    }
    this.serverInput.setInvalid(false);
    const worldId = parseWorld(this.worldInput.getValue());
    if (worldId === null) {
      this.worldInput.setInvalid(true);
      return this.setError('connect.invalidWorld');
    }
    this.worldInput.setInvalid(false);
    this.setError(null);
    this.show('joining');
    let session: ForgeSession;
    try {
      session = await this.deps.connect({
        endpoint: server,
        worldId,
        key: this.deps.settings.key,
      });
    } catch (error) {
      this.show('connect');
      this.setError(isSimMismatch(error) ? 'connect.simMismatch' : 'connect.failed');
      return;
    }
    if (this.destroyed) {
      void session.leave();
      return;
    }
    rememberServer(this.deps.storage, server);
    this.attach(session);
  }

  private attach(session: ForgeSession): void {
    const controller = new ForgeController(session, (notice) => this.onNotice(notice));
    this.session = session;
    this.controller = controller;
    this.unsubscribeSession = session.subscribe((event) => {
      if (event.type === 'welcome') this.checkMode(event.welcome.mode);
      else if (event.type === 'status' && event.status === 'closed')
        void this.drop('connect.closed');
    });
    this.deps.host.attach(controller);
    this.show('playing');
    this.refresh();
    this.timer = setInterval(() => this.refresh(), this.deps.hudIntervalMs ?? 250);
    // Karşılama kurulum bitmeden geldiyse ayrılma, kurulumdan sonra çalışmalı: aksi hâlde yarım kurulum kalır.
    if (session.welcome) this.checkMode(session.welcome.mode);
  }

  /** Bu istemci yalnız kilit adımlı dünyayı gösterir; ilgi alanı dünyasında kullanıcıya söyleyip ayrılır. */
  private checkMode(mode: number): void {
    if (mode !== SYNC_MODE.lockstep) void this.drop('connect.unsupportedMode');
  }

  /** Oturumu bırakır ve bağlantı formuna döner; `reason` formda gösterilir. */
  private async drop(reason: string | null): Promise<void> {
    const session = this.session;
    if (session === null) return;
    this.session = null;
    this.controller = null;
    this.unsubscribeSession?.();
    this.unsubscribeSession = null;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.deps.host.detach();
    this.menu.clearSelection();
    if (!this.destroyed) {
      this.show('connect');
      this.setError(reason);
    }
    await session.leave().catch(() => undefined);
  }

  private async leave(): Promise<void> {
    await this.drop(null);
  }

  private rotate(): void {
    const controller = this.controller;
    if (controller === null) return;
    controller.rotate();
    this.rotateButton.setLabel(this.rotateLabel(controller.rot));
  }

  private rotateLabel(rot: number): string {
    return `${t('tools.rotate')}: ${t(DIRECTION_KEYS[rot & 3])}`;
  }

  private onNotice(notice: Notice): void {
    switch (notice.kind) {
      case 'result':
        this.toasts.show(t(notice.key), { variant: 'warning', durationMs: 2500 });
        break;
      case 'desync':
        this.toasts.show(t('notice.desync'), { variant: 'warning' });
        break;
      case 'resynced':
        this.toasts.show(t('notice.resynced'), { variant: 'success', durationMs: 2000 });
        break;
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    const controller = this.controller;
    if (controller === null || isTypingTarget(event.target)) return;
    const action = actionForKey(event);
    if (action === null) return;
    switch (action.type) {
      case 'tool':
        this.menu.selectItem(action.tool);
        controller.select(action.tool);
        break;
      case 'rotate':
        this.rotate();
        break;
      case 'clear':
        this.menu.clearSelection();
        controller.select(null);
        break;
    }
  }

  private refresh(): void {
    const controller = this.controller;
    if (controller === null) return;
    const hud = controller.hud();
    if (hud === null) {
      const status = this.session?.status ?? 'connecting';
      this.statusLine.dataset.status = status;
      this.statusLine.textContent = t(`status.${status}`);
      this.statLine.textContent = '';
      return;
    }
    this.statusLine.dataset.status = hud.desynced ? 'desynced' : hud.status;
    this.statLine.dataset.tick = String(hud.tick);
    this.statLine.dataset.players = String(hud.players);
    this.statLine.dataset.resyncs = String(hud.resyncs);
    this.statLine.dataset.units = String(hud.units);
    this.statLine.dataset.lag = String(hud.lagTicks);
    this.statLine.dataset.hashChecks = String(hud.hashChecks);
    this.statLine.dataset.fps = hud.fps.toFixed(1);
    this.statLine.dataset.frameP99 = hud.frameMsP99.toFixed(1);
    this.statLine.dataset.stepP50 = hud.stepMsP50.toFixed(3);
    this.statLine.dataset.stepP99 = hud.stepMsP99.toFixed(3);
    this.statusLine.textContent = hud.desynced ? t('status.desynced') : t(`status.${hud.status}`);
    this.statLine.textContent = [
      `${t('hud.ore')} ${hud.ore}`,
      `${t('hud.plate')} ${hud.plate}`,
      `${t('hud.core')} ${hud.coreHp}`,
      `${t('hud.wave')} ${hud.wave}`,
      `${t('hud.next')} ${t('hud.seconds', { count: hud.nextWaveSeconds })}`,
      `${t('hud.units')} ${hud.units}`,
      `${t('hud.players')} ${hud.players}`,
      `${t('hud.ping')} ${t('hud.milliseconds', { count: Math.round(hud.rttMs) })}`,
    ].join(' · ');
    for (const tool of TOOLS)
      this.menu.setItemUnavailable(
        tool.id,
        affordable(tool.id, hud) ? null : t('tools.unaffordable'),
      );
  }

  get currentPhase(): Phase {
    return this.phase;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.scope.dispose();
    this.unsubscribeSession?.();
    this.unsubscribeSession = null;
    const session = this.session;
    this.session = null;
    this.controller = null;
    this.deps.host.detach();
    if (session) void session.leave().catch(() => undefined);
    this.menu.destroy();
    this.rotateButton.destroy();
    this.leaveButton.destroy();
    this.joinButton.destroy();
    this.serverInput.destroy();
    this.worldInput.destroy();
    this.toasts.destroy();
    this.root.remove();
  }
}
