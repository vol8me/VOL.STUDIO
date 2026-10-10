import type { Locator, Page } from '@playwright/test';

/**
 * Son renk kontrast ölçümü. axe, gradyan/doku/yarı saydam zeminlerde kontrastı hesaplayamaz
 * (`incomplete`). Burada metin SİLİNİR (şeffaf yapılır), öğenin metin satır kutuları zeminiyle
 * birlikte çizilmiş hâlde ekrandan okunur ve her zemin pikseli için, metin rengi (alfa ve
 * saydamlık dâhil) o pikselin üstüne bindirilerek WCAG oranı hesaplanır. En kötü piksel
 * belirleyicidir; ortalama değil. Metin gölgesi ve kenar çizgisi sayılmaz (ölçüm kötümserdir).
 */
const LARGE_TEXT_PX = 24;
const LARGE_BOLD_PX = 18.66;

export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export function parseColor(value: string): Rgba {
  const match = /^rgba?\(([^)]+)\)$/.exec(value.trim());
  if (!match) throw new Error(`Çözülemeyen renk: ${value}`);
  const parts = match[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
  const [r = 0, g = 0, b = 0, a = 1] = parts;
  return { r, g, b, a };
}

function channelLuminance(channel: number): number {
  const scaled = channel / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function contrastRatio(first: number, second: number): number {
  const [light, dark] = first >= second ? [first, second] : [second, first];
  return (light + 0.05) / (dark + 0.05);
}

/** Ön plan renginin (alfa × saydamlık) zemin pikselinin üstündeki oranı. */
export function pixelContrast(
  foreground: Rgba,
  opacity: number,
  background: readonly [number, number, number],
): number {
  const alpha = foreground.a * opacity;
  const mix = (front: number, back: number): number => front * alpha + back * (1 - alpha);
  const text = luminance(
    mix(foreground.r, background[0]),
    mix(foreground.g, background[1]),
    mix(foreground.b, background[2]),
  );
  return contrastRatio(text, luminance(...background));
}

export function requiredRatio(fontPx: number, bold: boolean): number {
  return fontPx >= LARGE_TEXT_PX || (bold && fontPx >= LARGE_BOLD_PX) ? 3 : 4.5;
}

interface TextRun {
  readonly color: string;
  readonly opacity: number;
  readonly fontPx: number;
  readonly bold: boolean;
  readonly text: string;
  readonly rects: ReadonlyArray<{ x: number; y: number; width: number; height: number }>;
}

export interface ContrastMeasurement {
  readonly text: string;
  readonly color: string;
  readonly fontPx: number;
  readonly required: number;
  /** En kötü zemin pikselindeki oran. */
  readonly worst: number;
  /** En kötü %5'lik dilimin üst sınırı: tek bir aykırı pikselin ağırlığını gösterir. */
  readonly p05: number;
  readonly pixels: number;
}

const HIDE_ATTRIBUTE = 'data-final-contrast';

/** Öğenin görünür metin satırlarını, rengini ve boyutunu okur; metni şeffaf yapar. */
async function readRuns(target: Locator): Promise<TextRun[]> {
  await target.scrollIntoViewIfNeeded();
  return target.evaluate((root, attribute) => {
    const runs: TextRun[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim() ?? '';
      const parent = node.parentElement;
      if (!text || !parent) continue;
      const style = getComputedStyle(parent);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      let opacity = 1;
      for (let el: Element | null = parent; el; el = el.parentElement)
        opacity *= Number(getComputedStyle(el).opacity);
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = [...range.getClientRects()]
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }));
      if (rects.length === 0) continue;
      runs.push({
        color: style.color,
        opacity,
        fontPx: Number.parseFloat(style.fontSize),
        bold: Number(style.fontWeight) >= 700,
        text,
        rects,
      });
    }
    root.setAttribute(attribute, '');
    return runs;
  }, HIDE_ATTRIBUTE);
}

async function decode(
  scratch: Page,
  png: Buffer,
): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const base64 = png.toString('base64');
  const decoded = await scratch.evaluate(async (payload) => {
    const image = new Image();
    image.src = `data:image/png;base64,${payload}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let binary = '';
    for (let i = 0; i < data.length; i += 0x8000)
      binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
    return { width: canvas.width, height: canvas.height, rgba: btoa(binary) };
  }, base64);
  return {
    width: decoded.width,
    height: decoded.height,
    data: new Uint8ClampedArray(Buffer.from(decoded.rgba, 'base64')),
  };
}

const HIDE_STYLE = `[${HIDE_ATTRIBUTE}], [${HIDE_ATTRIBUTE}] * {
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
  text-shadow: none !important;
  -webkit-text-stroke: 0 !important;
}`;

/**
 * Hedef öğenin her metin parçasını ölçer. `scratch` boş bir sayfadır (içerik güvenlik
 * politikasından bağımsız PNG çözümü için); her motor kendi çözücüsünü kullanır.
 */
export async function measureFinalContrast(
  page: Page,
  scratch: Page,
  target: Locator,
): Promise<ContrastMeasurement[]> {
  const runs = await readRuns(target);
  await page.evaluate((css) => {
    const style = document.createElement('style');
    style.id = 'final-contrast-style';
    style.textContent = css;
    document.head.append(style);
  }, HIDE_STYLE);
  try {
    const viewport = page.viewportSize()!;
    const png = await page.screenshot({
      clip: { x: 0, y: 0, width: viewport.width, height: viewport.height },
      animations: 'disabled',
    });
    const image = await decode(scratch, png);
    const scale = image.width / viewport.width;
    return runs.map((run) => measureRun(run, image, scale));
  } finally {
    await page.evaluate(() => document.getElementById('final-contrast-style')?.remove());
    await target.evaluate((node, attribute) => node.removeAttribute(attribute), HIDE_ATTRIBUTE);
  }
}

function measureRun(
  run: TextRun,
  image: { width: number; height: number; data: Uint8ClampedArray },
  scale: number,
): ContrastMeasurement {
  const foreground = parseColor(run.color);
  const ratios: number[] = [];
  for (const rect of run.rects) {
    const x0 = Math.max(0, Math.floor(rect.x * scale));
    const y0 = Math.max(0, Math.floor(rect.y * scale));
    const x1 = Math.min(image.width, Math.ceil((rect.x + rect.width) * scale));
    const y1 = Math.min(image.height, Math.ceil((rect.y + rect.height) * scale));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const at = (y * image.width + x) * 4;
        ratios.push(
          pixelContrast(foreground, run.opacity, [
            image.data[at],
            image.data[at + 1],
            image.data[at + 2],
          ]),
        );
      }
    }
  }
  if (ratios.length === 0) throw new Error(`Metin satırı görünür alanın dışında: ${run.text}`);
  ratios.sort((a, b) => a - b);
  return {
    text: run.text,
    color: run.color,
    fontPx: run.fontPx,
    required: requiredRatio(run.fontPx, run.bold),
    worst: ratios[0],
    p05: ratios[Math.floor(ratios.length * 0.05)],
    pixels: ratios.length,
  };
}
