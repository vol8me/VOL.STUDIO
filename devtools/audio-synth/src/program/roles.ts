/**
 * Katman rolleri — bir sesin `transient → body → detail → tail → space`
 * ayrışımının kapalı sözlüğü (+ sürekli doku, mekanizma, tonal çekirdek).
 * Rol SES ÜRETMEZ: stil rol dengesini, planlayıcı topolojiyi ve SoundGraph
 * izdüşümü okunabilirliği bu adlardan kurar. Serbest metin değil, kapalı
 * listedir — yazım hatası sessiz kalmaz.
 */
export const LAYER_ROLES = [
  'transient',
  'body',
  'detail',
  'tail',
  'space',
  'texture',
  'mechanism',
  'tonal',
] as const;

export type LayerRole = (typeof LAYER_ROLES)[number];
