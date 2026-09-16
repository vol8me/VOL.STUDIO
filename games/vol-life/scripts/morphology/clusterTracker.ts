import { ParticleSpatialHash } from '@/runtime/sim/ParticleSpatialHash';
import type { ParticleStore } from '@/runtime/sim/ParticleStore';

/**
 * Küme kimliği SLOT DEĞİL stable ID taşır. Slot yalnız depolama yeridir;
 * pasifleşen bir slot yeniden kullanıldığında yeni `stableId` alır (DESIGN §3).
 * Üyelik slotla tutulsaydı, ölen bir parçacığın slotuna doğan yeni parçacık
 * kümeye "devam ediyormuş" gibi görünür ve süreklilik sahte olurdu.
 */
export interface ClusterState {
  readonly id: number;
  readonly memberIds: readonly number[];
  readonly centroidX: number;
  readonly centroidY: number;
  readonly firstSeenTick: number;
  readonly lastSeenTick: number;
  /** Onaylanmamış küme henüz `birth` yayımlamamıştır (minContinuityTicks). */
  readonly confirmed: boolean;
}

export type ClusterEventKind = 'birth' | 'death' | 'split' | 'merge' | 'fragmentation';

export interface ClusterEvent {
  readonly tick: number;
  readonly kind: ClusterEventKind;
  readonly clusterId: number;
  /** split'te ebeveyn, merge'de hayatta kalan küme. */
  readonly relatedId?: number;
}

export interface ClusterTrackerConfig {
  /** Yoğunluk komşuluğu yarıçapı, dünya birimi. */
  readonly epsUnits: number;
  /** Bir çekirdek noktanın eps içinde görmesi gereken asgari komşu (kendisi dahil). */
  readonly minPts: number;
  readonly minClusterSize: number;
  /** Küme `birth` yayımlamadan önce kesintisiz sürmesi gereken tick. */
  readonly minContinuityTicks: number;
  /** Küme kaybolduktan sonra ölü sayılana kadar tolere edilen tick. */
  readonly maxGapTicks: number;
  /** Eşleme için asgari Jaccard örtüşmesi. */
  readonly overlapThreshold: number;
  /** Eşleme için azami merkez kayması, dünya birimi. */
  readonly centroidGateUnits: number;
  /** Eşleme için azami boyut oranı (büyük/küçük). */
  readonly sizeRatioGate: number;
  /** Ölçüm aralığı; süre eşikleri buna tam bölünmeli. */
  readonly sampleIntervalTicks: number;
}

/**
 * Eşikler §8.4'te ÖN-KAYITLI DEĞİLDİR (orada faz sınıflandırma eşikleri var,
 * kümeleme parametreleri yok). Buradaki değerler substrate ölçülerinden türer:
 * `epsUnits` kernel cutoff'unun üçte birine yakın tutulur ki tek bağlantılı
 * zincirleme bütün gazı tek kümeye bağlamasın; `minPts` yoğunluk şartını
 * getirerek aynı zincirlemeyi kırar. Bir aday değerlendirmesinden sonra
 * değişirlerse o ana kadarki küme sonuçları geçersizdir.
 */
export const defaultClusterConfig: ClusterTrackerConfig = {
  epsUnits: 32,
  minPts: 3,
  minClusterSize: 4,
  minContinuityTicks: 30,
  maxGapTicks: 10,
  overlapThreshold: 0.5,
  centroidGateUnits: 64,
  sizeRatioGate: 3,
  sampleIntervalTicks: 10,
};

