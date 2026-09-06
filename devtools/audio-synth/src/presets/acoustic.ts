import type { SynthParams } from '../types';

/**
 * PERDEYE GÖRE filtre kesimi.
 *
 * Sabit bir kesim, presetin karakterini yalnız bir oktavda doğru kılar: 3400
 * Hz'lik bir lowpass marimbanın 4:1 akordunu C3'te korur ama C7'de yok eder
 * (ölçüldü: kısmi/temel oranı 0,41 → 0,035). Kesim, enstrümanın ULAŞMASI
 * gereken en üst kısmi tona göre verilir ve mutlak bir tabanı korur — o taban
 * malzemenin kendi parlaklığıdır ve pes kayıtta kaybolmamalıdır.
 *
 * Tavan 20 kHz: 44,1 kHz'de Nyquist'in altında kalır.
 */
function reach(frequency: number, harmonic: number, floorHz: number): number {
  return Math.min(20000, Math.max(floorHz, frequency * harmonic));
}

/**
 * TEMELİ KESMEYEN highpass kesimi.
 *
 * Sabit bir highpass, enstrüman pes kayıtta çalındığında temeli yutar
 * (ölçüldü: klavsen 65 Hz'de temelinin beşte dördünü kaybediyordu). Kesim
 * temelin altında kalmaya zorlanır.
 */
function belowFundamental(frequency: number, ceilingHz: number): number {
  return Math.min(ceilingHz, frequency * 0.5);
}

/**
 * Akustik enstrümanlara öykünen presetler — YENİ DSP YOK.
 *
 * Hepsi mevcut additive + FM + filtre yolunun üstünde durur; buradaki değer
 * kodda değil, ORANLARDADIR. Her preset gerçek bir enstrümanın ölçülmüş kısmi
 * ton yapısını taşır ve o yapı testte doğrulanır — uydurulmuş bir harmonik
 * dizisi kulakla ayırt edilemez ama ölçümle ayırt edilir.
 *
 * Bunlar MODEL değil PRESETtir: hiçbiri `SynthParams` ile ifade edilemeyen bir
 * yapı (gecikme hattı, rezonatör) taşımaz. Model gerektiren enstrümanlar
 * `instruments/` altına gider.
 */

// ─── Klavye ────────────────────────────────────────────────────────

/**
 * Çekmeli org (drawbar organ).
 *
 * Oranlar Hammond çekme kolonlarının ayak uzunluklarıdır: 16′ = ½, 8′ = 1,
 * 5⅓′ = 1½, 4′ = 2, 2⅔′ = 3, 2′ = 4, 1′ = 8. 1⅗′ (5×) BİLİNÇLİ olarak dışarıda:
 * o kol majör üçlü katar ve kayıtlamayı belirgin biçimde "kamışlı" yapar.
 *
 * Orgu bu katalogdaki her şeyden ayıran şey harmonikler değil ZARFTIR: tuş
 * basılıyken seviye SABİTTİR, sönüm yoktur. Bir org presetine decay yazmak onu
 * sessizce elektrikli piyanoya çevirir.
 */
