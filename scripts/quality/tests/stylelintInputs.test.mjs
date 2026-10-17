import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import stylelint from 'stylelint';

test('Android test raporu atlanır, aynı bozuk CSS oyun kaynağında reddedilir', async () => {
  const config = JSON.parse(
    readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
  ).stylelint;
  const code = '.tabLinks { color: #f00; }';
  const lint = (file) => stylelint.lint({ code, codeFilename: resolve(file), config });
  const generated = await lint(
    'tauri-v2/plugins/vol-haptics/android/build/reports/tests/style.css',
  );
  assert.equal(generated.results[0].ignored, true);
  const source = await lint('games/vol-test/src/test-fixture.css');
  assert.equal(source.errored, true);
  assert.ok(
    source.results[0].warnings.some(
      (warning) => warning.rule === 'declaration-property-value-disallowed-list',
    ),
  );
});
