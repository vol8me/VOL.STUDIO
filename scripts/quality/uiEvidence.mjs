import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REGISTRY_PATH } from './uiRegistry.mjs';

/**
 * UI kanıt kayıtlarının doğrulaması: axe ve geometri istisna kayıtları ile durum fixture
 * verisi vitrin E2E'sinin girdisidir. Burada yalnız veri bütünlüğü sınanır:
 * her kayıt açık bir UI görevine bağlıdır, gerekçesi vardır, yinelenmez ve
 * fixture'lar registry'de uygulanabilir bir durumu sınar (N/A durum fixture'ı
 * ya da kayıtsız export reddedilir).
 */
export const AXE_RECORDS_PATH = 'devtools/vol-showcase/tests/e2e/support/axeExceptions.json';
export const GEOMETRY_RECORDS_PATH =
  'devtools/vol-showcase/tests/e2e/support/geometryExceptions.json';
export const STATE_FIXTURES_PATH = 'devtools/vol-showcase/tests/e2e/support/stateFixtures.json';

const GEOMETRY_RULES = new Set(['size', 'clipped', 'covered']);
const SCOPE = /^(tab\/[a-z]+|layer\/[a-z]+\/[a-z]+)$/;

function openTasks(text) {
  return new Set([...text.matchAll(/^- \[ \] \*\*(UI-\d\d\.\d) /gm)].map((match) => match[1]));
}

export function validateAxeRecords(records, tasks) {
  const problems = [];
  for (const kind of ['violations', 'incomplete']) {
    const seen = new Set();
    for (const record of records[kind] ?? []) {
      const id = `${record.scope} ${record.rule} @ ${record.target}`;
      if (seen.has(id)) problems.push(`axe ${kind}: yinelenen kayıt: ${id}`);
      seen.add(id);
      if (!SCOPE.test(record.scope ?? '')) problems.push(`axe ${kind}: geçersiz kapsam: ${id}`);
      if (!record.rule || !record.target) problems.push(`axe ${kind}: kural/hedef eksik: ${id}`);
      if (!tasks.has(record.owner))
        problems.push(
          `axe ${kind}: sahip görev açık bir UI görevi olmalı (${record.owner}): ${id}`,
        );
      if (typeof record.reason !== 'string' || record.reason.trim() === '')
        problems.push(`axe ${kind}: gerekçe boş: ${id}`);
    }
  }
  return problems;
}

export function validateGeometryRecords(document, tasks) {
  const problems = [];
  const seen = new Set();
  for (const record of document.hitTargets ?? []) {
    const id = `${record.scope} ${record.rule} @ ${record.target}`;
    if (seen.has(id)) problems.push(`geometri: yinelenen kayıt: ${id}`);
    seen.add(id);
    if (!SCOPE.test(record.scope ?? '')) problems.push(`geometri: geçersiz kapsam: ${id}`);
    if (!GEOMETRY_RULES.has(record.rule)) problems.push(`geometri: bilinmeyen kural: ${id}`);
    if (!record.target) problems.push(`geometri: hedef eksik: ${id}`);
    if (!tasks.has(record.owner))
      problems.push(`geometri: sahip görev açık bir UI görevi olmalı (${record.owner}): ${id}`);
    if (typeof record.reason !== 'string' || record.reason.trim() === '')
      problems.push(`geometri: gerekçe boş: ${id}`);
  }
  const fonts = new Set();
  for (const record of document.glyphHeights ?? []) {
    const id = `${record.font} [${(record.engines ?? ['*']).join(',')}]`;
    if (fonts.has(id)) problems.push(`glif: yinelenen kayıt: ${id}`);
    fonts.add(id);
    if (!/^.+ \d+(\.\d+)?px w\d+$/.test(record.font ?? ''))
      problems.push(`glif: yazı tipi anahtarı "Aile boyutpx w<ağırlık>" olmalı: ${id}`);
    for (const engine of record.engines ?? [])
      if (!['chromium', 'webkit'].includes(engine))
        problems.push(`glif: bilinmeyen motor "${engine}": ${id}`);
    if (!tasks.has(record.owner))
      problems.push(`glif: sahip görev açık bir UI görevi olmalı (${record.owner}): ${id}`);
    if (typeof record.reason !== 'string' || record.reason.trim() === '')
      problems.push(`glif: gerekçe boş: ${id}`);
  }
  return problems;
}

export function validateStateFixtures(document, registry, tasks) {
  const problems = [];
  const byExport = new Map((registry.entries ?? []).map((entry) => [entry.export, entry]));
  const scopes = new Set();
  for (const fixture of document.fixtures ?? []) {
    if (scopes.has(fixture.scope)) problems.push(`fixture ${fixture.scope}: yinelenen kapsam.`);
    scopes.add(fixture.scope);
    const entry = byExport.get(fixture.export);
    if (!entry) {
      problems.push(`fixture ${fixture.scope}: ${fixture.export} registry'de yok.`);
      continue;
    }
    const archetype = registry.archetypes?.[entry.archetype];
    const applicable = new Set([...(archetype?.applicable ?? []), ...(entry.extraStates ?? [])]);
    for (const state of fixture.states ?? []) {
      if (!applicable.has(state))
        problems.push(
          `fixture ${fixture.scope}: ${fixture.export} için "${state}" uygulanabilir değil (gerekçeli N/A): fixture N/A duruma yazılamaz.`,
        );
    }
    for (const [state, engines] of Object.entries(fixture.known ?? {})) {
      if (!(fixture.states ?? []).includes(state))
        problems.push(`fixture ${fixture.scope}: known "${state}" fixture'ın durumu değil.`);
      for (const [engine, owner] of Object.entries(engines)) {
        if (!['chromium', 'webkit', '*'].includes(engine))
          problems.push(`fixture ${fixture.scope}: bilinmeyen motor "${engine}".`);
        if (!tasks.has(owner))
          problems.push(`fixture ${fixture.scope}: known sahibi açık UI görevi olmalı (${owner}).`);
      }
    }
  }
  return problems;
}

export function validateRepoUiEvidence(root) {
  const read = (path) =>
    existsSync(resolve(root, path)) ? readFileSync(resolve(root, path), 'utf8') : null;
  const todo = read('docs/ui/TODO.md');
  const axe = read(AXE_RECORDS_PATH);
  const geometry = read(GEOMETRY_RECORDS_PATH);
  const fixtures = read(STATE_FIXTURES_PATH);
  const registry = read(REGISTRY_PATH);
  if (todo === null || axe === null || geometry === null || fixtures === null || registry === null)
    return [
      'UI kanıt kayıtları: TODO, axeExceptions, geometryExceptions, stateFixtures ya da registry eksik.',
    ];
  const tasks = openTasks(todo);
  return [
    ...validateAxeRecords(JSON.parse(axe), tasks),
    ...validateGeometryRecords(JSON.parse(geometry), tasks),
    ...validateStateFixtures(JSON.parse(fixtures), JSON.parse(registry), tasks),
  ];
}
