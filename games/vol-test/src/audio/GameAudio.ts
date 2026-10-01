import { DisposableScope } from '@volstudio/core/lifecycle';
import { createRandom } from '@volstudio/core/random';
import { SoundBank } from '@volstudio/core/audio/sfx';
import { AUDIO } from '@/config/audio';
import type { SimEvent } from '@/sim/events';
import type { Vehicle } from '@/sim/entities/Vehicle';
import { audioUrl, blastPath, FAMILIES, type FamilyName } from './assets';
import { blastDistance, spatialSound, type AudioPosition } from './spatial';
import { VehicleAudio } from './VehicleAudio';

export class GameAudio {
  private readonly scope = new DisposableScope();
  private readonly bank: SoundBank;
  private readonly bus: GainNode;
  private readonly vehicles = new Map<number, VehicleAudio>();
  private paused = false;
  private released = false;
  private eventIndex = 0;

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
    for (const action of ['pause', 'resume'])
      this.bank.register(`ui:${action}`, [audioUrl(`${AUDIO.uiAssetRoot}/${action}.ogg`)]);
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

  async sync(vehicles: readonly Vehicle[], listener: AudioPosition): Promise<void> {
    if (this.released) return;
    const audible = [...vehicles]
      .sort(
        (a, b) =>
          Math.hypot(a.tank.x - listener.x, a.tank.y - listener.y) -
            Math.hypot(b.tank.x - listener.x, b.tank.y - listener.y) || a.id - b.id,
      )
      .filter((v) => spatialSound(v.tank, listener).gain > 0)
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
        voice = new VehicleAudio(this.context, this.bus);
        this.vehicles.set(vehicle.id, voice);
      }
      if (voice.update(vehicle.tank, listener, this.paused))
        this.play('brake', vehicle.tank, listener);
      pending.push(voice.ready);
    }
    await Promise.all(pending);
  }

  route(events: readonly SimEvent[], listener: AudioPosition): void {
    if (this.released || this.paused) return;
    for (const event of events) {
      switch (event.kind) {
        case 'fired':
          this.play('cannon', event, listener);
          break;
        case 'impact':
          this.play('blast', event, listener);
          break;
        case 'hit':
          this.play('hit', event, listener);
          break;
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
    this.bank.play(`ui:${paused ? 'pause' : 'resume'}`, { gain: AUDIO.shotGain.ui });
  }

  dispose(): void {
    if (this.released) return;
    this.released = true;
    this.scope.dispose();
  }

  private play(
    name: FamilyName,
    source: AudioPosition,
    listener: AudioPosition,
    speed?: number,
  ): void {
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
    this.bank.play(`${name}:${variant.key}${suffix}`, {
      pan: spatial.pan,
      gain: AUDIO.shotGain[name] * spatial.gain * strength,
    });
  }
}
