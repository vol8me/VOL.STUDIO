import { createStatefulRandom, type StatefulRandom } from '@volstudio/core/random';
import { SpatialIndex } from '@volstudio/core/spatial';
import { BUILDING, ITEM_COUNT, KIND, MACHINES, WAVES, WORLD } from '@/config/forge';
import { fnv1a } from '@/net/bytes';
import { applyCommand, Ledger, RESULT, type ForgeCommand } from './commands';
import { readSnapshot, snapshotDimensions, writeSnapshot, type SnapshotMeta } from './snapshot';
import { stepBelts, stepMachines } from './belts';
import { ForgeState, type Unit } from './state';
import { generateTerrain, placeCore } from './terrain';
import {
  FlowSolver,
  refreshFlow,
  spawnWave,
  sustainUnits,
  turretStep,
  unitStep,
  type Shot,
} from './units';

export interface ForgeSimOptions {
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

/** Ölçüm aşamaları; `ForgeSim.profile` bu sırayla süre biriktirir. */
export const PHASES = [
  'flow',
  'machines',
  'belts',
  'spawn',
  'index',
  'turrets',
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
export class ForgeSim {
  readonly state: ForgeState;
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

  private constructor(state: ForgeState, random: StatefulRandom, options: ForgeSimOptions) {
    this.state = state;
    this.random = random;
    this.solver = new FlowSolver(state);
    this.index = new SpatialIndex<Unit>(MACHINES.turret.range, (unit) => unit.alive);
    this.sustain = options.sustainUnits ?? 0;
  }

  static create(options: ForgeSimOptions = {}): ForgeSim {
    const state = new ForgeState(options.width, options.height);
    const random = createStatefulRandom(options.seed ?? WORLD.seed);
    generateTerrain(state, random);
    placeCore(state);
    state.nextWaveTick = WAVES.firstDelay;
    return new ForgeSim(state, random, options);
  }

  /** Bozuk dosya `SnapshotError` fırlatır; hiçbir durum kurulmaz. */
  static restore(bytes: Uint8Array, options: ForgeSimOptions = {}): ForgeSim {
    const { width, height } = snapshotDimensions(bytes);
    const sim = new ForgeSim(new ForgeState(width, height), createStatefulRandom(0), options);
    const meta = readSnapshot(bytes, sim.state, sim.ledger);
    sim.random.setState(meta.rngState);
    sim.index.rebuild(sim.state.units);
    return sim;
  }

  get tick(): number {
    return this.state.tick;
  }

  /** Aynı oyuncudan aynı `seq` ikinci kez uygulanmaz; sonuç önbellekten gelir. */
  apply(key: string, seq: number, command: ForgeCommand): ApplyOutcome {
    const seen = this.ledger.lookup(key, seq);
    if (!seen.fresh) return { fresh: false, result: seen.result };
    const result = applyCommand(this.state, command);
    this.ledger.record(key, seq, result);
    return { fresh: true, result };
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

  /** Test ve ölçüm: araya komut girmeden `count` adım. */
  run(count: number): void {
    for (let index = 0; index < count; index++) this.step();
  }
}

export { RESULT };
export type { SnapshotMeta };
