import { describe, it, expect } from 'vitest';
import { Presets, compose, synth } from '@volstudio/audio-synth';

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

  it('çağrılabilen HER preset katalogda kayıtlıdır', () => {
    /*
     * Katalog ve `getPreset` iki ayrı listeden besleniyordu: bir aileyi
     * `all`'a eklemek onu çağrılabilir yapıyor ama katalogda görünmez
     * bırakıyordu. Görünmez bir preset aranamaz, `it.each` ile sentezlenmez ve
     * kimse fark etmeden ölür — `levelUpJingle`/`menuJingle` tam olarak böyle
     * yetim kalmıştı.
     */
    const callable = Presets.callablePresetNames();
    const catalogued = new Set(Object.keys(Presets.PRESET_CATALOG));
    const orphans = callable.filter((name) => !catalogued.has(name));

    expect(orphans, 'katalogda karşılığı olmayan preset').toEqual([]);
  });

  it('katalogdaki HER kayıt gerçekten çağrılabilir', () => {
    // Ters yön: katalogda adı geçip karşılığı olmayan bir kayıt, arama
    // sonucunda görünür ama çağrıldığında patlar.
    const callable = new Set(Presets.callablePresetNames());
    const missing = Object.keys(Presets.PRESET_CATALOG).filter((name) => !callable.has(name));

    expect(missing, 'katalogda olup çağrılamayan preset').toEqual([]);
  });
});

describe('Sekans presetleri', () => {
  /*
   * Sekanslar `SynthParams` değil `SequenceParams` döner ve bu yüzden
   * `PRESET_CATALOG`un dışındadır — `getPreset`in sözleşmesine girmezler.
   * Katalog dışında olmak TESTSİZ olmayı gerektirmez: iki jingle bir dönem
   * ne katalogda ne testte yer alıyordu ve sessizce çürüyordu.
   */
  const sequences = {
    arpeggioUp: Presets.arpeggioUp,
    levelUpJingle: Presets.levelUpJingle,
    menuJingle: Presets.menuJingle,
  };

  it.each(Object.entries(sequences))('%s geçerli bir nota dizisi döner', (name, factory) => {
    const sequence = factory();

    expect(sequence.notes.length, name).toBeGreaterThan(0);
    for (const note of sequence.notes) {
      expect(note.duration, name).toBeGreaterThan(0);
      const pitch = note.freq ?? note.semitone;
      expect(Number.isFinite(pitch), `${name}: nota perdesi sonlu değil`).toBe(true);
    }
  });

  it.each(Object.entries(sequences))('%s taban sesle sentezlenebilir', (name, factory) => {
    const result = compose(factory(), Presets.blip(440, 0.1));
    expect(result.channels[0]?.length, name).toBeGreaterThan(0);
  });
});