export function drawbarOrgan(frequency = 220, duration = 1.6): SynthParams {
  return {
    harmonics: [
      { ratio: 0.5, gain: 0.62 },
      { ratio: 1, gain: 1.0 },
      { ratio: 1.5, gain: 0.45 },
      { ratio: 2, gain: 0.55 },
      { ratio: 3, gain: 0.28 },
      { ratio: 4, gain: 0.22 },
      { ratio: 8, gain: 0.12 },
    ],
    frequency,
    duration,
    envelope: {
      attack: 0.006,
      hold: 0,
      decay: 0.01,
      // Bırakış UZUN tutulur (0,45 sn) ve gerekçesi tınlama değil KESİLMEDİR:
      // `synthesize` tamponu tam `duration` kadar üretir, reverb kuyruğunu
      // kesip atar. Kısa bırakışta ses hâlâ yüksekken tampon biter ve son
      // örnek 0,027'de kalır — art arda dizildiğinde duyulur bir tık. Uzun
      // bırakışla aynı yer 0,0014'e iner (ölçüldü, 19 kat).
      sustain: Math.max(0, duration - 0.47),
      release: 0.45,
      sustainLevel: 1,
    },
    // Leslie yaklaşımı: dönen hoparlörün genlik ve tiz kaymasının ucuz karşılığı.
    lfos: [
      { target: 'amplitude', rate: 6.2, depth: 0.09, wave: 'sine' },
      { target: 'pitch', rate: 6.2, depth: 3.5, wave: 'sine' },
    ],
    lowpass: { cutoff: reach(frequency, 9, 5200), resonance: 0.05, poles: 2, type: 'lowpass' },
    reverb: { amount: 0.22, decay: 1.6, roomSize: 0.6, damp: 0.5 },
    gain: 0.42,
  };
}

/**
 * Klavsen (harpsichord).
 *
 * Tel bir mızrapla koparılır: spektrum parlak ve harmonik olarak zengindir,
 * ama koparma NOKTASI bir tarak süzgeci gibi davranır — koparma noktasının
 * tersine denk gelen katlar zayıflar. Uçtan yaklaşık 1/7'de koparıldığı için
 * 7. harmonik BİLİNÇLİ olarak çukurdadır.
 *
 * İkinci ayırt edici özellik dinamik YOKLUĞUDUR: mekanizma tuşa ne kadar sert
 * basıldığını iletmez, bu yüzden preset tek bir şiddet taşır ve `gain`
 * frekansla değişmez.
 */
export function harpsichord(frequency = 330, duration = 1.1): SynthParams {
  return {
    harmonics: [
      { ratio: 1, gain: 1.0 },
      { ratio: 2, gain: 0.78 },
      { ratio: 3, gain: 0.6 },
      { ratio: 4, gain: 0.44 },
      { ratio: 5, gain: 0.33 },
      { ratio: 6, gain: 0.24 },
      { ratio: 7, gain: 0.05 },
      { ratio: 8, gain: 0.16 },
      { ratio: 9, gain: 0.11 },
    ],
    frequency,
    duration,
    envelope: {
      attack: 0.002,
      hold: 0.008,
      decay: 0.32,
      sustain: 0.05,
      release: 0.28,
      sustainLevel: 0.12,
    },
    highpass: {
      cutoff: belowFundamental(frequency, 140),
      resonance: 0.04,
      poles: 2,
      type: 'highpass',
    },
    lowpass: { cutoff: reach(frequency, 11, 7200), resonance: 0.1, poles: 2, type: 'lowpass' },
    reverb: { amount: 0.26, decay: 1.4, roomSize: 0.55, damp: 0.45 },
    gain: 0.4,
  };
}

// ─── Çubuklu (mallet) ──────────────────────────────────────────────

/**
 * Marimba — gül ağacı çubuk.
 *
 * Çubuğun altı, birinci üst tonu temelin TAM 4 KATINA (iki oktav) düşecek
 * biçimde oyulur; ikinci üst ton yaklaşık 10 kata oturur. Bu akort marimbayı
 * glockenspiel'den ayıran şeydir — orada çubuk oyulmaz ve kısmi tonlar
 * harmonik DEĞİLDİR.
 *
 * Ahşap olduğu için sönüm hızlıdır ve spektrum karanlıktır.
 */
export function marimba(frequency = 262, duration = 0.9): SynthParams {
  return {
    harmonics: [
      { ratio: 1, gain: 1.0 },
      { ratio: 4, gain: 0.34 },
      { ratio: 10, gain: 0.09 },
    ],
    frequency,
    duration,
    envelope: {
      attack: 0.0015,
      hold: 0.006,
      decay: 0.3,
      sustain: 0.04,
      release: 0.32,
      sustainLevel: 0.06,
    },
    lowpass: { cutoff: reach(frequency, 12, 3400), resonance: 0.06, poles: 2, type: 'lowpass' },
    reverb: { amount: 0.2, decay: 1.1, roomSize: 0.5, damp: 0.6 },
    gain: 0.46,
  };
}

