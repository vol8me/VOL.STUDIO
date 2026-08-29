/**
 * WebKitGTK'nin Web Audio ve OGG/Vorbis oynatımı için zorunlu GStreamer
 * elementleri. Element adı kullanmak Fedora'nın `/usr/lib64` ve Debian'ın
 * `/usr/lib/x86_64-linux-gnu` dizilimlerini aynı kodla destekler.
 */
export const REQUIRED_GSTREAMER_ELEMENTS = Object.freeze([
  'appsink',
  'appsrc',
  'autoaudiosink',
  'giostreamsrc',
  'decodebin',
  'filesrc',
  'typefind',
  // `typefind` elementi coreelements içindedir; gerçek OGG imza tanıyıcıları
  // ayrı typefindfunctions plugin'inde yaşar. WebKit decodebin bu plugin
  // olmadan dosyayı açar ama akışın türünü belirleyemez.
  'typefindfunctions',
  'queue',
  'fakesink',
  'audioconvert',
  'audioresample',
  'audiorate',
  // WebKit AudioFileReader stereo tamponları kanal başına ayırır.
  'deinterleave',
  'volume',
  'oggdemux',
  'vorbisdec',
  'pulsesink',
]);

/** Doğrudan PipeWire/ALSA çıkışı varsa Pulse uyumluluk katmanına alternatif olur. */
export const OPTIONAL_GSTREAMER_ELEMENTS = Object.freeze(['pipewiresink', 'alsasink']);

/** `gst-inspect-1.0` çıktısından elementin gerçek plugin dosyasını çıkarır. */
export function extractGStreamerPluginFilename(output) {
  const match = /^\s*Filename\s+(\/\S.*)$/m.exec(output);
  return match?.[1].trim() || null;
}

/**
 * Plugin scanner yolu dağıtımlar arasında standart değildir. pkg-config
 * geliştirme paketi kuruluysa verdiği dizinler öne alınır; yalnız runtime
 * paketi olan Fedora/Debian kurulumları bilinen sistem yollarına düşer.
 */
export function buildGStreamerScannerCandidates({
  envOverride,
  pluginScannerDir,
  libexecDir,
  arch = process.arch,
} = {}) {
  const multiarch = arch === 'arm64' ? 'aarch64-linux-gnu' : 'x86_64-linux-gnu';
  const candidates = [
    envOverride,
    pluginScannerDir && `${pluginScannerDir}/gst-plugin-scanner`,
    libexecDir && `${libexecDir}/gstreamer-1.0/gst-plugin-scanner`,
    '/usr/libexec/gstreamer-1.0/gst-plugin-scanner',
    '/usr/lib/gstreamer-1.0/gst-plugin-scanner',
    '/usr/lib64/gstreamer-1.0/gst-plugin-scanner',
    `/usr/lib/${multiarch}/gstreamer1.0/gstreamer-1.0/gst-plugin-scanner`,
  ].filter(Boolean);
  return [...new Set(candidates)];
}
