import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { composeTankSvg, type TankSvgParts } from '../src/assets/tank/composeTankSvg';

const root = join(import.meta.dirname, '..');
const names = {
  hull: 'hull',
  turret: 'turret',
  tread: 'tread',
  treadEnd: 'tread-end',
  core: 'core',
  feeler: 'feeler',
};
const parts = Object.fromEntries(
  Object.entries(names).map(([key, name]) => [
    key,
    readFileSync(join(root, 'src/assets/tank', `${name}.svg`), 'utf8'),
  ]),
) as unknown as TankSvgParts;
const tank = composeTankSvg(parts, { size: 1024, heading: -45, turret: -20 });
const body = tank.slice(tank.indexOf('>') + 1, tank.lastIndexOf('</svg>'));
const grid = Array.from({ length: 7 }, (_, i) => 8 + i * 8)
  .map((at) => `<path d="M${at} 4V60M4 ${at}H60"/>`)
  .join('');
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 64 64"><defs><radialGradient id="icon-glow"><stop stop-color="#17463d"/><stop offset="1" stop-color="#0a0d11"/></radialGradient><clipPath id="icon-plate"><rect width="64" height="64" rx="14"/></clipPath></defs><g clip-path="url(#icon-plate)"><rect width="64" height="64" fill="url(#icon-glow)"/><g fill="none" stroke="#9fb3c6" stroke-opacity=".08" stroke-width=".35">${grid}</g><g transform="translate(32 32) scale(.74) translate(-32 -32)">${body}</g></g><rect x=".5" y=".5" width="63" height="63" rx="13.5" fill="none" stroke="#52f5cf" stroke-opacity=".35"/></svg>\n`;
writeFileSync(join(root, 'src-tauri/app-icon.svg'), icon);
