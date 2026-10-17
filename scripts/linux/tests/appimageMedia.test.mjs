import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  oggDecodePipeline,
  buildGStreamerScannerCandidates,
  extractGStreamerPluginFilename,
  OPTIONAL_GSTREAMER_ELEMENTS,
  REQUIRED_GSTREAMER_ELEMENTS,
} from '../appimage-media.mjs';

const mediaToolsAvailable = ['ffmpeg', 'gst-launch-1.0'].every(
  (command) => spawnSync(command, ['--version'], { stdio: 'ignore' }).error === undefined,
);

test('gst-inspect çıktısından dağıtıma özgü plugin yolunu çıkarır', () => {
  const output = `Plugin Details:\n  Name app\n  Filename /usr/lib64/gstreamer-1.0/libgstapp.so\n`;
  assert.equal(extractGStreamerPluginFilename(output), '/usr/lib64/gstreamer-1.0/libgstapp.so');
  assert.equal(extractGStreamerPluginFilename('Filename alanı yok'), null);
});

test('WebKit, OGG/Vorbis ve en az bir ses çıkışı için gereken elementleri korur', () => {
  for (const element of [
    'appsink',
    'appsrc',
    'autoaudiosink',
    'giostreamsrc',
    'decodebin',
    'typefindfunctions',
    'deinterleave',
    'oggdemux',
    'vorbisdec',
    'pulsesink',
  ]) {
    assert.ok(REQUIRED_GSTREAMER_ELEMENTS.includes(element), element);
  }
  for (const element of ['pipewiresink', 'alsasink']) {
    assert.ok(OPTIONAL_GSTREAMER_ELEMENTS.includes(element), element);
  }
});

test('scanner için env, pkg-config, Fedora ve Debian yollarını sırayla üretir', () => {
  const candidates = buildGStreamerScannerCandidates({
    envOverride: '/opt/gst/scanner',
    pluginScannerDir: '/custom/scanners',
    libexecDir: '/custom/libexec',
    arch: 'x64',
  });

  assert.deepEqual(candidates.slice(0, 3), [
    '/opt/gst/scanner',
    '/custom/scanners/gst-plugin-scanner',
    '/custom/libexec/gstreamer-1.0/gst-plugin-scanner',
  ]);
  assert.ok(candidates.includes('/usr/libexec/gstreamer-1.0/gst-plugin-scanner'));
  assert.ok(
    candidates.includes('/usr/lib/x86_64-linux-gnu/gstreamer1.0/gstreamer-1.0/gst-plugin-scanner'),
  );
});

test('mono OGG stereo kanal sondasında EOS’a ulaşır', { skip: !mediaToolsAvailable }, () => {
  const temporary = mkdtempSync(join(tmpdir(), 'vol-media-'));
  try {
    const asset = join(temporary, 'mono.ogg');
    execFileSync(
      'ffmpeg',
      [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=0.1',
        '-ac',
        '1',
        '-c:a',
        'libvorbis',
        asset,
      ],
      { timeout: 5000 },
    );
    execFileSync('gst-launch-1.0', oggDecodePipeline(asset), { timeout: 2000, stdio: 'pipe' });
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