export function validateClusterTrackerConfig(config: ClusterTrackerConfig): void {
  const positives: [number, string][] = [
    [config.epsUnits, 'eps'],
    [config.centroidGateUnits, 'merkez kapısı'],
    [config.sampleIntervalTicks, 'örnek aralığı'],
  ];
  for (const [value, label] of positives) {
    if (!(value > 0) || !Number.isFinite(value)) {
      throw new RangeError(`${label} pozitif ve sonlu olmalı: ${value}`);
    }
  }
  if (!Number.isInteger(config.minPts) || config.minPts < 2) {
    throw new RangeError(`minPts en az 2 olmalı: ${config.minPts}`);
  }
  if (!Number.isInteger(config.minClusterSize) || config.minClusterSize < config.minPts) {
    throw new RangeError('Asgari küme boyutu minPts’ten küçük olamaz.');
  }
  if (!(config.overlapThreshold > 0) || config.overlapThreshold > 1) {
    throw new RangeError(`Örtüşme eşiği (0, 1] aralığında olmalı: ${config.overlapThreshold}`);
  }
  if (!(config.sizeRatioGate >= 1)) {
    throw new RangeError(`Boyut oranı kapısı en az 1 olmalı: ${config.sizeRatioGate}`);
  }
  // Süreler tick cinsindendir; örnek aralığına tam bölünmeyen config reddedilir.
  for (const [value, label] of [
    [config.minContinuityTicks, 'süreklilik'],
    [config.maxGapTicks, 'gap'],
  ] as [number, string][]) {
    if (!Number.isInteger(value) || value < 0 || value % config.sampleIntervalTicks !== 0) {
      throw new RangeError(`${label} süresi örnek aralığına tam bölünmeli: ${value}`);
    }
  }
}

interface PendingCluster {
  readonly memberIds: number[];
  readonly centroidX: number;
  readonly centroidY: number;
}

interface TrackedCluster {
  id: number;
  memberIds: number[];
  centroidX: number;
  centroidY: number;
  firstSeenTick: number;
  lastSeenTick: number;
  confirmed: boolean;
  missingSince: number | null;
}

/**
 * ARAŞTIRMA aracıdır (DESIGN §8). Runtime organizma kimliği (Adım 4) değildir
 * ve `src/`e girmez: buradaki süreklilik ölçüm içindir, oyun durumu değil.
 */
export class ClusterTracker {
  private readonly config: ClusterTrackerConfig;
  private readonly tracked = new Map<number, TrackedCluster>();
  private readonly events: ClusterEvent[] = [];
  private nextId = 1;
  private grid: ParticleSpatialHash | null = null;

  constructor(config: ClusterTrackerConfig = defaultClusterConfig) {
    validateClusterTrackerConfig(config);
    this.config = config;
  }

  get activeClusters(): readonly ClusterState[] {
    const states: ClusterState[] = [];
    for (const cluster of this.tracked.values()) {
      if (cluster.missingSince !== null) continue;
      states.push({
        id: cluster.id,
        memberIds: [...cluster.memberIds],
        centroidX: cluster.centroidX,
        centroidY: cluster.centroidY,
        firstSeenTick: cluster.firstSeenTick,
        lastSeenTick: cluster.lastSeenTick,
        confirmed: cluster.confirmed,
      });
    }
    return states;
  }

  get eventLog(): readonly ClusterEvent[] {
    return this.events;
  }

  reset(): void {
    this.tracked.clear();
    this.events.length = 0;
    this.nextId = 1;
    this.grid = null;
  }

  update(particles: ParticleStore, tick: number): void {
    const clusters = this.detect(particles);
    this.match(clusters, tick);
  }

