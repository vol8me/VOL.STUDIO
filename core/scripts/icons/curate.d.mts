export const SPRITE_PREFIX: string;
export function authorOf(folder: string): { folder: string; name: string; license: string };
export function roundPath(d: string): string;
export function parseGameIcon(svg: string, label?: string): string[];
export function buildIcons(input: {
  curation: { id: string; category: string; source: string }[];
  readSource: (source: string) => string;
}): Map<string, string>;
