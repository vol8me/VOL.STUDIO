// vol-deck-probe — cihaz başı ölçüm sondasının ön yüzü.
// Her bulgu tek kanallı JSONL kaydına gider; deck.mjs onu SSH ile toplar.
// Kayıt satırları { v, src:'js', type, t, wall, ... } biçimindedir.
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const statusEl = document.getElementById('status');
const detailEl = document.getElementById('detail');
const lines = {};
function show(key, text) {
  lines[key] = text;
  detailEl.textContent = Object.values(lines).join('\n');
}

function log(type, data = {}) {
  const entry = {
    v: 1,
    src: 'js',
    type,
    t: Math.round(performance.now()),
    wall: Date.now(),
    ...data,
  };
  return invoke('plugin:vol-diagnostics|report', { line: JSON.stringify(entry) }).catch(() => {});
}

window.addEventListener('error', (e) => log('error', { message: String(e.message) }));
window.addEventListener('unhandledrejection', (e) =>
  log('rejection', { reason: String(e.reason) }),
);

function webglInfo() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) return { webgl: false };
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    webgl: gl instanceof WebGL2RenderingContext ? 2 : 1,
    vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
  };
}

const media = (q) => window.matchMedia(q).matches;

let audio = null;
async function audioProbe(reason) {
  try {
    if (!audio) {
      audio = new AudioContext();
      audio.addEventListener('statechange', () => log('audio-state', { state: audio.state }));
    }
    if (audio.state !== 'running') await audio.resume().catch(() => {});
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    gain.gain.value = 0.08;
    osc.frequency.value = 440;
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.2);
    await log('audio', {
      reason,
      state: audio.state,
      sampleRate: audio.sampleRate,
      baseLatency: audio.baseLatency,
      outputLatency: audio.outputLatency,
    });
    show(
      'audio',
      `ses: ${audio.state} ${audio.sampleRate} Hz, çıkış gecikmesi ${Math.round(
        (audio.outputLatency || 0) * 1000,
      )} ms`,
    );
  } catch (error) {
    log('audio-error', { reason, message: String(error) });
  }
}

