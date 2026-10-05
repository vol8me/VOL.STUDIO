import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { commandRefs } from './agentDocs.mjs';
import { workingTreeFiles } from './gitFiles.mjs';
import { parseJustRecipes } from './justfile.mjs';
import { excludingFrozenPaths } from './workspaceLifecycle.mjs';
import { validateDocumentationConfig } from './documentationConfig.mjs';
import {
  markdownLinks,
  markdownProse,
  resolveMarkdownLink,
  validateMarkdownLinks,
} from './markdownLinks.mjs';

export function measureMarkdown(text) {
  return {
    lines: text === '' ? 0 : text.replace(/\r?\n$/, '').split(/\r?\n/).length,
    words: text.trim().split(/\s+/u).filter(Boolean).length,
  };
}

function commands(root, lifecycle) {
  const rootScripts = new Set(
    Object.keys(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {}),
  );
  const recipes = parseJustRecipes(readFileSync(join(root, 'justfile'), 'utf8'));
  const packages = new Map();
  for (const workspace of lifecycle.workspaces.filter((item) => item.status === 'active')) {
    const manifest = join(root, workspace.path, 'package.json');
    if (existsSync(manifest))
      packages.set(
        workspace.packageName,
        new Set(Object.keys(JSON.parse(readFileSync(manifest, 'utf8')).scripts ?? {})),
      );
  }
  return (ref) =>
    ref.kind === 'recipe'
      ? recipes.has(ref.name)
      : ref.kind === 'root'
        ? rootScripts.has(ref.name)
        : packages.get(ref.pkg)?.has(ref.name) === true;
}

function entryProblems(root, path, role, text, knownCommand) {
  const problems = [];
  const prose = markdownProse(text)
    .split(/\r?\n/)
    .filter((line) => line.trim() && !/^\s*(?:#|\||[-*+]\s|\d+\.\s|>|`)/.test(line))
    .join(' ')
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/`[^`]*`/g, '');
  if (prose.trim().split(/\s+/).filter(Boolean).length < 6)
    problems.push(`${path}: giriş için amaç açıklayan kısa bir paragraf gerekli`);
  const navigations = markdownLinks(text)
    .map((link) => resolveMarkdownLink(root, path, link))
    .filter(
      (link) =>
        link?.target && link.file !== path && link.file.endsWith('.md') && existsSync(link.target),
    );
  if (navigations.length < (role === 'hub' ? 2 : 1))
    problems.push(`${path}: ayrıntı sahibi Markdown belgeye yönlendirme gerekli`);
  if (role === 'rootReadme' || role === 'packageReadme') {
    if (!commandRefs(text).some(knownCommand))
      problems.push(`${path}: gerçek çalıştırma veya doğrulama komutu gerekli`);
  }
  return problems;
}

export function validateDocumentation(root, policy, lifecycle, files) {
  const schema = validateDocumentationConfig(policy);
  if (schema.length) return schema;
  const problems = [];
  const roles = new Map(policy.paths.map((entry) => [entry.path, entry.role]));
  for (const [path, role] of [
    ['README.md', 'rootReadme'],
    ['AGENTS.md', 'rootAgent'],
  ]) {
    if (roles.get(path) !== role) problems.push(`${path}: ${role} rol kaydı zorunlu`);
  }
  for (const workspace of lifecycle.workspaces.filter((item) => item.status === 'active')) {
    const readme = `${workspace.path}/README.md`;
    if (roles.has(readme) && roles.get(readme) !== 'packageReadme')
      problems.push(`${readme}: aktif paket rolü packageReadme olmalı`);
    roles.set(readme, 'packageReadme');
  }
  const docs = excludingFrozenPaths(files ?? workingTreeFiles(root, ['*.md']), lifecycle);
  const active = new Set(docs);
  for (const path of docs) {
    const role =
      path === 'devtools/pen.dev/AGENTS.md'
        ? 'pencilAgent'
        : path !== 'AGENTS.md' && /(?:^|\/)(?:AGENTS|CLAUDE)\.md$/.test(path)
          ? 'toolAgent'
          : /^docs\/(?:.*\/)?README\.md$/.test(path)
            ? 'hub'
            : undefined;
    if (role) {
      if (roles.get(path) !== role) problems.push(`${path}: ${role} rol kaydı zorunlu`);
      roles.set(path, role);
    }
  }
  const knownCommand = commands(root, lifecycle);
  const exceptions = new Map(policy.exceptions.map((entry) => [entry.path, entry]));
  for (const [path, role] of roles) {
    if (!active.has(path) || !existsSync(join(root, path))) {
      problems.push(`${path}: belge rol kaydı bayat veya gerekli belge eksik`);
      continue;
    }
    const text = readFileSync(join(root, path), 'utf8');
    const base = policy.budgets[role];
    if (!base) continue;
    const measured = measureMarkdown(text);
    const exception = exceptions.get(path);
    const limit = exception ?? base;
    if (exception && exception.role !== role)
      problems.push(`${path}: istisna rolü belge rolüyle aynı olmalı`);
    if (exception && measured.lines <= base.lines && measured.words <= base.words)
      problems.push(`${path}: boyut istisnası bayat; belge temel bütçenin içinde`);
    if (exception && (exception.lines < base.lines || exception.words < base.words))
      problems.push(`${path}: istisna temel bütçeyi daraltamaz`);
    if (measured.lines > limit.lines)
      problems.push(`${path}: ${measured.lines} satır, sınır ${limit.lines} satır (${role})`);
    if (measured.words > limit.words)
      problems.push(`${path}: ${measured.words} sözcük, sınır ${limit.words} sözcük (${role})`);
    problems.push(...entryProblems(root, path, role, text, knownCommand));
  }
  for (const path of exceptions.keys()) {
    if (!roles.has(path) || !active.has(path))
      problems.push(`${path}: istisna bayat; bütçeli aktif rol kaydı yok`);
  }
  for (const doc of docs) {
    const text = readFileSync(join(root, doc), 'utf8');
    problems.push(...validateMarkdownLinks(root, doc, text));
    for (const ref of commandRefs(text)) {
      if (!knownCommand(ref))
        problems.push(
          `${doc}: komut bulunamadı: ${ref.kind} ${ref.pkg ?? ''} ${ref.name}`.replace(/\s+/g, ' '),
        );
    }
  }
  return problems;
}
