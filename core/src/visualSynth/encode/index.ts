/**
 * @volstudio/core/visualSynth/encode
 *
 * Node-only alt-yol (D8): PNG kodlama ve dosya yazma. Tarayıcı paketine
 * `node:zlib`/`node:fs` sızmasın diye `visualSynth` barrel'ından AYRIdır.
 */
export { decodePng, encodePng, writePng, type DecodedPng } from './png';
export { createVisualArtifact, type VisualArtifact, type VisualArtifactOptions } from './artifact';
