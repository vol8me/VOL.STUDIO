import { clamp01 } from '../math/interpolation';
import { finiteOr, requireFinite } from '../math/numeric';

export interface LegGaitLeg {
  /** Gövde-yerel dinlenme ("ev") ayak konumu — gövde dönerse birlikte döner. */
  homeX: number;
  homeY: number;
  /**
   * Eşzamanlı adım grubu. Bir grup adım atarken diğerleri bekler; sekiz
   * bacakta 0/1 dağılımı doğal bir alternating tetrapod yürüyüşü verir
   * (yarısı hep yerde kalır).
   */
  group: number;
  /**
   * Bu bacağın ADIM BOYU ölçeği (varsayılan 1). Tetik ve öngörü payı bununla
   * çarpılır; acil eşik ÇARPILMAZ.
   *
   * Farklı boydaki bacaklar aynı adımı atamaz: eşik bacağın erişim payını
   * aşarsa ayak, uzuv TAM GERİLİ hâldeyken beklemeye devam eder ve uzuv
   * yürüyüş boyunca yerde sürükleniyormuş gibi görünür. Kısa bacak kısa adım
   * atar.
   *
   * Acil eşiğin ölçeklenmemesi bilinçlidir: o eşik bacağın değil GÖVDENİN
   * ölçüsüdür — gövdenin yürüyüş döngüsünü ne kadar geride bıraktığını sorar.
   * Ölçeklenirse kısa bacak, gövde normal hızda yürürken bile sırayı deler ve
   * "gövde her an desteklidir" güvencesi düşer.
   */
  strideScale?: number;
  /**
   * Bu bacak SIRA BEKLEMEZ (varsayılan `false`).
   *
   * Sıra disiplininin tek amacı "gövde her an desteklidir" güvencesidir. Gövdeyi
   * taşımayan yardımcı uzuvlar (kısa itici bacaklar, duyargalar) o güvencenin
   * parçası değildir; onları sıraya sokmak, kendi eşiklerini çoktan aşmış
   * hâlde beklemeye zorlar. Kısa bir uzuvda bu bekleme erişim payını yer:
   * uzuv stride'ın yarısından fazlasını TAM GERİLİ geçirir ve yerde
   * sürükleniyormuş gibi görünür.
   *
   * Serbest bacaklar sırayı ne alır ne bloklar; yalnız kendi eşikleriyle
   * tetiklenir.
   */
  freeStep?: boolean;
}

export interface LegGaitConfig {
  /** Ayak evinden bu kadar uzaklaşınca adım tetiklenir (dünya px). */
  stepTriggerPx: number;
  /**
   * Bir adımın (havada geçen) süresi.
   *
   * Adım kare sınırına YUVARLANIR: bir karede biten adımın artan süresi bir
   * sonraki adıma taşınmaz. Bu bilinçlidir — taşımak, aynı karede ikinci bir
   * adım başlatabilir ve sıra disiplinini kare hızına bağımlı kılardı. Kare
   * süresi `TECH.MAX_SIM_STEP_MS`e kelepçeli olduğu için sapma en fazla bir
   * kareliktir ve adım süresinin küçük bir kesridir.
   */
  stepDurationMs: number;
  /** Adım hedefini hız yönünde şu kadar saniye ileriye koyar — ayak gideceği yere basar. */
  stepLeadSeconds: number;
  /**
   * ACİL DURUM eşiği: gerginliği bunu aşan bacak, sıra kendisinde olmasa bile
   * adım atar. Sıra disiplini "gövde her an desteklidir" güvencesini verir ama
   * gövde bir dash'te bir adım süresinde bacak erişiminden DAHA ÇOK yol
   * alabilir; o durumda sıra beklemek bacağı yerde sürükler. Verilmezse
   * (ya da `stepTriggerPx`in altındaysa) kural kapalıdır.
   */
  maxStrainPx?: number;
}

export type LegGaitStepTuning = Pick<LegGaitConfig, 'stepTriggerPx' | 'stepDurationMs'>;

