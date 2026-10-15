import type { WeaponStyle } from './tank';

/**
 * Silahın görünümü: mermi izi ve ağız parlaması rengi ile gövde çarpanları. Her silah kendi
 * rengiyle okunur (kehribar kabuk, turuncu ağır mermi, buz mavisi ray, kızıl plazma, zehir yeşili iğne, mor yay, limon otomatik top, pembe döner makineli, zümrüt saçma, derin mavi mızrak, sedef havan); böylece
 * kimin ateş ettiği mermiden de anlaşılır. Çarpanlar `FX.shell` ölçülerine uygulanır.
 */
export interface ShotLook {
  /** Dış hale ve parıltı rengi. */
  readonly glow: number;
  /** İz çekirdeği ve gövde rengi. */
  readonly hot: number;
  /** İz uzunluğu, iz/gövde eni ve hale yarıçapı çarpanları. */
  readonly length: number;
  readonly width: number;
  readonly halo: number;
}

export const SHOT_LOOK: Readonly<Record<WeaponStyle, ShotLook>> = {
  shell: { glow: 0xffb347, hot: 0xfff0cc, length: 1, width: 1, halo: 1 },
  slug: { glow: 0xff6a2e, hot: 0xffe0c2, length: 0.75, width: 1.6, halo: 1.6 },
  rail: { glow: 0x62d8ff, hot: 0xf2fdff, length: 2, width: 0.6, halo: 0.8 },
  plasma: { glow: 0xff5a6e, hot: 0xffe4e8, length: 1.1, width: 1.15, halo: 1.25 },
  needle: { glow: 0x9dff3a, hot: 0xf3ffd6, length: 1.7, width: 0.55, halo: 0.9 },
  arc: { glow: 0xb15cff, hot: 0xf4e6ff, length: 1.35, width: 0.7, halo: 1.1 },
  autocannon: { glow: 0xffe45e, hot: 0xfffbe0, length: 1.25, width: 0.8, halo: 0.9 },
  gatling: { glow: 0xff7ad9, hot: 0xffe6f6, length: 0.9, width: 0.6, halo: 0.7 },
  flak: { glow: 0x3ddc97, hot: 0xdcfff0, length: 0.7, width: 0.85, halo: 0.8 },
  lance: { glow: 0x3a6bff, hot: 0xdce6ff, length: 2.4, width: 1.3, halo: 1.5 },
  howitzer: { glow: 0xffd0a0, hot: 0xffffff, length: 1.2, width: 1.9, halo: 1.9 },
};

