import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { validateBank } from '../../src/family/bank';
import { hashCanonical } from '../../src/kernel/canonical';
import { ProtocolError } from '../../src/protocol/errors';
import {
  checkFamily,
  familyStatus,
  previewFamily,
  publishFamily,
  variantJob,
  verifyFamily,
  type FamilyLocation,
} from '../../src/protocol/family';
import { validateManifest } from '../../src/protocol/manifest';
import { verifyManifest } from '../../src/protocol/publish';
import { jobStatus } from '../../src/protocol/status';
import { BatchBudgetError } from '../../src/guard/batch';
import { cloneTestRepo, createTestRepo, type TestRepo } from '../protocol/repo';
import { shellFamily } from './fixtures';
import { PIPELINE_TIMEOUT, RENDER_TIMEOUT } from '../support/timeouts';

const ROOT = 'devtools/audio-synth/audio-families';
const BANK = 'devtools/audio-synth/reference/production/banks/shell-hits.json';
const ASSETS = 'devtools/audio-synth/reference/production/assets/sfx/families/shell-hits';
const MANIFESTS = 'devtools/audio-synth/reference/production/manifests/sfx/families/shell-hits';

let repo: TestRepo;
let loc: FamilyLocation;
beforeEach(() => {
  repo = createTestRepo();
  loc = { repoRoot: repo.root, familiesRoot: ROOT, familyId: 'shell-hits' };
});
afterEach(() => repo.cleanup());

const at = (rel: string) => join(repo.root, rel);
const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    if (error instanceof ProtocolError) return error.code;
    if (error instanceof BatchBudgetError) return `budget:${error.resource}`;
    throw error;
  }
  throw new Error('hata beklenirdi');
};

describe('aile yayını — varyant başına kanonik akış', () => {
  let golden: TestRepo;
  const at0 = (rel: string) => join(golden.root, rel);
  const goldenLoc = (): FamilyLocation => ({
    repoRoot: golden.root,
    familiesRoot: ROOT,
    familyId: 'shell-hits',
  });
  /** Testin kendi deposunu altın deponun kopyasıyla değiştirir (afterEach siler). */
  const adoptClone = () => {
    repo.cleanup();
    repo = cloneTestRepo(golden);
    loc = { repoRoot: repo.root, familiesRoot: ROOT, familyId: 'shell-hits' };
  };

  beforeAll(() => {
    golden = createTestRepo();
    const outcome = publishFamily(golden.root, ROOT, shellFamily());
    expect(outcome.variants.map((v) => v.result)).toEqual(Array(8).fill('published'));
    expect(outcome.bank).toBe(BANK);
  }, PIPELINE_TIMEOUT);

  afterAll(() => golden.cleanup());

  it('her varyant kendi job’undan publish kapısıyla geçer; bank en son ve tam yazılır', () => {
    const bank = validateBank(JSON.parse(readFileSync(at0(BANK), 'utf8')));
    expect(bank.variants).toHaveLength(8);
    const family = goldenLoc();
    for (const v of bank.variants) {
      const job = variantJob(family, v.key);
      const status = jobStatus(job);
      expect(status.effectiveStage).toBe('published');
      expect(status.artifacts.origin).toMatchObject({ state: 'valid', kind: 'family-variant' });
      const origin = JSON.parse(
        readFileSync(at0(`${job.jobsRoot}/${v.key}/origin.json`), 'utf8'),
      ) as { source: Record<string, string> };
      expect(origin.source).toMatchObject({
        familyId: 'shell-hits',
        variantKey: v.key,
        variantId: v.variantId,
        familyHash: bank.family.hash,
      });
      const manifest = validateManifest(
        JSON.parse(readFileSync(at0(`devtools/audio-synth/${v.manifest.path}`), 'utf8')),
      );
      expect(manifest.program.hash).toBe(v.programHash);
      expect(manifest.render.pcm.hash).toBe(v.pcmHash);
      expect(manifest.job.path).toBe(`${ROOT}/shell-hits/jobs/${v.key}`);
      expect(manifest.policy.verdict).toBe('pass');
    }
    expect(verifyManifest(golden.root, `${MANIFESTS}/soft-light.json`).ok).toBe(true);
    expect(new Set(bank.variants.map((v) => v.pcmHash)).size).toBe(8);
    expect(verifyFamily(family).complete).toBe(true);
  });

  it(
    'yeniden koşu idempotenttir: hiçbir varyant yeniden yayımlanmaz, bank baytları aynı',
    () => {
      adoptClone();
      const before = readFileSync(at(BANK), 'utf8');
      const again = publishFamily(repo.root, ROOT, shellFamily());
      expect(again.variants.map((v) => v.result)).toEqual(Array(8).fill('unchanged'));
      expect(readFileSync(at(BANK), 'utf8')).toBe(before);
    },
    PIPELINE_TIMEOUT,
  );

  it(
    'yarıda kalan yayın bank’sızdır ve incomplete görünür; engel kalkınca aynı komut sürdürür',
    () => {
      const blocked = `${ASSETS}/soft-heavy.ogg`;
      mkdirSync(at(ASSETS), { recursive: true });
      writeFileSync(at(blocked), 'manifest’siz yabancı dosya');
      expect(codeOf(() => publishFamily(repo.root, ROOT, shellFamily()))).toBe('overwrite');
      expect(existsSync(at(BANK))).toBe(false);
      const status = familyStatus(loc);
      expect(status.verification.complete).toBe(false);
      const published = status.variants.filter((v) => v.stage === 'published').map((v) => v.key);
      expect(published.length).toBeGreaterThan(0);
      expect(published).not.toContain('soft-heavy');

      rmSync(at(blocked));
      const resumed = publishFamily(repo.root, ROOT, shellFamily());
      const results = Object.fromEntries(resumed.variants.map((v) => [v.key, v.result]));
      for (const key of published) expect(results[key], key).toBe('unchanged');
      expect(results['soft-heavy']).toBe('published');
      expect(verifyFamily(loc).complete).toBe(true);
    },
    PIPELINE_TIMEOUT,
  );

  it(
    'eksik ya da bozulan varyant bank’ı TAMAM saydırmaz',
    () => {
      adoptClone();
      rmSync(at(`${ASSETS}/hard-light.ogg`));
      const missing = verifyFamily(loc);
      expect(missing.complete).toBe(false);
      expect(missing.checks.find((c) => c.name === 'links')?.detail).toContain('hard-light');
      publishFamily(repo.root, ROOT, shellFamily());
      expect(verifyFamily(loc).complete).toBe(true);
      const manifest = at(`${MANIFESTS}/hard-heavy.json`);
      const doc = JSON.parse(readFileSync(manifest, 'utf8')) as {
        integration: { loop: boolean };
      };
      writeFileSync(
        manifest,
        JSON.stringify({ ...doc, integration: { ...doc.integration, loop: true } }),
      );
      expect(verifyFamily(loc).complete).toBe(false);
    },
    PIPELINE_TIMEOUT,
  );

  it(
    'aile içeriği sürüm artmadan değişemez; değişen ailenin eski bank’ı yayından önce silinir',
    () => {
      adoptClone();
      const changed = shellFamily({ seed: 12 });
      expect(codeOf(() => publishFamily(repo.root, ROOT, changed))).toBe('overwrite');
      const bumped = shellFamily({ seed: 12, version: 2 });
      const outcome = publishFamily(repo.root, ROOT, bumped);
      expect(outcome.variants.every((v) => v.result === 'published')).toBe(true);
      const bank = validateBank(JSON.parse(readFileSync(at(BANK), 'utf8')));
      expect(bank.family).toMatchObject({
        version: 2,
        hash: checkFamily(repo.root, bumped).familyHash,
      });
      expect(readdirSync(at(ASSETS)).sort()).toEqual(
        bank.variants.map((v) => `${v.key}.ogg`).sort(),
      );
    },
    PIPELINE_TIMEOUT,
  );
});