async function start() {
  const env = await invoke('plugin:vol-diagnostics|env_info');
  const sessionKind = await invoke('session_kind').catch(() => 'unknown');
  // D4 kanıtı: hidraw (Deck HID raporu) ya da evdev FF_RUMBLE — kabuk
  // arka ucu ölçülmüş sırayla seçer; 'none' ise scan sayaçları raporda durur.
  const haptics = await invoke('vol_haptics_status').catch(() => ({ backend: 'error' }));
  await log('haptics-status', { haptics });
  if (haptics.backend !== 'none' && haptics.backend !== 'error') {
    const rumble = await invoke('vol_haptics_rumble', {
      strong: 0.4,
      weak: 0.4,
      durationMs: 120,
    })
      .then(() => 'ok')
      .catch((error) => String(error));
    await log('haptics-rumble', { result: rumble });
    show('haptics', `haptik: ${haptics.device} (${rumble})`);
  } else {
    show('haptics', `haptik: ${haptics.backend}`);
  }
  // D6 kanıtı: eklenti kayıtlıdır; `available` ancak Steam istemcisi
  // bağlantısı kurulabildiyse true. Devkit lansmanında overlay takılı
  // olmayabilir — o zaman diyalog çağrısı `false` döner ve raporda durur.
  const sw = await invoke('plugin:vol-steamworks|status').catch((e) => ({ error: String(e) }));
  await log('steamworks-status', { status: sw });
  show(
    'steam',
    `steamworks: ${sw.available ? `bağlı appId ${sw.appId}` : `kapalı (${sw.error ?? 'stub'})`}`,
  );
  if (sw.available) {
    // Manifesto init sırasında (ilk RunFrame'den önce) Steam'e geçirilir;
    // sonuç status.manifestOk alanında. Komut yeniden geçirmeyi de dener —
    // geç çağrının reddi manifestonun yüklenmediği anlamına gelmez.
    const manifest = await invoke('plugin:vol-steamworks|set_input_manifest', {
      path: 'steam_input_manifest.vdf',
    })
      .then((ok) => ({ ok }))
      .catch((error) => ({ ok: false, error: String(error) }));
    await log('steamworks-manifest', { initOk: sw.manifestOk, late: manifest });
    const sets = await invoke('plugin:vol-steamworks|activate_action_set', {
      name: 'ProbeControls',
    }).catch((e) => String(e));
    await log('steamworks-actionset', { applied: sets });
    const ctrls = await invoke('plugin:vol-steamworks|controllers').catch(() => []);
    await log('steamworks-controllers', { controllers: ctrls });
    const glyph = await invoke('plugin:vol-steamworks|action_glyph', {
      actionSet: 'ProbeControls',
      action: 'menu_confirm',
    }).catch((e) => String(e));
    await log('steamworks-glyph', { glyph });
    // Steam Cloud: yalnız uygulama bulutu açıksa yaz/oku turu.
    if (sw.cloudEnabled) {
      const name = 'v2_cHJvYmU'; // 'probe' anahtarının base64url karşılığı
      const w = await invoke('plugin:vol-steamworks|cloud_write', {
        name,
        dataBase64: btoa(JSON.stringify({ ping: 1 })),
      }).catch((e) => String(e));
      const r = await invoke('plugin:vol-steamworks|cloud_read', { name }).catch((e) => String(e));
      await invoke('plugin:vol-steamworks|cloud_delete', { name }).catch(() => {});
      await log('steamworks-cloud', { write: w, read: r });
    }
    listen('vol-steamworks:overlay', (e) =>
      log('steamworks-overlay', { active: e.payload.active }),
    );
    listen('vol-steamworks:floating-dismissed', () => log('steamworks-floating', {}));
  }
  const info = {
    env,
    sessionKind,
    userAgent: navigator.userAgent,
    screen: {
      w: screen.width,
      h: screen.height,
      availW: screen.availWidth,
      availH: screen.availHeight,
    },
    inner: { w: innerWidth, h: innerHeight },
    dpr: devicePixelRatio,
    maxTouchPoints: navigator.maxTouchPoints,
    pointerCoarse: media('(pointer: coarse)'),
    pointerFine: media('(pointer: fine)'),
    anyPointerCoarse: media('(any-pointer: coarse)'),
    hover: media('(hover: hover)'),
    anyHover: media('(any-hover: hover)'),
    shouldUseTouchControls: media('(pointer: coarse)') && !media('(hover: hover)'),
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: navigator.deviceMemory ?? null,
    gamepadApi: typeof navigator.getGamepads === 'function',
    vibrationActuatorInPrototype:
      typeof Gamepad !== 'undefined' && 'vibrationActuator' in Gamepad.prototype,
    hapticActuatorClass: typeof GamepadHapticActuator !== 'undefined',
    navigatorVibrate: typeof navigator.vibrate === 'function',
    webgl: webglInfo(),
    fullscreenEnabled: document.fullscreenEnabled,
  };
  await log('info', info);
  show(
    'env',
    `SteamDeck=${env.SteamDeck ?? '-'} SteamAppId=${env.SteamAppId ?? '-'} DMABUF_KAPALI=${
      env.WEBKIT_DISABLE_DMABUF_RENDERER ?? '-'
    } runtime=${env.PRESSURE_VESSEL_RUNTIME ?? 'host'}`,
  );
  show('gl', `WebGL${info.webgl.webgl}: ${info.webgl.renderer}`);
  show(
    'ptr',
    `pencere ${innerWidth}×${innerHeight} dpr ${devicePixelRatio} dokunma ${navigator.maxTouchPoints} coarse ${info.pointerCoarse} hover ${info.hover} → dokunmatik kontrol ${info.shouldUseTouchControls}`,
  );
  audioProbe('start');
  const rafDeltas = [];
  let prev = 0;
  const until = performance.now() + 4000;
  await new Promise((resolve) => {
    const tick = (now) => {
      if (prev) rafDeltas.push(now - prev);
      prev = now;
      if (now < until) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  const raf = summarize(rafDeltas);
  await log('phase-raf', { phase: 'saf rAF', ...raf });
  show('raf', `saf rAF: ${raf.fps} FPS, p95 ${raf.p95} ms`);
  runLoadPhases();
}

const PHASES = [
  { name: 'boş', sprites: 0, seconds: 6 },
  { name: '1000 sprite', sprites: 1000, seconds: 10 },
  { name: '4000 sprite', sprites: 4000, seconds: 10 },
  { name: 'etkileşim (200 sprite)', sprites: 200, seconds: Infinity },
];

// Sprite yükü fazları oyun motoruyla ölçülür (Phaser — oyunların motoru).
// vendor/phaser.min.js yalnız `deck build`'te kopyalanır; yoksa fazlar
// atlanır ama geri kalan gözlemler (rAF, girdi, yaşam döngüsü) çalışır.
function runLoadPhases() {
  if (typeof Phaser === 'undefined') {
    log('phaser-missing', {});
    show('phaser', 'phaser.min.js yok — sprite fazları atlandı (deck build ile gelir)');
    return;
  }
  let phaseIndex = 0;
  let phaseStart = 0;
  let deltas = [];
  let sprites = [];
  let lastFrame = 0;
  const scene = {
    create() {
      const g = this.add.graphics();
      g.fillStyle(0xff5a36, 1).fillCircle(8, 8, 8);
      g.generateTexture('dot', 16, 16);
      g.destroy();
      this.setCount = (n) => {
        while (sprites.length < n) {
          const s = this.add.image(Math.random() * 1280, Math.random() * 800, 'dot');
          s.vx = (Math.random() - 0.5) * 400;
          s.vy = (Math.random() - 0.5) * 400;
          sprites.push(s);
        }
        while (sprites.length > n) sprites.pop().destroy();
      };
      this.setCount(PHASES[0].sprites);
      phaseStart = performance.now();
    },
    update(_time, delta) {
      const now = performance.now();
      if (lastFrame) deltas.push(now - lastFrame);
      lastFrame = now;
      const dt = delta / 1000;
      for (const s of sprites) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.x < 0 || s.x > 1280) s.vx *= -1;
        if (s.y < 0 || s.y > 800) s.vy *= -1;
      }
      const phase = PHASES[phaseIndex];
      statusEl.textContent = `faz: ${phase.name} — ${Math.round(this.game.loop.actualFps)} FPS`;
      if (now - phaseStart >= phase.seconds * 1000) {
        const summary = summarize(deltas);
        log('phase', { phase: phase.name, sprites: phase.sprites, ...summary });
        show(
          `phase${phaseIndex}`,
          `${phase.name}: ${summary.fps} FPS, p95 ${summary.p95} ms, >20ms ${summary.over20ms}`,
        );
        phaseIndex += 1;
        deltas = [];
        phaseStart = now;
        this.setCount(PHASES[phaseIndex].sprites);
        if (PHASES[phaseIndex].seconds === Infinity) {
          show('ask', 'ŞİMDİ: kol tuşları, çubuklar, trackpad, dokunmatik ve klavye dene');
        }
      }
    },
  };
  new Phaser.Game({
    type: Phaser.WEBGL,
    parent: 'game',
    width: 1280,
    height: 800,
    backgroundColor: '#0b0d12',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene,
  });
}

const seenPads = new Map();
function pollPads() {
  for (const pad of navigator.getGamepads()) {
    if (!pad) continue;
    const prev = seenPads.get(pad.index) ?? { buttons: [], axes: [] };
    const buttons = pad.buttons.map((b) => b.pressed);
    buttons.forEach((pressed, i) => {
      if (pressed && !prev.buttons[i]) {
        log('pad-button', { index: pad.index, button: i, value: pad.buttons[i].value });
        show('padlast', `son tuş: ${i} (değer ${pad.buttons[i].value.toFixed(2)})`);
      }
    });
    const axes = pad.axes.map((a) => (Math.abs(a) > 0.5 ? Math.sign(a) : 0));
    axes.forEach((a, i) => {
      if (a !== 0 && a !== prev.axes[i]) log('pad-axis', { index: pad.index, axis: i, dir: a });
    });
    seenPads.set(pad.index, { buttons, axes });
  }
  requestAnimationFrame(pollPads);
}
requestAnimationFrame(pollPads);

window.addEventListener('gamepadconnected', async (e) => {
  const pad = e.gamepad;
  const detail = {
    index: pad.index,
    id: pad.id,
    mapping: pad.mapping,
    buttons: pad.buttons.length,
    axes: pad.axes.length,
    vibrationActuator: pad.vibrationActuator
      ? pad.vibrationActuator.effects ?? pad.vibrationActuator.type ?? 'var'
      : null,
  };
  log('pad-connected', detail);
  show(
    'pad',
    `kol: ${pad.id} mapping=${pad.mapping} tuş ${pad.buttons.length} eksen ${
      pad.axes.length
    } titreşim ${detail.vibrationActuator ? 'VAR' : 'YOK'}`,
  );
  if (pad.vibrationActuator?.playEffect) {
    try {
      const result = await pad.vibrationActuator.playEffect('dual-rumble', {
        startDelay: 0,
        duration: 400,
        weakMagnitude: 1,
        strongMagnitude: 1,
      });
      log('rumble', { result: String(result) });
    } catch (error) {
      log('rumble-error', { message: String(error) });
    }
  }
  audioProbe('gamepad');
});
window.addEventListener('gamepaddisconnected', (e) =>
  log('pad-disconnected', { id: e.gamepad.id }),
);

const pointerCounts = {};
window.addEventListener('pointerdown', (e) => {
  log('pointerdown', {
    pointerType: e.pointerType,
    button: e.button,
    x: e.clientX,
    y: e.clientY,
  });
  show('ptrlast', `son işaretçi: ${e.pointerType} düğme ${e.button}`);
  audioProbe('pointer');
});
window.addEventListener('pointermove', (e) => {
  pointerCounts[e.pointerType] = (pointerCounts[e.pointerType] ?? 0) + 1;
});
window.addEventListener('wheel', (e) =>
  log('wheel', { dx: e.deltaX, dy: e.deltaY, mode: e.deltaMode }),
);
window.addEventListener('keydown', (e) => {
  log('key', { key: e.key, code: e.code, repeat: e.repeat });
  show('keylast', `son tuş (klavye): ${e.key} / ${e.code}`);
});
setInterval(() => {
  if (Object.keys(pointerCounts).length) log('pointer-moves', { ...pointerCounts });
  for (const key of Object.keys(pointerCounts)) delete pointerCounts[key];
}, 5000);

for (const name of ['visibilitychange', 'pagehide', 'pageshow', 'freeze', 'resume']) {
  document.addEventListener(name, () =>
    log('lifecycle', { event: name, hidden: document.hidden, audio: audio?.state }),
  );
}
for (const name of ['blur', 'focus']) {
  window.addEventListener(name, () =>
    log('lifecycle', { event: name, hidden: document.hidden, audio: audio?.state }),
  );
}

let lastPerf = performance.now();
let lastWall = Date.now();
setInterval(() => {
  const perf = performance.now();
  const wall = Date.now();
  const perfGap = perf - lastPerf;
  const wallGap = wall - lastWall;
  if (wallGap > 2500 || perfGap > 2500) {
    log('js-gap', {
      perfGap: Math.round(perfGap),
      wallGap: Math.round(wallGap),
      audio: audio?.state,
    });
    audioProbe('after-gap');
  }
  lastPerf = perf;
  lastWall = wall;
}, 1000);

listen('vol:terminate', async (event) => {
  await log('terminate-received', { signal: event.payload });
});

start();
import { summarizeFrameIntervals as summarize } from './vendor/frame-summary.js';
