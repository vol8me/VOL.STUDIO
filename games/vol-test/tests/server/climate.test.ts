import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Room } from '@volstudio/network/client';
import { afterEach, describe, expect, it } from 'vitest';
import { WEATHER } from '@/config/weather';
import { WORLD } from '@/config/world';
import { EVENT_MESSAGE } from '@/network/events';
import { CLIMATE_MESSAGE, CLIMATE_REQUEST, isClimateSnapshot } from '@/network/climate';
import type { WorldSnapshot } from '@/network/schema';
import type { ClimateSnapshot } from '@/sim/weather/types';
import { WeatherSystem } from '@/sim/weather/WeatherSystem';
import {
  decodeClimate,
  encodeClimate,
  FileClimateStore,
  type ClimateStore,
} from '../../server/ClimateStore';
import { joined, joinWorld, startServer, until, type TestServer } from '../support/netHarness';

const directories: string[] = [];
let server: TestServer | undefined;

afterEach(async () => {
  await server?.stop();
  server = undefined;
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function tempFile(): string {
  const directory = mkdtempSync(join(tmpdir(), 'voltest-climate-'));
  directories.push(directory);
  return join(directory, 'state', 'climate.json');
}

/** Dünya ölçüsünde bir iklim, `seconds` saniye ilerletilmiş. */
function aged(seconds: number): ClimateSnapshot {
  const climate = new WeatherSystem(WORLD.width, WORLD.height, { seed: WEATHER.seed });
  climate.step(seconds * 1000);
  return climate.snapshot();
}

class MemoryStore implements ClimateStore {
  saves: ClimateSnapshot[] = [];
  constructor(private readonly initial?: ClimateSnapshot) {}
  load(): ClimateSnapshot | undefined {
    return this.initial;
  }
  save(snapshot: ClimateSnapshot): boolean {
    this.saves.push(snapshot);
    return true;
  }
}

async function seat(host: TestServer): Promise<{
  room: Room<WorldSnapshot>;
  climates: ClimateSnapshot[];
}> {
  const room = await joinWorld(host, { name: 'Pilot' });
  room.reconnection.enabled = false;
  room.onMessage(EVENT_MESSAGE, () => undefined);
  const climates: ClimateSnapshot[] = [];
  room.onMessage(CLIMATE_MESSAGE, (value: unknown) => {
    if (isClimateSnapshot(value)) climates.push(value);
  });
  await joined(room);
  room.send(CLIMATE_REQUEST);
  return { room, climates };
}

describe('iklim dosya deposu', () => {
  it('yaz-oku gidiş dönüşü bütün alanları korur; bozuk ve tutarsız kayıt yok sayılır', () => {
    const path = tempFile();
    const store = new FileClimateStore(path);
    expect(store.load()).toBeUndefined();
    const snapshot = aged(30);
    expect(store.save(snapshot)).toBe(true);
    const loaded = store.load()!;
    expect(loaded.elapsedMs).toBe(snapshot.elapsedMs);
    expect(loaded.season).toBe(snapshot.season);
    expect(Array.from(loaded.surface.growth)).toEqual(Array.from(snapshot.surface.growth));
    expect(Array.from(loaded.surface.wetness)).toEqual(Array.from(snapshot.surface.wetness));

    writeFileSync(path, '{bozuk', 'utf8');
    expect(store.load()).toBeUndefined();
    const text = JSON.parse(encodeClimate(snapshot)) as { surface: { growth: string } };
    text.surface.growth = 'AAAA';
    expect(decodeClimate(JSON.stringify(text))).toBeUndefined();
    expect(decodeClimate('null')).toBeUndefined();
    expect(decodeClimate(JSON.stringify({ ...snapshot, surface: 5 }))).toBeUndefined();
  });

  it('yazım yarım kalmaz: geçici dosya yerine taşınır ve yazılamayan yol `false` verir', () => {
    const path = tempFile();
    const store = new FileClimateStore(path);
    expect(store.save(aged(5))).toBe(true);
    expect(() => readFileSync(`${path}.tmp`)).toThrow();
    // Üst yol bir dosyaysa dizin kurulamaz: hata fırlatmaz, başarısızlık döner.
    const blocked = new FileClimateStore(join(path, 'inside', 'climate.json'));
    expect(blocked.save(aged(5))).toBe(false);
  });
});

describe('sunucu iklimi', () => {
  it('katılan istemci iklim anlık görüntüsünü hemen alır ve düzenli aralıkla yenisini', async () => {
    server = await startServer(undefined, { perFaction: 0 });
    const { climates } = await seat(server);
    await until(() => climates.length > 0, 'ilk iklim');
    const first = climates[0];
    expect(first.seed).toBe(WEATHER.seed);
    expect(first.surface.columns * first.surface.rows).toBe(first.surface.growth.length);
    // Sunucu saati aynı belirli takvimde ilerler: sonraki görüntünün saati ilkinden büyüktür.
    await until(() => climates.length > 1, 'ikinci iklim', 20_000);
    expect(climates[1].elapsedMs).toBeGreaterThan(first.elapsedMs);
  }, 30_000);

  it('kayıtlı iklimden devam eder: saat ve yeşillik yeniden başlamada korunur', async () => {
    const saved = aged(150);
    const store = new MemoryStore(saved);
    server = await startServer(undefined, { perFaction: 0, climateStore: store });
    const { climates } = await seat(server);
    await until(() => climates.length > 0, 'ilk iklim');
    expect(climates[0].elapsedMs).toBeGreaterThanOrEqual(saved.elapsedMs);
    expect(climates[0].elapsedMs).toBeLessThan(saved.elapsedMs + 20_000);
    expect(Array.from(climates[0].surface.growth).some((value) => value > 0)).toBe(true);
  }, 30_000);

  it('oda kapanırken iklimi kaydeder', async () => {
    const store = new MemoryStore();
    server = await startServer(undefined, { perFaction: 0, climateStore: store });
    const { room } = await seat(server);
    expect(store.saves).toHaveLength(0);
    await room.leave();
    await until(() => store.saves.length > 0, 'iklim kaydı');
    expect(isClimateSnapshot(store.saves[store.saves.length - 1])).toBe(true);
  }, 30_000);

  it('başka tohumun kaydı bu dünyayı bozmaz', async () => {
    const foreign = new WeatherSystem(WORLD.width, WORLD.height, { seed: WEATHER.seed + 9 });
    foreign.step(60_000);
    server = await startServer(undefined, {
      perFaction: 0,
      climateStore: new MemoryStore(foreign.snapshot()),
    });
    const { climates } = await seat(server);
    await until(() => climates.length > 0, 'ilk iklim');
    expect(climates[0].seed).toBe(WEATHER.seed);
    expect(climates[0].elapsedMs).toBeLessThan(30_000);
  }, 30_000);
});

describe('iklim isteği', () => {
  it('istek sıklığı sınırlıdır: art arda istek tek yanıt alır', async () => {
    server = await startServer(undefined, { perFaction: 0 });
    const { room, climates } = await seat(server);
    await until(() => climates.length === 1, 'ilk yanıt');
    for (let index = 0; index < 5; index++) room.send(CLIMATE_REQUEST);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(climates).toHaveLength(1);
  }, 30_000);
});

describe('iklim ileti doğrulaması', () => {
  it('biçimsiz yükü reddeder', () => {
    const good = aged(1);
    expect(isClimateSnapshot(good)).toBe(true);
    for (const bad of [
      null,
      'x',
      {},
      { ...good, version: 2 },
      { ...good, elapsedMs: Number.NaN },
      { ...good, season: 5 },
      { ...good, season: 'bilinmeyen' },
      { ...good, seed: -1 },
      { ...good, seed: 0x100000000 },
      { ...good, seed: 1.5 },
      { ...good, elapsedMs: -1 },
      { ...good, elapsedMs: 1e300, surfaceMs: 1e300, windMs: 1e300 },
      { ...good, surfaceMs: -1 },
      { ...good, windMs: good.elapsedMs + 1 },
      { ...good, surfaceMs: good.windMs + 1 },
      {
        ...good,
        surface: { ...good.surface, columns: -good.surface.columns, rows: -good.surface.rows },
      },
      { ...good, surface: { ...good.surface, growth: new Uint8Array(3) } },
      { ...good, surface: { ...good.surface, columns: 1e9, rows: 1e9 } },
      { ...good, surface: { ...good.surface, wetness: [1, 2, 3] } },
    ])
      expect(isClimateSnapshot(bad)).toBe(false);
  });
});
