import type { Baseline } from './judge';
import type { LabLevel } from './log';
import { resolveParams, type ParamSpec, type ParamValues } from './params';
import type { LabRuntime, Outcome } from './runtime';
import type { WorkloadDef } from './workload';

/** `window.volLab` komut kataloğunun sürümü; komut ya da çıktı biçimi kırılırsa artar. */
export const LAB_API_VERSION = 1;

export interface CommandDef {
  readonly name: string;
  readonly summary: string;
  /** Düz (skaler) argümanlar. */
  readonly args: readonly ParamSpec[];
  /** İç içe nesne argümanlarının adları (`params`, `baseline`, `args`); içeriği `notes`ta anlatılır. */
  readonly objectArgs?: readonly string[];
  readonly notes?: string;
  run(
    runtime: LabRuntime,
    args: ParamValues,
    raw: Record<string, unknown>,
  ): Promise<Outcome<unknown>> | Outcome<unknown>;
}

const LEVELS: readonly LabLevel[] = ['debug', 'info', 'warn', 'error'];

function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

function fail(
  code: string,
  message: string,
): { ok: false; error: { code: string; message: string } } {
  return { ok: false, error: { code, message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Taban çizgi biçimini doğrular; bozuk taban sessizce yok sayılmaz. */
export function parseBaseline(raw: unknown): Baseline | null | string {
  if (raw === undefined || raw === null) return null;
  if (!isRecord(raw)) return 'baseline bir nesne olmalı';
  const text = (key: string): string | null => (typeof raw[key] === 'string' ? raw[key] : null);
  const number = (key: string): number | null =>
    typeof raw[key] === 'number' && Number.isFinite(raw[key]) ? raw[key] : null;
  const workload = text('workload');
  const paramsKey = text('paramsKey');
  const engine = text('engine');
  const rendererClass = text('rendererClass');
  const workP95Ms = number('workP95Ms');
  const intervalP99Ms = number('intervalP99Ms');
  if (
    workload === null ||
    paramsKey === null ||
    engine === null ||
    rendererClass === null ||
    workP95Ms === null ||
    intervalP99Ms === null
  )
    return 'baseline alanları eksik: workload, paramsKey, engine, rendererClass, workP95Ms, intervalP99Ms';
  if (!['chromium', 'webkit', 'firefox', 'unknown'].includes(engine))
    return 'baseline.engine geçersiz';
  if (!['hardware', 'software', 'unknown'].includes(rendererClass))
    return 'baseline.rendererClass geçersiz';
  return {
    workload,
    paramsKey,
    engine: engine as Baseline['engine'],
    rendererClass: rendererClass as Baseline['rendererClass'],
    workP95Ms,
    intervalP99Ms,
  };
}

/**
 * Komut kataloğu. Tek kaynak: `describe`, belge senkron testi ve `window.volLab.commands` bundan
 * türer; bir komut eklemek bu dizide bir giriş ve `docs/lab.md`de bir satırdır.
 */
export function buildCommands(workloads: readonly WorkloadDef[]): readonly CommandDef[] {
  const ids = workloads.map((workload) => workload.id);
  const runArgs: readonly ParamSpec[] = [
    {
      name: 'workload',
      type: 'choice',
      default: ids[0] ?? '',
      choices: ids,
      description: 'koşulacak yük (workloads komutu)',
    },
    {
      name: 'durationMs',
      type: 'integer',
      default: 8000,
      min: 500,
      max: 600_000,
      description: 'ısınma sonrası ölçüm süresi (ms)',
    },
    {
      name: 'warmupMs',
      type: 'integer',
      default: 1500,
      min: 0,
      max: 60_000,
      description: 'ölçüme alınmayan ısınma (ms)',
    },
  ];
  const actionNames = [
    ...new Set(workloads.flatMap((workload) => workload.actions.map((action) => action.name))),
  ];

  const commands: CommandDef[] = [
    {
      name: 'describe',
      summary: 'Komut kataloğu, yükler ve sürüm: ilk çağrılacak komut.',
      args: [],
      run: (runtime) =>
        ok({
          version: LAB_API_VERSION,
          observeOnly: runtime.observeOnly,
          commands: commands.map((command) => ({
            name: command.name,
            summary: command.summary,
            args: command.args,
            objectArgs: command.objectArgs ?? [],
            notes: command.notes ?? null,
          })),
          workloads: workloads.map((workload) => ({ id: workload.id, title: workload.title })),
        }),
    },
    {
      name: 'workloads',
      summary: 'Yükler: özet, parametre şeması, eylemler.',
      args: [],
      run: () =>
        ok(
          workloads.map((workload) => ({
            id: workload.id,
            title: workload.title,
            summary: workload.summary,
            params: workload.params,
            actions: workload.actions,
          })),
        ),
    },
    {
      name: 'status',
      summary: 'Koşu durumu: state, geçen/kalan süre, kare sayısı, son hata.',
      args: [],
      run: (runtime) => ok(runtime.status()),
    },
    {
      name: 'start',
      summary:
        'Yükü başlatır ve yük kurulunca döner; ölçüm arka planda sürer (status ile izlenir).',
      args: runArgs,
      objectArgs: ['params'],
      notes: 'params: yükün parametre nesnesi (workloads komutundaki şema).',
      run: (runtime, args, raw) =>
        runtime.start({
          workload: String(args.workload),
          params: raw.params,
          durationMs: Number(args.durationMs),
          warmupMs: Number(args.warmupMs),
        }),
    },
    {
      name: 'run',
      summary: 'start + bitişi bekle: koşu raporunu (yargı dahil) döndürür.',
      args: runArgs,
      objectArgs: ['params'],
      notes: 'params: yükün parametre nesnesi. Zaman aşımı ısınma + süre + 15 sn.',
      run: async (runtime, args, raw) => {
        const durationMs = Number(args.durationMs);
        const warmupMs = Number(args.warmupMs);
        const started = await runtime.start({
          workload: String(args.workload),
          params: raw.params,
          durationMs,
          warmupMs,
        });
        if (!started.ok) return started;
        const report = await runtime.waitFinished(durationMs + warmupMs + 15_000);
        return report === null ? fail('timeout', 'Koşu zamanında bitmedi.') : ok(report);
      },
    },
    {
      name: 'stop',
      summary: 'Sürmekte olan koşuyu hemen bitirir ve raporu döndürür (bittiyse son rapor).',
      args: [],
      run: (runtime) => runtime.stop(),
    },
    {
      name: 'reset',
      summary: 'Yükü söker ve boşa döner; günlük ve son rapor kalır.',
      args: [],
      run: (runtime) => {
        runtime.reset();
        return ok(runtime.status());
      },
    },
    {
      name: 'metrics',
      summary: 'Canlı ölçüm: kare özeti (yüzdelikler), GPU, yük sayaçları, günlük sayaçları.',
      args: [],
      run: (runtime) => ok(runtime.metrics()),
    },
    {
      name: 'telemetry',
      summary: 'Günlük kayıtları, `since` imleciyle artımlı: records, next, dropped.',
      args: [
        {
          name: 'since',
          type: 'integer',
          default: 0,
          min: 0,
          max: Number.MAX_SAFE_INTEGER,
          description: 'bu sıra numarasından sonrası',
        },
        {
          name: 'limit',
          type: 'integer',
          default: 200,
          min: 1,
          max: 4000,
          description: 'en çok kayıt',
        },
        {
          name: 'minLevel',
          type: 'choice',
          default: 'debug',
          choices: LEVELS,
          description: 'bunun altını ele',
        },
      ],
      run: (runtime, args) =>
        ok(runtime.log.since(Number(args.since), Number(args.limit), args.minLevel as LabLevel)),
    },
    {
      name: 'verdict',
      summary: 'Son koşunun yargısı; donanım şartı ve taban çizgiyle yeniden yargılanabilir.',
      args: [
        {
          name: 'requireHardware',
          type: 'boolean',
          default: false,
          description: 'donanım dışı çiziciyi inconclusive say',
        },
      ],
      objectArgs: ['baseline'],
      notes:
        'baseline: önceki koşu raporundan {workload, paramsKey, engine, rendererClass, workP95Ms, intervalP99Ms}.',
      run: (runtime, args, raw) => {
        const baseline = parseBaseline(raw.baseline);
        if (typeof baseline === 'string') return fail('bad-args', baseline);
        const verdict = runtime.rejudge(
          { requireHardware: args.requireHardware === true },
          baseline,
        );
        return verdict === null ? fail('no-run', 'Henüz biten koşu yok.') : ok(verdict);
      },
    },
    {
      name: 'environment',
      summary: 'Ortam: motor, çizici (SwiftShader mı), yenileme hızı, DPR, görünürlük.',
      args: [],
      run: (runtime) => ok(runtime.environment()),
    },
    {
      name: 'errors',
      summary: 'Hata ve uyarı sayıları ile son kayıtlar (sayfa hataları, konsol, kaynak yükleme).',
      args: [
        {
          name: 'limit',
          type: 'integer',
          default: 20,
          min: 1,
          max: 200,
          description: 'son kaç kayıt',
        },
      ],
      run: (runtime, args) => {
        const page = runtime.log.since(0, 4000, 'warn');
        return ok({
          errors: runtime.log.counts.error,
          warnings: runtime.log.counts.warn,
          recent: page.records.slice(-Number(args.limit)),
        });
      },
    },
    {
      name: 'action',
      summary: 'Çalışan yükün adlandırılmış eylemini uygular (workloads.actions).',
      args: [
        {
          name: 'name',
          type: 'choice',
          default: actionNames[0] ?? '',
          choices: actionNames,
          required: true,
          description: 'eylem adı (çalışan yükün workloads.actions listesinden)',
        },
      ],
      objectArgs: ['args'],
      notes: 'args: eylemin argüman nesnesi (workloads komutundaki şema).',
      run: (runtime, args, raw) => {
        const given = raw.args;
        if (given !== undefined && !isRecord(given))
          return fail('bad-args', 'args bir nesne olmalı');
        return runtime.action(String(args.name), given ?? {});
      },
    },
  ];
  return commands;
}

/** Komutu çözer, argümanı doğrular ve çalıştırır. Hiçbir koşulda fırlatmaz: sonuç her zaman zarftır. */
export async function dispatch(
  commands: readonly CommandDef[],
  runtime: LabRuntime,
  name: string,
  input: unknown,
): Promise<Outcome<unknown>> {
  const command = commands.find((candidate) => candidate.name === name);
  if (command === undefined)
    return fail(
      'unknown-command',
      `Bilinmeyen komut: ${name} (geçerli: ${commands.map((c) => c.name).join(', ')})`,
    );
  if (input !== undefined && input !== null && !isRecord(input))
    return fail('bad-args', 'Argümanlar bir nesne olmalı.');
  const raw = isRecord(input) ? input : {};
  const scalars = Object.fromEntries(
    Object.entries(raw).filter(([key]) => command.args.some((spec) => spec.name === key)),
  );
  const objectArgs = command.objectArgs ?? [];
  const extra = Object.keys(raw).filter(
    (key) => !command.args.some((spec) => spec.name === key) && !objectArgs.includes(key),
  );
  if (extra.length > 0)
    return fail(
      'bad-args',
      `Bilinmeyen argüman: ${extra.join(', ')} (geçerli: ${[...command.args.map((spec) => spec.name), ...objectArgs].join(', ') || 'yok'})`,
    );
  const resolved = resolveParams(command.args, scalars);
  if (!resolved.ok) return fail('bad-args', resolved.message);
  try {
    return await command.run(runtime, resolved.values, raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    runtime.log.error('lab', 'command.threw', { command: name, message });
    return fail('internal', message);
  }
}