interface LegState {
  leg: LegGaitLeg;
  /** `leg.strideScale`ın doğrulanmış hâli; her karede yeniden okunmaz. */
  strideScale: number;
  plantedX: number;
  plantedY: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** Adım ilerlemesi [0,1]; 1 = yere basıyor (adım yok). */
  t: number;
  stepping: boolean;
  footX: number;
  footY: number;
  lift: number;
  /** Bu karede adım tamamlanıp ayak yere BASTI mı (toz/ses tetikleyicisi). */
  justPlanted: boolean;
  /** Bu adım sıra disiplinini delerek mi başladı (acil rejim ölçüsü)? */
  brokeTurn: boolean;
  /** Ayağın evinden o kareki uzaklığı — adım kararının ham girdisi. */
  strain: number;
}

/**
 * Ayak-sabitleyen (planted foot) yürüyüş döngüsü.
 *
 * Her ayak DÜNYA uzayında bir noktaya basar ve gövde hareket ederken orada
 * KALIR — yere tutunma hissinin kaynağı budur. Ayak, gövdeyle birlikte dönen
 * "ev" konumundan `stepTriggerPx` kadar geride kalınca bir adım başlar ve
 * ayak, hızın işaret ettiği yere (gideceği noktaya) taşınır.
 *
 * Adım sırası SIRA (turn) modeliyle dizginlenir: hiçbir bacak adımda değilken
 * en gergin bacağın grubu sırayı alır ve sıra bitene (o gruptaki tüm adımlar
 * tamamlanana) kadar yalnız o grup adım atar.
 *
 * DESTEK GÜVENCESİ İKİ REJİMLİDİR ve ikisi aynı şey değildir:
 *
 * - **Normal rejim** (`emergencySteppingCount === 0`): aynı anda yalnız SIRASI
 *   GELEN grup ve sıra beklemeyen (`freeStep`) bacaklar havadadır. Gövde her an
 *   karşı grubun tamamı üstünde kalır — asıl güvence budur.
 * - **Acil rejim**: `maxStrainPx`i aşan bir bacak sırayı DELER. O anda birden
 *   çok grup aynı anda havada olabilir ve yukarıdaki güvence GEÇERSİZDİR.
 *
 * Acil rejim bir kaçış değil bilinçli bir takastır: gövde bir atılımda bir adım
 * süresinde bacak erişiminden daha çok yol alabilir ve sıra beklemek bacağı
 * yerde SÜRÜKLER. Sürüklenen bir bacak her karede görünür, bir karelik zayıf
 * destek görünmez. `emergencySteppingCount` bu takasın ne zaman yapıldığını
 * ölçülebilir kılar — tüketici hangi rejimde olduğunu bilmeden destek sayısına
 * bakarsa yanlış bir güvence varsayar.
 *
 * Sıra modeli, bir grubun kilidi süresiz tutmasını da engeller: eski kural
 * ("karşı grup adımdayken başlama") aynı gruptaki bacaklar kaymalı bittiği
 * sürece kilidi hiç bırakmayabiliyordu ve karşı gruptaki bacaklar dönüşlere
 * bile tepkisiz biçimde yere yapışık kalıyordu. Sıra ancak adım sayısı sıfıra
 * indiğinde yenilenir ve yeni sırayı EN GERGİN bacak kazanır; bekleyen grup
 * her zaman en gergin olduğu için açlık matematiksel olarak mümkün değildir.
 */
export class LegGait {
  private readonly states: LegState[];
  private readonly config: LegGaitConfig;
  private steppingTotal = 0;
  /**
   * Sıraya DAHİL bacaklardan kaç tanesi adımda. Serbest bacaklar sayılmaz;
   * aksi halde sırayı bloklar ve destek güvencesini kendileri geciktirirlerdi.
   */
  private lockedStepping = 0;
  /**
   * Sıra disiplinini DELEREK adıma girmiş ve hâlâ havada olan bacak sayısı.
   * Sıfırsa normal rejim, sıfırdan büyükse acil rejim geçerlidir.
   */
  private emergencyStepping = 0;
  /** Sırası gelen grup; sıraya dahil hiçbir bacak adımda değilken `null`. */
  private turnGroup: number | null = null;
  private initialised = false;

