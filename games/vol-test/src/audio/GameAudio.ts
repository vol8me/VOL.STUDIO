import { DisposableScope } from '@volstudio/core/lifecycle';
import { resumeAudioAfterWake } from '@volstudio/core';
import { createRandom } from '@volstudio/core/random';
import { SoundBank } from '@volstudio/core/audio/sfx';
import { UiSoundKit, uiSoundAssets } from '@volstudio/core/audio/ui';
import type { UiIntentBus } from '@volstudio/core/ui';
import { AUDIO } from '@/config/audio';
import type { SimEvent } from '@/sim/events';
import type { Vehicle } from '@/sim/entities/Vehicle';
import type { WeaponConfig } from '@/config/tank';
import { audioUrl, blastPath, FAMILIES, type FamilyName } from './assets';
import { blastDistance, spatialSound, type AudioPosition } from './spatial';
import { VehicleAudio } from './VehicleAudio';

export class GameAudio {
  private readonly scope = new DisposableScope();
  private readonly bank: SoundBank;
  private readonly bus: GainNode;
  private readonly vehicles = new Map<number, VehicleAudio>();
  /** Ateş olayının ses kimliği için her aracın silahı (duyulabilir olmasa da bilinir). */
  private readonly weapons = new Map<number, WeaponConfig>();
  /** Konumsuz olayların (ölüm) yeri: araç şasisi, canlı nesne olarak tutulur. */
  private readonly chassis = new Map<number, AudioPosition>();
  private paused = false;
  private released = false;
  private eventIndex = 0;
  private waking: Promise<void> | null = null;
  private ui: UiSoundKit | null = null;

  constructor(
    private readonly context: AudioContext,
    destination: AudioNode,
    private readonly seed: number = AUDIO.seed,
  ) {
    this.bus = context.createGain();
    this.bus.gain.value = AUDIO.masterGain;
    this.bus.connect(destination);
    this.scope.addSubscription(() => this.bus.disconnect());
    this.bank = this.scope.add(
      new SoundBank(context, this.bus, {
        maxVoices: AUDIO.maxVoices,
        maxVoicesPerSound: AUDIO.maxVoicesPerSound,
        random: createRandom(seed),
      }),
    );
    this.scope.addSubscription(() => {
      for (const voice of this.vehicles.values()) voice.dispose();
      this.vehicles.clear();
    });
    for (const [name, family] of Object.entries(FAMILIES)) {
      for (const variant of family.variants) {
        if (name === 'blast') {
          for (const distance of ['near', 'mid', 'far'] as const)
            this.bank.register(`${name}:${variant.key}:${distance}`, [
              audioUrl(blastPath(variant.key, distance)),
            ]);
        } else this.bank.register(`${name}:${variant.key}`, [audioUrl(variant.path)]);
      }
    }
    for (const asset of new Set(Object.values(AUDIO.shotAsset)))
      this.bank.register(`shot:${asset}`, [audioUrl(`${AUDIO.loopAssetRoot}/${asset}.ogg`)]);
    for (const asset of Object.values(AUDIO.eventAsset))
      this.bank.register(`fx:${asset}`, [audioUrl(`${AUDIO.loopAssetRoot}/${asset}.ogg`)]);
    for (const action of ['pause', 'resume'])
      this.bank.register(`ui:${action}`, [audioUrl(`${AUDIO.uiAssetRoot}/${action}.ogg`)]);
  }

  /**
   * Arayüz sesini (CORE `UiSoundKit`) HUD niyet veriyoluna ve köküne bağlar: düğme, kaydırıcı, onay
   * ve seçim niyetleri sese döner; hover/odak kökten dinlenir. Kit oyunun ses bağlamını ve ana
   * otobüsünü kullanır; oyun SFX'i ve ambiyansı değişmez. Çağrı ikinci kez kit kurmaz.
   */
  attachUi(bus: UiIntentBus, root: HTMLElement): void {
    if (this.released || this.ui) return;
    const kit = new UiSoundKit({
      assets: uiSoundAssets(import.meta.env.BASE_URL),
      context: this.context,
      destination: this.bus,
      visibilityTarget: document,
      onError: (error) => console.warn('[VOL.TEST] Arayüz sesi:', error),
    });
    kit.attach(bus);
    kit.observe(root);
    this.ui = kit;
    this.scope.add(kit);
    void kit.preload();
  }

  setVolume(volume: number): void {
    this.bus.gain.setTargetAtTime(
      AUDIO.masterGain * Math.max(0, Math.min(1, volume)),
      this.context.currentTime,
      0.02,
    );
  }

  load(): Promise<void> {
    return this.bank.loadAll();
  }

  resumeAfterWake(): Promise<void> {
    if (this.released) return Promise.resolve();
    this.waking ??= resumeAudioAfterWake(this.context)
      .then(() => undefined)
      .finally(() => {
        this.waking = null;
      });
    return this.waking;
  }

