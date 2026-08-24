import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DomCursorRenderer,
  applyCssCursor,
  buildCursorDataUri,
  VolCursorTheme,
} from '../../../src/input/cursor';

describe('DomCursorRenderer', () => {
  let root: HTMLElement;
  let renderer: DomCursorRenderer;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    renderer = new DomCursorRenderer(root, VolCursorTheme);
  });

  afterEach(() => {
    renderer.destroy();
    root.remove();
  });

  it('overlay elementi oluşturur', () => {
    const overlay = root.querySelector('svg.vol-cursor-overlay');
    expect(overlay).not.toBeNull();
  });

  it('set cursorun pathlerini overlaya yazar', () => {
    renderer.set('target');
    const overlay = root.querySelector('svg.vol-cursor-overlay') as SVGSVGElement;
    expect(overlay.querySelectorAll('path').length).toBeGreaterThan(0);
  });

  it('setSize overlay boyutunu değiştirir', () => {
    renderer.set('default');
    renderer.setSize(32);
    const overlay = root.querySelector('svg.vol-cursor-overlay') as SVGSVGElement;
    expect(overlay.getAttribute('width')).toBe('32');
    expect(overlay.getAttribute('height')).toBe('32');
  });

  it('pointer hareketi overlay konumunu günceller', () => {
    renderer.set('default');
    const overlay = root.querySelector('svg.vol-cursor-overlay') as SVGSVGElement;
    const event = new MouseEvent('pointermove', { clientX: 50, clientY: 60, bubbles: true });
    root.dispatchEvent(event);
    // Varsayılan cursor sıcak noktası (2,2) 24 px'de 2 px kaydırır.
    expect(overlay.style.left).toBe('48px');
    expect(overlay.style.top).toBe('58px');
    // Çift ofset yok: SVG içeriği `left/top` ile konumlanır, ek transform yok.
    expect(overlay.style.transform).toBeFalsy();
  });

  it('destroy overlay ve olay dinleyiciyi kaldırır', () => {
    renderer.destroy();
    expect(root.querySelector('svg.vol-cursor-overlay')).toBeNull();
  });
});

describe('applyCssCursor', () => {
  it('element cursor stilini data URI ile günceller', () => {
    const el = document.createElement('div');
    applyCssCursor(el, VolCursorTheme.cursors.default, 24);
    expect(el.style.cursor).toContain('url(');
    expect(el.style.cursor).toContain('default');
  });

  it('cursor data URI üretir', () => {
    const uri = buildCursorDataUri(VolCursorTheme.cursors.default);
    expect(uri).toMatch(/^data:image\/svg\+xml,/);
  });
});
