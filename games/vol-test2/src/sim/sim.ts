import { createStatefulRandom, type StatefulRandom } from '@volstudio/core/random';
import { SpatialIndex } from '@volstudio/core/spatial';
import { BUILDING, ITEM_COUNT, KIND, MACHINES, PLAYER, WAVES, WORLD } from '@/config/factory';
import { fnv1a, hashBuffer } from '@/net/bytes';
import {
  applyCommand,
  COMMAND,
  isSystemCommand,
  Ledger,
  RESULT,
  type FactoryCommand,
} from './commands';
import { joinPlayer, leavePlayerSlot, playerStep } from './players';
import type { Shot } from './shot';
import { readSnapshot, snapshotDimensions, writeSnapshot, type SnapshotMeta } from './snapshot';
import { stepBelts, stepMachines } from './belts';
import { FactoryState, type Unit } from './state';
import { generateTerrain, placeCore } from './terrain';
import { FlowSolver, refreshFlow, spawnWave, sustainUnits, turretStep, unitStep } from './units';

export interface FactorySimOptions {
  readonly seed?: number;
  readonly width?: number;
  readonly height?: number;
  /**
   * Dalga takvimine ek olarak canlı birim sayısını bu değerde tutar; boşta dünya
   * ölçümü ve test içindir. Oyun kuralı değil, anlık görüntüye girmez, her
   * oturumda aynı verilmelidir.
   */
  readonly sustainUnits?: number;
}

/** Ölçüm aşamaları; `FactorySim.profile` bu sırayla süre biriktirir. */
export const PHASES = [
  'flow',
  'machines',
  'belts',
  'spawn',
  'index',
  'turrets',
  'players',
  'units',
  'housekeeping',
] as const;
const PHASE = Object.fromEntries(PHASES.map((name, index) => [name, index])) as Record<
  (typeof PHASES)[number],
  number
>;

/** Hasar niceliği bu kadar adımda bir chunk sürümüne yazılır; ağ trafiğini sınırlar. */
const HP_MERGE_TICKS = 8;

export interface ApplyOutcome {
  readonly fresh: boolean;
  readonly result: number;
}

/**
 * Başsız fabrika simülasyonu. Saat, rastgelelik ve komut sırası dışarıdan
 * gelmez: aynı tohum ve aynı (adım, komut) dizisi bit düzeyinde aynı durumu verir.
 * Komutlar adımlar arasında uygulanır; `state.tick` komutun hangi adımdan önce
 * uygulandığını söyler ve günlük (journal) bu sayıyı kullanır.
 */
export class FactorySim {
  readonly state: FactoryState;
  readonly ledger = new Ledger();
  /** Son adımın taret atışları; sonraki adım başında temizlenir. */
  readonly shots: Shot[] = [];

  private readonly random: StatefulRandom;
  private readonly solver: FlowSolver;
  private readonly index: SpatialIndex<Unit>;
  private readonly sustain: number;
  private clock: (() => number) | null = null;
  private markAt = 0;
  /** Aşama başına birikmiş süre (ms); `measure` ile açılır. Durumu etkilemez. */
  profile: Float64Array | null = null;

  private constructor(state: FactoryState, random: StatefulRandom, options: FactorySimOptions) {
    this.state = state;
    this.random = random;
    this.solver = new FlowSolver(state);
    this.index = new SpatialIndex<Unit>(MACHINES.turret.range, (unit) => unit.alive);
    this.sustain = options.sustainUnits ?? 0;
  }

  static create(options: FactorySimOptions = {}): FactorySim {
    const state = new FactoryState(options.width, options.height);
    const random = createStatefulRandom(options.seed ?? WORLD.seed);
    generateTerrain(state, random);
    placeCore(state);
    state.nextWaveTick = WAVES.firstDelay;
    return new FactorySim(state, random, options);
  }

