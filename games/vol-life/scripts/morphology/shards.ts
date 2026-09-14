export interface ShardId {
  readonly workId: string;
  readonly shardIndex: number;
  readonly shardCount: number;
}

export interface ShardSpec {
  readonly genomeDigest: string;
  readonly seed: number;
  readonly phase: 'broad' | 'refinement' | 'qualification';
}

export function computeWorkId(spec: ShardSpec): string {
  return `${spec.phase}:${spec.genomeDigest}:${spec.seed}`;
}

export function shardForWork(workId: string, shardCount: number): number {
  if (shardCount <= 0) return 0;
  let hash = 0x811c9dc5;
  for (let i = 0; i < workId.length; i++) {
    hash = Math.imul(hash ^ workId.charCodeAt(i), 0x01000193);
  }
  return (hash >>> 0) % shardCount;
}

export function assignShards(specs: readonly ShardSpec[], shardCount: number): ShardId[] {
  return specs.map((spec) => {
    const workId = computeWorkId(spec);
    return {
      workId,
      shardIndex: shardForWork(workId, shardCount),
      shardCount,
    };
  });
}

export function filterShard(
  specs: readonly ShardSpec[],
  shardIndex: number,
  shardCount: number,
): ShardSpec[] {
  return specs.filter((spec) => {
    const workId = computeWorkId(spec);
    return shardForWork(workId, shardCount) === shardIndex;
  });
}

export function generateSeedCorpus(baseSeed: number, count: number): number[] {
  const seeds: number[] = [];
  let state = baseSeed >>> 0;
  for (let i = 0; i < count; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    seeds.push(state);
  }
  return seeds;
}

export function generateWorkIds(
  genomeDigest: string,
  seeds: readonly number[],
  phase: ShardSpec['phase'],
): ShardSpec[] {
  return seeds.map((seed) => ({ genomeDigest, seed, phase }));
}
