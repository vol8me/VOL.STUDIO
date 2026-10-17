import { describe, expect, it } from 'vitest';
import {
  firstGraphemeLength,
  lastGraphemeLength,
  splitGraphemes,
  splitGraphemesFallback,
} from '../../../src/ui/textEntry/graphemes';

/**
 * Grafem sınırları (UI-11.1): imleç ve geri silme kullanıcının gördüğü tek karaktere göre ilerler. Her vaka hem
 * `Intl.Segmenter` yolunda (`splitGraphemes`) hem yedek yolda (`splitGraphemesFallback`) sınanır; yedek WebView'da
 * Segmenter yokken devreye girer ve aynı temel sözleşmeyi vermelidir.
 */
const ZWJ = '\u{200D}';
const FAMILY = ['\u{1F468}', '\u{1F469}', '\u{1F467}'].join(ZWJ);
const WAVE_MEDIUM = '\u{1F44B}\u{1F3FD}';
const FLAG_TR = '\u{1F1F9}\u{1F1F7}';
const FLAG_DE = '\u{1F1E9}\u{1F1EA}';
const E_ACUTE_DECOMPOSED = 'e\u{0301}';
const HEART_EMOJI = '\u{2764}\u{FE0F}';

const CASES: ReadonlyArray<readonly [string, string, string[]]> = [
  ['boş metin', '', []],
  ['düz harfler', 'abc', ['a', 'b', 'c']],
  ['Türkçe harfler tek kümedir', 'ığüşöç', ['ı', 'ğ', 'ü', 'ş', 'ö', 'ç']],
  ['birleştirici vurgu harfe bağlanır', `a${E_ACUTE_DECOMPOSED}b`, ['a', E_ACUTE_DECOMPOSED, 'b']],
  ['ten tonu emojiye bağlanır', `x${WAVE_MEDIUM}y`, ['x', WAVE_MEDIUM, 'y']],
  ['varyasyon seçici emojiye bağlanır', `${HEART_EMOJI}a`, [HEART_EMOJI, 'a']],
  ['ZWJ’li aile emojisi tek kümedir', `a${FAMILY}b`, ['a', FAMILY, 'b']],
  [
    'bayrak çifti tek kümedir, ardışık iki bayrak ikidir',
    `${FLAG_TR}${FLAG_DE}`,
    [FLAG_TR, FLAG_DE],
  ],
  ['CRLF tek kümedir', 'a\r\nb', ['a', '\r\n', 'b']],
  ['yalnız LF ayrı kümedir', 'a\nb', ['a', '\n', 'b']],
];

describe.each([
  ['splitGraphemes', splitGraphemes],
  ['splitGraphemesFallback', splitGraphemesFallback],
] as const)('%s', (_name, split) => {
  it.each(CASES)('%s', (_label, text, expected) => {
    const clusters = split(text);
    expect(clusters).toEqual(expected);
    // Bölme kayıpsızdır: birleştirince özgün metin gelir.
    expect(clusters.join('')).toBe(text);
  });
});

describe('uzunluk yardımcıları', () => {
  it('lastGraphemeLength son kümenin UTF-16 uzunluğunu verir; boşta 0', () => {
    expect(lastGraphemeLength('')).toBe(0);
    expect(lastGraphemeLength('ab')).toBe(1);
    expect(lastGraphemeLength(`ab${E_ACUTE_DECOMPOSED}`)).toBe(2);
    expect(lastGraphemeLength(`a${FAMILY}`)).toBe(FAMILY.length);
    expect(lastGraphemeLength(`a${FLAG_TR}`)).toBe(4);
  });

  it('firstGraphemeLength ilk kümenin UTF-16 uzunluğunu verir; boşta 0', () => {
    expect(firstGraphemeLength('')).toBe(0);
    expect(firstGraphemeLength('ab')).toBe(1);
    expect(firstGraphemeLength(`${WAVE_MEDIUM}a`)).toBe(4);
    expect(firstGraphemeLength(`${FAMILY}a`)).toBe(FAMILY.length);
  });

  it('yedek yol da Segmenter ile aynı uzunluğu verir (geniş kapsamlı karşılaştırma)', () => {
    for (const [, text] of CASES) {
      expect(splitGraphemesFallback(text)).toEqual(splitGraphemes(text));
    }
  });
});
