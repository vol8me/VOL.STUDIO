import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { activeWorkspaceNames, loadRepoLifecycle } from './workspaceLifecycle.mjs';

/**
 * CİHAZ ÖLÇÜMÜNÜN KAPSAMI.
 *
 * Ölçülecek uygulamalar elle tutulan bir listeden değil, yaşam döngüsünden
 * türetilir: `status: "active"` + `src-tauri/tauri.conf.json` taşıyan her
 * workspace bir cihaz ölçüm adayıdır. Frozen ürünlerin kabukları ağaçta
 * durur ama rutin ölçümün adayı değildir — frozen ağaç değiştirilemez,
 * ölçümü rutin geliştirmeye maliyet bindirir.
 *
 * Bekçi iki şeyi kilitler: benchmark betiğinin bu keşfi KULLANDIĞINI (yerel
 * bir liste geri gelirse frozen oyunlar sessizce ölçüm adayı olurdu) ve
 * keşfin gerçek repoda aktif kabuklarla birebir örtüştüğünü.
 */

/** Bir workspace kaydının desteklenen Tauri uygulama kabuğu var mı? */
function shellIdentifier(root, workspacePath) {
  const config = join(root, workspacePath, 'src-tauri', 'tauri.conf.json');
  if (!existsSync(config)) return null;
  return JSON.parse(readFileSync(config, 'utf8')).identifier ?? null;
}

/**
 * Cihaz ölçüm adayları: aktif workspace + Tauri kabuğu + paket kimliği.
 * `device-benchmark.mjs` bunu çağırır; aday yoksa doğrulanmış no-op'tur.
 */
export function deviceBenchmarkCandidates(root, lifecycle) {
  const active = new Set(activeWorkspaceNames(lifecycle));
  return lifecycle.workspaces
    .filter((workspace) => active.has(workspace.packageName))
    .map((workspace) => ({ workspace, identifier: shellIdentifier(root, workspace.path) }))
    .filter(({ identifier }) => identifier !== null)
    .map(({ workspace, identifier }) => ({ name: workspace.packageName, pkg: identifier }));
}

/**
 * @param root Repo kökü.
 * @param lifecycle Ayrıştırılmış workspace-lifecycle.json (yoksa kökten okunur).
 * @returns Sorun listesi; boşsa ölçüm kapsamı lifecycle ile tutarlı.
 */
export function validateDeviceApps(root, lifecycle = loadRepoLifecycle(root)) {
  const script = join(root, 'scripts', 'device-benchmark.mjs');
  if (!existsSync(script)) return [];
  if (!lifecycle) {
    return ['workspace-lifecycle.json yok; cihaz ölçüm kapsamı doğrulanamaz.'];
  }

  const problems = [];
  const source = readFileSync(script, 'utf8');

  if (!source.includes('deviceBenchmarkCandidates')) {
    problems.push(
      'scripts/device-benchmark.mjs `deviceBenchmarkCandidates` keşfini kullanmıyor; ' +
        'ölçüm kapsamı lifecycle yerine yerel bir listeden besleniyor olabilir.',
    );
  }
  if (/const\s+\w+\s*=\s*\[[^\]]*\bpkg\s*:/s.test(source)) {
    problems.push(
      'scripts/device-benchmark.mjs sabit bir uygulama listesi taşıyor; ' +
        'adaylar lifecycle + tauri.conf.json üzerinden türetilmeli.',
    );
  }

  // Beklenen küme burada BAĞIMSIZ hesaplanır — keşif fonksiyonunun çıktısı
  // kendi kendinin kanıtı olamaz.
  const expected = new Map();
  for (const workspace of lifecycle.workspaces) {
    if (workspace.status !== 'active') continue;
    const identifier = shellIdentifier(root, workspace.path);
    if (identifier !== null) expected.set(workspace.packageName, identifier);
  }
  const actual = new Map(
    deviceBenchmarkCandidates(root, lifecycle).map((app) => [app.name, app.pkg]),
  );

  for (const [name, identifier] of expected) {
    const listed = actual.get(name);
    if (listed === undefined) {
      problems.push(
        `${name} aktif ve Android kabuğu taşıyor (${identifier}) ama ölçüm adayı değil.`,
      );
    } else if (listed !== identifier) {
      problems.push(`${name} kimliği ${identifier}, ölçüm ${listed} diyor.`);
    }
  }

  const frozen = new Set(
    lifecycle.workspaces
      .filter((workspace) => workspace.status === 'frozen')
      .map((workspace) => workspace.packageName),
  );
  for (const name of actual.keys()) {
    if (!expected.has(name)) {
      problems.push(
        `${name} ölçüm adayı ama aktif bir Tauri kabuğu değil` +
          (frozen.has(name) ? ' — frozen ürün rutin ölçüme girmez.' : '.'),
      );
    }
  }

  return problems;
}
