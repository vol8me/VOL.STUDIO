import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SOURCE_PATTERNS } from './commentDensity.mjs';
import { workingTreeFiles } from './gitFiles.mjs';
import { excludingFrozenPaths, loadRepoLifecycle } from './workspaceLifecycle.mjs';

/**
 * BAĞLAM YORUMU YASAĞI. Kod yorumu koddan okunamayan gerekçeyi ve sözleşmeyi
 * taşır; tarihçe, ölçüm günlüğü, plan ya da faz kimliği taşımaz. Ölçümün yeri
 * belgedir, kararın yeri commit'tir. Desenler yalnız günlük olduğu kesin
 * biçimleri yakalar; tırnak içindeki örnek metin sayılmaz.
 */
export const CONTEXT_PATTERNS = [
  { name: 'ölçüm günlüğü', pattern: /[Öö]lçüldü\s*[:—(-]|\([Öö]lçüldü|[Öö]lçüldü\s+20\d\d/ },
  { name: 'tarihçe', pattern: /\bbir dönem\b|\b[Ee]skiden\b(?!\s+yeniye)|\b[İi]lk sürümde\b/ },
  { name: 'tarih', pattern: /\b20\d\d-\d\d-\d\d\b/ },
  {
    name: 'plan kimliği',
    pattern:
      /(?<!["'`])\bDalga\s+\d+\b(?!["'`])|\(\s*[DKRFE]\d{1,2}[a-z]?\s*\)|\bTODO\s+[A-Z]{1,2}\d|\b(?:SD|SH|AS)\d{1,2}\b/,
  },
];

const COMMENT_START = /^(?:\/\/|\/\*|\*|#)/;

/** Bir kaynak metnindeki yasak yorum satırları: `{ line, name, text }`. */
export function contextViolations(text) {
  const found = [];
  text.split('\n').forEach((raw, index) => {
    const line = raw.trim();
    if (!COMMENT_START.test(line)) return;
    for (const { name, pattern } of CONTEXT_PATTERNS) {
      if (pattern.test(line)) {
        found.push({ line: index + 1, name, text: line });
        return;
      }
    }
  });
  return found;
}

export function validateContextComments(
  root,
  files = workingTreeFiles(root, SOURCE_PATTERNS),
  lifecycle = loadRepoLifecycle(root),
) {
  const problems = [];
  for (const file of excludingFrozenPaths(files, lifecycle)) {
    if (file.includes('/gen/') || file.includes('/vendor/')) continue;
    for (const hit of contextViolations(readFileSync(join(root, file), 'utf8'))) {
      problems.push(`${file}:${hit.line}: ${hit.name} yorumu — ${hit.text.slice(0, 80)}`);
    }
  }
  return problems;
}
