export const CURSOR_SIZE: number;
export const RETICLE_SIZE: number;
export function pathsOf(svg: string, label: string): string[];
export function hotspotOf(
  kind: string | [number, number],
  outlinePaths: string[],
  label: string,
): [number, number];
export function buildCursors(input: {
  curation: {
    cursors: { id: string; set: string; source: string; hotspot: string | [number, number] }[];
    reticles: { id: string; source: string }[];
  };
  readCursor: (variant: 'Basic' | 'Outline', name: string) => string;
  readReticle: (name: string) => string;
}): Map<string, string>;
