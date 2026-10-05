export const DOCUMENTATION_LIMITS = {
  rootReadme: { lines: 100, words: 800 },
  packageReadme: { lines: 80, words: 600 },
  hub: { lines: 40, words: 250 },
  rootAgent: { lines: 120, words: 1000 },
  pencilAgent: { lines: 80, words: 650 },
  toolAgent: { lines: 40, words: 250 },
};
const ROLES = new Set([...Object.keys(DOCUMENTATION_LIMITS), 'reference', 'legal', 'generated']);
const object = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

export function validDocumentationPath(value) {
  return (
    typeof value === 'string' &&
    /^[\w.-]+(?:\/[\w.-]+)*\.md$/.test(value) &&
    value.split('/').every((part) => part !== '.' && part !== '..')
  );
}

function keys(value, allowed, where, problems) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) problems.push(`${where}.${key}: tanınmayan alan`);
  }
}

function budget(value, where, problems) {
  if (!object(value)) {
    problems.push(`${where}: lines/words bütçe nesnesi olmalı`);
    return;
  }
  keys(value, ['lines', 'words'], where, problems);
  for (const metric of ['lines', 'words']) {
    if (!Number.isInteger(value[metric]) || value[metric] < 1) {
      problems.push(`${where}.${metric}: pozitif tam sayı olmalı`);
    }
  }
}

export function validateDocumentationConfig(raw) {
  const problems = [];
  if (!object(raw)) return ['documentation: nesne olmalı'];
  keys(raw, ['budgets', 'paths', 'exceptions'], 'documentation', problems);
  if (!object(raw.budgets)) problems.push('documentation.budgets: rol bütçeleri gerekli');
  else {
    keys(raw.budgets, Object.keys(DOCUMENTATION_LIMITS), 'documentation.budgets', problems);
    for (const [role, limit] of Object.entries(DOCUMENTATION_LIMITS)) {
      const value = raw.budgets[role];
      budget(value, `documentation.budgets.${role}`, problems);
      for (const metric of ['lines', 'words']) {
        if (value?.[metric] > limit[metric]) {
          problems.push(
            `documentation.budgets.${role}.${metric}: sözleşme tavanı ${limit[metric]}`,
          );
        }
      }
    }
  }
  for (const list of ['paths', 'exceptions']) {
    if (!Array.isArray(raw[list])) {
      problems.push(`documentation.${list}: liste olmalı`);
      continue;
    }
    const seen = new Set();
    for (const [index, entry] of raw[list].entries()) {
      const where = `documentation.${list}[${index}]`;
      if (!object(entry)) {
        problems.push(`${where}: nesne olmalı`);
        continue;
      }
      keys(
        entry,
        list === 'paths' ? ['path', 'role'] : ['path', 'role', 'lines', 'words', 'reason'],
        where,
        problems,
      );
      if (!validDocumentationPath(entry.path))
        problems.push(`${where}.path: kanonik göreli Markdown yolu olmalı`);
      if (seen.has(entry.path)) problems.push(`${where}.path: yinelenen yol ${entry.path}`);
      seen.add(entry.path);
      if (!ROLES.has(entry.role)) problems.push(`${where}.role: tanınmayan rol`);
      if (list === 'exceptions') {
        if (!Object.hasOwn(DOCUMENTATION_LIMITS, entry.role))
          problems.push(`${where}.role: yalnız bütçeli rol istisnası olabilir`);
        budget({ lines: entry.lines, words: entry.words }, where, problems);
        if (typeof entry.reason !== 'string' || entry.reason.trim().length < 10)
          problems.push(`${where}.reason: açıklayıcı gerekçe gerekli`);
      }
    }
  }
  return problems;
}
