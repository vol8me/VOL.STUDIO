import { describe, expect, it } from 'vitest';
import {
  buildGStreamerScannerCandidates,
  extractGStreamerPluginFilename,
  OPTIONAL_GSTREAMER_ELEMENTS,
  REQUIRED_GSTREAMER_ELEMENTS,
} from '../../../scripts/linux-appimage-media.mjs';

describe('Linux AppImage GStreamer sözleşmesi', () => {
  it('gst-inspect çıktısından dağıtıma özgü plugin yolunu çıkarır', () => {
    const output = `Plugin Details:\n  Name app\n  Filename /usr/lib64/gstreamer-1.0/libgstapp.so\n`;
    expect(extractGStreamerPluginFilename(output)).toBe('/usr/lib64/gstreamer-1.0/libgstapp.so');
    expect(extractGStreamerPluginFilename('Filename alanı yok')).toBeNull();
  });

  it('WebKit, OGG/Vorbis ve en az bir ses çıkışı için gereken elementleri korur', () => {
    expect(REQUIRED_GSTREAMER_ELEMENTS).toEqual(
      expect.arrayContaining([
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
      ]),
    );
    expect(OPTIONAL_GSTREAMER_ELEMENTS).toEqual(
      expect.arrayContaining(['pipewiresink', 'alsasink']),
    );
  });

  it('scanner için env, pkg-config, Fedora ve Debian yollarını sırayla üretir', () => {
    const candidates = buildGStreamerScannerCandidates({
      envOverride: '/opt/gst/scanner',
      pluginScannerDir: '/custom/scanners',
      libexecDir: '/custom/libexec',
      arch: 'x64',
    });

    expect(candidates.slice(0, 3)).toEqual([
      '/opt/gst/scanner',
      '/custom/scanners/gst-plugin-scanner',
      '/custom/libexec/gstreamer-1.0/gst-plugin-scanner',
    ]);
    expect(candidates).toContain('/usr/libexec/gstreamer-1.0/gst-plugin-scanner');
    expect(candidates).toContain(
      '/usr/lib/x86_64-linux-gnu/gstreamer1.0/gstreamer-1.0/gst-plugin-scanner',
    );
  });
});