/**
 * Vibrafon — alüminyum çubuk.
 *
 * Marimba ile AYNI 4:1 akordunu taşır; ayrım malzemededir. Metal daha uzun
 * sönümlenir ve spektrum daha parlaktır.
 *
 * Asıl imza tınlaç borularındaki DÖNEN KAPAKLARDIR: genliği periyodik olarak
 * kapatıp açarlar. Bu yüzden tremolo bir süs değil, enstrümanın tanımıdır —
 * kaldırılırsa geriye uzun sönümlü bir marimba kalır.
 */
export function vibraphone(frequency = 349, duration = 2.4): SynthParams {
  return {
    harmonics: [
      { ratio: 1, gain: 1.0 },
      { ratio: 4, gain: 0.42 },
      { ratio: 10, gain: 0.14 },
    ],
    frequency,
    duration,
    envelope: {
      attack: 0.002,
      hold: 0.01,
      decay: 0.55,
      sustain: Math.max(0, duration - 1.4),
      release: 0.85,
      sustainLevel: 0.3,
    },
    // Motor genlik LFO'sunu yarılar (`sample *= 1 - lfo * 0.5`), yani buradaki
    // 0.6 çıkışta ~%22 tepe-dip demektir. 0.34 ölçüldüğünde ~%12 veriyordu ve
    // enstrümanın imzası olacak kadar belirgin değildi.
    lfos: [{ target: 'amplitude', rate: 5.5, depth: 0.6, wave: 'sine' }],
    lowpass: { cutoff: reach(frequency, 12, 6200), resonance: 0.05, poles: 2, type: 'lowpass' },
    reverb: { amount: 0.34, decay: 2.2, roomSize: 0.7, damp: 0.4 },
    gain: 0.42,
  };
}

/**
 * Glockenspiel — oyulmamış çelik çubuk.
 *
 * Kısmi tonlar HARMONİK DEĞİLDİR. Serbest-serbest bir çubuğun enine titreşim
 * modları yaklaşık 1 : 2,76 : 5,40 : 8,93 oranındadır ve bu tam sayı olmayan
 * dizi "çanımsı" tınının kaynağıdır. Aynı sesi 1:2:3 ile kurmaya çalışmak
 * flüte benzer bir şey verir.
 *
 * Temel yüksektir (tipik olarak C6 civarı) ve atak serttir.
 */
export function glockenspiel(frequency = 1047, duration = 1.5): SynthParams {
  return {
    harmonics: [
      { ratio: 1, gain: 1.0 },
      { ratio: 2.76, gain: 0.38 },
      { ratio: 5.4, gain: 0.16 },
      { ratio: 8.93, gain: 0.07 },
    ],
    frequency,
    duration,
    envelope: {
      attack: 0.001,
      hold: 0.004,
      decay: 0.45,
      sustain: 0.12,
      release: 0.7,
      sustainLevel: 0.14,
    },
    highpass: {
      cutoff: belowFundamental(frequency, 400),
      resonance: 0.03,
      poles: 2,
      type: 'highpass',
    },
    reverb: { amount: 0.36, decay: 2.0, roomSize: 0.75, damp: 0.35 },
    gain: 0.34,
  };
}

// ─── Membran ───────────────────────────────────────────────────────

