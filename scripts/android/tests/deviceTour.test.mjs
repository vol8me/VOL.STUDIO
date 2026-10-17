import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  findEditAction,
  judgeOrientation,
  judgeSelection,
  judgeVibrations,
  newVibrations,
  overallVerdict,
  parseAmStart,
  parseFocusedWindow,
  parseInputShown,
  parseKeyguardShowing,
  parseUiNodes,
  parseVibrations,
  parseWakefulness,
} from '../deviceTour.mjs';

const PKG = 'com.volstudio.voltest';

describe('cihaz turu: pencere ve kilit durumu', () => {
  it('odaktaki pencereden paket ve etkinliği ayırır', () => {
    const focus = parseFocusedWindow(
      `  mCurrentFocus=Window{44b21bd u0 ${PKG}/${PKG}.MainActivity}\n  mFocusedApp=...`,
    );
    assert.deepEqual(focus, {
      package: PKG,
      activity: `${PKG}.MainActivity`,
      window: `${PKG}/${PKG}.MainActivity`,
    });
  });

  it('sistem pencerelerinde paketi null verir (kilit ekranı uygulama sayılmaz)', () => {
    assert.deepEqual(parseFocusedWindow('mCurrentFocus=Window{5c8dce8 u0 Bouncer}'), {
      package: null,
      activity: null,
      window: 'Bouncer',
    });
    assert.equal(parseFocusedWindow('odak yok'), null);
  });

  it('kilit ekranı, uyanıklık ve klavye durumunu okur; satır yoksa bilinmiyor der', () => {
    assert.equal(parseKeyguardShowing('    isKeyguardShowing=true'), true);
    assert.equal(parseKeyguardShowing('isKeyguardShowing=false'), false);
    assert.equal(parseKeyguardShowing('hiçbir şey'), null);
    assert.equal(parseWakefulness('  mWakefulness=Dozing'), 'Dozing');
    assert.equal(parseWakefulness(''), null);
    assert.equal(parseInputShown('x mInputShown=true y'), true);
    assert.equal(parseInputShown('mInputShown=false'), false);
    assert.equal(parseInputShown(''), null);
  });
});

describe('cihaz turu: am start -W', () => {
  it('durum, soğuk başlangıç ve süreyi okur', () => {
    const output = `Starting: Intent { cmp=${PKG}/.MainActivity }\r\nStatus: ok\r\nLaunchState: COLD\r\nActivity: ${PKG}/.MainActivity\r\nTotalTime: 748\r\nWaitTime: 754\r\nComplete`;
    assert.deepEqual(parseAmStart(output), { status: 'ok', launchState: 'COLD', totalMs: 748 });
  });

  it('eksik alanı null bırakır', () => {
    assert.deepEqual(parseAmStart('Error: Activity class not found'), {
      status: null,
      launchState: null,
      totalMs: null,
    });
  });
});

const VIB = [
  'Vibrator Manager Service:',
  '  Previous vibrations for usage UNKNOWN:',
  '    createTime: 09-12 14:35:02.184, startTime: 01-01 02:00:00.000, endTime: 09-12 14:35:02.184, durationMs: 0, status: ıgnored_for_settıngs, effect: Mono{}, callerInfo: CallerInfo{ attrs=VibrationAttributes: Usage=UNKNOWN, uid=1000, displayId=0, opPkg=com.tbsmart.levision, reason=null}',
  '  Previous vibrations for usage TOUCH:',
  `    createTime: 10-11 21:22:31.728, startTime: 01-01 02:00:00.000, endTime: 10-11 21:22:31.728, durationMs: 0, status: ıgnored_for_settıngs, effect: Mono{}, callerInfo: CallerInfo{ attrs=VibrationAttributes: Usage=TOUCH, uid=10317, displayId=0, opPkg=${PKG}, reason=null}`,
  `    createTime: 10-11 21:22:31.945, startTime: 10-11 21:22:31.950, endTime: 10-11 21:22:31.962, durationMs: 12, status: FINISHED, effect: Mono{}, callerInfo: CallerInfo{ attrs=VibrationAttributes: Usage=TOUCH, uid=10317, displayId=0, opPkg=${PKG}, reason=null}`,
].join('\n');

