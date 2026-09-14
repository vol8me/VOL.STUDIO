import { describe, expect, it } from 'vitest';
import {
  computeWorkId,
  shardForWork,
  assignShards,
  filterShard,
  generateSeedCorpus,
  generateWorkIds,
  type ShardSpec,
} from '@/../scripts/morphology/shards';

describe('Shards', () => {
  it('workId deterministik ve aynı girdide aynıdır', () => {
    const spec: ShardSpec = { genomeDigest: 'abc123', seed: 42, phase: 'broad' };
    expect(computeWorkId(spec)).toBe(computeWorkId(spec));
  });

  it('farklı girdiler farklı workId üretir', () => {
    const a: ShardSpec = { genomeDigest: 'abc', seed: 1, phase: 'broad' };
    const b: ShardSpec = { genomeDigest: 'def', seed: 2, phase: 'broad' };
    expect(computeWorkId(a)).not.toBe(computeWorkId(b));
  });

  it('shardForWork 0..shardCount-1 aralığında', () => {
    const workId = 'test-work-id';
    for (let count = 1; count <= 8; count++) {
      const shard = shardForWork(workId, count);
      expect(shard).toBeGreaterThanOrEqual(0);
      expect(shard).toBeLessThan(count);
    }
  });

  it('assignShards her spec için shard atar', () => {
    const specs = generateWorkIds('digest', [1, 2, 3], 'broad');
    const shards = assignShards(specs, 4);
    expect(shards).toHaveLength(3);
    for (const s of shards) {
      expect(s.shardIndex).toBeGreaterThanOrEqual(0);
      expect(s.shardIndex).toBeLessThan(4);
      expect(s.shardCount).toBe(4);
    }
  });

  it("filterShard sadece belirli shard'a ait spec'leri döner", () => {
    const seeds = generateSeedCorpus(42, 100);
    const specs = generateWorkIds('digest', seeds, 'broad');
    const shard0 = filterShard(specs, 0, 4);
    const shard1 = filterShard(specs, 1, 4);
    const allFiltered = [...shard0, ...shard1];
    const allSpecs = filterShard(specs, 0, 1);
    expect(allFiltered.length).toBeLessThan(specs.length);
    expect(allSpecs.length).toBe(specs.length);
  });

  it('generateSeedCorpus benzersiz tohum üretir', () => {
    const seeds = generateSeedCorpus(0, 50);
    const unique = new Set(seeds);
    expect(unique.size).toBe(50);
  });
});