/** Sunum efektlerinin ayarları; renkler `palette.ts`ten gelir. */
export const FX = {
  /**
   * Hasar sayıları: ömür, toplam yükseliş, yan kayma adımı, sönmeye başlama kesri, havuz kapasitesi ve
   * yazı çözünürlüğü; yön başına renk ve boy. Yarım puandan az hasar yazılmaz.
   */
  damageNumbers: {
    lifeMs: 820,
    risePx: 34,
    driftPerStep: 5,
    fadeStart: 0.55,
    capacity: 14,
    resolution: 2,
    depth: 40,
    minAmount: 0.5,
    kinds: {
      dealt: { color: 0xffd45c, size: 15 },
      taken: { color: 0xff5a5a, size: 17 },
      other: { color: 0xd7d0c4, size: 11 },
    },
  },
  /** Enkaz rastgelesinin tohumu: parça düzeni oturumdan oturuma aynıdır. */
  debrisSeed: 7013,
  aimGuide: {
    haloWidth: 2.8,
    haloAlpha: 0.3,
    coreWidth: 0.9,
    markerRadius: 5,
    /** Yörünge örneklerinden kaçta biri çizilir (örnekler 1/60 s arayla). */
    stride: 3,
    /** Çizginin açılma ve sönme süresi: açılış çabuk, sönüş yavaş. */
    fadeInMs: 90,
    fadeOutMs: 320,
    /** Çizgi, görünürlüğün bu çarpanla kısıtlanmış oranında uzanır: tam uzunluğa alfa dolmadan varır. */
    revealGain: 1.6,
    alpha: 0.55,
    pulseMs: 180,
    pulseAlpha: 0.08,
    depth: 11,
  },
  /** Mermi: parlak gövde, incelen iz ve havada kısa kalan duman izi. */
  shell: {
    headLength: 7,
    headWidth: 3.2,
    heightScale: 0.25,
    shadowRadius: 3,
    shadowAlpha: 0.3,
    tracerLength: 34,
    /** Duman izi bu uzaklıkta bir kabarcık bırakır (birim). */
    trailSpacing: 30,
  },
  /** Egzoz ve tozun gövde merkezinin arkasındaki kaynağı (birim). */
  exhaustOffset: 22,
  /** Bu hızın üstünde paletler toz kaldırır (birim/s). */
  dustSpeed: 90,
  /**
   * Palet izi: paletin temas yolunu izleyen sürekli bant; her parça bir pabuç
   * adımıdır ve enine pabuç (grouser) izini taşır.
   */
  marks: {
    capacity: 2400,
    /**
     * Parça arası yer yolu (birim): her parça `grousers` pabuç adımı taşır (doku tekrarlıdır), böylece
     * aynı yol yarı sayıda çıkartmayla çizilir ve kalabalık sahnede havuz izi hemen yutmaz.
     */
    spacing: 12,
    grousers: 2,
    /** Bir kareden ötekine bu kadar uzağa giden araç ışınlanmıştır (yeniden doğuş): iz kesilir, köprü çizilmez. */
    maxJump: 96,
    /** Bant eni: palet eni (birim). */
    width: 11,
    alpha: 0.34,
    lifeMs: 16000,
    holdShare: 0.4,
    depth: 2,
  },
  /** Örümcek ayak izi: yere basan sivri pençenin açtığı küçük delik; yoğunluğu ve ömrü palet izinden kısadır. */
  feet: {
    capacity: 700,
    lifeMs: 9000,
    holdShare: 0.35,
    alpha: 0.5,
    depth: 2,
    refHalfWidth: 22,
    /** Mech bot izi: pençe deliğinden büyük ve kalıcıdır, ama iki bacaklı araç az iz bırakır. */
    bootCapacity: 260,
    bootLifeMs: 12000,
    bootAlpha: 0.55,
  },
  /** Ekran dışındaki araçların izi/lekesi bırakılmaz; görünen dikdörtgen bu pay kadar genişletilir (birim). */
  cullMargin: 700,
  /** Kayma izi: kayan paletin temas noktasının yerde bıraktığı sürekli çizgi. */
  skid: {
    capacity: 900,
    /** Bu kayma hızının altında palet tutunur, çizgi kesilir (birim/s). */
    minSlide: 35,
    /** Çizginin tam koyuluğa çıktığı kayma hızı. */
    fullSlide: 90,
    minStrength: 0.35,
    /**
     * Parça boyu, uç örtüşmesi ve çizgi eni (birim). Örtüşme 0'dır: yarı saydam
     * parçalar üst üste binince eklerde koyu bant (merdiven) oluşur.
     */
    segment: 6,
    overlap: 0,
    width: 9,
    alpha: 0.5,
    /** İz 20 s yerde kalır; ömrün ilk yarısı tam, sonra söner. */
    lifeMs: 20000,
    holdShare: 0.5,
    /** Palet izinin altında, zeminin üstünde. */
    depth: 1.9,
  },
  /** Namlu patlaması: namlu freni yan jetleri, ileri ateş topu, yerde toz halkası. */
  muzzle: {
    /** Halka dokusu 64 birimdir; ölçek 1 = 32 birim yarıçap. */
    ring: { scale: 0.8, durationMs: 150, alpha: 0.5 },
    sideJets: 3,
    forwardSparks: 6,
    groundDust: 4,
  },
  /** Patlama: parlama, şok halkası, kum parçaları, toz, duman ve yanık izi. */
  blast: {
    flash: { scale: 1.6, durationMs: 170 },
    ring: { scale: 2, durationMs: 260, alpha: 0.55 },
    debris: 12,
    dust: 5,
    smoke: 3,
    sparks: 10,
    scorch: {
      capacity: 120,
      size: 46,
      alpha: 0.55,
      lifeMs: 20000,
      holdShare: 0.5,
      depth: 1.8,
    },
  },
  /** Araç imha edildi: hızlı, tek bir patlama; parçacık sayıları, parlama ve şok halkası çarpanı. */
  wreck: { fire: 12, sparks: 16, debris: 8, dust: 7, smoke: 7, flashScale: 2.3, ringScale: 1.7 },
  /** Parça koptu (palet ya da bacak): kıvılcım, toz ve duman sayısı ve parlama ölçeği. */
  snap: { sparks: 14, dust: 5, smoke: 3, flashScale: 0.9 },
  /** Mermi araca isabet etti: yanık bırakmayan küçük patlama. */
  hit: { sparks: 16, smoke: 5, flashScale: 1.1 },
  wallFlash: { span: 260, width: 7, durationMs: 260 },
} as const;
