export const SPRITE_PREFIX: string;
export const ICON_GRID: number;
export function roundPath(d: string): string;
export function parsePhosphorIcon(svg: string, label?: string): string[];
export function buildIcons(input: {
  curation: { id: string; category: string; source: string }[];
  readSource: (source: string) => string;
}): Map<string, string>;