describe('cihaz turu: titreşim geçmişi', () => {
  it('yalnız istenen paketin kayıtlarını alır ve Türkçe yerel durumunu normalleştirir', () => {
    const entries = parseVibrations(VIB, PKG);
    assert.deepEqual(
      entries.map(({ createTime, usage, status, durationMs }) => ({
        createTime,
        usage,
        status,
        durationMs,
      })),
      [
        {
          createTime: '10-11 21:22:31.728',
          usage: 'TOUCH',
          status: 'ignored_for_settings',
          durationMs: 0,
        },
        { createTime: '10-11 21:22:31.945', usage: 'TOUCH', status: 'finished', durationMs: 12 },
      ],
    );
  });

  it('Android 16 tablo biçimini de okur; başka paketi ve üst başlığı almaz', () => {
    const table = [
      '  10-11 21:30:53.939 |   effect |             finished | duration:   124ms | start: 21:30:53.940 | end: 21:30:54.063 | scale:     HIGH (adaptive=1.00) | flags:    0 | usage: TOUCH | com.volstudio.voltest (uid=10373, deviceId=0) | reason: null | played: [Step=26ms(amplitude=0,50)] | original: null',
      '  10-11 21:31:00.100 |   effect |             finished | duration:    10ms | start: 21:31:00.100 | end: 21:31:00.110 | scale:     HIGH (adaptive=1.00) | flags:    0 | usage: TOUCH | com.android.systemui (uid=10100, deviceId=0) | reason: null | played: Step=10ms | original: null',
      '  10-11 21:31:05.500 |   effect |   ignored_for_settings | duration:     0ms | start: 21:31:05.500 | end: 21:31:05.500 | scale:     HIGH (adaptive=1.00) | flags:    0 | usage: TOUCH | com.volstudio.voltest (uid=10373, deviceId=0) | reason: null | played: null | original: null',
    ].join(String.fromCharCode(10));
    const entries = parseVibrations(table, PKG);
    assert.deepEqual(
      entries.map(({ createTime, usage, status, durationMs }) => ({
        createTime,
        usage,
        status,
        durationMs,
      })),
      [
        { createTime: '10-11 21:30:53.939', usage: 'TOUCH', status: 'finished', durationMs: 124 },
        {
          createTime: '10-11 21:31:05.500',
          usage: 'TOUCH',
          status: 'ignored_for_settings',
          durationMs: 0,
        },
      ],
    );
    assert.equal(judgeVibrations(entries).played.verdict, 'PASS');
  });

  it('tur öncesi kayıtları yeni kayıtlardan ayırır', () => {
    const all = parseVibrations(VIB, PKG);
    assert.deepEqual(newVibrations([all[0]], all), [all[1]]);
    assert.deepEqual(newVibrations(all, all), []);
  });

  it('hiç istek yoksa ulaştı da çalındı da NOT-RUN olur', () => {
    const verdict = judgeVibrations([]);
    assert.equal(verdict.reached.verdict, 'NOT-RUN');
    assert.equal(verdict.played.verdict, 'NOT-RUN');
  });

  it('cihaz ayarı yüzünden yok sayılan istek ulaştı ama çalındı sayılmaz', () => {
    const [ignored, finished] = parseVibrations(VIB, PKG);
    const onlyIgnored = judgeVibrations([ignored]);
    assert.equal(onlyIgnored.reached.verdict, 'PASS');
    assert.equal(onlyIgnored.played.verdict, 'NOT-RUN');
    assert.match(onlyIgnored.played.detail, /ignored_for_settings/);

    const mixed = judgeVibrations([ignored, finished]);
    assert.equal(mixed.played.verdict, 'PASS');
    assert.match(mixed.played.detail, /insan doğrulaması/);
  });
});

