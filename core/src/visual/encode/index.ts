/**
 * @volstudio/core/visual/encode
 *
 * Node-only alt-yol (D8): PNG kodlama ve dosya yazma. Tarayıcı paketine
 * `node:zlib`/`node:fs` sızmasın diye `visual` barrel'ından AYRIdır.
 */
export { decodePng, encodePng, writePng, type DecodedPng } from './png';
export { createVisualArtifact, type VisualArtifact, type VisualArtifactOptions } from './artifact';
