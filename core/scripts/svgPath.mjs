/**
 * SVG yol verisi yardımcıları (ikon ve imleç kürasyonu ortak kullanır).
 */

const ARITY = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
const NUMBER = /^[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/;

const round1 = (value) => {
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

/**
 * Yol verisini 1 ondalığa yuvarlar. Sıkıştırılmış yazım ("5.5.5", "a1 1 0 01.5-3") komut
 * ayrıştırılarak okunur: yay bayrakları (0/1) tek karakterdir ve yuvarlamaya girmez; sayıyı
 * körü körüne yeniden yazmak bayrağı bir sonraki sayıya yapıştırıp şekli bozardı.
 */
export function roundPath(d) {
  let rest = d.trim();
  let out = '';
  while (rest.length > 0) {
    const command = rest[0];
    const arity = ARITY[command.toLowerCase()];
    if (arity === undefined) throw new Error(`yol komutu tanınmıyor: ${command}`);
    rest = rest.slice(1);
    const numbers = [];
    const read = () => {
      rest = rest.replace(/^[\s,]+/, '');
      const match = NUMBER.exec(rest);
      if (!match) return null;
      rest = rest.slice(match[0].length);
      return match[0];
    };
    const readFlag = () => {
      rest = rest.replace(/^[\s,]+/, '');
      const flag = rest[0];
      if (flag !== '0' && flag !== '1') return null;
      rest = rest.slice(1);
      return flag;
    };
    if (arity === 0) {
      out += command;
      rest = rest.replace(/^[\s,]+/, '');
      continue;
    }
    for (;;) {
      const group = [];
      for (let index = 0; index < arity; index += 1) {
        const isFlag = command.toLowerCase() === 'a' && (index === 3 || index === 4);
        const token = isFlag ? readFlag() : read();
        if (token === null) {
          if (index === 0) break;
          throw new Error(`yol parametresi eksik: ${command}`);
        }
        group.push(isFlag ? token : round1(Number.parseFloat(token)));
      }
      if (group.length === 0) break;
      numbers.push(group.join(' '));
    }
    out += command + numbers.join(' ');
  }
  return out;
}

/**
 * Mutlak komutlu (M/L/Q/C/H/V/Z) yoldaki bütün uç ve kontrol noktaları; imleç etkin noktasını
 * çıkarmak için kullanılır. Göreli komut desteklenmez (Kenney imleç yolları mutlaktır).
 */
export function pathPoints(d) {
  const points = [];
  let x = 0;
  let y = 0;
  for (const match of d.matchAll(/([A-Za-z])([^A-Za-z]*)/g)) {
    const command = match[1];
    if (command !== command.toUpperCase())
      throw new Error(`göreli komut desteklenmiyor: ${command}`);
    if (command === 'Z') continue;
    const numbers = (match[2].match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    if (command === 'H') {
      for (const value of numbers) {
        x = value;
        points.push([x, y]);
      }
    } else if (command === 'V') {
      for (const value of numbers) {
        y = value;
        points.push([x, y]);
      }
    } else {
      if (!'MLQCST'.includes(command)) throw new Error(`desteklenmeyen komut: ${command}`);
      for (let index = 0; index + 1 < numbers.length; index += 2) {
        x = numbers[index];
        y = numbers[index + 1];
        points.push([x, y]);
      }
    }
  }
  return points;
}
