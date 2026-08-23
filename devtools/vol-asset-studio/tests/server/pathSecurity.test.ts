import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AssetStudioError } from '../../server/errors.js';
import {
  assertSafeRelativePath,
  resolveExistingAsset,
  resolveWorkspaceRoot,
} from '../../server/pathSecurity.js';

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('pathSecurity', () => {
  it.each(['../outside', '/absolute', 'C:/windows', 'folder\\file.png', './same', 'a//b'])(
    'güvensiz göreli yolu reddeder: %s',
    (path) => {
      expect(() => assertSafeRelativePath(path)).toThrow(AssetStudioError);
    },
  );

  it('normal repo göreli yolunu korur', () => {
    expect(assertSafeRelativePath('assets/images/car.png')).toBe('assets/images/car.png');
  });

  it('dosya symlinkinin kök dışına kaçmasını engeller', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'vol-asset-path-'));
    temporary.push(sandbox);
    const repo = join(sandbox, 'repo');
    const outside = join(sandbox, 'outside');
    await mkdir(join(repo, 'assets'), { recursive: true });
    await mkdir(outside);
    await writeFile(join(outside, 'secret.png'), 'secret');
    await symlink(join(outside, 'secret.png'), join(repo, 'assets', 'escape.png'));

    const canonicalRepo = await realpath(repo);
    const root = await resolveWorkspaceRoot(canonicalRepo, 'assets');
    await expect(resolveExistingAsset(root, 'escape.png')).rejects.toMatchObject({
      code: 'path_outside_workspace',
    });
  });

  it('ara klasör symlinki üzerinden yapılandırılmış kök kaçışını engeller', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'vol-asset-root-'));
    temporary.push(sandbox);
    const repo = join(sandbox, 'repo');
    const outside = join(sandbox, 'outside');
    await mkdir(repo);
    await mkdir(outside);
    await symlink(outside, join(repo, 'linked'));
    const canonicalRepo = await realpath(repo);

    await expect(resolveWorkspaceRoot(canonicalRepo, 'linked/assets')).rejects.toMatchObject({
      code: 'path_outside_workspace',
    });
  });
});
