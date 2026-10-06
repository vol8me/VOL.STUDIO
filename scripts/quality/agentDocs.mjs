import { posix } from 'node:path';

/**
 * Agent belgeleri (`AGENTS.md`, `CLAUDE.md`, kapı belgesi) dosyaları, betikleri
 * ve kapı bileşimlerini ADLARIYLA anlatır. Bu modül o adları metinden çıkarır;
 * gerçek ağaçla karşılaştırma `tests/agentDocs.test.mjs`dedir.
 */

const PNPM_BUILTINS = new Set([
  'add',
  'audit',
  'dlx',
  'doctor',
  'install',
  'list',
  'outdated',
  'remove',
  'update',
  'why',
]);

const PATH_ROOTS = new Set([
  '.github',
  'core',
  'devtools',
  'docs',
  'games',
  'pen',
  'exported',
  'scripts',
  'src',
  'tauri-v2',
  'tests',
]);

const isPlaceholder = (token) => /[<>{}*]/.test(token);

function fencedLines(markdown) {
  const lines = [];
  let inside = false;
  for (const line of markdown.split('\n')) {
    if (line.trimStart().startsWith('```')) {
      inside = !inside;
      continue;
    }
    if (inside) lines.push(line.trim());
  }
  return lines;
}

/** Çitli kod blokları dışındaki satır içi kod parçaları. */
export function inlineSpans(markdown) {
  const prose = markdown.replace(/^\s*```[\s\S]*?^\s*```/gm, '');
  return [...prose.matchAll(/`([^`\n]+)`/g)].map((match) => match[1].trim());
}

/**
 * Belgede adı geçen komutlar. Çıktı türleri: `recipe` (just tarifi), `root`
 * (kök betik), `package` (`--filter` ile paket betiği).
 */
export function commandRefs(markdown) {
  const refs = [];
  for (const text of [...inlineSpans(markdown), ...fencedLines(markdown)]) {
    const tokens = text.split(/\s+/);
    if (tokens[0] === 'just' && tokens[1]) {
      refs.push({ kind: 'recipe', name: tokens[1] });
    } else if (tokens[0] === 'pnpm' && tokens[1]) {
      const [first, second, third, fourth] = tokens.slice(1);
      if (first === 'exec' && second === 'just' && third) {
        refs.push({ kind: 'recipe', name: third });
      } else if (first === '--filter' && second && third && !PNPM_BUILTINS.has(third)) {
        if (third !== 'exec')
          refs.push({
            kind: 'package',
            pkg: second,
            name: third === 'run' ? (fourth ?? '') : third,
          });
      } else if (first === 'run' && second) {
        refs.push({ kind: 'root', name: second });
      } else if (!first.startsWith('-') && !PNPM_BUILTINS.has(first) && first !== 'exec') {
        refs.push({ kind: 'root', name: first });
      }
    }
  }
  return refs.filter(
    (ref) => !isPlaceholder(ref.name) && !isPlaceholder(ref.pkg ?? '') && !/^--/.test(ref.name),
  );
}

/** Satır içi koddaki depo yolları; yer tutuculu, paket belirteçli ve biçimsiz olanlar dışarıda. */
export function documentedPaths(markdown) {
  const paths = new Set();
  for (const token of inlineSpans(markdown)) {
    if (!token.includes('/') || isPlaceholder(token)) continue;
    if (!/^[\w.-][\w./-]*$/.test(token)) continue;
    const segments = token.replace(/\/$/, '').split('/');
    const isDirectory = token.endsWith('/');
    const hasExtension = /\.[A-Za-z0-9]+$/.test(segments.at(-1));
    if (isDirectory || hasExtension || PATH_ROOTS.has(segments[0])) paths.add(token);
  }
  return [...paths].sort();
}

/** Yol, belgenin dizinine ya da repo köküne göre izlenen bir dosyaya veya dizine çözülür mü? */
export function resolvesInTree(path, docDir, files) {
  const clean = path.replace(/\/$/, '');
  const candidates = [clean, posix.normalize(posix.join(docDir, clean))];
  return candidates.some(
    (candidate) =>
      files.has(candidate) || [...files].some((file) => file.startsWith(`${candidate}/`)),
  );
}

/**
 * Birleşik kapı satırları: ilk hücresi kapıyı (`quick` ya da `pnpm quick`)
 * adlandıran tablo satırlarında, kalan hücrelerdeki tarif adları.
 */
export function gateRows(markdown, recipes, composites) {
  const rows = new Map();
  for (const line of markdown.split('\n')) {
    if (!line.trimStart().startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1);
    const head = inlineSpans(cells[0] ?? '');
    const gate = composites.find((name) => head.includes(name) || head.includes(`pnpm ${name}`));
    if (!gate) continue;
    const named = cells
      .slice(1)
      .flatMap((cell) => inlineSpans(cell))
      .filter((token) => recipes.has(token));
    rows.set(gate, [...new Set(named)].sort());
  }
  return rows;
}