  /** Bozuk dosya `SnapshotError` fırlatır; hiçbir durum kurulmaz. */
  static restore(bytes: Uint8Array, options: FactorySimOptions = {}): FactorySim {
    const { width, height } = snapshotDimensions(bytes);
    const sim = new FactorySim(new FactoryState(width, height), createStatefulRandom(0), options);
    const meta = readSnapshot(bytes, sim.state, sim.ledger);
    sim.random.setState(meta.rngState);
    sim.index.rebuild(sim.state.units);
    return sim;
  }

  get tick(): number {
    return this.state.tick;
  }

  /**
   * Oyuncu komutunu anahtarının yuvası adına uygular; aynı `seq` ikinci kez uygulanmaz, sonuç
   * önbellekten gelir. Yuvası olmayan anahtarın komutu `noPlayer` döner (ve deftere yazılır).
   */
  apply(key: string, seq: number, command: FactoryCommand): ApplyOutcome {
    // Sistem komutu oyuncu yolundan geçmez: defter ve sıra numarası ona ait değildir.
    if (isSystemCommand(command)) return { fresh: false, result: RESULT.malformed };
    const seen = this.ledger.lookup(key, seq);
    if (!seen.fresh) return { fresh: false, result: seen.result };
    const result = this.applyRaw(command, this.state.players.slotOf(key));
    this.ledger.record(key, seq, result);
    return { fresh: true, result };
  }

  /**
   * Defter ve sıra denetimi olmadan `slot` adına uygular. Kilit adımlı istemci sunucunun zaten
   * kabul ettiği komutları bu yoldan uygular; ağdan gelen ham komut için `apply` kullanılır.
   * Sistem komutları (`join`/`leave`) da buradan geçer: `join` anahtara yuva açar (`slot` yok sayılır),
   * `leave` verilen yuvayı boşaltır.
   */
  applyRaw(command: FactoryCommand, slot: number): number {
    if (!isSystemCommand(command)) return applyCommand(this.state, command, slot);
    if (command.type === COMMAND.join)
      return joinPlayer(this.state, command.key).slot >= 0 ? RESULT.ok : RESULT.noPlayer;
    return leavePlayerSlot(this.state, slot) ? RESULT.ok : RESULT.noPlayer;
  }

  /** Rastgele akışın anlık durumu; anlık görüntüye ve testlere girer. */
  get rngState(): number {
    return this.random.getState();
  }

  /**
   * Aşama sürelerini toplamaya başlar. Saat dışarıdan verilir: simülasyon kendi
   * zamanını okumaz, bu yüzden ölçüm durumu ve determinizmi etkilemez.
   */
  measure(clock: () => number): void {
    this.clock = clock;
    this.profile = new Float64Array(PHASES.length);
  }

  private mark(phase: number): void {
    const profile = this.profile;
    if (profile === null) return;
    const now = this.clock!();
    profile[phase] += now - this.markAt;
    this.markAt = now;
  }

  step(): void {
    const s = this.state;
    if (this.clock !== null) this.markAt = this.clock();
    this.shots.length = 0;
    if (s.listsDirty) s.rebuildLists();
    refreshFlow(s, this.solver);
    this.mark(PHASE.flow);
    stepMachines(s);
    this.mark(PHASE.machines);
    stepBelts(s);
    this.mark(PHASE.belts);
    spawnWave(s, this.random);
    if (this.sustain > 0) sustainUnits(s, this.sustain, this.random);
    this.mark(PHASE.spawn);
    this.index.refresh(s.units);
    this.mark(PHASE.index);
    turretStep(s, this.index, this.shots);
    this.mark(PHASE.turrets);
    playerStep(s, this.index, this.shots);
    this.mark(PHASE.players);
    unitStep(s);
    this.mark(PHASE.units);
    if (s.coreHp <= 0) this.defeat();
    if (s.tick % HP_MERGE_TICKS === 0) this.mergeHpVersions();
    s.tick++;
    this.mark(PHASE.housekeeping);
  }

