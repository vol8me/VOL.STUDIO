/**
 * Perde sözlüğü: nota adı, öteleme, dizi ve akor.
 *
 * Motor Hz ile konuşur, insan ve agent nota adıyla. Bu çeviri her müzik
 * üreten betikte yeniden yazılıyordu; bir kez burada durur.
 */

/** A4'e göre yarım ton ofseti. Bemol ve diyez aynı perdeye düşer. */
const PITCH_CLASS: Readonly<Record<string, number>> = {
  C: -9,
  'C#': -8,
  Db: -8,
  D: -7,
  'D#': -6,
  Eb: -6,
  E: -5,
  F: -4,
  'F#': -3,
  Gb: -3,
  G: -2,
  'G#': -1,
  Ab: -1,
  A: 0,
  'A#': 1,
  Bb: 1,
  B: 2,
};

/** Yazarken diyez tercih edilir; `shift` çıktısı bu diziden gelir. */
const SHARP_NAMES = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'] as const;

const NOTE_PATTERN = /^([A-G][#b]?)(-?\d)$/;

/** Referans perde: A4 = 440 Hz, eşit tamperemanın demir atma noktası. */
export const CONCERT_A = 440;

/** Nota adının A4'e göre yarım ton ofseti. Geçersiz ad `TypeError` fırlatır. */
function semitonesFromA4(note: string): number {
  const match = NOTE_PATTERN.exec(note);
  if (!match) throw new TypeError(`Geçersiz nota adı: ${note}`);
  return PITCH_CLASS[match[1]] + (Number(match[2]) - 4) * 12;
}

/**
 * Nota adı → frekans (Hz). `'A4'` → 440, `'C4'` → 261.63.
 *
 * Bilimsel perde gösterimi kullanılır: oktav numarası C'de artar, yani B3'ün
 * bir yarım ton üstü C4'tür. Bu, MIDI ve nota yazımının ortak sözleşmesidir.
 */
export function noteToHz(note: string): number {
  return CONCERT_A * Math.pow(2, semitonesFromA4(note) / 12);
}

/** Notayı yarım ton ötele. Sonuç DİYEZLİ adla döner (`Db4` + 0 → `C#4`). */
export function transposeNote(note: string, semitones: number): string {
  const absolute = semitonesFromA4(note) + semitones;
  const octave = 4 + Math.floor((absolute + 9) / 12);
  return SHARP_NAMES[((absolute % 12) + 12) % 12] + String(octave);
}

/**
 * Kök nota üstündeki yarım ton dizileri.
 *
 * Adlar bir türe (genre) değil, müzik teorisinin kendi terimlerine bağlıdır;
 * hangi duyguya hizmet ettikleri tüketicinin kararıdır.
 */
export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  wholeTone: [0, 2, 4, 6, 8, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
} as const satisfies Record<string, readonly number[]>;

export type ScaleName = keyof typeof SCALES;

/**
 * Dizinin `index`. derecesi. 0 = kök, 7 = bir oktav üstteki kök (yedi sesli
 * dizide), −1 = alttaki yedinci.
 *
 * İndeks dizinin uzunluğunu AŞABİLİR ve oktav taşar; bu bilinçlidir, çünkü
 * ezgi yazarken "üçüncü derecenin bir oktav üstü" doğal bir düşüncedir ve
 * elle oktav hesaplatmak hata kaynağıdır.
 */
export function scaleDegree(root: string, scale: readonly number[], index: number): string {
  /*
   * Yanlış yazılmış bir dizi adı (`SCALES.minorPent`) çalışma zamanında
   * `undefined` verir; tip sistemi bunu göremez çünkü imza `readonly
   * number[]` diyor. Korumasız hâlde `.length` üstünde patlıyordu ve mesaj
   * çağıranın hatasını göstermiyordu. `Array.isArray` KULLANILMAZ — dar
   * tipi `any[]`ye çevirip aşağıdaki indekslemeyi tipsiz bırakır.
   */
  if ((scale as readonly number[] | undefined) === undefined) {
    throw new TypeError('Dizi verilmedi — dizi adı yanlış yazılmış olabilir');
  }
  if (scale.length === 0) throw new TypeError('Boş dizi derece veremez');
  const octave = Math.floor(index / scale.length);
  const step = ((index % scale.length) + scale.length) % scale.length;
  return transposeNote(root, scale[step] + octave * 12);
}

/**
 * Dizi üstünde akor: kök dereceden başlayıp BİR DERECE ATLAYARAK yığar.
 *
 * Böylece akor dizinin kendi renginden çıkar — majör dizinin 2. derecesinde
 * kurulan üçlü doğal olarak minördür ve bunu ayrıca söylemek gerekmez. Yığma
 * dizi dışı bir ses üretmez.
 */
export function scaleChord(
  root: string,
  scale: readonly number[],
  index: number,
  size = 3,
): string[] {
  if (size < 1) throw new TypeError('Akor en az bir ses taşır');
  return Array.from({ length: size }, (_, i) => scaleDegree(root, scale, index + i * 2));
}
