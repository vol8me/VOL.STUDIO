import type { CursorId } from './cursorNames';

/**
 * Bağlamsal imleç tonu: RTS'te renk anlam taşır (kırmızı düşmanla ilgili eylem, yeşil dost
 * eylemi, sarı belirsiz/kaynak, vurgu rengi komut). Renk tek bilgi kanalı değildir: şekil de değişir.
 */
export type CursorTone = 'neutral' | 'friendly' | 'hostile' | 'caution' | 'accent';

export type CursorPalette = Readonly<Record<CursorTone, string>>;

export const DEFAULT_CURSOR_PALETTE: CursorPalette = {
  neutral: '#ffffff',
  friendly: '#7be0a1',
  hostile: '#ff6b6b',
  caution: '#ffd166',
  accent: '#ffb27a',
};

/** Dış çizgi rengi: gövdeden bağımsız, her zeminde okunur. */
export const CURSOR_OUTLINE = '#10141a';

/** RTS'te imleci belirleyen bağlam (oyun, imlecin altındaki şeyi bu adlarla bildirir). */
export type RtsContext =
  | 'idle'
  | 'friendly'
  | 'hostile'
  | 'resource'
  | 'tree'
  | 'blocked'
  | 'move'
  | 'build'
  | 'repair'
  | 'rally'
  | 'patrol'
  | 'garrison'
  | 'cancel'
  | 'look'
  | 'scrollN'
  | 'scrollNE'
  | 'scrollE'
  | 'scrollSE'
  | 'scrollS'
  | 'scrollSW'
  | 'scrollW'
  | 'scrollNW';

export interface CursorChoice {
  readonly id: CursorId;
  readonly tone: CursorTone;
}

const RTS_CHOICES: Readonly<Record<RtsContext, CursorChoice>> = {
  idle: { id: 'select', tone: 'neutral' },
  friendly: { id: 'select', tone: 'friendly' },
  hostile: { id: 'attack', tone: 'hostile' },
  resource: { id: 'mine', tone: 'caution' },
  tree: { id: 'chop', tone: 'caution' },
  blocked: { id: 'denied', tone: 'hostile' },
  move: { id: 'walk', tone: 'neutral' },
  build: { id: 'build', tone: 'accent' },
  repair: { id: 'repair', tone: 'friendly' },
  rally: { id: 'rally', tone: 'accent' },
  patrol: { id: 'patrol', tone: 'neutral' },
  garrison: { id: 'garrison', tone: 'friendly' },
  cancel: { id: 'cancelOrder', tone: 'hostile' },
  look: { id: 'look', tone: 'neutral' },
  scrollN: { id: 'scrollN', tone: 'neutral' },
  scrollNE: { id: 'scrollNE', tone: 'neutral' },
  scrollE: { id: 'scrollE', tone: 'neutral' },
  scrollSE: { id: 'scrollSE', tone: 'neutral' },
  scrollS: { id: 'scrollS', tone: 'neutral' },
  scrollSW: { id: 'scrollSW', tone: 'neutral' },
  scrollW: { id: 'scrollW', tone: 'neutral' },
  scrollNW: { id: 'scrollNW', tone: 'neutral' },
};

/** RTS bağlamından imleç + ton. Bilinmeyen bağlam `idle`a düşer. */
export function rtsCursorFor(context: RtsContext): CursorChoice {
  return RTS_CHOICES[context] ?? RTS_CHOICES.idle;
}

/** Ekran kenarı kaydırma bölgesinden bağlam: imleç kenara `edge` piksel yakınsa ilgili ok. */
export function scrollContextAt(
  point: { x: number; y: number },
  size: { width: number; height: number },
  edge = 16,
): RtsContext | null {
  const north = point.y <= edge;
  const south = point.y >= size.height - edge;
  const west = point.x <= edge;
  const east = point.x >= size.width - edge;
  const key = `${north ? 'N' : south ? 'S' : ''}${east ? 'E' : west ? 'W' : ''}`;
  return key === '' ? null : (`scroll${key}` as RtsContext);
}
