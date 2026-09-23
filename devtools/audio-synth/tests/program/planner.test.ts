import { describe, expect, it } from 'vitest';
import { AudioParamError } from '../../src/guard/errors';
import { validateBrief, type AcousticBriefV1 } from '../../src/program/brief';
import { PROGRAM_REGISTRY } from '../../src/program/catalog';
import { materialById } from '../../src/program/materials';
import {
  capabilityMatrix,
  MATERIAL_TERMS,
  MECHANISM_TERMS,
  mechanismById,
  MECHANISMS,
} from '../../src/program/ontology';
import { planBrief, STYLE_TERMS, tokenize } from '../../src/program/planner';
import { renderProgram } from '../../src/program/render';
import { LAYER_ROLES } from '../../src/program/roles';
import { outputSeconds, resolveProgram } from '../../src/program/schema';
import { soundGraph, topologyOf } from '../../src/program/soundGraph';
import { STYLE_PROFILES } from '../../src/program/styles';
import { canonicalJson, hashCanonical } from '../../src/protocol/canonical';

/**
 * Ontoloji ve ProgramPlanner (Dalga 7): sözlüğün her kimliği gerçek bir
 * registry girdisine, mekanizmaya, materyale ya da stile çözülür; plan
 * deterministiktir, desteklenmeyen mekanizmayı uydurmaz ve iskeleti render
 * edilebilir.
 */
function brief(fields: Record<string, unknown>): AcousticBriefV1 {
  return validateBrief({
    schema: 'AudioBriefV1',
    kind: 'acoustic',
    id: 'plan-test',
    title: 'Plan testi',
    intent: 'Planlayıcı testi.',
    provenance: { author: 'agent', by: 'vitest' },
    subtype: 'sfx',
    assetClass: 'sfx',
    durationSeconds: { min: 0.5, max: 1.5 },
    channels: 1,
    ...fields,
  }) as AcousticBriefV1;
}

describe('SoundOntology bütünlüğü', () => {
  it('her sağlayıcı ve tarif kimliği registry’de var; rol sözlükte', () => {
    for (const mechanism of MECHANISMS) {
      expect(LAYER_ROLES).toContain(mechanism.role);
      for (const id of mechanism.providers) expect(PROGRAM_REGISTRY.has(id), id).toBe(true);
      const recipe = mechanism.recipe;
      if (!recipe) continue;
      const ids = [
        recipe.source,
        recipe.articulation,
        recipe.busEffect,
        ...(recipe.resonators ?? []),
      ].filter((id): id is string => id !== undefined);
      for (const id of ids) expect(PROGRAM_REGISTRY.has(id), `${mechanism.id}: ${id}`).toBe(true);
      expect(recipe.resonatorParams?.length ?? 0).toBeLessThanOrEqual(
        recipe.resonators?.length ?? 0,
      );
    }
    expect(new Set(MECHANISMS.map((m) => m.id)).size).toBe(MECHANISMS.length);
  });

  it('terim sözlükleri yalnız var olan mekanizma, materyal ve stile çözülür', () => {
    for (const [term, ids] of MECHANISM_TERMS) {
      expect(tokenize(term).length, term).toBeGreaterThan(0);
      for (const id of ids) expect(mechanismById(id), `${term} → ${id}`).toBeDefined();
    }
    for (const [term, id] of MATERIAL_TERMS) expect(materialById(id), term).toBeDefined();
    const styles = new Set(STYLE_PROFILES.map((p) => p.id));
    for (const [term, id] of STYLE_TERMS) expect(styles.has(id), term).toBe(true);
    const terms = MECHANISM_TERMS.map(([t]) => t);
    expect(new Set(terms).size).toBe(terms.length);
  });

  it('sağlayıcısız mekanizma unsupported, üretim hattı olan pipeline olarak raporlanır', () => {
    const status = Object.fromEntries(capabilityMatrix().mechanisms.map((m) => [m.id, m.status]));
    expect(status.speech).toBe('unsupported');
    expect(status['doppler-motion']).toBe('unsupported');
    expect(status.musical).toBe('pipeline');
    expect(status.impact).toBe('supported');
    for (const m of MECHANISMS) if (m.providers.length === 0) expect(m.recipe).toBeNull();
  });
});