  /** Yoğunluk tabanlı kümeleme: eps komşuluğu spatial hash üzerinden taranır. */
  private detect(particles: ParticleStore): PendingCluster[] {
    const grid = this.ensureGrid(particles);
    grid.rebuild(particles);
    const { active, x, y, stableId, capacity } = particles;
    const slots: number[] = [];
    for (let slot = 0; slot < capacity; slot++) {
      if (active[slot] === 1) slots.push(slot);
    }

    const epsSquared = this.config.epsUnits * this.config.epsUnits;
    const neighbours = new Map<number, number[]>();
    for (const slot of slots) {
      const found = this.neighboursOf(particles, grid, slot, epsSquared);
      neighbours.set(slot, found);
    }

    const visited = new Set<number>();
    const clusters: PendingCluster[] = [];
    for (const slot of slots) {
      if (visited.has(slot)) continue;
      const seeds = neighbours.get(slot) ?? [];
      // Çekirdek olmayan nokta küme başlatamaz; tek bağlantılı zincirleme böyle kırılır.
      if (seeds.length < this.config.minPts) continue;
      const members: number[] = [];
      const stack = [slot];
      visited.add(slot);
      while (stack.length > 0) {
        const current = stack.pop() as number;
        members.push(current);
        const currentNeighbours = neighbours.get(current) ?? [];
        if (currentNeighbours.length < this.config.minPts) continue;
        for (const neighbour of currentNeighbours) {
          if (visited.has(neighbour)) continue;
          visited.add(neighbour);
          stack.push(neighbour);
        }
      }
      if (members.length < this.config.minClusterSize) continue;
      const memberIds = members.map((member) => stableId[member]).sort((a, b) => a - b);
      let cx = 0;
      let cy = 0;
      for (const member of members) {
        cx += x[member];
        cy += y[member];
      }
      clusters.push({
        memberIds,
        centroidX: cx / members.length,
        centroidY: cy / members.length,
      });
    }
    // Deterministik sıra: en kalabalık önce, eşitlikte en küçük üye kimliği.
    clusters.sort(
      (a, b) => b.memberIds.length - a.memberIds.length || a.memberIds[0] - b.memberIds[0],
    );
    return clusters;
  }

  private ensureGrid(particles: ParticleStore): ParticleSpatialHash {
    if (this.grid) return this.grid;
    const span = Math.max(1024, Math.ceil(this.config.epsUnits) * 8);
    const cell = span / 8;
    this.grid = new ParticleSpatialHash(
      { x: 0, y: 0, width: span, height: span },
      cell,
      particles.capacity,
    );
    return this.grid;
  }

