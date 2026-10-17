import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const CLAUDE = join(resolve(import.meta.dirname, '../../..'), '.claude');
const ALIASES = new Set(['haiku', 'sonnet', 'opus']);
const READ_ONLY = new Set(['Read', 'Grep', 'Glob']);
const FORCING = ['CLAUDE_CODE_SUBAGENT_MODEL_FORCE', 'CLAUDE_CODE_SUBAGENT_MODEL'];

function frontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  assert.ok(match, 'frontmatter yok');
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const at = line.indexOf(':');
    if (at > 0) fields[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return fields;
}

const agents = () =>
  readdirSync(join(CLAUDE, 'agents'))
    .filter((file) => file.endsWith('.md'))
    .map((file) => ({
      file,
      meta: frontmatter(readFileSync(join(CLAUDE, 'agents', file), 'utf8')),
    }));

test('paylaşılan ayar modeli ve danışmanı bildirir, alt ajan modelini zorlamaz', () => {
  const settings = JSON.parse(readFileSync(join(CLAUDE, 'settings.json'), 'utf8'));
  assert.ok(ALIASES.has(settings.model), `model bilinen bir takma ad olmalı: ${settings.model}`);
  assert.ok(ALIASES.has(settings.advisorModel), 'danışman modeli bildirilmeli');
  // Zorlama açıkken ajan tanımındaki model alanı yok sayılır: genel amaçlı ajan da en ucuz modele
  // düşer ve araştırma ajanı Haiku'nun uydurma riskine açılır. Kişisel tercih yerel ayardadır.
  for (const key of FORCING) {
    assert.equal(settings.env?.[key], undefined, `${key} projede ayarlanmaz (CLAUDE.md)`);
  }
});

test('her alt ajan tanımı ad, açıklama, model ve açık araç listesi taşır', () => {
  const found = agents();
  assert.ok(found.length > 0, 'alt ajan tanımı yok');
  for (const { file, meta } of found) {
    assert.ok(meta.name, `${file}: name yok`);
    assert.equal(
      file.replace(/\.md$/, ''),
      meta.name.toLowerCase(),
      `${file}: dosya adı name ile aynı olmalı`,
    );
    assert.ok(meta.description?.length > 20, `${file}: description yok ya da çok kısa`);
    assert.ok(
      ALIASES.has(meta.model),
      `${file}: model bilinen bir takma ad olmalı (${meta.model})`,
    );
    assert.ok(meta.tools, `${file}: tools açık yazılmalı; boşsa ajan her aracı miras alır`);
  }
});

test('ajan açıklaması ne zaman kullanılmayacağını söyler', () => {
  // Ölçümde alt ajan küçük işte doğrudan çalışmadan pahalı ve yavaştı (CLAUDE.md):
  // açıklama dar tutulmazsa model her aramayı devreder.
  for (const { file, meta } of agents()) {
    assert.match(meta.description, /KULLANMA/, `${file}: description "KULLANMA" cümlesi taşımalı`);
  }
});

test('Haiku ajanları salt okunurdur', () => {
  // Haiku kısa, kanıt döndüren işe verilir; yazma yetkisi ya da kararı ucuz modele bırakmaz.
  for (const { file, meta } of agents().filter(({ meta: m }) => m.model === 'haiku')) {
    const tools = meta.tools.split(',').map((tool) => tool.trim());
    const writers = tools.filter((tool) => !READ_ONLY.has(tool));
    assert.deepEqual(
      writers,
      [],
      `${file}: Haiku ajanı yalnız ${[...READ_ONLY].join(', ')} kullanır`,
    );
  }
});
