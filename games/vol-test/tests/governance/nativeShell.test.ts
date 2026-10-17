import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import config from '../../src-tauri/tauri.conf.json';

describe('native ürün sözleşmesi', () => {
  it('Android titreşim sürücüsü uygulamada kaydedilir ve komutlarına izin verilir', () => {
    const source = (path: string): string =>
      readFileSync(resolve(process.cwd(), 'src-tauri', path), 'utf8');
    const mobile = JSON.parse(source('capabilities/mobile.json')) as { permissions: string[] };
    expect(mobile.permissions).toContain('vol-haptics:default');
    expect(source('Cargo.toml')).toContain('tauri-plugin-vol-haptics');
    expect(source('src/lib.rs')).toContain('.plugin(tauri_plugin_vol_haptics::init())');
  });
  it('ürün kimliği, pencere ve Windows paket yolu ürüne aittir', () => {
    expect(config.identifier).toBe('com.volstudio.voltest');
    expect(config.mainBinaryName).toBe('VOL.TEST');
    expect(config.bundle.targets).toContain('nsis');
    expect(config.app.windows[0]).toMatchObject({ width: 1280, height: 800, resizable: true });
    expect(config.app.security.csp['object-src']).toBe("'none'");
    expect(config.app.security.csp['connect-src']).not.toContain('*');
    expect(config.app.security).toMatchObject({
      dangerousDisableAssetCspModification: ['style-src'],
    });
    expect(config.app.security.csp['script-src']).toBe("'self'");
  });
  it('Android kimlik, yön, oyun kategorisi, titreşim ve geri köprüsü kaynakta kalır', () => {
    const source = (path: string): string =>
      readFileSync(resolve(process.cwd(), 'src-tauri/gen/android', path), 'utf8');
    const manifest = new DOMParser().parseFromString(
      source('app/src/main/AndroidManifest.xml'),
      'text/xml',
    );
    expect(manifest.querySelector('application')?.getAttribute('android:appCategory')).toBe('game');
    expect(manifest.querySelector('activity')?.getAttribute('android:screenOrientation')).toBe(
      'landscape',
    );
    expect(
      [...manifest.querySelectorAll('uses-permission')].map((node) =>
        node.getAttribute('android:name'),
      ),
    ).toContain('android.permission.VIBRATE');
    const activity = source('app/src/main/java/com/volstudio/voltest/MainActivity.kt');
    expect(activity).toContain('package com.volstudio.voltest');
    expect(activity).toContain('override fun onWebViewCreate(webView: WebView)');
    expect(activity).toContain('vol:androidback');
    expect(activity).toContain('WindowInsetsCompat.Type.systemBars()');
    expect(activity).toContain('LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES');
    expect(source('app/build.gradle.kts')).toContain('applicationId = "com.volstudio.voltest"');
  });
});
