import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * `organize-pen-export.mjs` CLI'sinin gerçek süreç + gerçek geçici disk
 * sözleşmesi (B11). Kaynağı tüketme, çakışan kimlik ve yerleştirme hatasında
 * geri alma burada sınanır; rigExport testi bu düzenleyiciyi bütünüyle sınamaz.
 * `.pen` dosyasına dokunulmaz: girdi manifest ve PNG adlı sahte baytlardır.
 */
const REPO = resolve(import.meta.dirname, '../../..');
const SCRIPT = resolve(import.meta.dirname, '../scripts/organize-pen-export.mjs');
const OUTPUT_PARENT = join(REPO, 'node_modules/.cache/pen-dev-organize');

let staging: string;
let output: string;
beforeEach(() => {
  staging = mkdtempSync(join(tmpdir(), 'pen-staging-'));
  mkdirSync(OUTPUT_PARENT, { recursive: true });
  output = mkdtempSync(join(OUTPUT_PARENT, 'out-'));
});
afterEach(() => {
  rmSync(staging, { recursive: true, force: true });
  rmSync(output, { recursive: true, force: true });
});

interface Item {
  id: string;
  partId: string;
  type?: string;
  width?: number;
  height?: number;
  parent?: string;
}

const part = (id: string, partId: string, parent?: string): Item => ({
  id,
  partId,
  type: 'rectangle',
  width: 10,
  height: 10,
  ...(parent ? { parent } : {}),
});

function stage(...ids: string[]): void {
  for (const id of ids) writeFileSync(join(staging, `${id}.png`), `png:${id}`);
}

function organize(parts: Item[], previews: Item[] = []) {
  // Manifest staging'in dışında: staging başarıyla silinirken de okunabilsin.
  const manifestFile = join(output, '..', `manifest-${process.pid}.json`);
  writeFileSync(
    manifestFile,
    JSON.stringify({ entityId: 'walker', domain: 'enemies', parts, previews }),
  );
  const result = spawnSync(process.execPath, [SCRIPT, manifestFile, staging, output], {
    encoding: 'utf8',
  });
  rmSync(manifestFile, { force: true });
  return result;
}

const entity = (...segments: string[]): string => join(output, 'enemies', 'walker', ...segments);
const leftovers = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir).filter((name) => name.includes('.tmp-')) : [];

