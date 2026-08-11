import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MODAL_TRANSITION_MS } from '../../src/ui/overlays/Confirm';
import { TOAST_FADE_OUT_MS } from '../../src/ui/overlays/Toast';
import { MIN_NODE_WIDTH, NODE_LABEL_FONT } from '../../src/ui/hud/SkillTree';
import { HANDLE_WIDTH_PX } from '../../src/ui/primitives/RangeSlider';
import { EVENT_LOG_LEAVE_DURATION_MS } from '../../src/ui/data/EventLog';

/**
 * JS tarafındaki bazı sabitler CSS değerlerini elle tekrarlıyor. Bunlar iki ayrı
 * yerde yaşadığı için sessizce ayrışabilirler — nitekim EventLog sabiti (220 ms)
 * ile CSS animasyonu (200 ms) arasında zaten fark vardı.
 *
 * İki farklı sözleşme doğrulanır:
 * - Teardown zamanlayıcıları CSS süresinden KISA olamaz (erken silme animasyonu keser).
 * - Geometrik değerler (genişlik, font) BİREBİR eşit olmalı.
 */
function readCss(name: string): string {
  return readFileSync(resolve(import.meta.dirname, '../../src/ui', name), 'utf-8');
}

const theme = readCss('theme.css');
const overlays = readCss('overlays.css');
const hud = readCss('hud.css');
const primitives = readCss('primitives.css');
const data = readCss('data.css');

/** `--vol-transition-medium: 0.24s ease` → 240 */
function cssVarDurationMs(css: string, varName: string): number {
  const match = new RegExp(`${varName}:\\s*([0-9.]+)(m?s)`).exec(css);
  expect(match, `${varName} theme.css'te bulunamadı`).not.toBeNull();
  const value = Number(match![1]);
  return match![2] === 'ms' ? value : value * 1000;
}

/** Bir kural bloğundaki tek bir bildirimin değerini döndürür. */
function cssDeclaration(css: string, selector: string, property: string): string {
  const block = new RegExp(
    `${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
  ).exec(css);
  expect(block, `${selector} bulunamadı`).not.toBeNull();
  const decl = new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`).exec(block![1]);
  expect(decl, `${selector} içinde ${property} yok`).not.toBeNull();
  return decl![1].trim();
}

function pxToNumber(value: string): number {
  return Number(value.replace('px', '').trim());
}

describe('CSS sabit senkronu — teardown zamanlayıcıları', () => {
  it('MODAL_TRANSITION_MS, .vol-modal geçişinden kısa değil', () => {
    const cssMs = cssVarDurationMs(theme, '--vol-transition-medium');
    expect(overlays).toMatch(/\.vol-modal\b/);
    expect(MODAL_TRANSITION_MS).toBeGreaterThanOrEqual(cssMs);
  });

  it('TOAST_FADE_OUT_MS, .vol-toast geçişinden kısa değil', () => {
    const cssMs = cssVarDurationMs(theme, '--vol-transition-medium');
    expect(TOAST_FADE_OUT_MS).toBeGreaterThanOrEqual(cssMs);
  });

  it('EVENT_LOG_LEAVE_DURATION_MS, leave animasyonundan kısa değil', () => {
    const animation = cssDeclaration(data, '.vol-event-log__row--leave', 'animation');
    const match = /([0-9.]+)(m?s)/.exec(animation);
    expect(match, 'leave animasyon süresi okunamadı').not.toBeNull();
    const cssMs = match![2] === 'ms' ? Number(match![1]) : Number(match![1]) * 1000;
    expect(EVENT_LOG_LEAVE_DURATION_MS).toBeGreaterThanOrEqual(cssMs);
  });
});

describe('CSS sabit senkronu — geometri birebir eşleşmeli', () => {
  it('MIN_NODE_WIDTH === .vol-skill-tree__node min-width', () => {
    const cssWidth = cssDeclaration(hud, '.vol-skill-tree__node', 'min-width');
    expect(pxToNumber(cssWidth)).toBe(MIN_NODE_WIDTH);
  });

  it('HANDLE_WIDTH_PX === .vol-range-slider__handle width', () => {
    const cssWidth = cssDeclaration(primitives, '.vol-range-slider__handle', 'width');
    expect(pxToNumber(cssWidth)).toBe(HANDLE_WIDTH_PX);
  });

  it('NODE_LABEL_FONT, .vol-skill-tree__node-label ile aynı font/weight/size taşır', () => {
    // measureText() bu string ile ölçüm yapıyor; CSS'ten saparsa düğüm
    // genişlikleri yanlış hesaplanır ve uzun etiketler kutudan taşar.
    const fontFamily = cssDeclaration(theme, ':root', '--vol-font-family');
    const fontSize = cssDeclaration(hud, '.vol-skill-tree__node-label', 'font-size');
    const fontWeight = cssDeclaration(hud, '.vol-skill-tree__node-label', 'font-weight');

    expect(NODE_LABEL_FONT).toBe(`${fontWeight} ${fontSize} ${fontFamily}`);

    // Düğümün kendisi bu aileyi kullanmalı, aksi halde ölçüm başka fontla yapılır.
    expect(cssDeclaration(hud, '.vol-skill-tree__node', 'font-family')).toBe(
      'var(--vol-font-family)',
    );
  });
});
