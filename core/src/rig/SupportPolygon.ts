import { finiteOr } from '../math/numeric';

/**
 * Basılı ayakların oluşturduğu DESTEK POLİGONU ve gövdenin ona göre dengesi.
 *
 * Bu bir fizik motoru DEĞİLDİR ve öyle olmaya çalışmaz. Kütle, kuvvet, tork ya
 * da kısıt çözücü yoktur; tek soruyu cevaplar: *gövdenin ağırlık merkezi, yere
 * basan ayakların çevrelediği alanın içinde mi?* Bacaklı bir yaratığın devrilip
 * devrilmediği ilk yaklaşımda tam olarak bu sorunun cevabıdır ve cevabı
 * ölçmek, tam bir rijit gövde simülasyonu yazmadan "dengede mi?" demeyi
 * mümkün kılar.
 *
 * Yürüyüş döngüsü bugün dengeyi SIRA DİSİPLİNİYLE dolaylı olarak koruyor:
 * bir grup adım atarken diğeri yerde kalır. O disiplin bir güvence verir ama
 * ÖLÇMEZ — acil adım sırayı deldiğinde ya da bir ayak beklenmedik bir yere
 * bastığında güvencenin hâlâ geçerli olup olmadığını kimse söyleyemez. Burası
 * o boşluğu kapatır.
 *
 * Sonuç bir KARAR değil bir ÖLÇÜMDÜR. Ne yapılacağına (düzeltici adım, çömelme,
 * sendeleme) tüketici karar verir; bu modül yalnız durumu bildirir.
 */
export interface SupportFoot {
  /** Ayağın dünya konumu. */
  x: number;
  y: number;
  /**
   * Ayak gerçekten yerde mi? Havadaki bir ayak destek poligonuna girmez —
   * girseydi yaratık, üzerine basmadığı bir alanla dengede sayılırdı.
   */
  grounded: boolean;
}

export interface SupportState {
  /** Poligonu oluşturan (yerdeki) ayak sayısı. */
  groundedCount: number;
  /**
   * Destek poligonunun alanı (dünya px²).
   *
   * İki ya da daha az ayakla sıfırdır: iki nokta bir alan çevirmez. Alan
   * küçüldükçe denge kırılganlaşır — sayı, "kaç ayak yerde" sorusundan daha
   * bilgilidir çünkü bir kenara sıkışmış dört ayak da küçük bir alan verir.
   */
  areaPx2: number;
  /**
   * Ağırlık merkezi poligonun İÇİNDE mi?
   *
   * Poligon dejenere olduğunda (0-2 ayak, ya da hepsi aynı doğruda) `false`
   * döner: bir çizgi üstünde denge yoktur.
   */
  inside: boolean;
  /**
   * Merkezin poligon KENARINA uzaklığı (dünya px). İçerideyken pozitif,
   * dışarıdayken negatiftir — işaret, hangi tarafta olunduğunu tek sayıda taşır.
   */
  marginPx: number;
  /**
   * [0,1] denge payı. 1 = merkez poligonun göbeğinde; 0 = kenarda ya da dışarıda.
   *
   * `marginPx` mutlak bir uzunluktur ve yaratığın ölçüsüne bağlıdır; bu alan onu
   * tüketicinin verdiği `safeMarginPx` ile normalleştirir, böylece eşikler
   * yaratıktan bağımsız yazılabilir.
   */
  stability01: number;
}

export interface SupportQuery {
  /** Dengesi ölçülen nokta — genelde gövde merkezi ya da ağırlık merkezi. */
  centerX: number;
  centerY: number;
  /**
   * İleriye bakış (saniye). Verilirse merkez, hızla bu kadar ileri taşınır ve
   * denge GELECEK konum için ölçülür.
   *
   * Anlık denge çok geç bir sinyaldir: gövde devrildiğini ancak devrildikten
   * sonra bildirir. Bir adım süresi kadar ileriye bakmak, düzeltici bir adımın
   * yetişebileceği kadar erken uyarır.
   */
  lookaheadSeconds?: number;
  velX?: number;
  velY?: number;
  /**
   * `stability01`in 1'e ulaştığı kenar payı (dünya px). Verilmezse poligonun
   * kendi ölçüsünden türetilir.
   */
  safeMarginPx?: number;
}

const EMPTY: SupportState = {
  groundedCount: 0,
  areaPx2: 0,
  inside: false,
  marginPx: 0,
  stability01: 0,
};

/**
 * Basılı ayaklardan destek poligonunu kurar ve gövdenin dengesini ölçer.
 *
 * Ayaklar her karede gelir ve sıra garantisi yoktur; poligon bu yüzden her
 * çağrıda dışbükey zarf (convex hull) ile yeniden kurulur. Ayak sayısı tek
 * haneli olduğu için Andrew'un monoton zinciri fazlasıyla ucuzdur ve bir
 * artımlı yapı tutmanın karmaşıklığını hak etmez.
 */
