import { TANK } from '@/config/tank';

export interface TankSvgParts {
  hull: string;
  turret: string;
  tread: string;
  treadEnd: string;
  core: string;
  feeler: string;
}

export interface TankSvgOptions {
  size: number;
  heading: number;
  turret: number;
}

/** Aynı parça birden çok kez yerleşebilir; boya ve clip kimlikleri örneğe özeldir. */
function sprite(source: string, id: string, x: number, y: number, scale = 1): string {
  const match = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(source);
  if (!match) throw new Error('Tank parçasında viewBox yok');
  const width = Number(match[1]);
  const height = Number(match[2]);
  const renamed = source
    .replace(/id="([^"]+)"/g, `id="${id}-$1"`)
    .replace(/url\(#([^)]*)\)/g, `url(#${id}-$1)`);
  const nested = renamed.replace(
    /<svg\b[^>]*>/,
    `<svg x="${x}" y="${y}" width="${width * scale}" height="${
      height * scale
    }" viewBox="0 0 ${width} ${height}" overflow="visible">`,
  );
  return nested;
}

export function composeTankSvg(parts: TankSvgParts, options: TankSvgOptions): string {
  const height = 2 * (TANK.halfWidth - TANK.trackOffset);
  const length = 2 * TANK.halfLength - height;
  let sequence = 0;
  const place = (name: keyof TankSvgParts, x: number, y: number, scale = 1): string =>
    `<g data-part="${name}">${sprite(parts[name], `${name}-${sequence++}`, x, y, scale)}</g>`;
  const treads = [-1, 1]
    .map((side) => {
      const y = side * TANK.trackOffset;
      const ends = [-1, 1]
        .map((end) =>
          place(
            'treadEnd',
            (end * length) / 2 - (height * 6) / 11.2,
            y - (height * 6) / 11.2,
            height / 11.2,
          ),
        )
        .join('');
      const clip = `band-${sequence++}`;
      const tiles = Array.from({ length: Math.ceil(length / 8) }, (_, i) =>
        place('tread', -length / 2 + i * 8, y - height / 2),
      ).join('');
      return `<defs><clipPath id="${clip}"><rect x="${-length / 2}" y="${
        y - height / 2
      }" width="${length}" height="${height}"/></clipPath></defs>${ends}<g clip-path="url(#${clip})">${tiles}</g>`;
    })
    .join('');
  const feelers = [-1, 1]
    .map(
      (side) =>
        `<g transform="translate(-17 ${side * 6.5}) rotate(${
          180 - (side * 0.35 * 180) / Math.PI
        })">${place('feeler', -1, -3)}</g>`,
    )
    .join('');
  const body =
    feelers +
    place('hull', -24, -18) +
    place('core', -12, -12, 0.75) +
    `<g transform="rotate(${options.turret - options.heading})">${place('turret', -12, -12)}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${options.size}" height="${options.size}" viewBox="0 0 64 64"><g transform="translate(32 32) rotate(${options.heading})">${treads}${body}</g></svg>`;
}
