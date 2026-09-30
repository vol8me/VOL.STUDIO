/**
 * Sonda yüzeyinin YAPISAL sözleşmesi. Ölçümün kendisi cihazda üretilir;
 * burada kilitlenen şey kayıt şeması, izlenen olaylar ve paketleme
 * sözleşmesidir — bir düzenleme kayıt kanalını kırarsa cihaz turu sessizce
 * boş döner, o yüzden sözleşme testte sabittir.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface TauriConf {
  identifier: string;
  build: { frontendDist: string };
  app: { windows: { width: number; height: number; fullscreen: boolean }[] };
  bundle?: { resources?: string[] };
}

interface Capabilities {
  permissions: string[];
}

const PKG = join(__dirname, '..');
const probeJs = readFileSync(join(PKG, 'web', 'probe.js'), 'utf8');
const indexHtml = readFileSync(join(PKG, 'web', 'index.html'), 'utf8');
const tauriConf = JSON.parse(
  readFileSync(join(PKG, 'src-tauri', 'tauri.conf.json'), 'utf8'),
) as TauriConf;
const capabilities = JSON.parse(
  readFileSync(join(PKG, 'src-tauri', 'capabilities', 'default.json'), 'utf8'),
) as Capabilities;
const appRun = readFileSync(join(PKG, 'src-tauri', 'linux.AppRun'), 'utf8');

describe('kayıt kanalı', () => {
  it('diagnostics eklentisinin komutlarını çağırır', () => {
    expect(probeJs).toContain("invoke('plugin:vol-diagnostics|report'");
    expect(probeJs).toContain("invoke('plugin:vol-diagnostics|env_info')");
  });

  it('kayıt satırları şema sürümü ve saat damgası taşır', () => {
    expect(probeJs).toMatch(/v:\s*1,/);
    expect(probeJs).toMatch(/wall:\s*Date\.now\(\)/);
    expect(probeJs).toMatch(/t:\s*Math\.round\(performance\.now\(\)\)/);
  });
});

describe('izlenen olaylar', () => {
  it.each([
    'gamepadconnected',
    'gamepaddisconnected',
    'pointerdown',
    'keydown',
    'visibilitychange',
    'pagehide',
    'blur',
    'focus',
    'vol:terminate',
  ])('%s dinlenir', (event) => {
    expect(probeJs).toContain(event);
  });

  it('uyku sıçraması hem monoton hem duvar saatiyle ölçülür', () => {
    expect(probeJs).toContain('perfGap');
    expect(probeJs).toContain('wallGap');
  });
});

describe('yük fazları', () => {
  it('sprite fazları ve özet metrikleri tanımlıdır', () => {
    expect(probeJs).toContain('4000 sprite');
    expect(probeJs).toContain('summarizeFrameIntervals as summarize');
  });

  it('Phaser yoksa fazlar atlanır ama sonda çalışmaya devam eder', () => {
    expect(probeJs).toContain("typeof Phaser === 'undefined'");
    expect(probeJs).toContain('phaser-missing');
  });
});

describe('paketleme sözleşmesi', () => {
  it('tauri.conf Deck oturumunu hedefler', () => {
    expect(tauriConf.identifier).toBe('studio.vol.deckprobe');
    expect(tauriConf.build.frontendDist).toBe('../web');
    const [win] = tauriConf.app.windows;
    expect(win.width).toBe(1280);
    expect(win.height).toBe(800);
    expect(win.fullscreen).toBe(true);
  });

  it('diagnostics eklentisine izin verilmiştir', () => {
    expect(capabilities.permissions).toContain('vol-diagnostics:default');
    expect(capabilities.permissions).toContain('core:default');
  });

  it('index.html sonda kodunu ve motor kopyasını yükler', () => {
    expect(indexHtml).toContain('probe.js');
    expect(indexHtml).toContain('vendor/phaser.min.js');
  });

  it('linux.AppRun ürün adını yapılandırmadan türetir', () => {
    expect(appRun).toContain('basename "$this_dir" .AppDir');
    // Ürün adı sabitlenmez: product değişkeni yalnız AppDir adından türetilir.
    const assignment = appRun.split('\n').find((line) => line.startsWith('product='));
    expect(assignment).toBeDefined();
    expect(assignment).not.toMatch(/product="[a-z]/);
  });

  it('linux.AppRun Steam istemci kütüphanesini paket dışından çözer', () => {
    // libsteam_api.so pakete girmez: AppRun Steam'in kendi kurulumunu tarar.
    expect(appRun).toContain('libsteam_api.so');
    expect(appRun).toContain('steamrt64');
    expect(appRun).toContain('VOL_STEAM_LIB_DIR');
  });
});

describe('steamworks katmanı (D6)', () => {
  it('sonda manifestoyu resource olarak paketler ve komutlarını çağırır', () => {
    expect(tauriConf.bundle?.resources).toContain('steam_input_manifest.vdf');
    for (const cmd of [
      'plugin:vol-steamworks|status',
      'plugin:vol-steamworks|set_input_manifest',
      'plugin:vol-steamworks|activate_action_set',
      'plugin:vol-steamworks|controllers',
      'plugin:vol-steamworks|action_glyph',
    ]) {
      expect(probeJs).toContain(cmd);
    }
  });

  it("steamworks izni capability'de ve geliştirme App ID 480 manifestodan bağımsızdır", () => {
    expect(capabilities.permissions).toContain('vol-steamworks:default');
    // Aksiyon seti manifestodaki adla birebir aynıdır — yazım sürçmesi
    // Deck turunda sessiz "0 kol" sonucuna döner.
    expect(probeJs).toContain("'ProbeControls'");
  });
});
