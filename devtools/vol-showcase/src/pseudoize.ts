/** Saf sahte-çeviri dönüşümü (bağımlılıksız: testler de kullanır). */
const ACCENTS: Record<string, string> = {
  a: 'á',
  b: 'ƀ',
  c: 'ç',
  d: 'ď',
  e: 'é',
  f: 'ƒ',
  g: 'ğ',
  h: 'ĥ',
  i: 'í',
  j: 'ĵ',
  k: 'ķ',
  l: 'ľ',
  m: 'ṁ',
  n: 'ñ',
  o: 'ó',
  p: 'ƥ',
  q: 'ɋ',
  r: 'ŕ',
  s: 'š',
  t: 'ť',
  u: 'ú',
  v: 'ṽ',
  w: 'ŵ',
  x: 'ẋ',
  y: 'ý',
  z: 'ž',
};

/**
 * Deterministik sahte çeviri: harfler aksanlanır ve kelime sayısına değil harf sayısına göre %30 dolgu
 * eklenir (`{{değişken}}` korunur). Taşma/kırpılma taramak içindir; gerçek bir dilin uzunluğunu iddia etmez.
 */
export function pseudoize(text: string): string {
  let letters = 0;
  const body = text
    .split(/(\{\{[^}]*\}\})/)
    .map((part) => {
      if (part.startsWith('{{')) return part;
      letters += part.length;
      return part.replace(/[a-z]/gi, (char) => {
        const mapped = ACCENTS[char.toLowerCase()];
        if (!mapped) return char;
        return char === char.toLowerCase() ? mapped : mapped.toUpperCase();
      });
    })
    .join('');
  return `⟦${body}${'·'.repeat(Math.ceil(letters * 0.3))}⟧`;
}
