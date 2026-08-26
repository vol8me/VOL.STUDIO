import { describe, expect, it } from 'vitest';
import { VISUAL_SYNTH_CAPABILITIES } from '../../src/visualSynth';
import { collectSpriteDocIssues } from '../../src/visualSynth/validate';

/**
 * `VISUAL_SYNTH_CAPABILITIES.shading`/`.post` şemadan türemez (analysis.ts'in
 * aksine, bu ikisi `validate.ts`de elle yazılmış `shade`/`post` alan
 * listeleriyle eşleşir). Elle yazılmış iki liste birbirinden kopabilir:
 * biri güncellenip diğeri unutulursa, motor bir özelliği gerçekten
 * uyguladığı hâlde manifest bunu söylemez (ya da tersi). Bu bekçi ikisini
 * davranışsal olarak karşılaştırır.
 */
function baseDoc(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    size: [16, 16],
    seed: 1,
    palette: { colors: ['#000000', '#ffffff'] },
    layers: [{ id: 'a', source: { kind: 'sdf.circle', center: [0, 0], r: 0.5 }, material: 0 }],
  };
}

/** `post.<name>` en üst seviyede tanınıyor mu — içeriği önemsiz, sadece anahtar. */
function postKeyAccepted(name: string): boolean {
  const issues = collectSpriteDocIssues({ ...baseDoc(), post: { [name]: {} } });
  return !issues.some(
    (issue) => issue.startsWith(`post.${name}`) && issue.includes('böyle bir alan tanımıyor'),
  );
}

/** `shade.<name>` en üst seviyede tanınıyor mu. */
function shadeKeyAccepted(name: string): boolean {
  const issues = collectSpriteDocIssues({ ...baseDoc(), shade: { [name]: 0.1 } });
  return !issues.some(
    (issue) => issue.startsWith(`shade.${name}`) && issue.includes('böyle bir alan tanımıyor'),
  );
}

describe('VisualSynth yetenek manifesti — post/shade elle yazılan listelerle eşleşir', () => {
  it('manifestteki her post özelliği validate.ts tarafından da tanınır', () => {
    for (const name of VISUAL_SYNTH_CAPABILITIES.post) {
      expect(postKeyAccepted(name), `post.${name} reddedildi ama manifest listeliyor`).toBe(true);
    }
  });

  it('uydurma bir post anahtarı reddedilir (bekçinin kendisi anlamlı)', () => {
    expect(postKeyAccepted('bloom')).toBe(false);
  });

  it('manifestteki her literal shade anahtarı validate.ts tarafından da tanınır', () => {
    // `lambert` ayrı bir JSON alanı değil; `light`+`strength` birlikte var
    // olduğunda uygulanan aydınlatma MODELİNİN adıdır (bkz. shade/lighting.ts).
    const literalKeys = VISUAL_SYNTH_CAPABILITIES.shading.filter((name) => name !== 'lambert');
    for (const name of literalKeys) {
      expect(shadeKeyAccepted(name), `shade.${name} reddedildi ama manifest listeliyor`).toBe(true);
    }
  });

  it('validate.ts kabul ettiği hiçbir shade özelliği manifestte unutulmamış', () => {
    // `light`/`strength` `lambert` modelinin YAPILANDIRMASIdır, ayrı bir
    // özellik değildir; `ao` nesne biçiminde olduğu için ayrı ele alınır.
    const structuralKeys = new Set(['light', 'strength', 'ao']);
    const acceptedTopLevelKeys = [
      'light',
      'strength',
      'ambient',
      'rim',
      'relief',
      'emission',
      'ao',
    ];
    const namedFeatureKeys = acceptedTopLevelKeys.filter((name) => !structuralKeys.has(name));
    for (const name of namedFeatureKeys) {
      expect(
        VISUAL_SYNTH_CAPABILITIES.shading as readonly string[],
        `shade.${name} doğrulamada kabul ediliyor ama manifestte yok`,
      ).toContain(name);
    }
    expect(shadeKeyAccepted('ao')).toBe(true);
    expect(VISUAL_SYNTH_CAPABILITIES.shading).toContain('ao');
  });

  it('uydurma bir shade anahtarı reddedilir (bekçinin kendisi anlamlı)', () => {
    expect(shadeKeyAccepted('specular')).toBe(false);
  });
});
