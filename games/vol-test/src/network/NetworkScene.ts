import Phaser from 'phaser';
import {
  applyVolViewport,
  clampSimulationStep,
  DisposableScope,
  SimulationClock,
} from '@volstudio/core';
import { i18next } from '@volstudio/core/i18n';
import { Button, Text } from '@volstudio/core/ui';
import { GAME } from '@/config/game';
import { PALETTE } from '@/config/palette';
import { WORLD } from '@/config/world';
import { PlayerControls } from '@/scenes/world/PlayerControls';
import { NetworkSession, type NetworkConnectionStatus } from './NetworkSession';
import type { RemotePlayer, RemoteWorld } from './roomState';
import './network.css';

const STATUS_KEYS = {
  connecting: 'voltest:network.connecting',
  connected: 'voltest:network.connected',
  error: 'voltest:network.error',
  left: 'voltest:network.left',
} as const;

/** BootScene 'World' anahtarını başlatır: ağ kipi aynı sahne slotunu devralır. */
export class NetworkScene extends Phaser.Scene {
  private scope = new DisposableScope();
  private session: NetworkSession | null = null;
  private controls!: PlayerControls;
  private clock!: SimulationClock;
  private graphics!: Phaser.GameObjects.Graphics;
  private readonly labels = new Map<string, Phaser.GameObjects.Text>();
  private own: RemotePlayer | undefined;
  private world: RemoteWorld | null = null;
  private sessionId = '';
  private status!: Text;
  private summary!: Text;
  private help!: Text;
  private leaveButton!: Button;
  private destroyed = false;

  constructor(private readonly endpoint: string) {
    super('World');
  }

  create(): void {
    this.destroyed = false;
    this.scope = new DisposableScope();
    applyVolViewport(this);
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.centerOn(WORLD.width / 2, WORLD.height / 2);

    const ground = this.add.graphics();
    ground.fillStyle(PALETTE.sand, 1);
    ground.fillRect(0, 0, WORLD.width, WORLD.height);
    ground.lineStyle(1, PALETTE.gridMinor.color, PALETTE.gridMinor.alpha);
    for (let x = 0; x <= WORLD.width; x += WORLD.gridStep)
      ground.lineBetween(x, 0, x, WORLD.height);
    for (let y = 0; y <= WORLD.height; y += WORLD.gridStep)
      ground.lineBetween(0, y, WORLD.width, y);
    ground.lineStyle(5, PALETTE.border, 1);
    ground.strokeRect(0, 0, WORLD.width, WORLD.height);
    this.graphics = this.add.graphics();

    this.controls = this.scope.addDestroyable(new PlayerControls(this));
    this.clock = new SimulationClock({
      fixedStepMs: GAME.simulationStepMs,
      maxStepsPerFrame: GAME.maxStepsPerFrame,
      partialStep: 'defer',
    });
    this.createHud();
    this.scope.addSubscription(() => {
      for (const label of this.labels.values()) label.destroy();
      this.labels.clear();
    });
    this.scope.addListener(window, 'pagehide', () => this.release());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.release());

