import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

/**
 * ÜRÜN İKONU — her oyun kendi görünen kimliğini taşır.
 *
 * Kimlik, yapılandırma ve Tauri bağlamı oyunlara taşındıktan sonra ikon
 * paylaşılan runtime'da kalmıştı ve Tauri'nin VARSAYILAN logosuydu: üç oyunun
 * masaüstü paketi ve Android başlatıcısı bayt bayt aynıydı. `tauri android
 * init` şablonu yeniden ürettiğinde varsayılan ikon sessizce geri gelir.
 */

/** Tauri şablonunun masaüstü ve Android başlatıcı ikonlarının SHA-256 özetleri. */
export const TEMPLATE_ICON_HASHES = new Set([
  '0b250fc4451dfd1e5a41128234d93225726a2984448b0b966af25677b167d8de',
  '1f3689f6374b0553996fdc99743799216703835070145d7f0e6ec11e6280139e',
  '2425d59d27578f75ca97d31d9ae8385898badce3d6a1774bfc2f0fd191dc12c7',
  '27cf0cdbc78bec8b9a14eaedb084c541a3c191fe5db89766e831fbfd21ce955d',
  '320e552422179b81dae014ee6cc00561bd6e7455767b28f5518b8862a8c7987c',
  '3dc10493b7de48a61de58f768f8a5708d3a44a068c148cedf0502b9b9b71ba5d',
  '44e5c3dc1dfb392f65e3dbcc9b986d30f10dd95b57e306657e56281b572fa684',
  '69194785eef4323955af73b0c03362ac0804db056c2424f9715076cabc0ed103',
  '75322a261ba38a23a25647af0d1298f204f3b3fafd317b8122a1b9a1f38284ff',
  '7a9ae0632bfe5b28a1e6e9a7b38982fef62be07c95de46c26bd4f901ac6b9753',
  'ab9397c9827aef4b3a1f1f917fc722d54abcf26488880c8bf9c724d1e59ab905',
  'b1d19b8b78d0ed6903dd35b7640afba29b4cf02f3780e0d1cd46d9ebcbc93695',
  'b5d93c8ec365c08b11bd006e46a46e227c681d30bb295af3d017573bfc752a83',
  'd151f11e325f7502de0c739a2e51697aa569fd4701ae6e11fae1a3b4c7d5f157',
  'dae1ff05b101efea50e4b622fe6a3af8ba8f761162fa7c4fd864adc7cb39eeac',
  'e38ca88e1d5490f3dcbc3c3fa525f7fcb7b80fff3cb2f3a4eb1b2d018c0915c1',
]);

const ANDROID_RES = 'gen/android/app/src/main/res';

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function launcherIcons(shell) {
  const res = join(shell, ANDROID_RES);
  if (!existsSync(res)) return [];
  return readdirSync(res, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('mipmap-'))
    .flatMap((entry) =>
      readdirSync(join(res, entry.name))
        .filter((name) => /^ic_launcher.*\.png$/.test(name))
        .map((name) => join(res, entry.name, name)),
    )
    .sort();
}

/**
 * @param root Repo kökü.
 * @param templateHashes Reddedilen şablon ikon özetleri; testler kendi kümesini verir.
 * @returns Sorun listesi; boşsa her oyun kendi ikonunu taşır.
 */
export function validateProductIcons(root, templateHashes = TEMPLATE_ICON_HASHES) {
  const problems = [];
  const owners = new Map();
  const gamesDir = join(root, 'games');
  if (!existsSync(gamesDir)) return problems;

  const games = readdirSync(gamesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const game of games) {
    const shell = join(gamesDir, game, 'src-tauri');
    const config = join(shell, 'tauri.conf.json');
    if (!existsSync(config)) continue;

    const icons = JSON.parse(readFileSync(config, 'utf8')).bundle?.icon ?? [];
    if (icons.length === 0) {
      problems.push(`games/${game}: bundle.icon boş — paket ikonsuz üretilir.`);
    }
    const files = [];
    for (const icon of icons) {
      const path = resolve(shell, icon);
      if (!path.startsWith(shell + sep)) {
        problems.push(
          `games/${game}: ikon "${icon}" oyunun kendi src-tauri'si dışında — ürün kimliği başka pakette yaşamaz.`,
        );
      } else if (!existsSync(path)) {
        problems.push(`games/${game}: ikon "${icon}" yok.`);
      } else {
        files.push(path);
      }
    }

    for (const path of [...files, ...launcherIcons(shell)]) {
      const hash = sha256(path);
      const shown = relative(root, path).split(sep).join('/');
      if (templateHashes.has(hash)) {
        problems.push(`${shown}: Tauri'nin varsayılan ikonu — ürün ikonu \`tauri icon\` ile üretilmeli.`);
      }
      const seen = owners.get(hash) ?? new Set();
      seen.add(game);
      owners.set(hash, seen);
    }
  }

  const shared = new Set();
  for (const seen of owners.values()) {
    if (seen.size > 1) shared.add([...seen].sort().join(', '));
  }
  for (const group of shared) {
    problems.push(`${group}: aynı ikon dosyasını taşıyor — her ürün kendi ikonunu taşır.`);
  }
  return problems;
}