  constructor(legs: readonly LegGaitLeg[], config: LegGaitConfig) {
    if (legs.length === 0) {
      throw new Error('LegGait: en az bir bacak gerekli');
    }
    requireFinite(config.stepTriggerPx, 'LegGaitConfig.stepTriggerPx');
    requireFinite(config.stepDurationMs, 'LegGaitConfig.stepDurationMs');
    requireFinite(config.stepLeadSeconds, 'LegGaitConfig.stepLeadSeconds');
    if (config.stepTriggerPx <= 0 || config.stepDurationMs <= 0) {
      throw new Error('LegGait: stepTriggerPx ve stepDurationMs pozitif olmalı');
    }
    if (config.maxStrainPx !== undefined) {
      requireFinite(config.maxStrainPx, 'LegGaitConfig.maxStrainPx');
    }

    this.config = { ...config };
    this.states = legs.map((leg) => ({
      leg: { ...leg },
      strideScale: resolveStrideScale(leg.strideScale),
      plantedX: 0,
      plantedY: 0,
      fromX: 0,
      fromY: 0,
      toX: 0,
      toY: 0,
      t: 1,
      stepping: false,
      footX: 0,
      footY: 0,
      lift: 0,
      justPlanted: false,
      brokeTurn: false,
      strain: 0,
    }));
  }

  get legCount(): number {
    return this.states.length;
  }

  /** O anda havada olan bacak sayısı — teşhis, HUD ve denge hesapları için. */
  get steppingCount(): number {
    return this.steppingTotal;
  }

  /**
   * Sırayı DELEREK adıma girmiş ve hâlâ havada olan bacak sayısı.
   *
   * Sıfır olduğu sürece "gövde karşı grubun tamamı üstündedir" güvencesi
   * geçerlidir; sıfırdan büyükse o güvence bilinçli olarak askıdadır. İki rejimi
   * ayırt etmeden `steppingCount`a bakan bir tüketici, olmayan bir güvence
   * varsayar.
   */
  get emergencySteppingCount(): number {
    return this.emergencyStepping;
  }

  /**
   * Aktif ayak durumunu sıfırlamadan adım eşiğini ve süresini değiştirir.
   * Hızla değişen tempo için gait'i yeniden kurmak basılı ayakları her kare
   * gövdeye ışınlar; canlı ayar bu dünya-uzayı sürekliliğini korur.
   */
  setStepTuning(tuning: LegGaitStepTuning): void {
    requireFinite(tuning.stepTriggerPx, 'LegGaitStepTuning.stepTriggerPx');
    requireFinite(tuning.stepDurationMs, 'LegGaitStepTuning.stepDurationMs');
    if (tuning.stepTriggerPx <= 0 || tuning.stepDurationMs <= 0) {
      throw new Error('LegGait: stepTriggerPx ve stepDurationMs pozitif olmalı');
    }
    this.config.stepTriggerPx = tuning.stepTriggerPx;
    this.config.stepDurationMs = tuning.stepDurationMs;
  }

  /**
   * Bir bacağın gövde-yerel EV konumunu çalışma anında değiştirir.
   *
   * Duruş sabit bir tablo değildir: çömelme uzuvları gövdeye çeker, bir atılım
   * ön uzuvları öne fırlatır. Ev konumu yalnızca bir SONRAKİ adımın hedefini
   * ve gerginlik ölçüsünü etkiler; basılı ayak yerinde kalır, yani duruş
   * canlı değiştirilse bile ayaklar kaymaz.
   */
  setLegHome(index: number, homeX: number, homeY: number): void {
    const state = this.states[index];
    if (!state) throw new RangeError(`LegGait.setLegHome: geçersiz bacak indeksi ${index}`);
    state.leg.homeX = requireFinite(homeX, 'LegGait.setLegHome homeX');
    state.leg.homeY = requireFinite(homeY, 'LegGait.setLegHome homeY');
  }

  /** Ayağın o kareki dünya-uzayı X'i (adım sırasında interpolasyonlu). */
  footX(index: number): number {
    return this.states[index].footX;
  }

  footY(index: number): number {
    return this.states[index].footY;
  }

