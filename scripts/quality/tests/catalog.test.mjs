import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { coreUiComponents, validateCatalog, validateRepoCatalog } from '../catalog.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const component = (name) => ({ name, file: `src/ui/x/${name}.ts` });

test('vitrinde ve testte adıyla geçen bileşen geçer', () => {
  const problems = validateCatalog({
    components: [component('Kanban')],
    showcaseText: 'new Kanban({})',
    testText: "describe('Kanban')",
    shownVia: {},
  });
  assert.deepEqual(problems, []);
});

test('vitrinsiz ya da testsiz bileşen kalıntı sayılır', () => {
  const problems = validateCatalog({
    components: [component('Kanban'), component('SlotGrid')],
    showcaseText: 'Kanban',
    testText: 'SlotGrid KanbanBoard',
    shownVia: {},
  });
  assert.equal(problems.length, 2);
  assert.match(problems[0], /Kanban .*testlerinde/);
  assert.match(problems[1], /SlotGrid .*vitrininde/);
});

test('istisna gösterildiği bileşeni ister; ölü istisna reddedilir', () => {
  const problems = validateCatalog({
    components: [component('ToolButton')],
    showcaseText: 'yok',
    testText: 'ToolButton',
    shownVia: {
      ToolButton: { via: 'Toolbar', reason: 'parça' },
      Gone: { via: null, reason: 'eski' },
    },
  });
  assert.equal(problems.length, 2);
  assert.match(problems[0], /Toolbar/);
  assert.match(problems[1], /ölü istisna/);
});

test('CORE bileşen listesi yalnız ui altındaki sınıfları taşır', () => {
  const components = coreUiComponents(ROOT);
  assert.ok(components.length > 50);
  assert.ok(components.every((entry) => entry.file.startsWith('src/ui/')));
  assert.ok(components.some((entry) => entry.name === 'OnScreenKeyboard'));
});

test('depo katalog kuralını sağlar', () => {
  assert.deepEqual(validateRepoCatalog(ROOT), []);
});
