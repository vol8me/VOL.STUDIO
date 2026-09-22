/**
 * Arama testlerinin ucuz spec'leri: kısa süreli archetype/program tabanı,
 * sürekli + seçenekli boyutlar. Beklenen değerler testte formülden
 * türetilmez; motorun kendi çıktıları iki bağımsız yoldan karşılaştırılır.
 */
export function shellSpec(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: 'AcousticSearchSpecV1',
    searchId: 'shell-test',
    seed: 7,
    base: {
      kind: 'archetype',
      request: {
        schema: 'ArchetypeRequestV1',
        archetype: 'archetype.resonant-shell',
        version: 1,
        variation: 0,
        params: { durationSeconds: 0.4 },
      },
    },
    strategy: { id: 'scrambled-halton', version: 1 },
    candidates: 8,
    dimensions: [
      {
        name: 'size',
        target: { kind: 'archetype-param', param: 'size' },
        range: { min: 0.2, max: 0.8, scale: 'linear', unit: 'normalized' },
      },
      {
        name: 'hardness',
        target: { kind: 'archetype-param', param: 'hardness' },
        range: { min: 0.1, max: 0.9, scale: 'linear', unit: 'normalized' },
      },
      {
        name: 'layout',
        target: {
          kind: 'node-param',
          layer: 'strike',
          slot: 'resonator',
          index: 0,
          primitive: 'resonator.modal',
          param: 'layout',
        },
        options: ['bar', 'membrane'],
      },
    ],
    filters: [{ kind: 'clipping' }, { kind: 'descriptor', descriptor: 'activeSeconds', min: 0.3 }],
    ...overrides,
  };
}

/** Program tabanlı spec: düğüm parametresi + makro boyutu. */
export function programSpec(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: 'AcousticSearchSpecV1',
    searchId: 'tone-test',
    seed: 3,
    base: {
      kind: 'program',
      program: {
        schema: 'AcousticProgramV1',
        sampleRate: 48000,
        channels: 1,
        durationSeconds: 0.3,
        seed: 9,
        layers: [
          {
            name: 'body',
            source: { primitive: 'exciter.impact', version: 1, params: { contactTime: 0.002 } },
            resonators: [
              {
                primitive: 'resonator.modal',
                version: 1,
                params: { layout: 'bar', frequency: 300, decay: 0.3, modes: 6 },
              },
            ],
          },
        ],
        master: { normalize: 'peak', peakDbfs: -6 },
      },
    },
    strategy: { id: 'scrambled-halton', version: 1 },
    candidates: 6,
    dimensions: [
      {
        name: 'frequency',
        target: {
          kind: 'node-param',
          layer: 'body',
          slot: 'resonator',
          index: 0,
          primitive: 'resonator.modal',
          param: 'frequency',
        },
        range: { min: 150, max: 1200, scale: 'log', unit: 'Hz' },
      },
      {
        name: 'size',
        target: { kind: 'control', control: 'control.body-size' },
        range: { min: 0.2, max: 0.8, scale: 'linear', unit: 'normalized' },
      },
    ],
    ...overrides,
  };
}

/** JSON anahtarlarını her düzeyde ters sıraya dizer (anlam aynı, baytlar farklı). */
export function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.keys(value)
      .reverse()
      .map((key) => [key, reverseKeys((value as Record<string, unknown>)[key])]),
  );
}