describe('tokenize', () => {
  it('Türkçe büyük İ, noktalama ve tireli sözcükler', () => {
    expect(tokenize('İri TANK, 8-bit Lo-Fi!')).toEqual(['iri', 'tank', '8-bit', 'lo-fi']);
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('ProgramPlanner', () => {
  const tank = brief({
    title: 'Tank atışı',
    intent: 'Ağır bir tank topunun çelik gövdeli atışı.',
    descriptors: ['cinematic'],
  });

  it('tank: çarpma + basınç + mekanizma katmanları ve paylaşılan alan bus’ı', () => {
    const plan = planBrief(tank);
    expect(plan.mechanisms.map((m) => m.id)).toEqual(['impact', 'pressure', 'mechanical', 'tail']);
    expect(plan.layers.map((l) => [l.name, l.role])).toEqual([
      ['impact', 'transient'],
      ['pressure', 'body'],
      ['mechanical', 'mechanism'],
    ]);
    expect(plan.mechanisms[0].sources).toEqual(['term:tank']);
    expect(plan.material).toBe('metal');
    expect(plan.styleSuggestions).toEqual(['cinematic']);
    expect(plan.unsupported).toEqual([]);
    const skeleton = plan.skeleton as {
      buses: Record<string, unknown>;
      layers: { name: string; source: { params?: Record<string, unknown> }; sends?: unknown }[];
    };
    expect(Object.keys(skeleton.buses)).toEqual(['space']);
    expect(skeleton.layers[0].source.params?.materialB).toBe('metal');
    expect(skeleton.layers.map((l) => l.sends !== undefined)).toEqual([true, true, true]);
    const render = renderProgram(skeleton);
    expect(render.channels[0].some((v) => v !== 0)).toBe(true);
  });

  it('yılan tıslaması aynı planlayıcıdan farklı topolojiyle çıkar (alan yok)', () => {
    const snake = planBrief(brief({ title: 'Yılan', intent: 'Tehditkâr bir yılan tıslaması.' }));
    expect(snake.mechanisms.map((m) => m.id)).toEqual(['airflow', 'hiss', 'sibilant-resonance']);
    expect(snake.skeleton?.buses).toBeUndefined();
    const graphs = [snake, planBrief(tank)].map((p) => topologyOf(soundGraph(p.skeleton)));
    expect(hashCanonical(graphs[0])).not.toBe(hashCanonical(graphs[1]));
    renderProgram(snake.skeleton);
  });

  it('desteklenmeyen mekanizma taklit edilmez: konuşma iskelet üretmez', () => {
    const plan = planBrief(brief({ title: 'Anons', intent: 'Robotik konuşma anonsu.' }));
    expect(plan.unsupported).toEqual(['speech']);
    expect(plan.layers).toEqual([]);
    expect(plan.skeleton).toBeNull();
    const music = planBrief(brief({ title: 'Menü müzik', intent: 'Menü için kısa müzik.' }));
    expect(music.pipelines).toEqual(['musical']);
    expect(music.mechanisms.find((m) => m.id === 'ui')?.status).toBe('supported');
  });

  it('beyan ve terim kaynakları birleşir; beyan edilen stil ve materyal iskelete geçer', () => {
    const plan = planBrief(
      brief({
        title: 'Kazıma',
        intent: 'Taş üstünde kazıma.',
        mechanisms: ['scrape', 'rolling'],
        style: 'industrial',
        material: 'wood',
      }),
    );
    expect(plan.mechanisms.map((m) => [m.id, m.sources])).toEqual([
      ['friction', ['term:kazıma']],
      ['scrape', ['declared', 'term:kazıma']],
      ['rolling', ['declared']],
    ]);
    expect(plan.material).toBe('wood');
    const skeleton = plan.skeleton as {
      style: unknown;
      layers: { source: { params: Record<string, unknown> } }[];
    };
    expect(skeleton.style).toEqual({ profile: 'industrial', version: 1 });
    expect(skeleton.layers.map((l) => l.source.params.material)).toEqual(['wood', 'wood', 'wood']);
    resolveProgram(skeleton);
  });

  it('loop brief’i dikiş payı ekler: çıktı süresi hedef süreye eşit', () => {
    const plan = planBrief(
      brief({ title: 'Rüzgar', intent: 'Sürekli rüzgar.', loop: true, assetClass: 'ambience' }),
    );
    const skeleton = plan.skeleton as { durationSeconds: number; master: { loop: unknown } };
    expect(skeleton.master.loop).toEqual({ crossfadeSeconds: 0.25 });
    expect(skeleton.durationSeconds).toBe(1.25);
    expect(outputSeconds(resolveProgram(skeleton))).toBeCloseTo(1, 9);
  });

  it('plan deterministiktir; rol dışı gerekçe taşımaz', () => {
    expect(canonicalJson(planBrief(tank))).toBe(canonicalJson(planBrief(tank)));
    for (const layer of planBrief(tank).layers) expect(layer.rationale).toMatch(/\(term:/);
  });
});

describe('brief ses tasarımı alanları', () => {
  it.each([
    ['mechanisms', { mechanisms: ['teleport'] }, 'mechanisms[0]'],
    ['style', { style: 'vaporwave' }, 'style'],
    ['material', { material: 'unobtainium' }, 'material'],
  ])('bilinmeyen %s kimliği adlı hatayla reddedilir', (_label, fields, path) => {
    try {
      brief(fields);
    } catch (error) {
      expect(error).toBeInstanceOf(AudioParamError);
      expect([(error as AudioParamError).path, (error as AudioParamError).issue]).toEqual([
        path,
        'unknown-id',
      ]);
      return;
    }
    throw new Error('reddedilmedi');
  });
});
