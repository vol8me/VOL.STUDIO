/**
 * Mekanik olarak farklı iki aile: (1) archetype tabanlı modal vuruş —
 * sertlik/boyut/sönüm/yerleşim; (2) program tabanlı damla dokusu — olay
 * hızı/düzenlilik/perde çarpanı. Süreler kısa tutulur (test maliyeti).
 */
export function shellFamily(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: 'SoundFamilyProgramV1',
    familyId: 'shell-hits',
    version: 1,
    title: 'Test kabuk vuruşları',
    description: 'Aile protokol testi için kısa kabuk vuruşları.',
    base: {
      kind: 'archetype',
      request: {
        schema: 'ArchetypeRequestV1',
        archetype: 'archetype.resonant-shell',
        version: 1,
        variation: 0,
        params: { durationSeconds: 0.5 },
      },
    },
    seed: 11,
    variation: { policy: 'role-subrange-v1' },
    dimensions: [
      {
        name: 'size',
        target: { kind: 'archetype-param', param: 'size' },
        range: { min: 0.15, max: 0.85, scale: 'linear', unit: 'normalized' },
      },
      {
        name: 'hardness',
        target: { kind: 'archetype-param', param: 'hardness' },
        range: { min: 0.3, max: 0.95, scale: 'linear', unit: 'normalized' },
      },
      {
        name: 'damping',
        target: { kind: 'archetype-param', param: 'damping' },
        range: { min: 0.2, max: 0.7, scale: 'linear', unit: 'normalized' },
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
        scope: 'role',
      },
    ],
    roles: {
      intensity: {
        soft: { hardness: { min: 0.3, max: 0.45 } },
        hard: { hardness: { min: 0.75, max: 0.95 } },
      },
      weight: {
        light: { size: { min: 0.15, max: 0.4 } },
        heavy: { size: { min: 0.6, max: 0.85 } },
      },
      rarity: {
        common: { layout: { options: ['bar'] } },
        alternate: { layout: { options: ['membrane'] } },
      },
    },
    variants: [
      { key: 'soft-light', roles: { intensity: 'soft', weight: 'light', rarity: 'common' } },
      { key: 'soft-heavy', roles: { intensity: 'soft', weight: 'heavy', rarity: 'common' } },
      {
        key: 'hard-light',
        roles: { intensity: 'hard', weight: 'light', rarity: 'common' },
        tags: ['strike'],
      },
      {
        key: 'hard-heavy',
        roles: { intensity: 'hard', weight: 'heavy', rarity: 'common' },
        tags: ['strike'],
      },
      { key: 'soft-light-b', roles: { intensity: 'soft', weight: 'light', rarity: 'common' } },
      {
        key: 'hard-heavy-b',
        roles: { intensity: 'hard', weight: 'heavy', rarity: 'common' },
        tags: ['strike'],
      },
      { key: 'soft-heavy-alt', roles: { intensity: 'soft', weight: 'heavy', rarity: 'alternate' } },
      {
        key: 'hard-light-alt',
        roles: { intensity: 'hard', weight: 'light', rarity: 'alternate' },
        tags: ['strike'],
      },
    ],
    quality: {
      minMembers: 8,
      diversity: { minNearestDistance: 0.02, minMedianDistance: 0.05, nearIdentical: 'fail' },
      coherence: { maxRobustZ: 4, outliers: 'report', maxLoudnessSpreadDb: 14 },
    },
    delivery: {
      package: '@volstudio/audio-synth',
      assetDir: 'reference/production/assets/sfx/families/shell-hits',
      subtype: 'sfx',
      assetClass: 'sfx',
      durationSeconds: { min: 0.3, max: 1 },
    },
    ...overrides,
  };
}

export function dropletFamily(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const node = {
    primitive: 'source.micro-events',
    version: 1,
    params: { event: 'droplet', rate: 6, regularity: 0.5, sizeSpread: 0.3, levelSpread: 4 },
  };
  const target = (param: string) => ({
    kind: 'node-param',
    layer: 'drops',
    slot: 'source',
    primitive: 'source.micro-events',
    param,
  });
  return {
    schema: 'SoundFamilyProgramV1',
    familyId: 'droplets',
    version: 1,
    title: 'Test damla dokuları',
    description: 'Program tabanlı ikinci test ailesi: olay hızı, düzenlilik ve perde.',
    base: {
      kind: 'program',
      program: {
        schema: 'AcousticProgramV1',
        sampleRate: 48000,
        channels: 1,
        durationSeconds: 0.6,
        seed: 4,
        layers: [{ name: 'drops', source: node }],
        master: { normalize: 'peak', peakDbfs: -3, fadeOutSeconds: 0.02 },
      },
    },
    seed: 5,
    variation: { policy: 'role-subrange-v1' },
    dimensions: [
      {
        name: 'rate',
        target: target('rate'),
        range: { min: 4, max: 40, scale: 'log', unit: 'per-second' },
      },
      {
        name: 'regularity',
        target: target('regularity'),
        range: { min: 0, max: 1, scale: 'linear', unit: 'normalized' },
      },
      {
        name: 'pitch',
        target: target('pitch'),
        range: { min: 0.5, max: 2, scale: 'log', unit: 'ratio' },
      },
    ],
    roles: {
      speed: { slow: { rate: { min: 4, max: 8 } }, fast: { rate: { min: 20, max: 40 } } },
      weight: { heavy: { pitch: { min: 0.5, max: 0.8 } }, light: { pitch: { min: 1.3, max: 2 } } },
    },
    variants: [
      { key: 'slow-heavy', roles: { speed: 'slow', weight: 'heavy' } },
      { key: 'slow-light', roles: { speed: 'slow', weight: 'light' } },
      { key: 'fast-heavy', roles: { speed: 'fast', weight: 'heavy' } },
      { key: 'fast-light', roles: { speed: 'fast', weight: 'light' } },
      { key: 'slow-heavy-b', roles: { speed: 'slow', weight: 'heavy' } },
      { key: 'slow-light-b', roles: { speed: 'slow', weight: 'light' } },
      { key: 'fast-heavy-b', roles: { speed: 'fast', weight: 'heavy' } },
      { key: 'fast-light-b', roles: { speed: 'fast', weight: 'light' } },
    ],
    quality: {
      minMembers: 8,
      diversity: { minNearestDistance: 0.02, minMedianDistance: 0.05, nearIdentical: 'fail' },
      coherence: { maxRobustZ: 4, outliers: 'report' },
    },
    delivery: {
      package: '@volstudio/audio-synth',
      assetDir: 'reference/production/assets/sfx/families/droplets',
      subtype: 'organic',
      assetClass: 'sfx',
      durationSeconds: { min: 0.3, max: 1 },
    },
    ...overrides,
  };
}