export function measureSupport(
  feet: readonly SupportFoot[],
  query: SupportQuery,
  out: SupportState = { ...EMPTY },
): SupportState {
  const points: number[] = [];
  for (const foot of feet) {
    if (!foot.grounded) continue;
    const x = finiteOr(foot.x, Number.NaN);
    const y = finiteOr(foot.y, Number.NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    points.push(x, y);
  }

  out.groundedCount = points.length / 2;
  if (out.groundedCount < 3) {
    // İki nokta bir alan çevirmez; denge sorusu anlamını yitirir.
    out.areaPx2 = 0;
    out.inside = false;
    out.marginPx = 0;
    out.stability01 = 0;
    return out;
  }

  const hull = convexHull(points);
  out.areaPx2 = polygonArea(hull);

  const lookahead = Math.max(0, finiteOr(query.lookaheadSeconds ?? 0, 0));
  const centerX = finiteOr(query.centerX, 0) + finiteOr(query.velX ?? 0, 0) * lookahead;
  const centerY = finiteOr(query.centerY, 0) + finiteOr(query.velY ?? 0, 0) * lookahead;

  const signed = signedEdgeDistance(hull, centerX, centerY);
  out.inside = signed > 0;
  out.marginPx = signed;

  /*
   * Güvenli pay verilmezse poligonun KENDİ ölçüsünden türetilir: alanın
   * kareköküne oranlı bir uzunluk, yaratık büyüdükçe eşiği de büyütür. Sabit
   * bir piksel değeri, küçük bir yaratığı hep dengesiz gösterirdi.
   */
  const safeMargin = Math.max(
    1e-6,
    finiteOr(query.safeMarginPx ?? Math.sqrt(out.areaPx2) * 0.25, 1),
  );
  out.stability01 = signed <= 0 ? 0 : Math.min(1, signed / safeMargin);
  return out;
}

/** Andrew'un monoton zinciri; saat yönünün TERSİNE sıralı zarf döner. */
function convexHull(points: readonly number[]): number[] {
  const indices: number[] = [];
  for (let i = 0; i < points.length; i += 2) indices.push(i);
  indices.sort((a, b) => points[a] - points[b] || points[a + 1] - points[b + 1]);

  const build = (order: readonly number[]): number[] => {
    const chain: number[] = [];
    for (const index of order) {
      while (chain.length >= 4) {
        const n = chain.length;
        const cross =
          (chain[n - 2] - chain[n - 4]) * (points[index + 1] - chain[n - 3]) -
          (chain[n - 1] - chain[n - 3]) * (points[index] - chain[n - 4]);
        if (cross > 0) break;
        chain.length = n - 2;
      }
      chain.push(points[index], points[index + 1]);
    }
    chain.length = Math.max(0, chain.length - 2);
    return chain;
  };

  return [...build(indices), ...build([...indices].reverse())];
}

/** Ayakkabı bağı (shoelace) formülü; mutlak alan. */
function polygonArea(polygon: readonly number[]): number {
  const count = polygon.length / 2;
  if (count < 3) return 0;
  let total = 0;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    total += polygon[i * 2] * polygon[j * 2 + 1] - polygon[j * 2] * polygon[i * 2 + 1];
  }
  return Math.abs(total) / 2;
}

/**
 * Noktanın poligon kenarına İŞARETLİ uzaklığı: içeride pozitif, dışarıda
 * negatif.
 *
 * İçeride/dışarıda kararı, dışbükey bir poligonda tüm kenarların aynı tarafında
 * olmakla verilir; uzaklık ise en yakın kenar SEGMENTİNE olan mesafedir.
 * Sonsuz doğruya olan mesafe köşelerde yanlış (fazla büyük) çıkar.
 */
function signedEdgeDistance(polygon: readonly number[], x: number, y: number): number {
  const count = polygon.length / 2;
  let inside = true;
  let sign = 0;
  let nearest = Number.POSITIVE_INFINITY;

  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    const ax = polygon[i * 2];
    const ay = polygon[i * 2 + 1];
    const bx = polygon[j * 2];
    const by = polygon[j * 2 + 1];

    const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    const side = Math.sign(cross);
    if (side !== 0) {
      if (sign === 0) sign = side;
      else if (side !== sign) inside = false;
    }

    nearest = Math.min(nearest, segmentDistance(ax, ay, bx, by, x, y));
  }

  if (!Number.isFinite(nearest)) return 0;
  return inside ? nearest : -nearest;
}

function segmentDistance(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  x: number,
  y: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0) return Math.hypot(x - ax, y - ay);
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared));
  return Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
}
