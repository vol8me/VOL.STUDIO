import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AgentLab, installAgentLab, type LabState, type VolLabApi } from '@/app/AgentLab';
import { LAB } from '@/config/lab';
import type { TankCommand } from '@/sim/command';

function state(patch: Partial<LabState> = {}): LabState {
  return {
    scenario: 'empty',
    seed: 7,
    online: false,
    vehicle: 'striker',
    kind: 'tank',
    x: 10,
    y: 20,
    hull: 0,
    speed: 0,
    health: 100,
    alive: true,
    vehicles: 1,
    projectiles: 0,
    paused: false,
    extra: {},
    ...patch,
  };
}

function lab() {
  const inputs: Array<Partial<TankCommand> | null> = [];
  const placed: Array<[number, number, number | undefined]> = [];
  const world = { current: state() };
  const instance = new AgentLab({
    state: () => world.current,
    setInput: (patch) => inputs.push(patch),
    teleport: (x, y, hull) => placed.push([x, y, hull]),
  });
  return { lab: instance, inputs, world, placed };
}

describe('AgentLab', () => {
  it('durum, yardım ve komut kaydı tutarlıdır; bilinmeyen komut fırlatır', () => {
    const { lab: instance } = lab();
    expect(instance.run('state')).toMatchObject({ scenario: 'empty', seed: 7, vehicle: 'striker' });
    const help = instance.run('help') as Array<{ name: string; description: string }>;
    expect(help.map((item) => item.name)).toEqual([...instance.commands]);
    expect(help.every((item) => item.description.length > 0)).toBe(true);
    expect(() => instance.run('yok')).toThrow(RangeError);
  });

  it('örnekleme aralığına uyar; halka dolunca en eskiyi ezer ve sırayı korur', () => {
    const { lab: instance, world } = lab();
    instance.sample(1000);
    instance.sample(1000 + LAB.sampleMs - 1);
    expect(instance.run('telemetry')).toHaveLength(1);
    for (let index = 0; index < LAB.telemetryCapacity + 25; index++) {
      world.current = state({ x: index });
      instance.sample(2000 + index * LAB.sampleMs);
    }
    const all = instance.run('telemetry', { count: LAB.maxCount }) as Array<{
      t: number;
      x: number;
    }>;
    expect(all).toHaveLength(LAB.telemetryCapacity);
    expect(all.map((row) => row.t)).toEqual([...all.map((row) => row.t)].sort((a, b) => a - b));
    expect(all[all.length - 1].x).toBe(LAB.telemetryCapacity + 24);
    expect(all[0].x).toBe(25);
    expect(instance.run('telemetry', { count: 3 })).toHaveLength(3);
    expect(instance.run('telemetry', { count: -4 })).toHaveLength(1);
  });

  it('girdi doğrulanır ve kaynağa iletilir; release bırakır', () => {
    const { lab: instance, inputs } = lab();
    expect(instance.run('input', { moveX: 1, fire: true })).toEqual({
      input: { moveX: 1, fire: true },
    });
    expect(inputs[0]).toEqual({ moveX: 1, fire: true });
    expect(() => instance.run('input', { moveX: 2 })).toThrow(RangeError);
    expect(() => instance.run('input', { moveY: Number.NaN })).toThrow(RangeError);
    expect(() => instance.run('input', { fire: 'evet' })).toThrow(RangeError);
    expect(inputs).toHaveLength(1);
    instance.run('release');
    expect(inputs[1]).toBeNull();
  });

  it('ışınlama sayıyı doğrular ve kaynağa iletir', () => {
    const { lab: instance, placed } = lab();
    expect(instance.run('teleport', { x: 1500, y: 2500 })).toEqual({
      x: 1500,
      y: 2500,
      hull: null,
    });
    expect(instance.run('teleport', { x: 1, y: 2, hull: 0.5 })).toMatchObject({ hull: 0.5 });
    expect(placed).toEqual([
      [1500, 2500, undefined],
      [1, 2, 0.5],
    ]);
    expect(() => instance.run('teleport', { x: 'a', y: 1 })).toThrow(RangeError);
    expect(() => instance.run('teleport', { x: Number.NaN, y: 1 })).toThrow(RangeError);
    expect(() => instance.run('teleport', { x: 1, y: 1, hull: 'x' })).toThrow(RangeError);
    expect(placed).toHaveLength(2);
  });

  it('olaylar ve işaretler zaman damgalı satırlar olarak jsonl çıktısında sıralanır', () => {
    const { lab: instance } = lab();
    instance.sample(500);
    instance.record('fired', { source: 1 });
    instance.sample(900);
    instance.run('mark', { label: 'a'.repeat(200) });
    const lines = (instance.run('jsonl') as string)
      .split('\n')
      .map((line) => JSON.parse(line) as { ev: string; t: number; label?: string });
    expect(lines.map((line) => line.ev)).toEqual(['sample', 'fired', 'sample', 'mark']);
    const times = lines.map((line) => line.t);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(lines[3].label).toHaveLength(80);
    expect(instance.run('events')).toHaveLength(2);
  });

  it('pencereye bağlanır ve kaldırılırken yalnız kendi kaydını siler', () => {
    const { lab: first } = lab();
    const { lab: second } = lab();
    const target: { volLab?: VolLabApi } = {};
    const removeFirst = installAgentLab(target, first);
    expect(target.volLab?.commands).toEqual([...first.commands]);
    expect(target.volLab?.run('state')).toMatchObject({ seed: 7 });
    const removeSecond = installAgentLab(target, second);
    removeFirst();
    expect(target.volLab).toBeDefined();
    removeSecond();
    expect(target.volLab).toBeUndefined();
  });

  it('DESIGN laboratuvar tablosu komut kaydıyla birebir aynıdır', () => {
    const { lab: instance } = lab();
    const design = readFileSync(resolve(process.cwd(), 'DESIGN.md'), 'utf8');
    const section = design.slice(design.indexOf('### Ajan laboratuvarı'));
    expect(section.length).toBeGreaterThan(0);
    const documented = [...section.matchAll(/^\| `volLab\.([a-z]+)`/gm)].map((match) => match[1]);
    expect(documented.sort()).toEqual([...instance.commands].sort());
  });
});