  /** Çekirdek yıkıldı: birimler silinir, kaynaklar kısmen kalır, dalga takvimi başa döner. */
  private defeat(): void {
    const s = this.state;
    s.defeats++;
    for (const unit of s.units) s.releaseUnit(unit);
    for (let item = 0; item < ITEM_COUNT; item++)
      s.inventory[item] = Math.floor((s.inventory[item] * WAVES.defeatKeepPercent) / 100);
    s.coreHp = BUILDING[KIND.core].hp;
    s.wave = 0;
    s.nextWaveTick = s.tick + WAVES.firstDelay;
  }

  private mergeHpVersions(): void {
    const s = this.state;
    for (let chunk = 0; chunk < s.chunkCount; chunk++) {
      if (s.chunkHpDirty[chunk] === 0) continue;
      s.chunkHpDirty[chunk] = 0;
      s.chunkVersion[chunk]++;
    }
  }

  /** Kalıcı durumun kanonik baytları. */
  snapshot(): Uint8Array {
    return writeSnapshot(this.state, this.random.getState(), this.ledger);
  }

  /**
   * Kalıcı durumun 32 bit karması (anlık görüntü gövdesinin FNV-1a'sı). Büyük dünyada
   * milisaniyeler sürer; her adımda değil, günlük kontrol noktalarında çağrılır.
   */
  hash(): number {
    const bytes = this.snapshot();
    return fnv1a(bytes.subarray(0, bytes.length - 4));
  }

  /**
   * Oynanışı belirleyen durumun hızlı karması: defter hariç, anlık görüntüden bağımsız ve
   * kopyasız. Sunucu ve kilit adımlı istemci aynı adımda aynı değeri üretmelidir; 256×256 dünyada
   * milisaniye mertebesindedir.
   */
  stateHash(): number {
    const s = this.state;
    const scalars = new Float64Array([
      s.tick,
      s.nextWaveTick,
      s.wave,
      s.defeats,
      s.coreHp,
      s.flowTick,
      s.flowDirty ? 1 : 0,
      this.random.getState(),
      s.freeCount,
      s.aliveUnits,
    ]);
    let hash = hashBuffer(scalars, 0x811c9dc5);
    hash = hashBuffer(s.inventory, hash);
    hash = hashBuffer(s.delivered, hash);
    for (const array of [
      s.ore,
      s.kind,
      s.rot,
      s.team,
      s.hp,
      s.timer,
      s.bufA,
      s.bufOut,
      s.beltCount,
      s.beltItem,
      s.beltPos,
      s.flowDir,
      s.unitGen,
    ])
      hash = hashBuffer(array, hash);
    hash = hashBuffer(s.freeUnits.subarray(0, s.freeCount), hash);
    const record = new Float64Array(5);
    for (const unit of s.units) {
      if (!unit.alive) continue;
      record[0] = unit.slot;
      record[1] = unit.kind;
      record[2] = unit.x;
      record[3] = unit.y;
      record[4] = unit.hp;
      hash = hashBuffer(record, hash);
    }
    const p = s.players;
    const tank = new Float64Array(11);
    for (let slot = 0; slot < PLAYER.slots; slot++) {
      tank[0] = p.status[slot];
      tank[1] = p.keys[slot] === null ? 0 : fnv1a(new TextEncoder().encode(p.keys[slot]!));
      tank[2] = p.x[slot];
      tank[3] = p.y[slot];
      tank[4] = p.aimX[slot];
      tank[5] = p.aimY[slot];
      tank[6] = p.dir[slot];
      tank[7] = p.moveUntil[slot];
      tank[8] = p.hp[slot];
      tank[9] = p.cooldown[slot];
      tank[10] = p.respawnAt[slot];
      hash = hashBuffer(tank, hash);
    }
    return hash;
  }

  /** Test ve ölçüm: araya komut girmeden `count` adım. */
  run(count: number): void {
    for (let index = 0; index < count; index++) this.step();
  }
}

export { RESULT };
export type { SnapshotMeta };
