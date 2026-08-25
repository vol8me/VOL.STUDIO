import { describe, expect, it } from 'vitest';
import {
  FIELD_KINDS,
  NODE_SCHEMAS,
  VISUAL_SYNTH_CAPABILITIES,
  getVisualSynthCapabilities,
} from '../../src/visualSynth';

describe('VisualSynth yetenek manifesti', () => {
  it('alan düğümleri ve kategori listeleri şemadan türetilir', () => {
    expect(getVisualSynthCapabilities()).toBe(VISUAL_SYNTH_CAPABILITIES);
    expect(VISUAL_SYNTH_CAPABILITIES.fieldKinds).toEqual(FIELD_KINDS);

    const grouped = Object.values(VISUAL_SYNTH_CAPABILITIES.kindsByCategory).flat();
    expect([...grouped].sort()).toEqual([...FIELD_KINDS].sort());
    expect(grouped.every((kind) => NODE_SCHEMAS[kind] !== undefined)).toBe(true);
  });

  it('garantileri ve bilinçli sınırları açıkça bildirir', () => {
    expect(VISUAL_SYNTH_CAPABILITIES.guarantees).toEqual({
      deterministicSeeded: true,
      paletteLockedAfterQuantization: true,
      headless: true,
      unitAndPixelSpaces: true,
    });
    expect(VISUAL_SYNTH_CAPABILITIES.unsupported).toContain('camera3d');
    expect(VISUAL_SYNTH_CAPABILITIES.unsupported).toContain('diffusion');
    expect(VISUAL_SYNTH_CAPABILITIES.unsupported).toContain('generalEditor');
  });
});
