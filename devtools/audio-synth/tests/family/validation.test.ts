import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateBank } from '../../src/family/bank';
import { expandFamily, validateFamilyProgram } from '../../src/family/program';
import { AudioParamError } from '../../src/guard/errors';
import { ProtocolError } from '../../src/protocol/errors';
import {
  checkFamily,
  familyLabel,
  familyStatus,
  listFamilies,
  previewFamily,
  publishFamily,
  variantJob,
  verifyFamily,
  type FamilyLocation,
} from '../../src/protocol/family';
import { initJob } from '../../src/protocol/job';
import { edited } from '../support/json';
import { createTestRepo, type TestRepo } from '../protocol/repo';
import { dropletFamily, shellFamily } from './fixtures';

function issue(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof AudioParamError) return `${error.path} ${error.issue}`;
    if (error instanceof ProtocolError) return `protocol:${error.code}`;
    throw error;
  }
  return 'kabul edildi';
}

describe('SoundFamilyProgramV1 — hata ve kenar dalları', () => {
  const validate = (doc: unknown) => () => validateFamilyProgram(doc);
  it.each([
    ['yanlış şema', { ...shellFamily(), schema: 'SoundFamilyProgramV2' }, 'schema type'],
    ['geçersiz familyId', { ...shellFamily(), familyId: 'Aile' }, 'familyId type'],
    ['boş başlık', { ...shellFamily(), title: ' ' }, 'title type'],
    ['tek varyant', edited(shellFamily(), [['variants'], [{ key: 'solo' }]]), 'variants range'],
    [
      'geçersiz anahtar',
      edited(shellFamily(), [['variants', 0, 'key'], 'Büyük']),
      'variants[0].key type',
    ],
    [
      'geçersiz etiket',
      edited(shellFamily(), [['variants', 0, 'tags'], ['Boss Fight']]),
      'variants[0].tags[0] type',
    ],
    [
      'boş rol seçenek kümesi',
      edited(shellFamily(), [['roles', 'rarity', 'common', 'layout'], { options: [] }]),
      'roles.rarity.common.layout.options range',
    ],
    [
      'boyutta olmayan rol seçeneği',
      edited(shellFamily(), [['roles', 'rarity', 'common', 'layout'], { options: ['string'] }]),
      'roles.rarity.common.layout.options[0] combination',
    ],
    [
      'bilinmeyen politika',
      edited(shellFamily(), [['variation', 'policy'], 'random']),
      'variation.policy type',
    ],
  ])('%s', (_, doc, expected) => {
    expect(issue(validate(doc))).toBe(expected);
  });

  it('rolsüz/etiketsiz varyant, kaynak (arama) bilgisi, bütçe ve varsayılan kalite politikası', () => {
    const doc = shellFamily({
      provenance: {
        searchId: 'reference-shell',
        candidateId: 'c-0123456789abcdef',
        reportHash: `sha256:${'0'.repeat(64)}`,
      },
      budget: { maxItems: 64 },
      quality: undefined,
    });
    const variants = [...(doc.variants as Record<string, unknown>[])];
    variants.push({ key: 'plain' });
    const family = validateFamilyProgram({ ...doc, variants });
    expect(family.provenance?.searchId).toBe('reference-shell');
    expect(family.budget).toEqual({ maxItems: 64 });
    expect(family.quality).toBeUndefined();
    const plain = expandFamily(family).find((v) => v.key === 'plain');
    expect(plain?.roles).toEqual({});
    expect(plain?.tags).toEqual([]);
    expect(plain?.values).not.toHaveProperty('layout');
  });
});

describe('aile protokolü — kenar dalları (geçici depo)', () => {
  let repo: TestRepo;
  let loc: FamilyLocation;
  const ROOT = 'devtools/audio-synth/audio-families';
  beforeEach(() => {
    repo = createTestRepo();
    loc = { repoRoot: repo.root, familiesRoot: ROOT, familyId: 'droplets' };
  });
  afterEach(() => repo.cleanup());

  it('geçersiz aile kimliği yol hatasıdır; kök yoksa aile listesi boştur, dosyalar aile sayılmaz', () => {
    expect(issue(() => familyLabel({ ...loc, familyId: '../x' }))).toBe('protocol:path');
    expect(listFamilies(repo.root, ROOT)).toEqual([]);
    mkdirSync(join(repo.root, ROOT, 'droplets'), { recursive: true });
    writeFileSync(join(repo.root, ROOT, 'note.txt'), 'x');
    expect(listFamilies(repo.root, ROOT)).toEqual(['droplets']);
  });

  it('yol sınıfı teslim sınıfıyla uyuşmazsa hedef hatası', () => {
    const ui = dropletFamily({
      delivery: { ...(dropletFamily().delivery as object), assetClass: 'ui' },
    });
    expect(issue(() => previewFamily(repo.root, ui))).toBe('protocol:destination');
  });

  it('kalite politikası verilmeyen aile varsayılan politikayla değerlendirilir', () => {
    const check = checkFamily(repo.root, dropletFamily({ quality: undefined }));
    expect(check.quality.policy.minMembers).toBe(2);
    expect(check.quality.verdict.pass).toBe(true);
  });

  it('aile belgesi yoksa, bank bozuksa ya da kalite belgesi yoksa doğrulama TAMAM demez', () => {
    expect(verifyFamily(loc)).toMatchObject({ complete: false, bank: '—' });
    expect(familyStatus(loc).variants).toEqual([]);
    publishFamily(repo.root, ROOT, dropletFamily());
    expect(verifyFamily(loc).complete).toBe(true);
    const bank = join(repo.root, 'devtools/audio-synth/reference/production/banks/droplets.json');
    const original = readFileSync(bank, 'utf8');
    writeFileSync(bank, '{}');
    expect(verifyFamily(loc).checks.map((c) => c.name)).toEqual(['bank-schema']);
    writeFileSync(bank, original);
    rmSync(join(repo.root, ROOT, 'droplets/quality.json'));
    expect(verifyFamily(loc).checks.find((c) => c.name === 'quality-hash')).toMatchObject({
      ok: false,
      detail: 'quality.json yok',
    });
    expect(
      validateBank(JSON.parse(original)).variants.every(
        (v) => v.descriptors.pitchHz === null || v.descriptors.pitchHz > 0,
      ),
    ).toBe(true);
  }, 120_000);

  it('aile genişletmesi bank’tan saparsa (farklı tohumla elle yazılmış aile) doğrulama sapmayı adlandırır', () => {
    publishFamily(repo.root, ROOT, dropletFamily());
    const file = join(repo.root, ROOT, 'droplets/family.json');
    writeFileSync(
      file,
      JSON.stringify({ ...(JSON.parse(readFileSync(file, 'utf8')) as object), seed: 99 }),
    );
    const report = verifyFamily(loc);
    expect(report.complete).toBe(false);
    expect(report.checks.find((c) => c.name === 'expansion')?.detail).toMatch(/uyuşmayan/);
  }, 120_000);

  it('varyant işi başka bir hedefe aitse yayın kimlik hatasıyla durur', () => {
    initJob(variantJob(loc, 'fast-heavy'), {
      target: {
        package: '@volstudio/audio-synth',
        asset: 'reference/production/assets/sfx/families/droplets/other.ogg',
        integration: { runtimeKey: null, loop: false },
      },
    });
    expect(issue(() => publishFamily(repo.root, ROOT, dropletFamily()))).toBe('protocol:identity');
  }, 120_000);
});