describe('organize-pen-export CLI (B11)', () => {
  it('geçerli manifest: parça, önizleme ve metadata yazılır; kaynak ve staging temizlenir', () => {
    stage('n1', 'n2', 'p1');
    const result = organize([part('n1', 'hull'), part('n2', 'arm', 'hull')], [part('p1', 'card')]);
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(entity('parts', 'hull.png'), 'utf8')).toBe('png:n1');
    expect(readFileSync(entity('parts', 'arm.png'), 'utf8')).toBe('png:n2');
    expect(readFileSync(entity('previews', 'card.png'), 'utf8')).toBe('png:p1');
    const metadata = JSON.parse(
      readFileSync(entity('metadata', 'walker.metadata.json'), 'utf8'),
    ) as {
      parts: { partId: string; sourceNodeId: string; parentPartId: string | null }[];
    };
    expect(metadata.parts.map((p) => [p.partId, p.sourceNodeId, p.parentPartId])).toEqual([
      ['hull', 'n1', null],
      ['arm', 'n2', 'hull'],
    ]);
    expect(existsSync(staging)).toBe(false);
    for (const dir of ['parts', 'previews', 'metadata']) expect(leftovers(entity(dir))).toEqual([]);
  });

  it('farklı partId aynı nodeId: yazımdan önce reddedilir, kaynak ve hedef dokunulmaz', () => {
    stage('n1', 'n2');
    const result = organize([part('n1', 'body'), part('n1', 'arm'), part('n2', 'leg')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/düğüm "n1" hem "body" hem "arm"/);
    expect(existsSync(join(staging, 'n1.png'))).toBe(true);
    expect(existsSync(join(staging, 'n2.png'))).toBe(true);
    expect(existsSync(join(output, 'enemies'))).toBe(false);
  });

  it('aynı düğüm hem parça hem önizlemede: tek plan olarak reddedilir', () => {
    stage('n1');
    const result = organize([part('n1', 'body')], [part('n1', 'card')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/düğüm "n1" hem "body" hem "card"/);
    expect(existsSync(join(staging, 'n1.png'))).toBe(true);
    expect(existsSync(join(output, 'enemies'))).toBe(false);
  });

  it('eksik staging dosyası hiçbir kaynağı tüketmeden reddedilir', () => {
    stage('n1');
    const result = organize([part('n1', 'body'), part('n2', 'arm')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/staging dosyası eksik - arm/);
    expect(existsSync(join(staging, 'n1.png'))).toBe(true);
    expect(existsSync(join(output, 'enemies'))).toBe(false);
  });

  it.each(['../evil', 'a/b', 'a\\b', '', '.hidden'])(
    'yolu kaçıran düğüm kimliği reddedilir: %j',
    (id) => {
      stage('n1');
      const result = organize([{ ...part(id, 'body') }]);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/düğüm kimliği geçersiz/);
      expect(existsSync(join(staging, 'n1.png'))).toBe(true);
      expect(existsSync(join(output, 'enemies'))).toBe(false);
    },
  );

  it('ikinci hedef yerleştirilemezse ilk hedef eski hâline döner, kaynaklar ve staging kalır', () => {
    // Önceki başarılı export: hull.png eski içerikle duruyor.
    stage('n1', 'n2');
    expect(organize([part('n1', 'hull'), part('n2', 'arm')]).status).toBe(0);
    const before = readFileSync(entity('parts', 'hull.png'), 'utf8');
    const metadataBefore = readFileSync(entity('metadata', 'walker.metadata.json'), 'utf8');

    // Yeni export: arm.png hedefi dizin olduğu için rename düşer.
    rmSync(entity('parts', 'arm.png'));
    mkdirSync(entity('parts', 'arm.png'));
    mkdirSync(staging, { recursive: true });
    writeFileSync(join(staging, 'n1.png'), 'png:yeni-n1');
    writeFileSync(join(staging, 'n2.png'), 'png:yeni-n2');
    const result = organize([part('n1', 'hull'), part('n2', 'arm')]);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/önceki hedef geri yüklendi/);
    expect(readFileSync(entity('parts', 'hull.png'), 'utf8')).toBe(before);
    expect(readFileSync(entity('metadata', 'walker.metadata.json'), 'utf8')).toBe(metadataBefore);
    expect(readFileSync(join(staging, 'n1.png'), 'utf8')).toBe('png:yeni-n1');
    expect(readFileSync(join(staging, 'n2.png'), 'utf8')).toBe('png:yeni-n2');
    for (const dir of ['parts', 'metadata']) expect(leftovers(entity(dir))).toEqual([]);
  });

  it('ilk export yarıda düşerse hiçbir hedef ya da metadata kalmaz', () => {
    stage('n1', 'n2');
    mkdirSync(entity('parts', 'arm.png'), { recursive: true });
    const result = organize([part('n1', 'hull'), part('n2', 'arm')]);
    expect(result.status).toBe(1);
    expect(existsSync(entity('parts', 'hull.png'))).toBe(false);
    expect(existsSync(entity('metadata', 'walker.metadata.json'))).toBe(false);
    expect(existsSync(join(staging, 'n1.png'))).toBe(true);
    expect(existsSync(join(staging, 'n2.png'))).toBe(true);
    expect(leftovers(entity('parts'))).toEqual([]);
  });

  it('ebeveyn sırası ve partId kuralları yazımdan önce denetlenir', () => {
    stage('n1', 'n2');
    expect(organize([part('n2', 'arm', 'hull'), part('n1', 'hull')]).stderr).toMatch(/SONRA/);
    expect(organize([part('n1', 'Hull')]).stderr).toMatch(/snake_case/);
    expect(organize([part('n1', 'hull'), part('n2', 'hull')]).stderr).toMatch(/birden fazla/);
    expect(existsSync(join(output, 'enemies'))).toBe(false);
  });
});
