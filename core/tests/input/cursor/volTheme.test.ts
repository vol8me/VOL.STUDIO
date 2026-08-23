import { describe, it, expect } from 'vitest';
import { VOL_CURSOR_ASSETS, VolCursorTheme, VOL_CURSOR_COLORS } from '../../../src/input/cursor';
import type { CursorId } from '../../../src/input/cursor';

const EXPECTED_CURSOR_IDS: CursorId[] = [
  'default',
  'pointer',
  'text',
  'crosshair',
  'precision',
  'grab',
  'grabbing',
  'pan',
  'move',
  'resize-ew',
  'resize-ns',
  'resize-nesw',
  'resize-nwse',
  'resize-all',
  'zoom-in',
  'zoom-out',
  'not-allowed',
  'wait',
  'help',
  'target',
];

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

describe('VolCursorTheme', () => {
  it('20 cursor asseti tanımlı', () => {
    const ids = Object.keys(VolCursorTheme.cursors).sort();
    expect(ids).toEqual([...EXPECTED_CURSOR_IDS].sort());
  });

  it('her CursorId için asset var', () => {
    for (const id of EXPECTED_CURSOR_IDS) {
      expect(VOL_CURSOR_ASSETS[id], `Eksik cursor: ${id}`).toBeDefined();
    }
  });

  it('renk rolleri geçerli hex stringleridir', () => {
    expect(VOL_CURSOR_COLORS.outline).toMatch(HEX_PATTERN);
    expect(VOL_CURSOR_COLORS.body).toMatch(HEX_PATTERN);
    expect(VOL_CURSOR_COLORS.accent).toMatch(HEX_PATTERN);
    expect(VOL_CURSOR_COLORS.danger).toMatch(HEX_PATTERN);
    expect(VOL_CURSOR_COLORS.disabled).toMatch(HEX_PATTERN);
  });

  it('her assetin hotspotu viewBox içinde', () => {
    for (const id of EXPECTED_CURSOR_IDS) {
      const asset = VOL_CURSOR_ASSETS[id];
      expect(asset.hotspotX).toBeGreaterThanOrEqual(0);
      expect(asset.hotspotX).toBeLessThanOrEqual(asset.viewBox);
      expect(asset.hotspotY).toBeGreaterThanOrEqual(0);
      expect(asset.hotspotY).toBeLessThanOrEqual(asset.viewBox);
      expect(asset.fallback).toBeTruthy();
    }
  });

  it('her asset en az outline ve body katmanı taşır', () => {
    for (const id of EXPECTED_CURSOR_IDS) {
      const asset = VOL_CURSOR_ASSETS[id];
      const roles = asset.layers.map((l) => l.role);
      expect(roles).toContain('outline');
      expect(roles).toContain('body');
      expect(asset.layers.every((l) => l.stroke === true && l.fill === false)).toBe(true);
    }
  });
});
