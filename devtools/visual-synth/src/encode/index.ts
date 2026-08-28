/**
 * @volstudio/visual-synth/encode
 *
 * Node-only alt-yol (D8): PNG kodlama ve dosya yazma. Tarayıcı paketine
 * `node:zlib`/`node:fs` sızmasın diye `visual-synth` barrel'ından AYRIdır.
 */
export { decodePng, encodePng, writePng, type DecodedPng } from './png';
export { createVisualArtifact, type VisualArtifact, type VisualArtifactOptions } from './artifact';
