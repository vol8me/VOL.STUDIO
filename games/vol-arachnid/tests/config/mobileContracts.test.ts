import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { arachnidAmbienceTrack, arachnidAudioConfig, arachnidSoundAssets } from '@/config/audio';
import { arachnidGraphicsConfig } from '@/config/graphics';
import { ARACHNID_LEFT_STICK_REGION } from '@/config/input';

const PACKAGE_ROOT = resolve(import.meta.dirname, '../..');
const NATIVE_ROOT = resolve(PACKAGE_ROOT, 'src-tauri');

function read(relativePath: string): string {
  return readFileSync(resolve(PACKAGE_ROOT, relativePath), 'utf8');
}

describe('VOL.ARACHNID mobil sözleşmeleri', () => {
  it('tek grafik profili yüksek kaliteyi açıkça kilitler', () => {
    expect(arachnidGraphicsConfig).toEqual({
      renderScale: 1,
      renderer: {
        antialias: true,
        antialiasGL: true,
        pixelArt: false,
        roundPixels: false,
        powerPreference: 'high-performance',
      },
    });
  });

  it('joystick yalnız sol başparmak bölgesinde doğar', () => {
    expect(ARACHNID_LEFT_STICK_REGION).toEqual({ minX: 0, maxX: 0.48, minY: 0.42, maxY: 1 });
  });

  it('runtime ses sözlüğündeki her dosya gönderilen public varlığında bulunur', () => {
    const urls = [
      ...Object.values(arachnidSoundAssets).flat(),
      ...arachnidAmbienceTrack.stems.map((stem) => stem.src),
    ].filter((url): url is string => typeof url === 'string');

    expect(Object.keys(arachnidAudioConfig.events).sort()).toEqual(
      Object.keys(arachnidSoundAssets).sort(),
    );
    expect(urls).not.toHaveLength(0);
    for (const url of urls) {
      expect(existsSync(resolve(PACKAGE_ROOT, 'public', url)), url).toBe(true);
    }
  });

  it('Android paketi bağımsız kimlik, titreşim izni ve yatay yön taşır', () => {
    const config = JSON.parse(read('src-tauri/tauri.conf.json')) as { identifier?: string };
    const manifest = read('src-tauri/gen/android/app/src/main/AndroidManifest.xml');

    expect(config.identifier).toBe('com.volstudio.arachnid');
    expect(manifest).toContain('android.permission.VIBRATE');
    expect(manifest).toContain('android:screenOrientation="sensorLandscape"');
  });

  it('Android geri olayı JS onayına, onay da uygulama düzeyi çıkışa gider', () => {
    const activity = read(
      'src-tauri/gen/android/app/src/main/java/com/volstudio/arachnid/MainActivity.kt',
    );
    const nativeShell = readFileSync(
      resolve(PACKAGE_ROOT, '../../tauri-v2/src-tauri/src/lib.rs'),
      'utf8',
    );
    const mobileCapability = JSON.parse(
      readFileSync(resolve(NATIVE_ROOT, 'capabilities/mobile.json'), 'utf8'),
    ) as { permissions?: string[] };

    expect(activity).toContain("CustomEvent('vol:androidback')");
    expect(activity).toMatch(/onCreate[\s\S]*onBackPressedDispatcher\.addCallback/);
    expect(nativeShell).toMatch(/fn exit_application\([\s\S]*app\.exit\(0\)/);
    expect(nativeShell).toContain('tauri::generate_handler![exit_application]');
    expect(mobileCapability.permissions).not.toContain('core:window:allow-destroy');
  });
});
