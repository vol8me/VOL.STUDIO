import { performance } from 'node:perf_hooks';
import { getEnemyDefinition } from '../src/config/enemies/catalog';
import { createRenderSnapshot } from '../src/runtime/simulation/snapshots';
import type { SimulationEnemyState } from '../src/runtime/simulation/types';
import { RunEconomy } from '../src/runtime/systems/RunEconomy';
import { WaveManager } from '../src/runtime/systems/WaveManager';

const definition = getEnemyDefinition('grunt');
const economy = new RunEconomy();
const waveManager = new WaveManager();
waveManager.start();

function sourceFor(enemyCount: number) {
  const enemies: SimulationEnemyState[] = Array.from({ length: enemyCount }, (_, id) => ({
    id,
    definition,
    radius: definition.radius,
    maxHealth: definition.baseStats.health,
    scoreValue: definition.scoreValue,
    health: definition.baseStats.health,
    isAlive: true,
    speed: definition.baseStats.speed,
    rusherState: null,
    swarmerState: null,
    spawnRequest: null,
    minions: [],
    behaviorContext: null,
    x: id * 13,
    y: id * 7,
  }));
  return {
    frame: 1,
    elapsedMs: 16,
    playerX: 0,
    playerY: 0,
    economy,
    waveManager,
    runCompleted: false,
    enemies,
    pickups: [],
    waves: [],
    shopTriggers: [],
    levelUps: [],
    eliteWaves: [],
    bossWaves: [],
    maxEnemyCount: enemyCount,
    maxPickupCount: 0,
  };
}

function measure(enemyCount: number): number {
  const source = sourceFor(enemyCount);
  const runs: number[] = [];
  let checksum = 0;
  for (let sample = 0; sample < 7; sample++) {
    const started = performance.now();
    for (let iteration = 0; iteration < 10_000; iteration++) {
      checksum += createRenderSnapshot(source).enemies.length;
    }
    runs.push(performance.now() - started);
  }
  if (checksum !== enemyCount * 70_000) throw new Error('Snapshot ölçümü tutarsız');
  runs.sort((a, b) => a - b);
  return runs[3];
}

console.log(
  JSON.stringify({ snapshots: [10, 40].map((enemies) => ({ enemies, ms: measure(enemies) })) }),
);