  /**
   * [0,1] — 0 yere basıyor, 1 adımın tepesi. Kaldırmanın NASIL gösterileceğine
   * tüketici karar verir; üstten bakışta "yukarı" ekran ekseni değildir.
   */
  lift(index: number): number {
    return this.states[index].lift;
  }

  isStepping(index: number): boolean {
    return this.states[index].stepping;
  }

  /** Yalnızca adımın tamamlandığı KAREDE true — temas efektlerinin tetiği. */
  justPlanted(index: number): boolean {
    return this.states[index].justPlanted;
  }

  /**
   * Bacağın GÖVDE-YEREL ev konumu.
   *
   * Yürüyüş döngüsünün geçici olarak devre dışı kaldığı durumlarda (ör. gövde
   * havadayken) tüketici uzvu doğrudan evine pozlayabilsin diye açıktır;
   * `setLegHome` ile yazılan değerin okunmuş hâlidir.
   */
  homeX(index: number): number {
    return this.states[index].leg.homeX;
  }

  homeY(index: number): number {
    return this.states[index].leg.homeY;
  }

  /**
   * Ayağın evinden uzaklığı (dünya px) — adım eşiğiyle karşılaştırılan ölçü.
   * Yalnız YERE BASAN bacaklarda tazelenir; havadaki bacak zaten hedefine
   * gidiyordur ve gerginliği bir karar girdisi değildir.
   */
  strain(index: number): number {
    return this.states[index].strain;
  }

  /** Ayakları gövdenin altına, adımsız hâlde yeniden yerleştirir. */
  reset(bodyX: number, bodyY: number, bodyAngleRad: number): void {
    const cos = Math.cos(bodyAngleRad);
    const sin = Math.sin(bodyAngleRad);
    for (const state of this.states) {
      const hx = bodyX + state.leg.homeX * cos - state.leg.homeY * sin;
      const hy = bodyY + state.leg.homeX * sin + state.leg.homeY * cos;
      state.plantedX = hx;
      state.plantedY = hy;
      state.footX = hx;
      state.footY = hy;
      state.fromX = hx;
      state.fromY = hy;
      state.toX = hx;
      state.toY = hy;
      state.t = 1;
      state.stepping = false;
      state.lift = 0;
      state.justPlanted = false;
      state.brokeTurn = false;
      state.strain = 0;
    }
    this.steppingTotal = 0;
    this.lockedStepping = 0;
    this.emergencyStepping = 0;
    this.turnGroup = null;
    this.initialised = true;
  }

