// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Paylaşılan kabuk, yerel WebView menüsünü her pencereye sayfa yüklenmeden
 * enjekte eder. Bu test enjekte edilen BETİĞİ gerçekten koşturur ve Rust
 * tarafının aynı dosyayı kaydettiğini doğrular; ayrı düşerlerse kapı düşer.
 *
 * Kök `process.cwd()`tir: vitest package dizininden koşar.
 */
const SRC = join(process.cwd(), 'src-tauri', 'src');
const SCRIPT = readFileSync(join(SRC, 'native_menus.js'), 'utf8');

function dispatch(target, type) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function runScript() {
  new Function(SCRIPT)();
}

describe('native_menus.js — WebView yerel menüsü', () => {
  it('bağlam menüsünü metin alanı dahil her yerde engeller', () => {
    const canvas = document.createElement('canvas');
    const input = document.createElement('input');
    document.body.append(canvas, input);
    runScript();

    expect(dispatch(canvas, 'contextmenu').defaultPrevented).toBe(true);
    expect(dispatch(input, 'contextmenu').defaultPrevented).toBe(true);

    canvas.remove();
    input.remove();
  });

  it('sürükleme hayaletini engeller, metin seçimini bırakır', () => {
    const image = document.createElement('img');
    const input = document.createElement('input');
    document.body.append(image, input);
    runScript();

    expect(dispatch(image, 'dragstart').defaultPrevented).toBe(true);
    expect(dispatch(input, 'dragstart').defaultPrevented).toBe(false);

    image.remove();
    input.remove();
  });

  it('stil bir kez enjekte edilir ve metin alanlarını seçilebilir bırakır', () => {
    runScript();
    runScript();
    const styles = document.querySelectorAll('#vol-native-menu-block');
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toContain('user-select:none');
    expect(styles[0].textContent).toContain(':not(input, textarea)');
    expect(styles[0].textContent).toContain('-webkit-touch-callout:none');
  });

  it('Rust kabuğu bu betiği eklentiyle kaydeder', () => {
    const plugin = readFileSync(join(SRC, 'native_menus.rs'), 'utf8');
    const lib = readFileSync(join(SRC, 'lib.rs'), 'utf8');
    expect(plugin).toContain('include_str!("native_menus.js")');
    expect(plugin).toContain('js_init_script(INIT_SCRIPT)');
    expect(lib).toContain('mod native_menus;');
    expect(lib).toContain('.plugin(native_menus::plugin())');
  });

  it('tarayıcı kısayollarını durdurur, metin alanında düzenlemeyi korur', () => {
    runScript();
    const canvas = document.createElement('canvas');
    const input = document.createElement('input');
    document.body.append(canvas, input);
    const press = (target, init) => {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(press(canvas, { key: 'p', ctrlKey: true })).toBe(true);
    expect(press(canvas, { key: 'z', ctrlKey: true })).toBe(true);
    expect(press(input, { key: 'z', ctrlKey: true })).toBe(false);
    expect(press(canvas, { key: 'w' })).toBe(false);
  });

  it('kısayol tablosu CORE web karşılığıyla aynıdır', () => {
    const core = readFileSync(
      join(process.cwd(), '..', 'core', 'src', 'ui', 'nativeMenus.ts'),
      'utf8',
    );
    const list = (text, name) =>
      new RegExp(`${name}[^=]*=\\s*\\[([^\\]]*)\\]`).exec(text)?.[1].replace(/\s/g, '');
    expect(list(SCRIPT, 'ALWAYS_BLOCKED')).toBe(list(core, 'ALWAYS_BLOCKED_SHORTCUTS'));
    expect(list(SCRIPT, 'OUTSIDE_TEXT_BLOCKED')).toBe(list(core, 'OUTSIDE_TEXT_BLOCKED_SHORTCUTS'));
    expect(list(SCRIPT, 'ALWAYS_BLOCKED')).toBeTruthy();
  });
});