describe('aile ön-denetimi ve kalite kapısı — hiçbir şey yazılmadan', () => {
  it('bütçe aşımı adıyla reddedilir, dosya açılmaz', () => {
    expect(
      codeOf(() =>
        publishFamily(repo.root, ROOT, shellFamily({ budget: { maxTotalWorkUnits: 1000 } })),
      ),
    ).toBe('budget:work');
    expect(existsSync(at(ROOT))).toBe(false);
    expect(previewFamily(repo.root, shellFamily()).estimate.items).toBe(8);
  });

  it(
    'kalite kapısı düşerse (yakın-özdeş ikiz) hiçbir job, asset ya da bank yazılmaz',
    () => {
      const narrow = {
        size: { min: 0.2, max: 0.2001 },
        hardness: { min: 0.4, max: 0.4001 },
        damping: { min: 0.5, max: 0.5001 },
      };
      const twins = shellFamily({
        roles: { weight: { light: narrow } },
        variants: Array.from({ length: 8 }, (_, i) => ({
          key: `twin-${i}`,
          roles: { weight: 'light' },
        })),
      });
      const check = checkFamily(repo.root, twins);
      if (check.quality.verdict.pass) throw new Error('fixture kapıyı düşürmedi');
      expect(codeOf(() => publishFamily(repo.root, ROOT, twins))).toBe('policy');
      expect(existsSync(at(ROOT))).toBe(false);
      expect(existsSync(at(ASSETS))).toBe(false);
    },
    RENDER_TIMEOUT,
  );

  it('frozen ya da beyansız hedef reddedilir', () => {
    const frozen = shellFamily({
      delivery: { ...(shellFamily().delivery as object), package: '@volstudio/old-game' },
    });
    expect(codeOf(() => previewFamily(repo.root, frozen))).toBe('destination');
    expect(hashCanonical(shellFamily())).toBe(hashCanonical(shellFamily()));
  });
});
