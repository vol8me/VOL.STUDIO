import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listJobLocations, verifyJobPublications } from '../../src/protocol/jobInventory';
import { publishJob } from '../../src/protocol/publish';
import { PIPELINE_BLOCK } from '../support/timeouts';
import { createTestRepo, prepareSelectedJob, type TestRepo } from './repo';

/**
 * B20: yayın kaydı taşıyan iş, kaydın gösterdiği hedef kaybolduğunda
 * yeniden yayın öneren bir artık olarak sessizce kalamaz; envanter onu bulur.
 */
let repo: TestRepo;
beforeEach(() => {
  repo = createTestRepo();
});
afterEach(() => repo.cleanup());

const asset = 'devtools/audio-synth/reference/production/assets/sfx/knock.ogg';
const manifest = 'devtools/audio-synth/reference/production/manifests/sfx/knock.json';

describe('iş yayın envanteri', () => {
  it('boş depoda iş yoktur', () => {
    expect(listJobLocations(repo.root)).toEqual([]);
    expect(verifyJobPublications(repo.root)).toEqual([]);
  });

  it('yayın kaydı olmayan iş (devam eden çalışma) tutarlı sayılır', () => {
    prepareSelectedJob(repo, 'knock');
    expect(verifyJobPublications(repo.root)).toEqual([
      expect.objectContaining({
        job: 'devtools/audio-synth/records/jobs/knock',
        publication: 'none',
        next: 'publish',
        ok: true,
      }),
    ]);
  });

  it(
    'yayımlanmış iş geçerlidir; hedef kaybolunca emekli artık olarak bulunur',
    () => {
      const loc = prepareSelectedJob(repo, 'knock');
      publishJob(loc);
      expect(verifyJobPublications(repo.root)).toEqual([
        expect.objectContaining({ publication: 'valid', next: 'done', ok: true, reason: null }),
      ]);

      // Eski işin hedefi başka bir işle değiştirilip dosyaları silinmiş durum.
      rmSync(join(repo.root, manifest));
      rmSync(join(repo.root, asset));
      const [stale] = verifyJobPublications(repo.root);
      expect(stale).toMatchObject({ publication: 'corrupt', next: 'publish', ok: false });
      expect(stale.reason).toMatch(/dosya yok/);
    },
    PIPELINE_BLOCK.timeout,
  );

  it(
    'yalnız asset kaybolursa da tutarsızlık yakalanır',
    () => {
      publishJob(prepareSelectedJob(repo, 'knock'));
      rmSync(join(repo.root, asset));
      const [row] = verifyJobPublications(repo.root);
      expect(row).toMatchObject({ ok: false, next: 'publish' });
      expect(row.publication).not.toBe('valid');
      expect(row.reason).toMatch(/asset dosyası yok/);
      // Manifest hâlâ okunabilir: sorun yalnız asset'te.
      expect(readFileSync(join(repo.root, manifest), 'utf8')).toContain('AudioAssetManifestV1');
    },
    PIPELINE_BLOCK.timeout,
  );

  it('aile ve müzik altındaki işler de, deterministik sırayla listelenir', () => {
    const roots = [
      'devtools/audio-synth/records/jobs',
      'devtools/audio-synth/records/families/shells/jobs',
      'devtools/audio-synth/records/music/theme/jobs',
    ];
    for (const jobsRoot of roots) {
      mkdirSync(join(repo.root, jobsRoot), { recursive: true });
      prepareSelectedJob(repo, 'knock', { jobsRoot });
    }
    expect(listJobLocations(repo.root).map((loc) => loc.jobsRoot)).toEqual(roots);
    // Job kaydı olmayan dizin ve geçersiz ad envantere girmez.
    mkdirSync(join(repo.root, roots[0], 'not-a-job'), { recursive: true });
    mkdirSync(join(repo.root, roots[0], 'Bad_Name'), { recursive: true });
    expect(listJobLocations(repo.root)).toHaveLength(3);
  });
});
