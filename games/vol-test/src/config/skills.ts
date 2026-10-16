/**
 * Araç yetenekleri. Her araç tek bir yetenek taşır ve yeteneği hız deposundan (`boostCapacity`)
 * besler: Space (tankta Shift) basılınca depo boşalırken yetenek açıktır, depo tükenince bir
 * bekleme (`boostRestart`) vardır. Süre ve bekleme bu yüzden araç sayılarıdır; yeni bir ağ durumu
 * yoktur, sunucu ve öngörü aynı depodan aynı yeteneği türetir (`Chassis.boosting`).
 *
 * - `dash`: hızlı atılım (tank, mech).
 * - `leap`: kayanın ve suyun üstünden geçen sıçrama (sıçrayıcılar, Arachnid, Widow).
 * - `shield`: süreli enerji kalkanı; savaş hasarını emer (Goliath).
 * - `overdrive`: iticilere aşırı yük; atış temposu katlanır (Manta).
 * - `ram`: çarpma atağı; hızla çarpan rakibe katlanmış hasar verir, kendi hasarı azalır (Barracuda).
 * - `siege`: kuşatma duruşu; hareket yavaşlar, gelen hasar azalır, verilen artar (Leviathan).
 */
export const SKILL_IDS = ['dash', 'leap', 'shield', 'overdrive', 'ram', 'siege'] as const;
export type SkillId = (typeof SKILL_IDS)[number];

/** Yetenek açıkken geçerli savaş çarpanları; hepsi 1'dir = etkisiz. */
export interface SkillEffect {
  /** Gelen savaş hasarı (mermi, duvar, çarpışma) çarpanı; boğulma etkilenmez. 0 = kalkan. */
  readonly taken: number;
  /** Atılan mermilerin hasar çarpanı. */
  readonly dealt: number;
  /** Silah bekleme süresinin akış hızı: 2 = silah iki kat sık ateşler. */
  readonly fireRate: number;
  /** Bu araç çarptığında rakibin aldığı çarpışma hasarı çarpanı. */
  readonly ram: number;
  /** Bu aracın kendi çarpışma hasarı çarpanı (rakibe çarpmanın bedeli). */
  readonly ramTaken: number;
  /** Mermi isabetinin itme gücü çarpanı: kalkan ve zırh aracı yerinden oynatmaz. */
  readonly push: number;
}

const NEUTRAL: SkillEffect = {
  taken: 1,
  dealt: 1,
  fireRate: 1,
  ram: 1,
  ramTaken: 1,
  push: 1,
};

export const SKILLS: Readonly<Record<SkillId, SkillEffect>> = {
  dash: NEUTRAL,
  leap: NEUTRAL,
  shield: { ...NEUTRAL, taken: 0, push: 0.15 },
  overdrive: { ...NEUTRAL, fireRate: 1.45 },
  ram: { ...NEUTRAL, ram: 2.4, ramTaken: 0.3 },
  siege: { ...NEUTRAL, taken: 0.9, dealt: 1.05, push: 0.6 },
};

/** Yetenek açılırken araç fırlar mı? Kalkan ve kuşatma yerinde durur; kamera itmesi ve hız çizgisi yalnız fırlayanlarındır. */
export function skillLunges(skill: SkillId): boolean {
  return skill !== 'shield' && skill !== 'siege';
}
