import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FactoryHost } from '../../src/app/host';
import { createLabKit, LabTransport, type LabHandle } from '../../src/lab/install';
import { LAB_API_VERSION } from '../../src/lab/commands';
import { LAB_SCENE_KEY } from '../../src/lab/LabScene';

// Phaser jsdom'da yüklenemez; LabScene yalnız bir sınıf olarak gerekir.
vi.mock('phaser', () => ({ default: { Scene: class {} } }));

class Emitter {
  readonly listeners = new Map<string, Set<() => void>>();
  on(event: string, listener: () => void): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)?.add(listener);
    return this;
  }
  off(event: string, listener: () => void): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }
  once(event: string, listener: () => void): this {
    return this.on(event, listener);
  }
}

const fakeGame = (): { events: Emitter } => ({ events: new Emitter() });
const handles: LabHandle[] = [];

afterEach(() => {
  for (const handle of handles.splice(0)) handle.destroy();
  delete window.volLab;
});

describe('LabTransport', () => {
  it('çizici bilgisi ancak teşhis anlık görüntüsü gelince bilinir', () => {
    const transport = new LabTransport();
    expect(transport.renderer()).toBeNull();
    transport.send({ renderer: { kind: 'webgl', fellBack: false } } as never);
    expect(transport.renderer()).toEqual({ kind: 'webgl', fellBack: false });
    transport.send({ renderer: { kind: 'canvas', fellBack: true } } as never);
    expect(transport.renderer()).toEqual({ kind: 'canvas', fellBack: true });
  });

  it('"unknown" ölçülemedi demektir ve null döner', () => {
    const transport = new LabTransport();
    transport.send({ renderer: { kind: 'unknown', fellBack: false } } as never);
    expect(transport.renderer()).toBeNull();
  });
});

describe('createLabKit', () => {
  it('kipini, günlüğü, teşhisi ve laboratuvar sahnesini hazırlar; açılış günlüğe yazılır', () => {
    const kit = createLabKit('run');
    expect(kit.mode).toBe('run');
    expect(kit.scenes).toHaveLength(1);
    expect(new kit.scenes[0]()).toBeDefined();
    expect(LAB_SCENE_KEY).toBe('lab');
    const created = kit.log.since(0, 10).records.find((record) => record.ev === 'kit.created');
    expect(created?.data).toMatchObject({ mode: 'run', api: LAB_API_VERSION });
    kit.dispose();
  });

  it('attach window.volLab yayımlar: sürüm, kip, komut listesi ve çağrı', async () => {
    const kit = createLabKit('run');
    const handle = kit.attach(fakeGame() as never, {} as FactoryHost);
    handles.push(handle);
    const api = window.volLab;
    expect(api).toBeDefined();
    expect(api?.version).toBe(LAB_API_VERSION);
    expect(api?.mode).toBe('run');
    expect(api?.commands).toEqual(expect.arrayContaining(['start', 'stop', 'metrics', 'verdict']));
    const workloads = await api?.call('workloads');
    expect(workloads).toMatchObject({ ok: true });
    const ids = (workloads as { data: { id: string }[] }).data.map((workload) => workload.id);
    expect(ids).toEqual(
      expect.arrayContaining(['svg-sprites', 'svg-props', 'arachnid-swarm', 'factory-local']),
    );
    const unknown = await api?.call('yok');
    expect(unknown).toMatchObject({ ok: false });
  });

  it('gözlem kipinde runtime yalnız izler: start reddedilir', async () => {
    const kit = createLabKit('observe');
    const handle = kit.attach(fakeGame() as never, {} as FactoryHost);
    handles.push(handle);
    expect(window.volLab?.mode).toBe('observe');
    const result = await window.volLab?.call('start', { workload: 'svg-sprites' });
    expect(result).toMatchObject({ ok: false, error: { code: 'observe-only' } });
  });

  it("destroy window.volLab'ı kaldırır, sayacı durdurur ve konsolu geri koyar; ikinci dispose zararsız", () => {
    const originalWarn = console.warn;
    const kit = createLabKit('run');
    expect(console.warn).not.toBe(originalWarn);
    const handle = kit.attach(fakeGame() as never, {} as FactoryHost);
    expect(window.volLab).toBeDefined();
    handle.destroy();
    expect(window.volLab).toBeUndefined();
    expect(console.warn).toBe(originalWarn);
    expect(() => kit.dispose()).not.toThrow();
  });

  it("başka bir kit window.volLab'ı devralmışsa eskisinin destroy'u onu silmez", () => {
    const first = createLabKit('run');
    const firstHandle = first.attach(fakeGame() as never, {} as FactoryHost);
    const second = createLabKit('run');
    const secondHandle = second.attach(fakeGame() as never, {} as FactoryHost);
    handles.push(secondHandle);
    const current = window.volLab;
    firstHandle.destroy();
    expect(window.volLab).toBe(current);
  });

  it('kurulamayan oyun için dispose sayfa yakalayıcısını bırakır', () => {
    const originalError = console.error;
    const kit = createLabKit('run');
    expect(console.error).not.toBe(originalError);
    kit.dispose();
    expect(console.error).toBe(originalError);
  });
});
