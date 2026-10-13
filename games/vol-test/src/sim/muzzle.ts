import type { ChassisPose } from './tank/Tank';

/** Dünya uzayında bir nokta ve bakış yönü. */
export interface MuzzlePose {
  x: number;
  y: number;
  angle: number;
}

/**
 * Tarete bağlı namlu ucunun tek tanımı. Sim atışı, görünüm (ağız parlaması), nişan çizgisi ve
 * nişan başlangıcı aynı işlevi kullanır; yoksa her biri kendi kopyasını türetir ve aralarında
 * görünür bir kayma doğar. Gövde süspansiyonla paletler üzerinde `pitch` (ileri) ve `roll` (yan)
 * kadar kayar; taret mili bu kaymayla birlikte gider. `reach` mil ile namlu ucu arası mesafedir.
 */
export function muzzlePose(pose: ChassisPose, reach: number, out: MuzzlePose): MuzzlePose {
  const cosine = Math.cos(pose.hull);
  const sine = Math.sin(pose.hull);
  const dirX = Math.cos(pose.turret);
  const dirY = Math.sin(pose.turret);
  out.x = pose.x + pose.pitch * cosine - pose.roll * sine + dirX * reach;
  out.y = pose.y + pose.pitch * sine + pose.roll * cosine + dirY * reach;
  out.angle = pose.turret;
  return out;
}

/** Taret milinin dünya konumu: nişanın dönüş merkezi ve namluların başlangıcı. */
export function pivotPose(pose: ChassisPose, out: MuzzlePose): MuzzlePose {
  return muzzlePose(pose, 0, out);
}
