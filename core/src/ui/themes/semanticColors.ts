/**
 * Anlamsal tema tokenları (varsayılan tema). `colors.ts`teki 60 genel
 * `VOL_COLORS` tokenı değişmez; bunlar ona EKLENEN rol katmanıdır ve henüz hiçbir
 * bileşen tüketmez: varsayılan görünüm bu dilimde değişmez. Tüketim UI-03'ten
 * itibaren bileşen bileşen gelir.
 *
 * Bu dosya `core/scripts/gen-theme.mjs` tarafından DOĞRUDAN yüklenir (Node tür
 * soyma): yalnız düz sabitler taşır, başka modül içe aktarmaz. Yeni token
 * eklerken `pnpm gen:theme` çalıştırılır; CSS değişken adı anahtarın kebab hâlidir
 * (`plateTopLight` → `--vol-ui-plate-top-light`).
 *
 * Roller:
 * - yüzey: page (sayfa) < well (çukur) / panel (yüzey) < plate (kabartma);
 *   ayrım ton farkı + iç gölge + hairline + üst ışık iledir.
 * - frame: çerçeve ailesi (dış hairline, köşe vurgusu, başlık şeridi, ayraç).
 * - glow: emissive anlam ışıması; renk tek taşıyıcı değildir, metin/ikon/desen
 *   eşliğinde kullanılır.
 * - rarity: dört nadirlik × (solid, hover, selected, disabled, border, glow).
 *   Nadirlik kimliktir, temayla değişmez. Mevcut CardTile (rare/epic/legendary) ve
 *   SlotGrid (common/rare/epic) tipleri otomatik birleştirilmez.
 */
export const VOL_SEMANTIC_COLORS = {
  // yüzey rolleri
  page: '#0d1115',
  well: '#0a0d11',
  panel: '#182028',
  plate: '#212a33',
  plateTopLight: '#ffffff1f',
  wellInnerShadow: '#00000066',

  // çerçeve
  frameHairline: '#34414d',
  frameCorner: '#864a2c',
  frameHeader: '#1d252d',
  frameDivider: '#2a3540',

  // emissive anlam ışıması
  glowBrand: '#d6743459',
  glowSupport: '#2c748359',
  glowSuccess: '#307a5759',
  glowWarning: '#d2a03c59',
  glowDanger: '#b94a4a59',

  // nadirlik: common
  rarityCommonSolid: '#83919d',
  rarityCommonHover: '#9aa7b3',
  rarityCommonSelected: '#b5c1cc',
  rarityCommonDisabled: '#4a5560',
  rarityCommonBorder: '#34414d',
  rarityCommonGlow: '#9aa7b340',

  // nadirlik: rare (mevcut info mavisiyle aynı kimlik)
  rarityRareSolid: '#356eb0',
  rarityRareHover: '#4580c4',
  rarityRareSelected: '#5a95d9',
  rarityRareDisabled: '#2a3d55',
  rarityRareBorder: '#2c557f',
  rarityRareGlow: '#4580c459',

  // nadirlik: epic (mevcut accent moruyla aynı kimlik)
  rarityEpicSolid: '#565dbe',
  rarityEpicHover: '#6a71d4',
  rarityEpicSelected: '#7f86e6',
  rarityEpicDisabled: '#363a66',
  rarityEpicBorder: '#6269c4',
  rarityEpicGlow: '#6a71d459',

  // nadirlik: legendary (mevcut warning altınıyla aynı kimlik)
  rarityLegendarySolid: '#d2a03c',
  rarityLegendaryHover: '#e3b24d',
  rarityLegendarySelected: '#f0c568',
  rarityLegendaryDisabled: '#5e4a22',
  rarityLegendaryBorder: '#a67c25',
  rarityLegendaryGlow: '#e3b24d66',
} as const;
