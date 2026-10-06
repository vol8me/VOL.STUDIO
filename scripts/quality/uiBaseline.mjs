import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * UI ilk referans kaydı (UI-00.5). Kayıtlar git dışı özel alana yazılır
 * (`devtools/vol-showcase/records`); burada yalnız kaydın biçimi, saymanın
 * yöntemi ve iki kaydı karşılaştırma yöntemi tutulur ve testlenir.
 *
 * Kayıt cihaz adresi, seri numarası ya da kullanıcı adı taşımaz. Ölçülmeyen
 * hücre `NOT-RUN` ya da `NOT-SUPPORTED` olarak gerekçesiyle yazılır; sıfır
 * ya da tahmin değildir.
 */
export const BASELINE_SCHEMA = 'UiBaselineV1';
export const BASELINE_DIR = 'devtools/vol-showcase/records/ui-baseline';
export const PERF_DIR = 'devtools/vol-showcase/records/ui-perf';

const TABS_SOURCE = 'devtools/vol-showcase/tests/e2e/support/determinism.ts';
const SHOWCASE_I18N = 'devtools/vol-showcase/src/i18n';
const CORE_I18N = 'core/src/i18n';
const REGISTRY = 'devtools/vol-showcase/src/catalog/registry.json';

/** Yaprak (metin) anahtarlarının sayısı: iç düğümler sayılmaz. */
export function countLeaves(value) {
  if (typeof value !== 'object' || value === null) return 1;
  return Object.values(value).reduce((sum, child) => sum + countLeaves(child), 0);
}

const readJson = (root, path) => JSON.parse(readFileSync(join(root, path), 'utf8'));

/** Kaynaktan sayılan başlangıç: sekme, i18n anahtarı ve CORE doğrudan tüketimi. */
export function countStatic(root) {
  const source = readFileSync(join(root, TABS_SOURCE), 'utf8');
  const list = /SHOWCASE_TABS\s*=\s*\[([^\]]*)\]/.exec(source)?.[1] ?? '';
  const testedTabs = [...list.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  const en = readJson(root, `${SHOWCASE_I18N}/en.json`);
  const tr = readJson(root, `${SHOWCASE_I18N}/tr.json`);
  const registry = readJson(root, REGISTRY);
  const direct = registry.entries.filter((entry) => entry.consumer === 'direct');
  return {
    tabs: Object.keys(en.tabs ?? {}).length,
    testedTabs: testedTabs.length,
    showcaseKeys: { en: countLeaves(en), tr: countLeaves(tr) },
    coreKeys: {
      en: countLeaves(readJson(root, `${CORE_I18N}/en.json`)),
      tr: countLeaves(readJson(root, `${CORE_I18N}/tr.json`)),
    },
    directConsumers: {
      classes: direct.filter((entry) => entry.kind === 'class').length,
      helpers: direct.filter((entry) => entry.kind === 'helper').length,
    },
  };
}

/** Ölçülmeyen cihaz hücreleri: bağlı olsa da yerel vitrin ölçümü yoksa NOT-RUN. */
export function deviceCells() {
  const native = 'yerel vitrin ölçümü UI-06.4/UI-11.4/UI-12.4 teslimiyle gelir';
  return {
    windowsLaptop: {
      status: 'measured-host',
      note: 'başsız tarayıcı koşusu; fiziksel panel ölçümü değildir',
    },
    androidTablet: { status: 'NOT-RUN', reason: native },
    steamDeck: { status: 'NOT-RUN', reason: `cihaz bağlı değil; ${native}` },
    samsung: { status: 'NOT-RUN', reason: `cihaz yok; ${native}` },
    android16: { status: 'NOT-RUN', reason: `cihaz yok; ${native}` },
  };
}

/** `records/ui-perf` altındaki rapor özetleri (yoksa NOT-RUN). */
export function readPerfSummary(root) {
  const directory = join(root, PERF_DIR);
  if (!existsSync(directory)) return { status: 'NOT-RUN', reason: 'ui-perf kaydı yok' };
  const summary = {};
  for (const file of readdirSync(directory).filter((name) => name.endsWith('.json'))) {
    const document = JSON.parse(readFileSync(join(directory, file), 'utf8'));
    const scopes = document.report?.scopes ?? {};
    const p95 = (name) => scopes[name]?.distribution?.p95 ?? null;
    summary[file.replace(/\.json$/, '')] = {
      verdict: document.verdict?.verdict ?? null,
      hz: document.report?.hz ?? null,
      timerResolutionMs: document.report?.timerResolutionMs ?? null,
      inputPointerP95Ms: p95('inputPointer'),
      inputKeyboardP95Ms: p95('inputKeyboard'),
      tabSwitchJsP95Ms: document.probes?.tabSwitchJs?.a1?.p95 ?? null,
    };
  }
  return Object.keys(summary).length === 0
    ? { status: 'NOT-RUN', reason: 'ui-perf kaydı yok' }
    : { status: 'measured', records: summary };
}

const LABEL = /^[a-z0-9][a-z0-9._-]*$/;
const ENGINES = ['chromium', 'webkit'];
const HASH = /^[0-9a-f]{64}$/;

