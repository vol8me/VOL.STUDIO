/**
 * Oyun ses efektleri — olay → kategorize edilmiş dosya yolları.
 * Dosyalar `public/assets/audio/sfx/<kategori>/` altında üretilir.
 *
 * Tema: Karanlık Sentetik / Void. Tüm SFX'ler `scripts/audio/sfx/specs.ts`
 * tarafından üretilir; bu dosya yalnızca runtime haritasıdır.
 */

const basePath = 'assets/audio/sfx';

const ui = `${basePath}/ui`;
const player = `${basePath}/player`;
const combat = `${basePath}/combat`;
const ability = `${basePath}/ability`;
const progress = `${basePath}/progress`;

/** Olay başına varyasyon listesi (0, 1, ...). */
export const soundAssets = {
  // ————— UI —————
  /** Menü / ayarlar / genel buton tıklaması. Eski `menuBlip` adı korundu
   *  çünkü sahne kodu geniş çapta bu olayı kullanıyor. */
  menuBlip: [`${ui}/click-0.ogg`, `${ui}/click-1.ogg`],
  /** Geri / iptal butonu. */
  back: [`${ui}/back-0.ogg`],
  /** Duraklatma ekranı açılırken. */
  pause: [`${ui}/pause-0.ogg`],
  /** Oyuna devam ederken. */
  resume: [`${ui}/resume-0.ogg`],
  /** Yeniden başlatma. */
  restart: [`${ui}/restart-0.ogg`],
  /** Yetersiz Flux / kilitlenemez / reddedilen eylem. */
  deny: [`${ui}/deny-0.ogg`],
  /** Seviye atladığında kart seçimi. */
  cardPick: [`${ui}/card-pick-0.ogg`],
  /** Dükkanda kart satın alma. */
  cardBuy: [`${ui}/card-buy-0.ogg`],
  /** Dükkanda teklifleri yenileme. */
  reroll: [`${ui}/reroll-0.ogg`],
  /** Dükkanda teklifi kilitleme / kilidi açma. */
  lock: [`${ui}/lock-0.ogg`],

  // ————— PLAYER —————
  fire: [`${player}/fire-0.ogg`, `${player}/fire-1.ogg`, `${player}/fire-2.ogg`],
  dash: [`${player}/dash-0.ogg`],
  hurt: [`${player}/hurt-0.ogg`, `${player}/hurt-1.ogg`],
  death: [`${player}/death-0.ogg`],
  fluxPickup: [`${player}/flux-pickup-0.ogg`, `${player}/flux-pickup-1.ogg`],

  // ————— COMBAT —————
  enemyHit: [`${combat}/enemy-hit-0.ogg`, `${combat}/enemy-hit-1.ogg`],
  enemyDeath: [`${combat}/enemy-death-0.ogg`, `${combat}/enemy-death-1.ogg`],
  bulletBounce: [`${combat}/bullet-bounce-0.ogg`],
  eliteSpawn: [`${combat}/elite-spawn-0.ogg`],
  bossSpawn: [`${combat}/boss-spawn-0.ogg`],
  bossEnrage: [`${combat}/boss-enrage-0.ogg`],
  bossDown: [`${combat}/boss-down-0.ogg`],
  telegraph: [`${combat}/telegraph-0.ogg`],

  // ————— ABILITY —————
  chainLightning: [`${ability}/chain-lightning-0.ogg`],
  fireZone: [`${ability}/fire-zone-0.ogg`],
  multiShot: [`${ability}/multi-shot-0.ogg`],
  turretDeploy: [`${ability}/turret-deploy-0.ogg`],
  turretFire: [`${ability}/turret-fire-0.ogg`],

  // ————— PROGRESS —————
  waveStart: [`${progress}/wave-start-0.ogg`],
  waveClear: [`${progress}/wave-clear-0.ogg`],
  levelUp: [`${progress}/level-up-0.ogg`],
} as const;

/** Olay → GameAudio SFX key eşlemesi. */
export const soundKeys = {
  menuBlip: 'sfx-menu-blip',
  back: 'sfx-back',
  pause: 'sfx-pause',
  resume: 'sfx-resume',
  restart: 'sfx-restart',
  deny: 'sfx-deny',
  cardPick: 'sfx-card-pick',
  cardBuy: 'sfx-card-buy',
  reroll: 'sfx-reroll',
  lock: 'sfx-lock',

  fire: 'sfx-fire',
  dash: 'sfx-dash',
  hurt: 'sfx-hurt',
  death: 'sfx-death',
  fluxPickup: 'sfx-flux-pickup',

  enemyHit: 'sfx-enemy-hit',
  enemyDeath: 'sfx-enemy-death',
  bulletBounce: 'sfx-bullet-bounce',
  eliteSpawn: 'sfx-elite-spawn',
  bossSpawn: 'sfx-boss-spawn',
  bossEnrage: 'sfx-boss-enrage',
  bossDown: 'sfx-boss-down',
  telegraph: 'sfx-telegraph',

  chainLightning: 'sfx-chain-lightning',
  fireZone: 'sfx-fire-zone',
  multiShot: 'sfx-multi-shot',
  turretDeploy: 'sfx-turret-deploy',
  turretFire: 'sfx-turret-fire',

  waveStart: 'sfx-wave-start',
  waveClear: 'sfx-wave-clear',
  levelUp: 'sfx-level-up',
} as const;

export type SoundEvent = keyof typeof soundAssets;
