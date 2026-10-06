import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeFrames, nominalHz, parseFrameStats, summarizeFrameStats } from '../frameStats.mjs';

const HEADER =
  'Flags,FrameTimelineVsyncId,IntendedVsync,Vsync,InputEventId,HandleInputStart,AnimationStart,PerformTraversalsStart,DrawStart,FrameDeadline,FrameInterval,FrameStartTime,SyncQueued,SyncStart,IssueDrawCommandsStart,SwapBuffers,FrameCompleted,DequeueBufferDuration,QueueBufferDuration,GpuCompleted,SwapBuffersCompleted,DisplayPresentTime,CommandSubmissionCompleted,';
const LEGACY_HEADER =
  'Flags,IntendedVsync,Vsync,InputEventId,HandleInputStart,FrameDeadline,FrameCompleted,';

/** 8,333 ms aralıklı (120 Hz) kare satırı üretir; değerler ns. */
function row(index, over = {}) {
  const base = 1_000_000_000 + index * 8_333_333;
  const values = {
    Flags: 0,
    FrameTimelineVsyncId: 500 + index,
    IntendedVsync: base,
    Vsync: base,
    InputEventId: 0,
    HandleInputStart: base + 500_000,
    AnimationStart: base + 600_000,
    PerformTraversalsStart: base + 700_000,
    DrawStart: base + 800_000,
    FrameDeadline: base + 16_000_000,
    FrameInterval: base,
    FrameStartTime: 8_333_333,
    SyncQueued: base + 1_000_000,
    SyncStart: base + 1_100_000,
    IssueDrawCommandsStart: base + 1_200_000,
    SwapBuffers: base + 4_000_000,
    FrameCompleted: base + 7_000_000,
    DequeueBufferDuration: 30_000,
    QueueBufferDuration: 370_000,
    GpuCompleted: base + 7_000_000,
    SwapBuffersCompleted: base + 4_500_000,
    DisplayPresentTime: base + 32_000_000,
    CommandSubmissionCompleted: base + 4_000_000,
    ...over,
  };
  return `${Object.values(values).join(',')},`;
}

const dump = (rows, header = HEADER) =>
  [
    'Applications Graphics Acceleration Info:',
    '---PROFILEDATA---',
    header,
    ...rows,
    '---PROFILEDATA---',
    'View hierarchy:',
  ].join('\n');

test('ayrıştırıcı yalnız PROFILEDATA bloğundaki sayısal satırları sütun adıyla okur', () => {
  const parsed = parseFrameStats(dump([row(0), row(1), 'bozuk,satır', '12,34,']));
  assert.equal(parsed.columns.length, 23);
  assert.equal(parsed.frames.length, 2);
  assert.equal(parsed.frames[1].FrameTimelineVsyncId, 501);
  assert.deepEqual(parseFrameStats('boş çıktı'), { columns: [], frames: [] });
});

test('özet: 120 Hz, sunum gecikmesi, GPU ve süre aşımı ayrı kapsamlar', () => {
  const rows = Array.from({ length: 30 }, (_, index) => row(index));
  rows[10] = row(10, { FrameCompleted: 1_000_000_000 + 10 * 8_333_333 + 20_000_000 });
  const summary = summarizeFrameStats(parseFrameStats(dump(rows)));
  assert.equal(summary.validFrames, 30);
  assert.equal(summary.hz, 120);
  assert.equal(summary.presentation.status, 'measured');
  assert.equal(summary.presentation.basis, 'display-present-time');
  assert.equal(summary.presentation.intendedToPresentMs.p50, 32);
  assert.equal(summary.render.deadlineMisses, 1);
  assert.equal(summary.render.intendedToGpuCompletedMs.p50, 7);
  // Girdi karesi yok: ölçülmedi, sıfır değil.
  assert.equal(summary.input.status, 'not-run');
});

test('girdi karesi: HandleInputStart → DisplayPresentTime ve çekirdek zamanı dahil değil notu', () => {
  const rows = [
    row(0),
    row(1, { InputEventId: 77, HandleInputStart: 1_008_333_333 + 5_000_000 }),
    row(2),
  ];
  const summary = summarizeFrameStats(parseFrameStats(dump(rows)));
  assert.equal(summary.input.status, 'measured');
  assert.equal(summary.input.handleToPresentMs.samples, 1);
  // 32 ms present − 5 ms handle ofseti = 27 ms.
  assert.ok(Math.abs(summary.input.handleToPresentMs.p50 - 27) < 0.01);
  assert.match(summary.input.note, /çekirdek olay zamanı/);
});

test('bayraklı (atlanan) kareler özetten çıkar ve sayılır', () => {
  const rows = [row(0), row(1, { Flags: 1 }), row(2)];
  const summary = summarizeFrameStats(parseFrameStats(dump(rows)));
  assert.equal(summary.frames, 3);
  assert.equal(summary.validFrames, 2);
  assert.equal(summary.skippedFrames, 1);
});

test('eski Android: sunum ve girdi sütunu yoksa unsupported, GPU süresi yoksa boş', () => {
  const legacy = [
    '1,1000000000,1000000000,0,0,1016000000,1007000000,',
    '0,1008333333,1008333333,0,0,1024000000,1015000000,',
    '0,1016666666,1016666666,0,0,1032000000,1023000000,',
  ];
  const summary = summarizeFrameStats(parseFrameStats(dump(legacy, LEGACY_HEADER)));
  assert.equal(summary.presentation.status, 'unsupported');
  assert.match(summary.presentation.reason, /DisplayPresentTime sütunu yok/);
  assert.equal(summary.input.status, 'unsupported');
  assert.equal(summary.render.intendedToGpuCompletedMs, null);
  assert.equal(summary.validFrames, 2);
});

test('sunum sütunu var ama hiç dolu değilse unsupported (tahmin edilmez)', () => {
  const rows = [row(0, { DisplayPresentTime: 0 }), row(1, { DisplayPresentTime: 0 })];
  const summary = summarizeFrameStats(parseFrameStats(dump(rows)));
  assert.equal(summary.presentation.status, 'unsupported');
  assert.match(summary.presentation.reason, /hiçbir karede dolu değil/);
});

test('birleştirme tekrar eden kareleri tekilleştirir ve sıralar', () => {
  const a = parseFrameStats(dump([row(0), row(1), row(2)]));
  const b = parseFrameStats(dump([row(2), row(3)]));
  const merged = mergeFrames(b, a);
  assert.deepEqual(
    merged.frames.map((frame) => frame.FrameTimelineVsyncId),
    [500, 501, 502, 503],
  );
});

test('yenileme hızı yalnız bilinen hızlara ±%4 yakınsa verilir', () => {
  assert.equal(nominalHz(8.333), 120);
  assert.equal(nominalHz(16.667), 60);
  assert.equal(nominalHz(11.11), 90);
  assert.equal(nominalHz(22), null);
  assert.equal(nominalHz(0), null);
  assert.equal(nominalHz(null), null);
});