  private neighboursOf(
    particles: ParticleStore,
    grid: ParticleSpatialHash,
    slot: number,
    epsSquared: number,
  ): number[] {
    const { x, y } = particles;
    const cell = grid.cellForPosition(x[slot], y[slot]);
    const found: number[] = [];
    if (cell === null) return found;
    const cellX = cell % grid.cellsX;
    const cellY = (cell / grid.cellsX) | 0;
    const reach = Math.ceil(this.config.epsUnits / grid.cellSize);
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const neighbourCell = grid.cellIndex(cellX + dx, cellY + dy);
        if (neighbourCell === null) continue;
        for (let index = grid.start(neighbourCell); index < grid.end(neighbourCell); index++) {
          const other = grid.particleAt(index);
          const ddx = x[slot] - x[other];
          const ddy = y[slot] - y[other];
          if (ddx * ddx + ddy * ddy <= epsSquared) found.push(other);
        }
      }
    }
    return found;
  }

  /**
   * Eşleme üç kapıdan geçer: Jaccard örtüşmesi, merkez kayması ve boyut oranı.
   * Atama deterministik greedy'dir — önce yüksek örtüşme, eşitlikte ESKİ ID.
   */
  private match(clusters: PendingCluster[], tick: number): void {
    /*
     * Önceki üyelikler DONDURULUR: `applyMatches` eşleşen kümenin üyeliğini
     * yeni kadroyla değiştirir, dolayısıyla bölünme ve parçalanma kararları
     * ondan sonra bakıldığında ebeveynin eski kadrosunu göremez. Ölçüldü:
     * kopan parça güncellenmiş ebeveynle sıfır kesişim verip `split` yerine
     * sıradan `birth` alıyordu.
     */
    const previousMembers = new Map<number, readonly number[]>();
    for (const [id, tracked] of this.tracked) previousMembers.set(id, [...tracked.memberIds]);
    const pairs: { clusterIndex: number; id: number; overlap: number }[] = [];
    for (const [id, tracked] of this.tracked) {
      for (let index = 0; index < clusters.length; index++) {
        const candidate = clusters[index];
        const overlap = jaccard(candidate.memberIds, tracked.memberIds);
        if (overlap < this.config.overlapThreshold) continue;
        const distance = Math.hypot(
          candidate.centroidX - tracked.centroidX,
          candidate.centroidY - tracked.centroidY,
        );
        if (distance > this.config.centroidGateUnits) continue;
        const ratio =
          Math.max(candidate.memberIds.length, tracked.memberIds.length) /
          Math.max(1, Math.min(candidate.memberIds.length, tracked.memberIds.length));
        if (ratio > this.config.sizeRatioGate) continue;
        pairs.push({ clusterIndex: index, id, overlap });
      }
    }
    pairs.sort((a, b) => b.overlap - a.overlap || a.id - b.id || a.clusterIndex - b.clusterIndex);

    const claimedCluster = new Map<number, number>();
    const claimedId = new Set<number>();
    for (const pair of pairs) {
      if (claimedCluster.has(pair.clusterIndex) || claimedId.has(pair.id)) continue;
      claimedCluster.set(pair.clusterIndex, pair.id);
      claimedId.add(pair.id);
    }

    this.emitMerges(clusters, claimedCluster, tick);
    this.applyMatches(clusters, claimedCluster, tick);
    // SIRA ÖNEMLİ: bölünme, eşleşmeyen parçalar sıradan doğum olarak
    // sahiplenilmeden ÖNCE tanınmalı; aksi hâlde kopan parça `birth` alır ve
    // ebeveyn bağı kaybolur (ölçüldü: split hiç yayımlanmıyordu).
    this.emitSplits(clusters, claimedCluster, previousMembers, tick);
    this.emitFragmentation(clusters, claimedCluster, previousMembers, tick);
    this.adoptUnmatched(clusters, claimedCluster, tick);
    this.retireMissing(claimedCluster, tick);
  }

  /** Aynı yeni kümeye birden çok izlenen küme düşerse: en büyük örtüşme yaşar. */
  private emitMerges(clusters: PendingCluster[], claimed: Map<number, number>, tick: number): void {
    for (const [clusterIndex, survivingId] of claimed) {
      const members = new Set(clusters[clusterIndex].memberIds);
      for (const [id, tracked] of this.tracked) {
        if (id === survivingId || tracked.missingSince !== null) continue;
        const absorbed = tracked.memberIds.filter((member) => members.has(member)).length;
        if (absorbed / Math.max(1, tracked.memberIds.length) < this.config.overlapThreshold) {
          continue;
        }
        if (tracked.confirmed) {
          this.events.push({ tick, kind: 'merge', clusterId: id, relatedId: survivingId });
        }
        this.tracked.delete(id);
      }
    }
  }

  private applyMatches(
    clusters: PendingCluster[],
    claimed: Map<number, number>,
    tick: number,
  ): void {
    for (const [clusterIndex, id] of claimed) {
      const cluster = clusters[clusterIndex];
      const tracked = this.tracked.get(id);
      if (!tracked) continue;
      tracked.memberIds = [...cluster.memberIds];
      tracked.centroidX = cluster.centroidX;
      tracked.centroidY = cluster.centroidY;
      tracked.lastSeenTick = tick;
      tracked.missingSince = null;
      if (!tracked.confirmed && tick - tracked.firstSeenTick >= this.config.minContinuityTicks) {
        tracked.confirmed = true;
        this.events.push({ tick, kind: 'birth', clusterId: id });
      }
    }
  }

  /**
   * Bölünme: en büyük parça ID'yi KORUR, diğerleri ebeveyni işaretleyen yeni ID
   * alır. Ayrım örtüşme kapısına bakamaz — kopan parça küçüldükçe Jaccard
   * düşer ve kapı onu zaten elemiştir. Sorulan şey şudur: bu yeni kümenin
   * üyeleri ÇOĞUNLUKLA tek bir izlenen kümeden mi geliyor?
   */
  private emitSplits(
    clusters: PendingCluster[],
    claimed: Map<number, number>,
    previousMembers: Map<number, readonly number[]>,
    tick: number,
  ): void {
    for (let index = 0; index < clusters.length; index++) {
      if (claimed.has(index)) continue;
      const members = clusters[index].memberIds;
      let parentId = -1;
      let bestShare = 0;
      for (const id of previousMembers.keys()) {
        const previous = new Set(previousMembers.get(id) ?? []);
        const shared = members.filter((member) => previous.has(member)).length;
        const share = shared / Math.max(1, members.length);
        if (share > bestShare) {
          bestShare = share;
          parentId = id;
        }
      }
      if (parentId < 0 || bestShare < this.config.overlapThreshold) continue;
      const id = this.adopt(clusters[index], tick);
      claimed.set(index, id);
      this.events.push({ tick, kind: 'split', clusterId: id, relatedId: parentId });
    }
  }

  /**
   * Parçalanma: izlenen kümenin hiçbir parçası tek başına eşiği geçmez ama
   * parçaların BİRLEŞİMİ geçer — küme dağılmıştır, ölmüş değildir.
   */
  private emitFragmentation(
    clusters: PendingCluster[],
    claimed: Map<number, number>,
    previousMembers: Map<number, readonly number[]>,
    tick: number,
  ): void {
    for (const [id, tracked] of this.tracked) {
      if (!tracked.confirmed || [...claimed.values()].includes(id)) continue;
      const members = new Set(previousMembers.get(id) ?? tracked.memberIds);
      let union = 0;
      let best = 0;
      for (let index = 0; index < clusters.length; index++) {
        const shared = clusters[index].memberIds.filter((member) => members.has(member)).length;
        union += shared;
        best = Math.max(best, shared);
      }
      const size = Math.max(1, (previousMembers.get(id) ?? tracked.memberIds).length);
      if (
        best / size < this.config.overlapThreshold &&
        union / size >= this.config.overlapThreshold
      ) {
        this.events.push({ tick, kind: 'fragmentation', clusterId: id });
      }
    }
  }

  private adopt(cluster: PendingCluster, tick: number): number {
    const id = this.nextId++;
    this.tracked.set(id, {
      id,
      memberIds: [...cluster.memberIds],
      centroidX: cluster.centroidX,
      centroidY: cluster.centroidY,
      firstSeenTick: tick,
      lastSeenTick: tick,
      confirmed: this.config.minContinuityTicks === 0,
      missingSince: null,
    });
    if (this.config.minContinuityTicks === 0) {
      this.events.push({ tick, kind: 'birth', clusterId: id });
    }
    return id;
  }

  /** Eşleşmeyen küme hemen ölmez: `maxGapTicks` boyunca beklenir. */
  private retireMissing(claimed: Map<number, number>, tick: number): void {
    const claimedIds = new Set(claimed.values());
    for (const [id, tracked] of this.tracked) {
      if (claimedIds.has(id)) continue;
      tracked.missingSince ??= tick;
      if (tick - tracked.missingSince > this.config.maxGapTicks) {
        if (tracked.confirmed) this.events.push({ tick, kind: 'death', clusterId: id });
        this.tracked.delete(id);
      }
    }
  }

  /** Eşleşmeyen parçalar yeni küme olarak alınır; sıra deterministiktir. */
  private adoptUnmatched(
    clusters: PendingCluster[],
    claimed: Map<number, number>,
    tick: number,
  ): void {
    for (let index = 0; index < clusters.length; index++) {
      if (claimed.has(index)) continue;
      const id = this.adopt(clusters[index], tick);
      claimed.set(index, id);
    }
  }
}

/** Jaccard: kesişim / birleşim. Boyut oranı kapısı ayrıca uygulanır. */
function jaccard(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  let common = 0;
  for (const value of b) {
    if (setA.has(value)) common++;
  }
  return common / (a.length + b.length - common);
}
