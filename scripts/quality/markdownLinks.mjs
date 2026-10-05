import { existsSync, readFileSync, statSync } from 'node:fs';
import { posix, relative, resolve } from 'node:path';

export function markdownProse(text) {
  return text.replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, '');
}

export function markdownLinks(text) {
  const prose = markdownProse(text).replace(/`[^`\n]+`/g, '');
  const links = [
    ...prose.matchAll(/!?\[[^\]\n]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+['"][^\n]*['"])?\s*\)/g),
  ].map((match) => match[1].replace(/^<|>$/g, ''));
  links.push(
    ...[...prose.matchAll(/^\s*\[[^\]\n]+\]:\s*(<[^>]+>|\S+)/gm)].map((match) =>
      match[1].replace(/^<|>$/g, ''),
    ),
  );
  return links;
}

export function markdownAnchors(text) {
  const anchors = new Set();
  const duplicates = new Map();
  const prose = markdownProse(text);
  const headings = [];
  const lines = prose.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const atx = /^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(lines[index]);
    if (atx) headings.push(atx[1]);
    else if (index > 0 && /^ {0,3}(?:=+|-+)\s*$/.test(lines[index]) && lines[index - 1].trim())
      headings.push(lines[index - 1]);
  }
  for (const heading of headings) {
    const slug = heading
      .toLowerCase()
      .replace(/<[^>]*>/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[^\p{L}\p{M}\p{N}_\-\s]/gu, '')
      .replace(/\s/g, '-');
    let suffix = duplicates.get(slug) ?? 0;
    let candidate = suffix ? `${slug}-${suffix}` : slug;
    while (anchors.has(candidate)) {
      suffix++;
      candidate = `${slug}-${suffix}`;
    }
    duplicates.set(slug, suffix + 1);
    anchors.add(candidate);
  }
  for (const match of prose.matchAll(/<(?:a|[a-z][\w-]*)\b[^>]*\b(?:id|name)=["']([^"']+)["']/gi))
    anchors.add(match[1]);
  return anchors;
}

export function resolveMarkdownLink(root, doc, link) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(link)) return null;
  const [rawPath, rawAnchor] = link.split('#', 2);
  let path, anchor;
  try {
    path = decodeURIComponent(rawPath.split('?')[0]);
    anchor = rawAnchor === undefined ? undefined : decodeURIComponent(rawAnchor);
  } catch {
    return { problem: 'geçersiz URL kaçışı' };
  }
  const file = path
    ? path.startsWith('/')
      ? path.slice(1)
      : posix.normalize(posix.join(posix.dirname(doc), path))
    : doc;
  const target = resolve(root, file);
  const rel = relative(resolve(root), target);
  if (rel.startsWith('..') || /^[A-Za-z]:/.test(rel))
    return { problem: 'depo dışına çıkan yerel bağlantı' };
  return { file, target, anchor };
}

export function validateMarkdownLinks(root, doc, text) {
  const problems = [];
  for (const link of markdownLinks(text)) {
    const resolved = resolveMarkdownLink(root, doc, link);
    if (!resolved) continue;
    if (resolved.problem || !resolved.target) {
      problems.push(`${doc}: ${link}: ${resolved.problem}`);
      continue;
    }
    if (!existsSync(resolved.target)) {
      problems.push(`${doc}: yerel bağlantı bulunamadı: ${link}`);
      continue;
    }
    if (!resolved.anchor) continue;
    if (!statSync(resolved.target).isFile()) {
      problems.push(`${doc}: dizin başlığı doğrulanamaz: ${link}`);
      continue;
    }
    const content = readFileSync(resolved.target, 'utf8');
    if (resolved.file.endsWith('.md')) {
      if (!markdownAnchors(content).has(resolved.anchor))
        problems.push(`${doc}: Markdown başlığı bulunamadı: ${link}`);
    } else {
      const lines = /^L([1-9]\d*)(?:-L([1-9]\d*))?$/.exec(resolved.anchor);
      const count = content.replace(/\r?\n$/, '').split(/\r?\n/).length;
      if (
        !lines ||
        Number(lines[1]) > count ||
        (lines[2] && (Number(lines[2]) < Number(lines[1]) || Number(lines[2]) > count))
      )
        problems.push(`${doc}: kaynak satır başvurusu geçersiz: ${link}`);
    }
  }
  return problems;
}