describe('cihaz turu: yön ve genel hüküm', () => {
  const base = { type: 'landscape-primary', width: 1569, height: 941, tokenKept: true, pid: 10919 };

  it('yatay, aynı sayfa ve aynı süreçte PASS verir', () => {
    assert.equal(judgeOrientation(base, { pid: 10919 }).verdict, 'PASS');
  });

  it('dikeye dönme, sayfa yeniden yüklenmesi ve süreç değişimini ayrı ayrı FAIL yapar', () => {
    const portrait = judgeOrientation(
      { ...base, type: 'portrait-primary', width: 600, height: 900 },
      { pid: 10919 },
    );
    assert.equal(portrait.verdict, 'FAIL');
    assert.match(portrait.detail, /portrait-primary/);
    assert.match(portrait.detail, /yatay değil/);

    const reloaded = judgeOrientation({ ...base, tokenKept: false }, { pid: 10919 });
    assert.match(reloaded.detail, /yeniden yüklendi/);

    const respawned = judgeOrientation({ ...base, pid: 99 }, { pid: 10919 });
    assert.match(respawned.detail, /süreç değişti/);
  });

  it('genel hüküm: FAIL baskındır; NOT-RUN karışırsa PARTIAL; boş liste NOT-RUN', () => {
    const pass = { verdict: 'PASS' };
    const notRun = { verdict: 'NOT-RUN' };
    const fail = { verdict: 'FAIL' };
    assert.equal(overallVerdict([pass, pass]), 'PASS');
    assert.equal(overallVerdict([pass, notRun]), 'PARTIAL');
    assert.equal(overallVerdict([pass, notRun, fail]), 'FAIL');
    assert.equal(overallVerdict([notRun, notRun]), 'NOT-RUN');
    assert.equal(overallVerdict([]), 'NOT-RUN');
  });
});

describe('cihaz turu: yerel seçim çubuğu', () => {
  const xml = `<?xml version='1.0' encoding='UTF-8'?><hierarchy rotation="1">
    <node index="0" text="" class="android.widget.FrameLayout" bounds="[0,0][1200,2000]">
      <node index="0" text="Kes" content-desc="" class="android.widget.Button" bounds="[100,200][300,300]" />
      <node index="1" text="" content-desc="Kopyala" class="android.widget.Button" bounds="[300,200][500,300]" />
      <node index="2" text="Tümünü seç" class="android.widget.Button" bounds="[500,200][700,300]" />
    </node></hierarchy>`;

  it('metin ve açıklama taşıyan düğümleri merkezleriyle çıkarır; etiketsizleri atar', () => {
    const nodes = parseUiNodes(xml);
    assert.deepEqual(
      nodes.map((node) => [node.label, node.x, node.y]),
      [
        ['Kes', 200, 250],
        ['Kopyala', 400, 250],
        ['Tümünü seç', 600, 250],
      ],
    );
  });

  it('eylemi Türkçe ve İngilizce etiketle bulur; olmayan eylem null verir', () => {
    const nodes = parseUiNodes(xml);
    assert.equal(findEditAction(nodes, 'cut')?.x, 200);
    assert.equal(findEditAction(nodes, 'copy')?.x, 400);
    assert.equal(findEditAction(nodes, 'selectAll')?.x, 600);
    assert.equal(findEditAction(nodes, 'paste'), null);
    const english = parseUiNodes('<node text="Paste" bounds="[0,0][10,10]" />');
    assert.equal(findEditAction(english, 'paste')?.label, 'Paste');
  });

  it('seçim hükmü: seçildi PASS, boş FAIL, sayı alanı ve alan yok NOT-RUN', () => {
    assert.equal(judgeSelection({ start: 0, end: 8, value: 'volstudio' }).verdict, 'PASS');
    assert.equal(judgeSelection({ start: 3, end: 3, value: 'volstudio' }).verdict, 'FAIL');
    assert.equal(judgeSelection({ start: null, end: null, value: '12' }).verdict, 'NOT-RUN');
    assert.equal(judgeSelection(null).verdict, 'NOT-RUN');
  });
});