    this.session = new NetworkSession(
      this.endpoint,
      (status) => this.showStatus(status),
      (state, id) => this.showWorld(state, id),
    );
    void this.session.connect();
  }

  override update(_time: number, deltaMs: number): void {
    if (this.destroyed) return;
    this.session?.checkFreshness(deltaMs);
    const x = this.own?.x ?? WORLD.width / 2;
    const y = this.own?.y ?? WORLD.height / 2;
    this.controls.read(x, y, deltaMs);
    this.clock.advance(deltaMs, (stepMs) => this.session?.send(this.controls.step(stepMs)), {
      acceptedDeltaMs: clampSimulationStep(deltaMs),
    });
  }

  private createHud(): void {
    const root = document.createElement('aside');
    root.className = 'vt-network-hud';
    root.dataset.testid = 'network-hud';
    root.setAttribute('aria-label', i18next.t('voltest:network.title'));
    this.status = this.scope.addDestroyable(
      new Text(i18next.t('voltest:network.connecting'), { variant: 'heading' }),
    );
    this.status.element.dataset.testid = 'network-status';
    this.status.element.setAttribute('role', 'status');
    this.status.element.dataset.connection = 'connecting';
    this.summary = this.scope.addDestroyable(new Text('', { variant: 'body' }));
    this.summary.element.dataset.testid = 'network-summary';
    this.help = this.scope.addDestroyable(
      new Text(i18next.t('voltest:network.controls'), { variant: 'muted' }),
    );
    this.leaveButton = this.scope.addDestroyable(
      new Button(i18next.t('voltest:network.leave'), {
        size: 'sm',
        fullWidth: false,
        onClick: () => this.leave(),
      }),
    );
    this.leaveButton.element.dataset.testid = 'network-leave';
    root.append(
      this.status.element,
      this.summary.element,
      this.help.element,
      this.leaveButton.element,
    );
    (this.game.canvas.parentElement ?? document.body).appendChild(root);
    this.scope.addSubscription(() => root.remove());
    const translate = (): void => {
      root.setAttribute('aria-label', i18next.t('voltest:network.title'));
      this.help.setContent(i18next.t('voltest:network.controls'));
      this.leaveButton.setLabel(i18next.t('voltest:network.leave'));
      if (this.session) this.showStatus(this.session.connectionStatus);
      this.render();
    };
    i18next.on('languageChanged', translate);
    this.scope.addSubscription(() => i18next.off('languageChanged', translate));
  }

  private showStatus(status: NetworkConnectionStatus): void {
    if (this.destroyed) return;
    this.status.element.dataset.connection = status;
    this.status.setContent(i18next.t(STATUS_KEYS[status]));
  }

  private showWorld(world: RemoteWorld, sessionId: string): void {
    if (this.destroyed) return;
    this.world = world;
    this.sessionId = sessionId;
    this.own = world.players.find((player) => player.sessionId === sessionId);
    this.render();
  }

  private render(): void {
    if (this.destroyed || !this.graphics) return;
    const players = this.world?.players ?? [];
    this.graphics.clear();
    const active = new Set<string>();
    for (const player of players) {
      active.add(player.sessionId);
      const local = player.sessionId === this.sessionId;
      const color = local ? PALETTE.energy : PALETTE.aimTurning;
      const alpha = player.alive ? 1 : 0.35;
      const { x, y } = player;
      const hullX = Math.cos(player.hull);
      const hullY = Math.sin(player.hull);
      const turretX = Math.cos(player.turret);
      const turretY = Math.sin(player.turret);

      this.graphics.fillStyle(PALETTE.shellShadow, alpha);
      this.graphics.fillCircle(x, y, 26);
      this.graphics.fillStyle(color, alpha);
      this.graphics.fillCircle(x, y, 19);
      this.graphics.lineStyle(4, PALETTE.shellShadow, alpha);
      this.graphics.lineBetween(x, y, x + hullX * 21, y + hullY * 21);
      this.graphics.lineStyle(7, color, alpha);
      this.graphics.lineBetween(x, y, x + turretX * 35, y + turretY * 35);
      this.graphics.fillStyle(PALETTE.shellShadow, 0.9);
      this.graphics.fillRect(x - 25, y - 43, 50, 6);
      this.graphics.fillStyle(color, 1);
      this.graphics.fillRect(x - 25, y - 43, 50 * (player.health / player.maxHealth), 6);

      let label = this.labels.get(player.sessionId);
      if (!label) {
        label = this.add.text(0, 0, '', {
          fontFamily: 'sans-serif',
          fontSize: '13px',
          color: '#ffffff',
          stroke: '#1d1812',
          strokeThickness: 3,
        });
        label.setOrigin(0.5, 1);
        this.labels.set(player.sessionId, label);
      }
      label.setPosition(x, y - 50);
      label.setText(i18next.t(local ? 'voltest:network.you' : 'voltest:network.other'));
      label.setAlpha(alpha);
    }
    for (const [id, label] of this.labels) {
      if (active.has(id)) continue;
      label.destroy();
      this.labels.delete(id);
    }
    if (this.own) this.cameras.main.centerOn(this.own.x, this.own.y);
    this.summary.setContent(
      this.own
        ? i18next.t('voltest:network.summary', {
            players: players.length,
            health: Math.round(this.own.health),
            maxHealth: Math.round(this.own.maxHealth),
          }) +
            (!this.own.alive
              ? ' · ' +
                i18next.t('voltest:network.respawn', {
                  seconds: Math.ceil(this.own.respawnRemainingMs / 1000),
                })
              : '')
        : i18next.t('voltest:network.awaiting'),
    );
    this.summary.element.dataset.players = String(players.length);
    if (this.own) {
      this.summary.element.dataset.selfX = String(this.own.x);
      this.summary.element.dataset.health = String(this.own.health);
    }
  }

  private async leave(): Promise<void> {
    const destination = new URL(window.location.href);
    destination.searchParams.delete('net');
    this.release();
    try {
      await this.session?.dispose();
    } catch {
      // Yerel sahne her durumda kapanır; ağ kapanışındaki kopma çıkışı engellemez.
    } finally {
      window.location.assign(destination.href);
    }
  }

  private release(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scope.dispose();
    void this.session?.dispose().catch(() => undefined);
  }
}