/**
 * Ağır davul — büyük, derin membran (taiko / kat tomu ailesi).
 *
 * İki katman: gövde ve vuruş. Gövde `slide` ile düşen bir temeldir — deri
 * vurulduğu an gerilir ve gevşerken perde iner, "tok" vuruş hissini yapan şey
 * budur. Vuruş katmanı gürültüdür ve hızla boğulur: `lowpass.envelope`
 * kesimi ilk anda açıp kapatır, böylece sopa temasından sonra geriye yalnız
 * gövde kalır.
 *
 * **Membran modları BURADA YOK ve bu bilinçli bir takastır.** Gerçek bir
 * dairesel membranın modları harmonik değildir (yaklaşık 1 : 1,59 : 2,14 :
 * 2,30). Motorda `harmonics` verildiği an `wave` devre dışı kalır, yani modlar
 * ile vuruş gürültüsü aynı presette buluşamaz. Ağır bir vuruşta algıyı atak
 * belirlediği için gürültü seçildi. Modları da isteyen bir ses fiziksel
 * modele ihtiyaç duyar, presete değil.
 */
export function heavyDrum(frequency = 78, duration = 1.1): SynthParams {
  return {
    wave: ['sine', 'triangle', 'noise'],
    frequency,
    // Perde düşüşü temelin yarısına yakın; oran frekanstan bağımsız kalsın
    // diye mutlak Hz değil, frekansın katı olarak verilir.
    slide: -frequency * 0.42,
    slideCurve: 'exponential',
    duration,
    envelope: {
      attack: 0.001,
      hold: 0.004,
      decay: 0.42,
      sustain: 0.06,
      release: 0.4,
      sustainLevel: 0.1,
    },
    lowpass: {
      cutoff: 2600,
      resonance: 0.12,
      poles: 2,
      type: 'lowpass',
      envAmount: 0.92,
      envelope: {
        attack: 0.0008,
        hold: 0.002,
        decay: 0.05,
        sustain: 0.1,
        release: 0.2,
        sustainLevel: 0.05,
      },
    },
    distortion: { amount: 0.18, type: 'soft', mix: 0.35 },
    // Yumuşak doyum simetrik değildir ve ölçülebilir bir DC kayması bırakır
    // (0,009 — diğer presetlerin on katı). DC hem tepe payını yer hem
    // katmanlar toplandığında birikir. Kesim temelin en pes hâlinin
    // (`frequency * 0.58`) altında kalır, gövdeye dokunmaz.
    highpass: { cutoff: Math.min(30, frequency * 0.35), resonance: 0, poles: 1, type: 'highpass' },
    reverb: { amount: 0.24, decay: 1.8, roomSize: 0.8, damp: 0.65 },
    gain: 0.8,
  };
}

// ─── Yumuşak klavye ────────────────────────────────────────────────

/**
 * Yumuşak klavye — neredeyse saf sinüs, hafif akortsuz, geniş hacimde.
 *
 * Üç şeyin birleşimi: spektrum sinüse çok yakındır (üst tonlar zayıf), iki
 * ses birbirine göre birkaç sent kaydırılmıştır ve reverb büyüktür. Akortsuzluk
 * yavaş bir vurum üretir — sıcaklık dediğimiz şey odur; kaldırılırsa geriye
 * cansız bir sinüs kalır.
 *
 * Atak ne perküsif ne de pad'dir: ~25 ms. Daha keskini elektrikli piyanoya,
 * daha yumuşağı yaylıya kayar.
 */
export function mellowKeys(frequency = 262, duration = 2.2): SynthParams {
  return {
    harmonics: [
      { ratio: 1, gain: 1.0 },
      { ratio: 2, gain: 0.16 },
      { ratio: 3, gain: 0.07 },
      { ratio: 4, gain: 0.03 },
    ],
    frequency,
    duration,
    // Vurum hızı yaklaşık 1 Hz: duyulur ama titremeye dönüşmez.
    detune: 7,
    envelope: {
      attack: 0.025,
      hold: 0.02,
      decay: 0.6,
      sustain: Math.max(0, duration - 1.5),
      release: 0.85,
      sustainLevel: 0.42,
    },
    lowpass: { cutoff: reach(frequency, 5, 2800), resonance: 0.04, poles: 2, type: 'lowpass' },
    reverb: { amount: 0.42, decay: 3.4, roomSize: 0.9, damp: 0.55 },
    gain: 0.44,
  };
}
