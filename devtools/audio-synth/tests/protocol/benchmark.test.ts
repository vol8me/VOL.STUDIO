import { describe, expect, it } from 'vitest';
import { validateBenchmarkReport } from '../../src/protocol/benchmark';

const HASH = 'sha256:' + '0'.repeat(64);
function report() {
  return {
    schema: 'BenchmarkReportV2',
    engine: {
      programRenderer: 1,
      musicRenderer: 1,
      analyzer: 1,
      checks: 1,
      registryHash: HASH,
      instrumentRegistryHash: HASH,
    },
    tasks: [
      {
        id: 'knock',
        version: 1,
        category: 'impact',
        sourceHash: HASH,
        pass: true,
        parts: [
          {
            id: 'main',
            source: 'acoustic',
            programHash: HASH,
            pcmHash: HASH,
            checks: [{ kind: 'clipping', pass: true, measured: 0, reason: null }],
          },
        ],
      },
    ],
    canaries: [
      {
        id: 'bubble',
        version: 1,
        sourceHash: HASH,
        pass: true,
        programHash: HASH,
        pcmHash: HASH,
        checks: [{ kind: 'descriptor', pass: true, measured: 1, reason: null }],
      },
    ],
  };
}

describe('kayıtlı benchmark rapor sözleşmesi', () => {
  it('kaydedilen teknik sonuç hash ve ölçüleriyle yeniden okunur', () => {
    const serialized = JSON.parse(JSON.stringify(report())) as unknown;
    const checked = validateBenchmarkReport(serialized);
    expect(checked.tasks[0].parts[0].checks[0]).toEqual({
      kind: 'clipping',
      pass: true,
      measured: 0,
      reason: null,
    });
    expect(checked.canaries[0].pcmHash).toBe(HASH);
  });
  it('düşen kontrol görev ve canary sonucuna tutarlı yansır', () => {
    const value = report();
    value.tasks[0].pass = false;
    value.tasks[0].parts[0].checks[0].pass = false;
    value.canaries[0].pass = false;
    value.canaries[0].checks[0].pass = false;
    expect(validateBenchmarkReport(value).tasks[0].pass).toBe(false);
    expect(validateBenchmarkReport(value).canaries[0].pass).toBe(false);
  });
  it.each([
    [
      'eski sürüm',
      (r: ReturnType<typeof report>) => {
        r.schema = 'BenchmarkReportV1';
      },
      /BenchmarkReportV2/,
    ],
    [
      'renderer sürümü',
      (r: ReturnType<typeof report>) => {
        r.engine.programRenderer = -1;
      },
      /engine.programRenderer/,
    ],
    [
      'registry kimliği',
      (r: ReturnType<typeof report>) => {
        r.engine.registryHash = 'bozuk';
      },
      /engine.registryHash/,
    ],
    [
      'kaynak kimliği',
      (r: ReturnType<typeof report>) => {
        r.tasks[0].sourceHash = 'bozuk';
      },
      /sourceHash/,
    ],
    [
      'PCM kimliği',
      (r: ReturnType<typeof report>) => {
        r.tasks[0].parts[0].pcmHash = 'bozuk';
      },
      /pcmHash/,
    ],
    [
      'canary kimliği',
      (r: ReturnType<typeof report>) => {
        r.canaries[0].pcmHash = 'bozuk';
      },
      /pcmHash/,
    ],
    [
      'görev tekrarı',
      (r: ReturnType<typeof report>) => {
        r.tasks.push(r.tasks[0]);
      },
      /yinelenen kimlik/,
    ],
    [
      'canary tekrarı',
      (r: ReturnType<typeof report>) => {
        r.canaries.push(r.canaries[0]);
      },
      /yinelenen kimlik/,
    ],
    [
      'parçasız görev',
      (r: ReturnType<typeof report>) => {
        r.tasks[0].parts = [];
      },
      /parts/,
    ],
    [
      'yanlış kaynak türü',
      (r: ReturnType<typeof report>) => {
        r.tasks[0].parts[0].source = 'yok';
      },
      /source/,
    ],
    [
      'tutarsız görev sonucu',
      (r: ReturnType<typeof report>) => {
        r.tasks[0].pass = false;
      },
      /pass/,
    ],
    [
      'tutarsız canary sonucu',
      (r: ReturnType<typeof report>) => {
        r.canaries[0].pass = false;
      },
      /pass/,
    ],
  ] as const)('%s sessizce kabul edilmez', (_, mutate, expected) => {
    const value = report();
    mutate(value);
    expect(() => validateBenchmarkReport(value)).toThrow(expected);
  });
  it('eski kabul alanı yeni şemaya taşınamaz', () => {
    const value = report();
    expect(() =>
      validateBenchmarkReport({
        ...value,
        tasks: [{ ...value.tasks[0], review: 'heard-acceptable' }],
      }),
    ).toThrow(/review/);
  });
  it('bozuk kontrol türü ve gerekçe reddedilir', () => {
    const value = report();
    const part = value.tasks[0].parts[0];
    expect(() =>
      validateBenchmarkReport({
        ...value,
        tasks: [
          {
            ...value.tasks[0],
            parts: [
              { ...part, checks: [{ kind: 'clipping', pass: 'yes', measured: 0, reason: null }] },
            ],
          },
        ],
      }),
    ).toThrow(/checks/);
    expect(() =>
      validateBenchmarkReport({
        ...value,
        tasks: [
          {
            ...value.tasks[0],
            parts: [
              { ...part, checks: [{ kind: 'clipping', pass: true, measured: 0, reason: 5 }] },
            ],
          },
        ],
      }),
    ).toThrow(/checks/);
  });
});
