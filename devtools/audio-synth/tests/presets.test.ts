import { describe, it, expect } from 'vitest';
import { Presets, synth } from '@volstudio/audio-synth';

const presetNames = Presets.findPresets();

describe('Preset kütüphanesi', () => {
  it('catalog boş değil', () => {
    expect(presetNames.length).toBeGreaterThan(0);
  });

  // Preset başına ayrı test: tüm catalog'u tek testte sentezlemek coverage
  // enstrümantasyonu altında varsayılan 5 sn zaman aşımını aşıyordu. Ayrıca
  // bölünmüş hâlde düşen preset'in adı doğrudan raporda görünür.
  it.each(presetNames)('%s preseti geçerli SynthParams döner ve sentezlenebilir', (name) => {
    const params = Presets.getPreset(name);
    expect(params.duration).toBeGreaterThan(0);
    const result = synth(params.duration, params);
    expect(result.channels[0]?.length).toBeGreaterThan(0);
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
    const categories = ['combat', 'ui', 'movement', 'reward', 'texture', 'instrument'] as const;
    for (const category of categories) {
      const found = Presets.findPresets({ category });
      expect(found.length).toBeGreaterThan(0);
    }
  });

  it('texture kategorisi pastoral ve industrial dokular döner', () => {
    const texture = Presets.findPresets({ category: 'texture' });
    expect(texture).toContain('warmPad');
    expect(texture).toContain('machineHum');
  });

  it('role bazlı arama çalışır', () => {
    const bass = Presets.findPresets({ role: 'bass' });
    const pad = Presets.findPresets({ role: 'pad' });
    const lead = Presets.findPresets({ role: 'lead' });
    expect(bass).toContain('subBass');
    expect(pad).toContain('additivePad');
    expect(lead).toContain('brightLead');
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
