import { SoundFamilyBank } from '@volstudio/core/audio/sfx';
import cannon from '../../audio-banks/vt-hardsteel-cannon.json';
import blast from '../../audio-banks/vt-hardsteel-blast.json';
import hit from '../../audio-banks/vt-hardsteel-hit.json';
import crash from '../../audio-banks/vt-hardsteel-crash.json';
import brake from '../../audio-banks/vt-hardsteel-brake.json';

export const FAMILIES = {
  cannon: SoundFamilyBank.parse(cannon),
  blast: SoundFamilyBank.parse(blast),
  hit: SoundFamilyBank.parse(hit),
  crash: SoundFamilyBank.parse(crash),
  brake: SoundFamilyBank.parse(brake),
};
export type FamilyName = keyof typeof FAMILIES;

export function audioUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^public\//, '')}`;
}

export function blastPath(key: string, distance: 'near' | 'mid' | 'far'): string {
  const variant = FAMILIES.blast.variant(key);
  if (!variant) throw new Error(`Patlama varyantı bulunamadı: ${key}`);
  return distance === 'near'
    ? variant.path
    : `public/assets/audio/sfx/steel/blast-${distance}-${key}.ogg`;
}
