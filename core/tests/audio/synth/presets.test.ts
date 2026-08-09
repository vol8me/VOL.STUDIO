import { describe, it, expect } from 'vitest';
import { Presets, synth } from '@volstudio/core/audio/synth';

describe('Preset kütüphanesi', () => {
  it('tüm catalog presetleri geçerli SynthParams döner ve sentezlenebilir', () => {
    const names = Presets.findPresets();
    expect(names.length).toBeGreaterThan(0);

    for (const name of names) {
      const params = Presets.getPreset(name);
      expect(params.duration).toBeGreaterThan(0);
      const result = synth(params.duration, params);
      expect(result.channels[0]?.length).toBeGreaterThan(0);
    }
  });

  it('kategori bazlı arama çalışır', () => {
    const combat = Presets.findPresets({ category: 'combat' });
    const ui = Presets.findPresets({ category: 'ui' });
    const movement = Presets.findPresets({ category: 'movement' });

    expect(combat).toContain('laser');
    expect(combat).toContain('hit');
    expect(ui).toContain('blip');
    expect(ui).toContain('pause');
    expect(movement).toContain('dash');
  });

  it('etiket bazlı arama çalışır', () => {
    const result = Presets.findPresets({ tags: ['weapon'] });
    expect(result).toContain('laser');
  });

  it('her kategori için en az bir preset vardır', () => {
    const categories = ['combat', 'ui', 'movement', 'reward'] as const;
    for (const category of categories) {
      const found = Presets.findPresets({ category });
      expect(found.length).toBeGreaterThan(0);
    }
  });

  it('detune içeren presetler sonsuz döngü yapmaz', () => {
    const params = Presets.restart();
    expect(params.detune).toBe(5);
    const result = synth(params.duration, params);
    expect(result.channels[0]?.length).toBe(Math.floor(44100 * params.duration));
  });

  it('fire, bulletBounce, pause, resume, restart sentezlenebilir', () => {
    const sounds = [
      Presets.fire(),
      Presets.bulletBounce(),
      Presets.pause(),
      Presets.resume(),
      Presets.restart(),
    ];
    for (const params of sounds) {
      const result = synth(params.duration, params);
      expect(result.channels[0]?.length).toBeGreaterThan(0);
    }
  });
});