  async sync(vehicles: readonly Vehicle[], listener: AudioPosition): Promise<void> {
    if (this.released) return;
    this.weapons.clear();
    this.chassis.clear();
    for (const vehicle of vehicles) {
      this.weapons.set(vehicle.id, vehicle.spec.armament.weapon);
      this.chassis.set(vehicle.id, vehicle.chassis);
    }
    const audible = [...vehicles]
      .sort(
        (a, b) =>
          Math.hypot(a.chassis.x - listener.x, a.chassis.y - listener.y) -
            Math.hypot(b.chassis.x - listener.x, b.chassis.y - listener.y) || a.id - b.id,
      )
      .filter((v) => spatialSound(v.chassis, listener).gain > 0)
      .slice(0, AUDIO.maxLoopVehicles);
    const ids = new Set(audible.map((v) => v.id));
    for (const [id, voice] of this.vehicles)
      if (!ids.has(id)) {
        voice.dispose();
        this.vehicles.delete(id);
      }
    const pending: Promise<void>[] = [];
    for (const vehicle of audible) {
      let voice = this.vehicles.get(vehicle.id);
      if (!voice) {
        voice = new VehicleAudio(this.context, this.bus, vehicle.spec);
        this.vehicles.set(vehicle.id, voice);
      }
      if (voice.update(vehicle.chassis, listener, this.paused))
        this.play('brake', vehicle.chassis, listener);
      if (voice.dashStarted && !this.paused && voice.skillEvent)
        this.playEvent(voice.skillEvent, vehicle.chassis, listener);
      if (voice.landed && !this.paused) this.playEvent('land', vehicle.chassis, listener);
      pending.push(voice.ready);
    }
    await Promise.all(pending);
  }

  route(events: readonly SimEvent[], listener: AudioPosition): void {
    if (this.released || this.paused) return;
    for (const event of events) {
      switch (event.kind) {
        case 'fired':
          this.play('cannon', event, listener, undefined, this.weapons.get(event.source));
          break;
        case 'impact':
          this.play('blast', event, listener);
          break;
        case 'hit':
          this.play('hit', event, listener);
          break;
        case 'broke':
          this.playEvent('snap', event, listener);
          break;
        case 'died': {
          // Boğulan araç patlamaz; batışı kendi sesiyle duyulur (yeri son bilinen şasisidir).
          const at = this.chassis.get(event.target);
          if (event.cause === 'drown' && at) this.playEvent('sink', at, listener);
          break;
        }
        case 'wallHit':
        case 'collision':
          this.play('crash', event, listener, event.speed);
          break;
      }
    }
  }

  setPaused(paused: boolean): void {
    if (this.released || this.paused === paused) return;
    this.paused = paused;
    this.bank.stopAll();
    if (paused) for (const voice of this.vehicles.values()) voice.stop();
    // Arayüz sesi bağlıysa duraklatma/sürdürme paneli onunla çalar (eski sesle çift çalmaz).
    if (this.ui?.play(paused ? 'panelOpen' : 'panelClose')) return;
    this.bank.play(`ui:${paused ? 'pause' : 'resume'}`, { gain: AUDIO.shotGain.ui });
  }

  dispose(): void {
    if (this.released) return;
    this.released = true;
    this.scope.dispose();
  }

  /** Tek atımlık araç olayı sesi: konuma göre pan ve seviye. */
  private playEvent(
    name: keyof typeof AUDIO.eventAsset,
    source: AudioPosition,
    listener: AudioPosition,
  ): void {
    const spatial = spatialSound(source, listener);
    if (spatial.gain === 0) return;
    this.bank.play(`fx:${AUDIO.eventAsset[name]}`, {
      pan: spatial.pan,
      gain: AUDIO.eventGain[name] * spatial.gain,
    });
  }

  private play(
    name: FamilyName,
    source: AudioPosition,
    listener: AudioPosition,
    speed?: number,
    weapon?: WeaponConfig,
  ): void {
    // Kendi atış teslimi olan silah (ray, plazma, iğne) top ailesini perdeyle işlemez.
    const own = name === 'cannon' && weapon ? AUDIO.shotAsset[weapon.style] : undefined;
    if (weapon && own) {
      const spatial = spatialSound(source, listener);
      if (spatial.gain === 0) return;
      this.bank.play(`shot:${own}`, {
        pan: spatial.pan,
        gain: AUDIO.shotGain.cannon * spatial.gain * AUDIO.weaponVoice[weapon.style].gain,
      });
      return;
    }
    const variant = FAMILIES[name].choose(
      `${this.seed}:${this.eventIndex++}:${name}`,
      name === 'crash'
        ? { roles: { intensity: (speed ?? 0) >= AUDIO.hardCrashSpeed ? 'hard' : 'soft' } }
        : {},
    );
    if (!variant) return;
    const spatial = spatialSound(source, listener);
    if (spatial.gain === 0) return;
    const suffix =
      name === 'blast'
        ? `:${blastDistance(Math.hypot(source.x - listener.x, source.y - listener.y))}`
        : '';
    const strength = speed === undefined ? 1 : Math.min(1, speed / AUDIO.fullCrashSpeed);
    const voice = weapon ? AUDIO.weaponVoice[weapon.style] : undefined;
    this.bank.play(`${name}:${variant.key}${suffix}`, {
      pan: spatial.pan,
      gain: AUDIO.shotGain[name] * spatial.gain * strength * (voice?.gain ?? 1),
      ...(voice ? { rate: voice.rate } : {}),
    });
  }
}
