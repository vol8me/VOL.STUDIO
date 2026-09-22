import { describe, expect, it } from 'vitest';
import { AudioParamError } from '../../src/guard/errors';
import { sha256Bytes } from '../../src/protocol/canonical';
import {
  validateAnalysisRecord,
  validateJob,
  validateRenderRecord,
  validateSelection,
} from '../../src/protocol/records';
import { edited, type Edit } from '../support/json';

const H = sha256Bytes('x');
const RID = 'r-0123456789abcdef';

const job = {
  schema: 'AudioJobV1',
  protocolVersion: 1,
  jobId: 'knock',
  kind: 'acoustic',
  target: {
    package: '@volstudio/audio-synth',
    asset: 'reference/production/assets/sfx/knock.ogg',
    integration: { runtimeKey: null, loop: false },
  },
  stage: 'published',
  revision: 3,
  artifacts: {
    brief: { path: 'brief.json', hash: H },
    program: { path: 'program.json', hash: H, brief: H },
    renders: { [RID]: { path: `renders/${RID}.json`, hash: H } },
    analyses: { [RID]: { path: `analyses/${RID}.json`, hash: H } },
    selection: { path: 'selection.json', hash: H },
    publication: {
      path: 'devtools/audio-synth/reference/production/manifests/sfx/knock.json',
      hash: H,
    },
  },
};

const render = {
  schema: 'AudioRenderRecordV1',
  renderId: RID,
  programHash: H,
  seed: 1,
  rendererVersion: 1,
  pcm: { hash: H, sampleRate: 48000, channels: 1, frames: 10 },
  cost: { peakBytes: 1, workUnits: 1 },
};

const analysis = {
  schema: 'AudioAnalysisRecordV1',
  renderId: RID,
  renderHash: H,
  pcmHash: H,
  report: { schema: 'AudioAnalysisReportV1', measuredFrom: 'source-pcm' },
};

const selection = {
  schema: 'AudioSelectionV1',
  renderId: RID,
  renderHash: H,
  analysisHash: H,
  pcmHash: H,
  reason: 'tek aday',
};

describe('protokol kayıt doğrulayıcıları', () => {
  it('geçerli kayıtlar geçer', () => {
    expect(validateJob(job)).toBe(job);
    expect(validateRenderRecord(render)).toBe(render);
    expect(validateAnalysisRecord(analysis)).toBe(analysis);
    expect(validateSelection(selection)).toBe(selection);
  });

  it.each<[string, Edit]>([
    ['şema', [['schema'], 'AudioJobV2']],
    ['protokol sürümü', [['protocolVersion'], 2]],
    ['job kimliği', [['jobId'], 'Knock!']],
    ['kind', [['kind'], 'music']],
    ['paket adı', [['target', 'package'], 'audio-synth']],
    ['mutlak asset', [['target', 'asset'], '/etc/passwd']],
    ['runtime anahtarı', [['target', 'integration', 'runtimeKey'], 'A B']],
    ['loop', [['target', 'integration', 'loop'], 'no']],
    ['aşama', [['stage'], 'mastered']],
    ['revizyon', [['revision'], -1]],
    ['brief yolu', [['artifacts', 'brief', 'path'], '../brief.json']],
    ['özet biçimi', [['artifacts', 'program', 'brief'], 'md5:abc']],
    [
      'render kimliği',
      [['artifacts', 'renders'], { 'r-zz': { path: 'renders/r-zz.json', hash: H } }],
    ],
    ['render yolu', [['artifacts', 'renders', RID, 'path'], 'renders/other.json']],
    ['yayın yolu', [['artifacts', 'publication', 'path'], 'C:/x.json']],
    ['bilinmeyen alan', [['artifacts', 'extra'], 1]],
  ])('job: %s reddedilir', (_label, edit) => {
    expect(() => validateJob(edited(job, edit))).toThrow(AudioParamError);
  });

  it.each<[string, (value: unknown) => unknown, unknown, Edit]>([
    ['render şeması', validateRenderRecord, render, [['schema'], 'x']],
    ['render tohumu', validateRenderRecord, render, [['seed'], 2 ** 33]],
    ['render kanalı', validateRenderRecord, render, [['pcm', 'channels'], 3]],
    ['render maliyeti', validateRenderRecord, render, [['cost', 'workUnits'], -1]],
    ['analiz şeması', validateAnalysisRecord, analysis, [['schema'], 'x']],
    ['analiz raporu', validateAnalysisRecord, analysis, [['report', 'schema'], 'x']],
    [
      'analiz kaynağı',
      validateAnalysisRecord,
      analysis,
      [['report', 'measuredFrom'], 'decoded-encoded'],
    ],
    ['seçim şeması', validateSelection, selection, [['schema'], 'x']],
    ['seçim gerekçesi', validateSelection, selection, [['reason'], 'x'.repeat(2001)]],
    ['seçim özeti', validateSelection, selection, [['pcmHash'], 'sha256:00']],
  ])('%s reddedilir', (_label, validate, doc, edit) => {
    expect(() => validate(edited(doc, edit))).toThrow(AudioParamError);
  });
});