  /**
   * Bir kare ilerletir. `velX/velY` gövdenin dünya-uzayı hızıdır (px/s) ve
   * adımın nereye ATILACAĞINI belirler — ayak, gövdenin gideceği yere basar.
   */
  update(
    bodyX: number,
    bodyY: number,
    bodyAngleRad: number,
    velX: number,
    velY: number,
    deltaMs: number,
  ): void {
    for (const state of this.states) state.justPlanted = false;

    if (!this.initialised) {
      this.reset(bodyX, bodyY, bodyAngleRad);
      return;
    }

    const dt = finiteOr(deltaMs, 0);
    if (dt <= 0) return;

    const cos = Math.cos(bodyAngleRad);
    const sin = Math.sin(bodyAngleRad);
    const leadX = velX * this.config.stepLeadSeconds;
    const leadY = velY * this.config.stepLeadSeconds;

    // 1) Süren adımları ilerlet — yeni adım kararlarından ÖNCE, ki biten
    //    adımlar sırayı aynı karede serbest bıraksın.
    for (const state of this.states) {
      if (!state.stepping) continue;
      state.t = clamp01(state.t + dt / this.config.stepDurationMs);
      const eased = easeInOut(state.t);
      state.footX = state.fromX + (state.toX - state.fromX) * eased;
      state.footY = state.fromY + (state.toY - state.fromY) * eased;
      state.lift = Math.sin(Math.PI * state.t);
      if (state.t >= 1) {
        state.plantedX = state.toX;
        state.plantedY = state.toY;
        state.footX = state.toX;
        state.footY = state.toY;
        state.lift = 0;
        state.stepping = false;
        state.justPlanted = true;
        this.steppingTotal--;
        if (state.brokeTurn) {
          state.brokeTurn = false;
          this.emergencyStepping--;
        }
        if (!state.leg.freeStep) this.lockedStepping--;
      }
    }

    // 2) Gerginlikler — hem sıra seçiminin hem adım tetiğinin ortak girdisi.
    for (const state of this.states) {
      if (state.stepping) continue;
      const homeX = bodyX + state.leg.homeX * cos - state.leg.homeY * sin;
      const homeY = bodyY + state.leg.homeX * sin + state.leg.homeY * cos;
      state.strain = Math.hypot(homeX - state.plantedX, homeY - state.plantedY);
      state.footX = state.plantedX;
      state.footY = state.plantedY;
      state.lift = 0;
    }

    // 3) Sıra: sıraya dahil adımlar bittiyse yenilenir ve EN AÇ grup kazanır.
    if (this.lockedStepping === 0) this.turnGroup = this.pickNeediestGroup();

    // 4) Yeni adımlar.
    const emergency = this.resolveEmergencyStrain();
    for (const state of this.states) {
      if (state.stepping) continue;
      if (state.strain <= this.config.stepTriggerPx * state.strideScale) continue;
      const urgent = emergency !== null && state.strain >= emergency;
      if (!urgent && !state.leg.freeStep && state.leg.group !== this.turnGroup) continue;

      // Sırayı gerçekten DELEN adım: acil olmasa reddedilirdi. Sırası gelmiş ya
      // da serbest bir bacağın acil eşiği aşması disiplini delmez.
      state.brokeTurn = urgent && !state.leg.freeStep && state.leg.group !== this.turnGroup;
      if (state.brokeTurn) this.emergencyStepping++;

      state.fromX = state.plantedX;
      state.fromY = state.plantedY;
      state.toX = bodyX + state.leg.homeX * cos - state.leg.homeY * sin + leadX * state.strideScale;
      state.toY = bodyY + state.leg.homeX * sin + state.leg.homeY * cos + leadY * state.strideScale;
      state.t = 0;
      state.stepping = true;
      state.lift = 0;
      this.steppingTotal++;
      if (state.leg.freeStep) continue;
      this.lockedStepping++;
      // Acil adım sırayı da devralır; aksi halde `turnGroup` bir sonraki kareye
      // kadar boşta kalan bir gruba işaret eder ve sıra iki kez dağıtılırdı.
      if (this.turnGroup === null) this.turnGroup = state.leg.group;
    }
  }

  /**
   * Adım isteyen bacaklar arasında en "aç" olanın grubu; isteyen yoksa `null`.
   *
   * Karşılaştırma ham gerginlikle değil, bacağın KENDİ eşiğine oranıyla
   * yapılır: farklı adım ölçekli bacaklarda ham piksel kıyası uzun bacağı
   * hep öne alır ve kısa bacak sırayı hiç almazdı.
   */
  private pickNeediestGroup(): number | null {
    let best: number | null = null;
    let bestRatio = 1;
    for (const state of this.states) {
      if (state.stepping || state.leg.freeStep) continue;
      const ratio = state.strain / (this.config.stepTriggerPx * state.strideScale);
      if (ratio <= bestRatio) continue;
      bestRatio = ratio;
      best = state.leg.group;
    }
    return best;
  }

  /** Sırayı delen gerginlik eşiği; eşik tetikten küçükse kural anlamsızdır. */
  private resolveEmergencyStrain(): number | null {
    const max = this.config.maxStrainPx;
    if (max === undefined || max <= this.config.stepTriggerPx) return null;
    return max;
  }
}

/** Adım ölçeği pozitif ve sonlu olmalıdır; verilmezse 1. */
function resolveStrideScale(value: number | undefined): number {
  if (value === undefined) return 1;
  requireFinite(value, 'LegGaitLeg.strideScale');
  if (value <= 0) throw new RangeError('LegGait: strideScale pozitif olmalı');
  return value;
}

/** Adımın başında ve sonunda yavaşlayan eğri — ayak yere sertçe çarpmaz. */
function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}
