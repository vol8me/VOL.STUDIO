/**
 * Kategori sözlüğü — §8.11 ve §10.2'nin ORTAK kaynağı.
 *
 * Editörün çıktı klasörleri ile preset kataloğunun kategorileri aynı olmak
 * zorunda: iki yerde ayrı ayrı büyüyen iki taksonomi kaçınılmaz olarak
 * ayrışır ve bir süre sonra `metal` ile `metaller` yan yana durur.
 *
 * Kategoriler bir TÜRÜ (genre) değil malzeme/biçim ailesini adlandırır;
 * `primitiveNeutrality` bekçisi bunu tarar.
 */
export const PRESET_CATEGORIES = [
  'material',
  'terrain',
  'organic',
  'liquid',
  'mineral',
  'structure',
  'effect',
] as const;

export type PresetCategory = (typeof PRESET_CATEGORIES)[number];

export function isPresetCategory(value: unknown): value is PresetCategory {
  return typeof value === 'string' && (PRESET_CATEGORIES as readonly string[]).includes(value);
}