/** Kayıt biçimi hataları. */
export function validateBaseline(document) {
  const problems = [];
  if (document?.schema !== BASELINE_SCHEMA) problems.push(`şema ${BASELINE_SCHEMA} değil`);
  if (!LABEL.test(document?.label ?? '')) problems.push('etiket küçük harf/rakam/.-_ olmalı');
  const counts = document?.counts;
  if (!counts) problems.push('sayımlar eksik');
  else {
    if (counts.tabs !== counts.testedTabs)
      problems.push(`sekme sayısı ${counts.tabs} ≠ test edilen ${counts.testedTabs}`);
    if (counts.showcaseKeys?.en !== counts.showcaseKeys?.tr)
      problems.push('vitrin EN/TR anahtar sayısı eşit değil');
    if (counts.coreKeys?.en !== counts.coreKeys?.tr)
      problems.push('CORE EN/TR anahtar sayısı eşit değil');
  }
  for (const [name, bundle] of Object.entries(document?.bundles ?? {})) {
    for (const key of ['appBytes', 'vendorBytes', 'cssBytes'])
      if (!Number.isInteger(bundle?.[key]) || bundle[key] < 0)
        problems.push(`bundle ${name}.${key} bayt sayısı olmalı`);
  }
  for (const engine of ENGINES) {
    const screens = document?.screens?.[engine];
    if (screens === undefined) continue;
    for (const [tab, hash] of Object.entries(screens))
      if (!HASH.test(hash)) problems.push(`ekran ${engine}/${tab}: sha256 değil`);
  }
  for (const [name, cell] of Object.entries(document?.devices ?? {})) {
    if (cell?.status === 'NOT-RUN' && !cell.reason)
      problems.push(`cihaz ${name}: NOT-RUN gerekçesiz`);
  }
  if (!document?.devices?.steamDeck) problems.push('Steam Deck hücresi yok');
  return problems;
}

const delta = (a, b) => (b > a ? `+${b - a}` : `${b - a}`);

/**
 * İki kaydı karşılaştırır. `changes` her farkı, `regressions` yalnız kötüleşmeyi
 * (bundle büyümesi, ekran değişimi, hareket azaltmanın işlevsizliği, ölçü
 * yitimi) listeler. Yöntem ölçüm gürültüsüne dayanmaz: ekran özetleri
 * dondurulmuş ortamdan, sayılar kaynaktan, baytlar dosya sıkıştırmasındandır.
 */
export function compareBaselines(before, after) {
  const changes = [];
  const regressions = [];

  const flat = (value, path = []) =>
    typeof value === 'object' && value !== null
      ? Object.entries(value).flatMap(([key, child]) => flat(child, [...path, key]))
      : [[path.join('.'), value]];
  const prevCounts = new Map(flat(before.counts));
  for (const [key, value] of flat(after.counts)) {
    if (prevCounts.get(key) !== value) {
      changes.push(`sayım ${key}: ${prevCounts.get(key)} → ${value}`);
    }
  }

  for (const [name, bundle] of Object.entries(after.bundles ?? {})) {
    const old = before.bundles?.[name];
    if (!old) {
      changes.push(`bundle ${name}: yeni kayıt`);
      continue;
    }
    for (const key of ['appBytes', 'vendorBytes', 'cssBytes']) {
      if (bundle[key] === old[key]) continue;
      const line = `bundle ${name}.${key}: ${old[key]} → ${bundle[key]} (${delta(old[key], bundle[key])} B)`;
      changes.push(line);
      if (bundle[key] > old[key]) regressions.push(line);
    }
  }

  for (const engine of ENGINES) {
    const was = before.screens?.[engine];
    const now = after.screens?.[engine];
    if (was === undefined || now === undefined) {
      if ((was === undefined) !== (now === undefined)) {
        const line = `ekranlar ${engine}: ${now === undefined ? 'yeni kayıtta yok (ölçü yitimi)' : 'önceki kayıtta yoktu'}`;
        changes.push(line);
        if (now === undefined) regressions.push(line);
      }
      continue;
    }
    for (const tab of new Set([...Object.keys(was), ...Object.keys(now)])) {
      if (was[tab] !== now[tab]) {
        const line = `ekran ${engine}/${tab}: piksel özeti değişti`;
        changes.push(line);
        regressions.push(line);
      }
    }
  }

  const motionNow = after.motion ?? {};
  for (const engine of ENGINES) {
    for (const [tab, modes] of Object.entries(motionNow[engine] ?? {})) {
      const old = before.motion?.[engine]?.[tab];
      if (old && JSON.stringify(old) !== JSON.stringify(modes))
        changes.push(`hareket ${engine}/${tab}: sürekli animasyon kümesi değişti`);
      // İlk kayıttaki mevcut kusur (azaltma açıkken de süren animasyon) kötüleşme
      // değildir; kötüleşme, önceki kayıtta olmayan YENİ bir adın azaltma altında
      // da sürmesidir.
      const was = old?.reduce?.looping ?? [];
      const added = (modes.reduce?.looping ?? []).filter((name) => !was.includes(name));
      if (old && added.length > 0)
        regressions.push(
          `hareket ${engine}/${tab}: hareket azaltma açıkken yeni sürekli animasyon (${added.join(', ')})`,
        );
    }
  }

  for (const [name, cell] of Object.entries(after.devices ?? {})) {
    const old = before.devices?.[name];
    if (old && old.status !== cell.status)
      changes.push(`cihaz ${name}: ${old.status} → ${cell.status}`);
  }

  return { changes, regressions };
}
