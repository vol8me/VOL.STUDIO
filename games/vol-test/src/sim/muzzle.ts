import type { Armament } from '@/config/vehicles';
import type { ChassisPose } from './chassis/ChassisState';

/** Dünya uzayında bir nokta ve bakış yönü. */
export interface MuzzlePose {
  x: number;
  y: number;
  angle: number;
}

const origin: MuzzlePose = { x: 0, y: 0, angle: 0 };

/** Yuva milinin dünya konumu: gövde süspansiyonla `pitch` (ileri) ve `roll` (yan) kadar kayar. */
function placeMount(pose: ChassisPose, x: number, y: number, out: MuzzlePose): MuzzlePose {
  const cosine = Math.cos(pose.hull);
  const sine = Math.sin(pose.hull);
  const forward = pose.pitch + x;
  const side = pose.roll + y;
  out.x = pose.x + forward * cosine - side * sine;
  out.y = pose.y + forward * sine + side * cosine;
  return out;
}

/**
 * Yuva milinin konumu ve yönü. `Armament.pivot` yoksa 0. yuva nişan taretidir: yönü taretin yönüdür,
 * öteki yuvalar nişan noktasına (0. yuvadan taret yönünde `toeInRange` ileride) bakar. `pivot` varsa
 * nişan başlangıcı odur ve her yuva (0. dahil) nişan noktasına bakar; simetrik iki yan top böyle
 * gövde eksenine odaklanır. Yön yalnız poza bağlıdır: ağ üzerinde
 * namlu açısı taşınmaz, görünüm ara değerli poz ile aynı açıyı bulur.
 */
export function mountPose(
  pose: ChassisPose,
  armament: Armament,
  index: number,
  out: MuzzlePose,
): MuzzlePose {
  const mount = armament.mounts[index];
  placeMount(pose, mount.x, mount.y, out);
  if (index === 0 && !armament.pivot) {
    out.angle = pose.turret;
    return out;
  }
  const first = armament.pivot ?? armament.mounts[0];
  placeMount(pose, first.x, first.y, origin);
  const focusX = origin.x + Math.cos(pose.turret) * armament.toeInRange;
  const focusY = origin.y + Math.sin(pose.turret) * armament.toeInRange;
  out.angle = Math.atan2(focusY - out.y, focusX - out.x);
  return out;
}

/**
 * Namlu ucunun tek tanımı. Sim atışı, görünüm (ağız parlaması), nişan çizgisi ve nişan başlangıcı
 * aynı işlevi kullanır; yoksa her biri kendi kopyasını türetir ve aralarında görünür bir kayma
 * doğar. `reach` yoksa yuvanın tanımındaki mesafe kullanılır (görünüm geri tepen namlunun
 * ucunu bu değerle bulur).
 */
export function muzzlePose(
  pose: ChassisPose,
  armament: Armament,
  index: number,
  out: MuzzlePose,
  reach: number = armament.mounts[index].reach,
): MuzzlePose {
  mountPose(pose, armament, index, out);
  out.x += Math.cos(out.angle) * reach;
  out.y += Math.sin(out.angle) * reach;
  return out;
}

/** Nişan başlangıcı (`pivot`, yoksa 0. yuvanın mili): nişan çizgisinin ve dönüş merkezinin başlangıcı. */
export function pivotPose(pose: ChassisPose, armament: Armament, out: MuzzlePose): MuzzlePose {
  if (!armament.pivot) return mountPose(pose, armament, 0, out);
  placeMount(pose, armament.pivot.x, armament.pivot.y, out);
  out.angle = pose.turret;
  return out;
}
